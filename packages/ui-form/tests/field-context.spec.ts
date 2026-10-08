// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick, ref} from 'vue';

import type {FieldErrors, OwnControlProps} from '../src/composables/field-context';

import CheckboxGroup from '../src/components/CheckboxGroup.vue';
import FormField from '../src/components/FormField.vue';
import Textarea from '../src/components/Textarea.vue';
import TextInput from '../src/components/TextInput.vue';
import {provideFieldErrors, useFieldControl, useFieldError} from '../src/composables/field-context';

// A control from OUTSIDE the package (an emmie control), reading the field the way the docs tell
// it to. It renders its resolved wiring as attributes so a spec can read them.
const OutsideControl = defineComponent({
    props: {
        id: {type: String, default: undefined},
        invalid: {type: Boolean, default: undefined},
        describedby: {type: String, default: undefined},
        required: {type: Boolean, default: undefined},
    },
    setup: (props: OwnControlProps) => {
        const control = useFieldControl(() => props);

        return () =>
            h('input', {
                id: control.value.id,
                'aria-invalid': control.value.invalid || undefined,
                'aria-describedby': control.value.describedby,
                'aria-required': control.value.required || undefined,
            });
    },
});

// A form that provides its bag and renders whatever fields it is given.
const formWith = (errors: ReturnType<typeof ref<FieldErrors>>, render: () => ReturnType<typeof h>) =>
    defineComponent({
        setup: () => {
            provideFieldErrors(errors as never);

            return render;
        },
    });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useFieldControl', () => {
    it('takes the id, mark and describedby from the enclosing FormField', () => {
        const wrapper = mount(FormField, {
            props: {id: 'caseload', label: 'Caseload', error: 'Required', required: true},
            slots: {default: () => h(OutsideControl)},
        });
        const input = wrapper.find('input');

        expect(input.attributes('id')).toBe('caseload');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('caseload-error');
        expect(input.attributes('aria-required')).toBe('true');
        expect(wrapper.find('label').attributes('for')).toBe('caseload');
        expect(wrapper.find(`#${input.attributes('aria-describedby')}`).text()).toBe('Required');
    });

    it('lets every prop the control was given win, an explicit false included', () => {
        const wrapper = mount(FormField, {
            props: {id: 'field', error: 'Required', required: true},
            slots: {
                default: () => h(OutsideControl, {id: 'own', invalid: false, describedby: 'hint', required: false}),
            },
        });
        const input = wrapper.find('input');

        expect(input.attributes('id')).toBe('own');
        expect(input.attributes('aria-invalid')).toBeUndefined();
        expect(input.attributes('aria-describedby')).toBe('hint');
        expect(input.attributes('aria-required')).toBeUndefined();
    });

    it('falls back to its own generated id and no mark outside any field', () => {
        const input = mount(OutsideControl).find('input');

        expect(input.attributes('id')).toMatch(/\S/);
        expect(input.attributes('aria-invalid')).toBeUndefined();
        expect(input.attributes('aria-describedby')).toBeUndefined();
        expect(input.attributes('aria-required')).toBeUndefined();
    });

    it('reads the nearest field when fields nest', () => {
        const wrapper = mount(FormField, {
            props: {id: 'outer', error: 'Outer'},
            slots: {default: () => h(FormField, {id: 'inner'}, {default: () => h(OutsideControl)})},
        });
        const input = wrapper.find('input');

        expect(input.attributes('id')).toBe('inner');
        expect(input.attributes('aria-invalid')).toBeUndefined();
    });

    it('follows the field when its error changes', async () => {
        const wrapper = mount(FormField, {props: {id: 'email'}, slots: {default: () => h(OutsideControl)}});

        await wrapper.setProps({error: 'Bad email'});
        expect(wrapper.find('input').attributes('aria-describedby')).toBe('email-error');

        await wrapper.setProps({error: undefined});
        expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined();
    });
});

describe('useFieldControl isolate', () => {
    // A control that renders another control inside itself (emmie's SearchableSelect: a search box
    // in the dropdown). It takes the field for itself; the inner box must not be marked or described.
    const WithInnerSearch = defineComponent({
        setup: () => {
            const control = useFieldControl(() => ({}), {isolate: true});

            return () =>
                h('div', {id: control.value.id, 'aria-invalid': control.value.invalid || undefined}, [
                    h(TextInput, {modelValue: '', class: 'inner'}),
                ]);
        },
    });

    it('lets the controls inside a wrapper that does not isolate inherit the field (a thin adapter)', () => {
        const Adapter = defineComponent({
            setup: () => {
                const control = useFieldControl(() => ({}));

                return () => h('div', {'data-wrapper': control.value.id}, [h(TextInput, {modelValue: ''})]);
            },
        });
        const wrapper = mount(FormField, {
            props: {id: 'name', error: 'Vul een naam in'},
            slots: {default: () => h(Adapter)},
        });
        const input = wrapper.find('input');

        expect(input.attributes('id')).toBe('name');
        expect(input.attributes('aria-describedby')).toBe('name-error');
    });

    it('keeps the field for the outer control and hides it from the controls inside', () => {
        const wrapper = mount(FormField, {
            props: {id: 'client', error: 'Kies een cliënt'},
            slots: {default: () => h(WithInnerSearch)},
        });
        const inner = wrapper.find('input.inner');

        expect(wrapper.find('div#client').attributes('aria-invalid')).toBe('true');
        expect(inner.attributes('id')).not.toBe('client');
        expect(inner.attributes('aria-invalid')).toBeUndefined();
        expect(inner.attributes('aria-describedby')).toBeUndefined();
    });
});

describe('FormField name', () => {
    it('reads its message from the provided bag by name, verbatim', async () => {
        const errors = ref<FieldErrors>({});
        const wrapper = mount(
            formWith(errors, () =>
                h('div', [
                    h(
                        FormField,
                        {name: 'learningGoals.0.title', label: 'Title'},
                        {default: () => h(TextInput, {modelValue: ''})},
                    ),
                    h(FormField, {name: 'remarks', label: 'Remarks'}, {default: () => h(Textarea, {modelValue: ''})}),
                ]),
            ),
        );

        errors.value = {'learningGoals.0.title': 'Vul een titel in'};
        await nextTick();

        const [title, remarks] = wrapper.findAll('.ui-field');
        const input = title!.find('input');
        expect(title!.find('.ui-error').text()).toBe('Vul een titel in');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(title!.find(`#${input.attributes('aria-describedby')}`).text()).toBe('Vul een titel in');
        expect(title!.find('label').attributes('for')).toBe(input.attributes('id'));
        expect(remarks!.find('textarea').attributes('aria-invalid')).toBeUndefined();
        expect(remarks!.find('.ui-error').exists()).toBe(false);
    });

    it('generates distinct ids for two fields with the same name in two forms', () => {
        const errors = ref<FieldErrors>({});
        const field = () =>
            h(FormField, {name: 'email', label: 'Email'}, {default: () => h(TextInput, {modelValue: ''})});
        const wrapper = mount(
            defineComponent({render: () => h('div', [h(formWith(errors, field)), h(formWith(errors, field))])}),
        );
        const [first, second] = wrapper.findAll('input');

        expect(first!.attributes('id')).not.toBe(second!.attributes('id'));
    });

    it('lets an explicit error win over the bag', () => {
        const errors = ref<FieldErrors>({email: 'From the bag'});
        const wrapper = mount(
            formWith(errors, () =>
                h(FormField, {name: 'email', error: 'Explicit'}, {default: () => h(TextInput, {modelValue: ''})}),
            ),
        );

        expect(wrapper.find('.ui-error').text()).toBe('Explicit');
    });

    it('treats an empty message as no error, so describedby never points at a missing element', () => {
        const errors = ref<FieldErrors>({email: ''});
        const wrapper = mount(
            formWith(errors, () => h(FormField, {name: 'email'}, {default: () => h(TextInput, {modelValue: ''})})),
        );
        const input = wrapper.find('input');

        expect(wrapper.find('.ui-error').exists()).toBe(false);
        expect(input.attributes('aria-invalid')).toBeUndefined();
        expect(input.attributes('aria-describedby')).toBeUndefined();
    });

    it('reads the nearest provided bag', () => {
        const outer = ref<FieldErrors>({email: 'Outer form'});
        const inner = ref<FieldErrors>({});
        const field = () => h(FormField, {name: 'email'}, {default: () => h(TextInput, {modelValue: ''})});
        const wrapper = mount(formWith(outer, () => h(formWith(inner, field))));

        expect(wrapper.find('.ui-error').exists()).toBe(false);
    });

    it('warns in development when a name finds no bag', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        mount(FormField, {props: {name: 'email'}, slots: {default: () => h(TextInput, {modelValue: ''})}});

        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0]![0])).toContain('<FormField name="email"> found no error bag');
    });

    it('stays quiet with a bag, and without a name', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        mount(
            formWith(ref<FieldErrors>({}), () =>
                h(FormField, {name: 'email'}, {default: () => h(TextInput, {modelValue: ''})}),
            ),
        );
        mount(FormField, {props: {id: 'plain'}, slots: {default: () => h(TextInput, {modelValue: ''})}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('accepts a getter as the source', () => {
        const wrapper = mount(
            defineComponent({
                setup: () => {
                    provideFieldErrors(() => ({email: 'From a getter'}));

                    return () => h(FormField, {name: 'email'}, {default: () => h(TextInput, {modelValue: ''})});
                },
            }),
        );

        expect(wrapper.find('.ui-error').text()).toBe('From a getter');
    });
});

describe('CheckboxGroup inside a field', () => {
    it('carries the field wiring on the fieldset only, never on its members', () => {
        const wrapper = mount(FormField, {
            props: {id: 'fruit', error: 'Pick one'},
            slots: {
                default: () =>
                    h(CheckboxGroup, {
                        options: [{id: 1, name: 'Apple'}],
                        optionLabel: 'name',
                        label: 'Fruit',
                        modelValue: [],
                    }),
            },
        });
        const fieldset = wrapper.find('fieldset');
        const member = wrapper.find('input[type="checkbox"]');

        expect(fieldset.attributes('id')).toBe('fruit');
        expect(fieldset.attributes('aria-invalid')).toBe('true');
        expect(fieldset.attributes('aria-describedby')).toBe('fruit-error');
        expect(member.attributes('id')).toBe('fruit-opt-0');
        expect(member.attributes('aria-describedby')).toBeUndefined();
    });
});

describe('useFieldError', () => {
    // A test double the way a consumer writes one: renders the message it reads as data-error.
    const Probe = defineComponent({
        props: {name: {type: String, default: undefined}},
        setup: (props) => {
            const message = useFieldError(() => props.name);

            return () => h('span', {'data-error': message.value});
        },
    });

    it('reads the message by name from the nearest bag, and follows the bag and the name', async () => {
        const errors = ref<FieldErrors>({remarks: 'Te lang'});
        const name = ref('remarks');
        const wrapper = mount(formWith(errors, () => h(Probe, {name: name.value})));

        expect(wrapper.find('span').attributes('data-error')).toBe('Te lang');

        name.value = 'title';
        errors.value = {title: 'Vul een titel in'};
        await nextTick();
        expect(wrapper.find('span').attributes('data-error')).toBe('Vul een titel in');
    });

    it('gives undefined for an empty message, a missing key, no name and no bag', () => {
        const bagged = mount(
            formWith(ref<FieldErrors>({empty: ''}), () =>
                h('div', [h(Probe, {name: 'empty'}), h(Probe, {name: 'missing'}), h(Probe)]),
            ),
        );

        for (const span of bagged.findAll('span')) expect(span.attributes('data-error')).toBeUndefined();
        expect(
            mount(Probe, {props: {name: 'remarks'}})
                .find('span')
                .attributes('data-error'),
        ).toBeUndefined();
    });
});
