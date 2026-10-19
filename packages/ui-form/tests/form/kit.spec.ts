// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';
import {defineComponent, h, nextTick, ref} from 'vue';

import {Checkbox, createUiForm, SingleSelect, TextInput, useForm} from '../../src';

interface Draft {
    name: string | null;
    active: boolean;
    debtorId: number | null;
    tagIds: number[];
}
const debtors = [
    {id: 1, name: 'Gemeente'},
    {id: 2, name: 'Zorgkantoor'},
];
const newDraft = (): Draft => ({name: 'Ann', active: false, debtorId: null, tagIds: []});

const mountWith = (render: (form: ReturnType<typeof useForm<Draft>>) => ReturnType<typeof h>, make = useForm) => {
    const draft = ref(newDraft());
    let form!: ReturnType<typeof useForm<Draft>>;
    const wrapper = mount(
        defineComponent({
            setup: () => {
                form = make({draft}) as typeof form;
                return () => render(form);
            },
        }),
        {attachTo: document.body},
    );
    return {wrapper, draft, form: () => form};
};

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
        expect(wrapper.find('.ui-field').classes()).toContain('w-40');

        await input.setValue('Bo');
        expect(draft.value.name).toBe('Bo');

        form().refuse('name', 'Te kort');
        await nextTick();
        expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
        expect(wrapper.find(`#${wrapper.find('input').attributes('aria-describedby')}`).text()).toBe('Te kort');
    });

    it('joins addon texts to a text-like field and names them with the message in aria-describedby', async () => {
        const draft = ref({rate: null as number | null});
        let form!: ReturnType<typeof useForm<{rate: number | null}>>;
        const wrapper = mount(
            defineComponent({
                setup: () => {
                    form = useForm({draft});
                    return () => h(form.NumberField, {name: 'rate', label: 'Tarief', prepend: '€', append: 'per uur'});
                },
            }),
        );
        const input = wrapper.find('input');
        const id = input.attributes('id');

        expect(wrapper.findAll('.ui-input-group__addon').map((addon) => addon.text())).toEqual(['€', 'per uur']);
        expect(input.attributes('aria-describedby')).toBe(`${id}-prepend ${id}-append`);

        form.refuse('rate', 'Vul een tarief in');
        await nextTick();
        expect(wrapper.find('input').attributes('aria-describedby')).toBe(`${id}-error ${id}-prepend ${id}-append`);
    });

    it('hands a hint to the field and names it after the message, before the addons', async () => {
        const {wrapper, form} = mountWith(({TextField}) =>
            h(TextField, {name: 'name', label: 'Naam', append: 'tekens'}, {hint: () => 'Zoals op het paspoort'}),
        );
        form().refuse('name', 'Te kort');
        await nextTick();
        const id = wrapper.find('input').attributes('id');

        expect(wrapper.find('.ui-hint').text()).toBe('Zoals op het paspoort');
        expect(wrapper.find('input').attributes('aria-describedby')).toBe(`${id}-error ${id}-hint ${id}-append`);
    });

    it('joins a single addon text too', () => {
        const {wrapper} = mountWith(({TextField}) => h(TextField, {name: 'name', label: 'Naam', append: 'dagen'}));
        const id = wrapper.find('input').attributes('id');

        expect(wrapper.findAll('.ui-input-group__addon').map((addon) => addon.text())).toEqual(['dagen']);
        expect(wrapper.find('input').attributes('aria-describedby')).toBe(`${id}-append`);
    });

    it('keeps its own props off the control, and hands every other attribute to the control, not the field', () => {
        const {wrapper} = mountWith(({TextField}) =>
            h(TextField, {name: 'name', label: 'Naam', orientation: 'horizontal', prepend: '€', 'data-test': 'naam'}),
        );
        const field = wrapper.find('.ui-field');
        const input = wrapper.find('input');

        expect(field.classes()).toContain('is-horizontal');
        expect(field.attributes()).not.toHaveProperty('data-test');
        expect(input.attributes('data-test')).toBe('naam');
        expect(input.attributes()).not.toHaveProperty('orientation');
        expect(input.attributes()).not.toHaveProperty('prepend');
        expect(input.attributes()).not.toHaveProperty('label');
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
        expect(wrapper.findComponent({name: 'FormLabel'}).exists()).toBe(true);
        expect(wrapper.findComponent({name: 'FormError'}).text()).toBe('Te kort');
    });

    it('renders no group without addons', () => {
        const {wrapper} = mountWith(({TextField}) => h(TextField, {name: 'name', label: 'Naam'}));

        expect(wrapper.find('.ui-input-group').exists()).toBe(false);
        expect(wrapper.find('input').attributes()).not.toHaveProperty('aria-describedby');
    });

    it('lets the call site override the wiring: invalid false shows the message without the mark', async () => {
        const {wrapper, form} = mountWith(({TextField}) => h(TextField, {name: 'name', label: 'Naam', invalid: false}));
        form().refuse('name', 'Te kort');
        await nextTick();

        expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined();
        expect(wrapper.text()).toContain('Te kort');
    });

    it('hands label-after and aside to the field frame, and every other slot to the control', async () => {
        const {wrapper} = mountWith(({SingleSelectField}) =>
            h(
                SingleSelectField,
                {name: 'debtorId', label: 'Debiteur', options: debtors, optionLabel: 'name'},
                {
                    'label-after': () => h('em', {class: 'note'}, 'optioneel'),
                    aside: () => h('span', {class: 'toggle'}, 'aan'),
                    option: ({option}: {option: {name: string}}) => h('b', option.name),
                },
            ),
        );

        expect(wrapper.find('label.ui-label .note').text()).toBe('optioneel');
        expect(wrapper.find('.ui-field__head .toggle').text()).toBe('aan');
        await wrapper.find('button').trigger('click');
        expect(wrapper.findAll('[role="option"] b').map((option) => option.text())).toEqual([
            'Gemeente',
            'Zorgkantoor',
        ]);
    });

    it("puts a checkbox's label on the box itself, not in a field label column", () => {
        const {wrapper} = mountWith(({CheckboxField}) => h(CheckboxField, {name: 'active', label: 'Actief'}));

        expect(wrapper.findComponent(Checkbox).props('label')).toBe('Actief');
        expect(wrapper.find('.ui-field > .ui-label').exists()).toBe(false);
    });

    it('binds a select to an id path, with its options passed through', async () => {
        const {wrapper, draft} = mountWith(({SingleSelectField}) =>
            h(SingleSelectField, {name: 'debtorId', label: 'Debiteur', options: debtors, optionLabel: 'name'}),
        );
        const select = wrapper.findComponent(SingleSelect);

        expect(select.props('options')).toEqual(debtors);
        select.vm.$emit('update:modelValue', 2);
        await nextTick();
        expect(draft.value.debtorId).toBe(2);
    });

    it('has a stable component name per control, so a spec finds them by name or by the inner control', () => {
        const {wrapper} = mountWith(({TextField}) =>
            h('div', [h(TextField, {name: 'name', label: 'Naam'}), h(TextField, {name: 'name', label: 'Opnieuw'})]),
        );

        expect(wrapper.findAllComponents({name: 'TextField'}).map((field) => field.props('label'))).toEqual([
            'Naam',
            'Opnieuw',
        ]);
        expect(wrapper.findAllComponents(TextInput)).toHaveLength(2);
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

describe('createUiForm', () => {
    const ui = createUiForm({
        texts: {
            placeholder: 'Kies…',
            emptyText: 'Geen opties',
            optionsLabel: 'Opties',
            removeLabel: 'Verwijder',
            requiredLabel: '(verplicht)',
            clearButtonLabel: 'Wis',
            showPasswordLabel: 'Toon wachtwoord',
        },
    });

    it('gives the bound selects the configured texts, and only the controls that declare them', () => {
        const {wrapper} = mountWith(
            ({SingleSelectField, TextField}) =>
                h('div', [
                    h(SingleSelectField, {name: 'debtorId', options: debtors, optionLabel: 'name'}),
                    h(TextField, {name: 'name'}),
                ]),
            ui.useForm,
        );

        expect(wrapper.findComponent(SingleSelect).props('placeholder')).toBe('Kies…');
        expect(wrapper.findComponent(SingleSelect).props('emptyText')).toBe('Geen opties');
        expect(wrapper.find('input').attributes()).not.toHaveProperty('placeholder');
        expect(wrapper.find('input').attributes()).not.toHaveProperty('emptytext');
    });

    it('carries removeLabel to the multi-selects and requiredLabel to the checkbox group', () => {
        const {wrapper} = mountWith(
            ({MultiSelectField, CheckboxGroupField}) =>
                h('div', [
                    h(MultiSelectField, {name: 'tagIds', options: debtors, optionLabel: 'name'}),
                    h(CheckboxGroupField, {name: 'tagIds', options: debtors, optionLabel: 'name', label: 'Tags'}),
                ]),
            ui.useForm,
        );

        expect(
            wrapper.findComponent({name: 'MultiSelectField'}).findComponent({name: 'MultiSelect'}).props('removeLabel'),
        ).toBe('Verwijder');
        expect(
            wrapper
                .findComponent({name: 'CheckboxGroupField'})
                .findComponent({name: 'CheckboxGroup'})
                .props('requiredLabel'),
        ).toBe('(verplicht)');
    });

    it('hands out the bare controls with those texts as defaults; the call site still wins', () => {
        const defaulted = mount(ui.SingleSelect, {props: {options: debtors, optionLabel: 'name', modelValue: null}});
        const overridden = mount(ui.SingleSelect, {
            props: {options: debtors, optionLabel: 'name', modelValue: null, placeholder: 'Eigen'},
        });

        expect(defaulted.findComponent(SingleSelect).props('placeholder')).toBe('Kies…');
        expect(overridden.findComponent(SingleSelect).props('placeholder')).toBe('Eigen');
    });

    it("names a TimeField's clear button with the configured text", () => {
        const draft = ref({start: '09:00' as string | null});
        const wrapper = mount(
            defineComponent({
                setup: () => {
                    const {TimeField} = ui.useForm({draft});
                    return () => h(TimeField, {name: 'start', label: 'Start'});
                },
            }),
        );

        expect(wrapper.find('.ui-input__button').attributes('aria-label')).toBe('Wis');
    });

    it('gives a bare SearchInput the configured clear button name', () => {
        const wrapper = mount(ui.SearchInput, {props: {modelValue: 'appel'}});

        expect(wrapper.find('.ui-input__button').attributes('aria-label')).toBe('Wis');
    });

    it("names a PasswordField's toggle with the configured text", () => {
        const draft = ref({password: null as string | null});
        const wrapper = mount(
            defineComponent({
                setup: () => {
                    const {PasswordField} = ui.useForm({draft});
                    return () => h(PasswordField, {name: 'password', label: 'Wachtwoord'});
                },
            }),
        );

        expect(wrapper.find('.ui-input__button').attributes('aria-label')).toBe('Toon wachtwoord');
    });

    it('keeps the control name on every bare control it wraps with texts', () => {
        const wrapped = Object.entries(ui).filter(([key]) => key !== 'useForm');

        expect(wrapped.map(([key, control]) => [key, (control as {name?: string}).name])).toEqual(
            wrapped.map(([key]) => [key, key]),
        );
    });

    it('hands out the package controls themselves when no texts are configured', () => {
        expect(createUiForm().SingleSelect).toBe(SingleSelect);
    });
});
