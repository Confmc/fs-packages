// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import {
    Checkbox,
    CheckboxGroup,
    Combobox,
    DateInput,
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

// Every control, the props it needs to render, and the element that carries the mark.
const CONTROLS: [string, unknown, Record<string, unknown>, string][] = [
    ['TextInput', TextInput, {modelValue: ''}, 'input'],
    ['Textarea', Textarea, {modelValue: ''}, 'textarea'],
    ['NumberInput', NumberInput, {modelValue: null}, 'input'],
    ['DateInput', DateInput, {modelValue: null}, 'input'],
    ['Checkbox', Checkbox, {modelValue: false, label: 'Accept'}, 'input'],
    ['Switch', Switch, {modelValue: false, label: 'On'}, 'input'],
    ['RadioGroup', RadioGroup, {options: [], optionLabel: 'name', label: 'Fruit', modelValue: null}, 'fieldset'],
    ['CheckboxGroup', CheckboxGroup, {options: [], optionLabel: 'name', label: 'Fruit', modelValue: []}, 'fieldset'],
    ['SingleSelect', SingleSelect, {options: [], optionLabel: 'name', modelValue: null}, '[role="combobox"]'],
    ['Combobox', Combobox, {options: [], optionLabel: 'name', modelValue: null}, '[role="combobox"]'],
    ['MultiSelect', MultiSelect, {options: [], optionLabel: 'name', modelValue: []}, '[role="combobox"]'],
    ['MultiCombobox', MultiCombobox, {options: [], optionLabel: 'name', modelValue: []}, '[role="combobox"]'],
    ['GroupSelect', GroupSelect, {groups: [], optionLabel: 'name', modelValue: null}, '[role="combobox"]'],
    ['GroupCombobox', GroupCombobox, {groups: [], optionLabel: 'name', modelValue: null}, '[role="combobox"]'],
];

const mark = (control: unknown, props: Record<string, unknown>, selector: string) =>
    mount(control as never, {props})
        .find(selector)
        .attributes('aria-invalid');

describe('every control takes the field message as `error`', () => {
    it.each(CONTROLS)('%s: error alone marks it', (_, control, props, selector) => {
        expect(mark(control, {...props, error: 'Required'}, selector)).toBe('true');
    });

    it.each(CONTROLS)('%s: invalid false shows the message without the mark', (_, control, props, selector) => {
        expect(mark(control, {...props, error: 'Required', invalid: false}, selector)).toBeUndefined();
    });

    it.each(CONTROLS)('%s: invalid true marks it without a message', (_, control, props, selector) => {
        expect(mark(control, {...props, invalid: true}, selector)).toBe('true');
    });

    it.each(CONTROLS)(
        '%s: neither leaves it unmarked, and error never leaks as an attribute',
        (_, control, props, selector) => {
            const wrapper = mount(control as never, {props: {...props, error: ''}});

            expect(wrapper.find(selector).attributes('aria-invalid')).toBeUndefined();
            expect(wrapper.html()).not.toMatch(/\serror=/);
        },
    );
});
