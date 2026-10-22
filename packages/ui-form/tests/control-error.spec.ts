// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import {TextInput} from '../src';

// Every control, the props it needs to render, and the element that carries the mark.
const CONTROLS: [string, unknown, Record<string, unknown>, string][] = [
    ['TextInput', TextInput, {modelValue: ''}, 'input'],
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
