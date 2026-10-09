// @vitest-environment happy-dom
import {mount, shallowMount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';
import {defineComponent, h} from 'vue';

import {
    Checkbox,
    CheckboxGroup,
    Combobox,
    DateInput,
    FormField,
    GroupCombobox,
    GroupSelect,
    MultiCombobox,
    MultiSelect,
    NumberInput,
    RadioGroup,
    SingleSelect,
    Switch,
    Textarea,
    TextInput,
} from '../src';

interface FieldScope {
    field: {id: string; invalid: boolean; describedby: string | undefined};
}

// A control from OUTSIDE the package (an emmie control): plain props, no composable.
const OutsideControl = defineComponent({
    props: {
        id: {type: String, default: undefined},
        invalid: {type: Boolean, default: false},
        describedby: {type: String, default: undefined},
    },
    setup: (props) => () =>
        h('input', {id: props.id, 'aria-invalid': props.invalid || undefined, 'aria-describedby': props.describedby}),
});

// The documented shape: one v-bind of the slot's `field` on the control.
const spread =
    (control: unknown = OutsideControl, extra: Record<string, unknown> = {}) =>
    ({field}: FieldScope) =>
        h(control as never, {...field, ...extra});

const inField = (props: Record<string, unknown>, slot: (scope: FieldScope) => unknown) =>
    mount(FormField, {props, slots: {default: slot as never}});

describe('FormField hands its control one object to bind', () => {
    it('wires the control with one v-bind: id, mark and describedby, matching the label and the message', () => {
        const wrapper = inField({id: 'caseload', label: 'Caseload', error: 'Required'}, spread());
        const input = wrapper.find('input');

        expect(input.attributes('id')).toBe('caseload');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('caseload-error');
        expect(wrapper.find('label').attributes('for')).toBe('caseload');
        expect(wrapper.find('#caseload-error').text()).toBe('Required');
    });

    it('hands over exactly id, invalid and describedby: required stays on the label', () => {
        let received: FieldScope['field'] | undefined;
        const wrapper = inField({id: 'name', label: 'Name', required: true}, ({field}) => {
            received = field;
            return h('span');
        });

        expect(received).toEqual({id: 'name', invalid: false, describedby: undefined});
        expect(wrapper.find('.ui-label__req').exists()).toBe(true);
    });

    it('generates the id when none is given', () => {
        const input = inField({label: 'Name'}, spread()).find('input');

        expect(input.attributes('id')).toMatch(/\S/);
        expect(input.attributes('id')).not.toBe('undefined');
    });

    it('describes a control by its generated id when none is given', () => {
        const input = inField({label: 'Name', error: 'Required'}, spread()).find('input');

        expect(input.attributes('aria-describedby')).toBe(`${input.attributes('id')}-error`);
    });

    it('wires a control wrapped in an element the same way', () => {
        const wrapper = inField({id: 'wrapped', error: 'Required'}, ({field}) =>
            h('div', {class: 'relative'}, [h(OutsideControl, field)]),
        );

        expect(wrapper.find('input').attributes('aria-describedby')).toBe('wrapped-error');
    });

    it('follows the field when its error changes', async () => {
        const wrapper = inField({id: 'email'}, spread());

        await wrapper.setProps({error: 'Bad email'});
        expect(wrapper.find('input').attributes('aria-describedby')).toBe('email-error');

        await wrapper.setProps({error: undefined});
        expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined();
    });

    it('treats an empty error as no error, so describedby never points at a missing element', () => {
        const wrapper = inField({id: 'email', error: ''}, spread());

        expect(wrapper.find('.ui-error').exists()).toBe(false);
        expect(wrapper.find('input').attributes('aria-describedby')).toBeUndefined();
    });

    it('wires a group on its fieldset; its members are its own and never repeat the describedby', () => {
        const wrapper = inField(
            {id: 'fruit', error: 'Pick one'},
            spread(CheckboxGroup, {
                options: [{id: 1, name: 'Apple'}],
                optionLabel: 'name',
                label: 'Fruit',
                modelValue: [],
            }),
        );

        expect(wrapper.find('fieldset').attributes('aria-describedby')).toBe('fruit-error');
        expect(wrapper.find('input[type="checkbox"]').attributes('id')).toBe('fruit-opt-0');
        expect(wrapper.find('input[type="checkbox"]').attributes('aria-describedby')).toBeUndefined();
    });

    it('wires a shallow-mounted consumer: the stubbed control receives the bound props', () => {
        const Host = defineComponent({
            setup: () => () =>
                h(FormField, {id: 'shallow', error: 'Required'}, {default: spread(TextInput, {modelValue: ''})}),
        });
        const control = shallowMount(Host, {global: {stubs: {FormField: false}}}).findComponent(TextInput);

        expect(control.props('id')).toBe('shallow');
        expect(control.props('invalid')).toBe(true);
        expect(control.props('describedby')).toBe('shallow-error');
    });

    it('renders a field with no slot content', () => {
        expect(
            mount(FormField, {props: {id: 'empty'}})
                .find('.ui-field__control')
                .exists(),
        ).toBe(true);
    });

    it.each([
        ['TextInput', TextInput, {modelValue: ''}, 'input'],
        ['Textarea', Textarea, {modelValue: ''}, 'textarea'],
        ['NumberInput', NumberInput, {modelValue: null}, 'input'],
        ['DateInput', DateInput, {modelValue: null}, 'input'],
        ['Checkbox', Checkbox, {modelValue: false, label: 'Accept'}, 'input'],
        ['Switch', Switch, {modelValue: false, label: 'On'}, 'input'],
        ['RadioGroup', RadioGroup, {options: [], optionLabel: 'name', label: 'Fruit', modelValue: null}, 'fieldset'],
        ['SingleSelect', SingleSelect, {options: [], label: 'name', modelValue: null}, '[role="combobox"]'],
        ['Combobox', Combobox, {options: [], label: 'name', modelValue: null}, '[role="combobox"]'],
        ['MultiSelect', MultiSelect, {options: [], label: 'name', modelValue: []}, '[role="combobox"]'],
        ['MultiCombobox', MultiCombobox, {options: [], label: 'name', modelValue: []}, '[role="combobox"]'],
        ['GroupSelect', GroupSelect, {groups: [], label: 'name', modelValue: null}, '[role="combobox"]'],
        ['GroupCombobox', GroupCombobox, {groups: [], label: 'name', modelValue: null}, '[role="combobox"]'],
        [
            'CheckboxGroup',
            CheckboxGroup,
            {options: [], optionLabel: 'name', label: 'Fruit', modelValue: []},
            'fieldset',
        ],
    ])('%s used outside a field gets its own id, and keeps one it was given', (_, control, props, selector) => {
        expect(
            mount(control as never, {props})
                .find(selector)
                .attributes('id'),
        ).toMatch(/\S/);
        expect(
            mount(control as never, {props: {...props, id: 'given'}})
                .find(selector)
                .attributes('id'),
        ).toBe('given');
    });
});
