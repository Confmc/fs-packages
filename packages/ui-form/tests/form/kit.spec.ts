// @vitest-environment happy-dom
import {enableAutoUnmount, mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick, ref} from 'vue';

import type {FieldBinding, UseDraftForm} from '../../src';

import {TextInput, useForm} from '../../src';

interface Draft {
    name: string | null;
}
const newDraft = (): Draft => ({name: 'Ann'});

const mountWith = (render: (form: UseDraftForm<Draft>) => ReturnType<typeof h>) => {
    const draft = ref(newDraft());
    let form!: UseDraftForm<Draft>;
    const wrapper = mount(
        defineComponent({
            setup: () => {
                form = useForm({draft});
                return () => render(form);
            },
        }),
        {attachTo: document.body},
    );
    return {wrapper, draft, form: () => form};
};

// A failing test still unmounts: ids from useId() repeat across mounts, so a form left in the DOM
// would be found in place of the next test's.
enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

describe('form-bound controls', () => {
    it('draws the field around the control, wired by its name: label, value, write-back, message', async () => {
        const {wrapper, draft, form} = mountWith(({TextField}) =>
            h(TextField, {name: 'name', label: 'Naam', required: true, placeholder: 'Vul in', class: 'w-40'}),
        );
        const input = wrapper.find('input');

        expect(wrapper.find('label').attributes('for')).toBe(input.attributes('id'));
        expect(input.element.value).toBe('Ann');
        expect(input.attributes('placeholder')).toBe('Vul in');
        expect(input.attributes('aria-required')).toBe('true');
        expect(wrapper.find('label .ui-label__req').exists()).toBe(true);
        expect(wrapper.find('.ui-field').classes()).toContain('w-40');

        await input.setValue('Bo');
        expect(draft.value.name).toBe('Bo');

        form().refuse('name', 'Te kort');
        await nextTick();
        expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
        expect(wrapper.find(`#${wrapper.find('input').attributes('aria-describedby')}`).text()).toBe('Te kort');
    });

    it('puts class and style on the field, not on the control', () => {
        const {wrapper} = mountWith(({TextField}) =>
            h(TextField, {name: 'name', label: 'Naam', placeholder: 'Vul in', class: 'w-40', style: 'width: 10rem'}),
        );

        expect(wrapper.find('.ui-field').attributes('style')).toBe('width: 10rem;');
        expect(wrapper.find('.ui-input-wrap').attributes()).not.toHaveProperty('style');
        expect(wrapper.find('.ui-input-wrap').classes()).not.toContain('w-40');
    });

    it('keeps its own props off the control, and hands every other attribute to the control, not the field', () => {
        const {wrapper} = mountWith(({TextField}) =>
            h(TextField, {
                name: 'name',
                label: 'Naam',
                placeholder: 'Vul in',
                orientation: 'horizontal',
                'data-test': 'naam',
            }),
        );
        const field = wrapper.find('.ui-field');
        const input = wrapper.find('input');

        expect(field.classes()).toContain('is-horizontal');
        expect(field.attributes()).not.toHaveProperty('data-test');
        expect(input.attributes('data-test')).toBe('naam');
        expect(input.attributes()).not.toHaveProperty('orientation');
        expect(input.attributes()).not.toHaveProperty('label');
    });

    it("binds a FormField by name: the form's ids, label and message, and the wiring without the value", async () => {
        let scope!: FieldBinding;
        const {wrapper, form} = mountWith(({FormField}) =>
            h(
                FormField,
                {name: 'name', label: 'Naam', required: true, class: 'w-40'},
                {
                    default: ({field}: {field: FieldBinding}) => {
                        scope = field;
                        return h(TextInput, {...field, placeholder: 'Vul in', modelValue: 'eigen'});
                    },
                },
            ),
        );
        form().refuse('name', 'Te kort');
        await nextTick();
        const id = form().field('name').id;

        expect(wrapper.find('input').attributes('id')).toBe(id);
        expect(wrapper.find('label').attributes('for')).toBe(id);
        expect(wrapper.find('.ui-field').classes()).toContain('w-40');
        expect(wrapper.find(`#${id}-error`).text()).toBe('Te kort');
        expect(wrapper.find('label .ui-label__req').exists()).toBe(true);
        expect(form().FormField.name).toBe('FormField');
        expect(scope).toEqual({id, invalid: true, describedby: `${id}-error`});
    });

    it("leaves a bound FormField's control its own v-model: the draft is not written", async () => {
        const own = ref<string | null>(null);
        const {wrapper, draft} = mountWith(({FormField}) =>
            h(
                FormField,
                {name: 'name', label: 'Gemeente'},
                {
                    default: ({field}: {field: FieldBinding}) =>
                        h(TextInput, {
                            ...field,
                            placeholder: 'Vul in',
                            modelValue: own.value,
                            'onUpdate:modelValue': (next: string | null) => (own.value = next),
                        }),
                },
            ),
        );

        await wrapper.find('input').setValue('Utrecht');

        expect(own.value).toBe('Utrecht');
        expect(draft.value.name).toBe('Ann');
    });

    it('binds FormLabel and FormError by name, under stable component names, with nothing stray on the label', async () => {
        const {wrapper, form} = mountWith((bound) =>
            h('div', [
                h(bound.FormLabel, {name: 'name', label: 'Naam', required: true}),
                h(bound.FormError, {name: 'name'}),
            ]),
        );
        form().refuse('name', 'Te kort');
        await nextTick();
        const label = wrapper.find('label');

        expect(label.text()).toBe('Naam*');
        expect(label.find('.ui-label__req').exists()).toBe(true);
        expect(Object.keys(label.attributes())).toEqual(['class', 'for']);
        expect(form().FormLabel.name).toBe('FormLabel');
        expect(form().FormError.name).toBe('FormError');
        expect(wrapper.findComponent({name: 'FormError'}).text()).toBe('Te kort');
    });

    it('lets the call site override the wiring: invalid false shows the message without the mark', async () => {
        const {wrapper, form} = mountWith(({TextField}) =>
            h(TextField, {name: 'name', label: 'Naam', placeholder: 'Vul in', invalid: false}),
        );
        form().refuse('name', 'Te kort');
        await nextTick();

        expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined();
        expect(wrapper.text()).toContain('Te kort');
    });

    it('has a stable component name per control, so a spec finds them by name or by the inner control', () => {
        const {wrapper} = mountWith(({TextField}) =>
            h('div', [
                h(TextField, {name: 'name', label: 'Naam', placeholder: 'Vul in'}),
                h(TextField, {name: 'name', label: 'Opnieuw', placeholder: 'Vul in'}),
            ]),
        );

        expect(wrapper.findAllComponents({name: 'TextField'}).map((field) => field.props('label'))).toEqual([
            'Naam',
            'Opnieuw',
        ]);
        expect(wrapper.findAllComponents(TextInput)).toHaveLength(2);
    });

    it("shows the server's 422 on its bound field and scrolls the refused control into view", async () => {
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
        const {wrapper, form} = mountWith(({TextField}) =>
            h(TextField, {name: 'name', label: 'Naam', placeholder: 'Vul in'}),
        );
        const refusal = {isAxiosError: true, response: {status: 422, data: {errors: {name: ['Al in gebruik']}}}};

        await expect(form().handleSubmit(() => Promise.reject(refusal))).resolves.toBe('refused');

        const input = wrapper.find('input');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(wrapper.find(`#${input.attributes('aria-describedby')}`).text()).toBe('Al in gebruik');
        expect(scrollIntoView.mock.contexts).toEqual([input.element]);
    });

    it('takes a v-model at the call site over the draft, so a proxy converts before the draft is written', async () => {
        const shown = ref<string | null>('in uren');
        const {wrapper, draft} = mountWith(({TextField}) =>
            h(TextField, {
                name: 'name',
                placeholder: 'Vul in',
                modelValue: shown.value,
                'onUpdate:modelValue': (next: string | null) => (shown.value = next),
            }),
        );

        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('in uren');
        await wrapper.find('input').setValue('8');

        expect(shown.value).toBe('8');
        expect(draft.value.name).toBe('Ann');
    });

    it('takes its value from v-model on a form without a draft', async () => {
        const value = ref<string | null>('x');
        const wrapper = mount(
            defineComponent({
                setup: () => {
                    const {TextField} = useForm();
                    return () =>
                        h(TextField, {
                            name: 'email',
                            placeholder: 'E-mail',
                            modelValue: value.value,
                            'onUpdate:modelValue': (next: string | null) => (value.value = next),
                        });
                },
            }),
        );

        await wrapper.find('input').setValue('y');
        expect(value.value).toBe('y');
    });
});
