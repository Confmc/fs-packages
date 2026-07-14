// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import FsTextInput from '../src/components/FsTextInput.vue';

describe('FsTextInput', () => {
    it('renders a text input by default, reflecting the model and valid state', () => {
        const wrapper = mount(FsTextInput, {props: {id: 'name', modelValue: 'hi'}});
        const input = wrapper.find('input');

        expect(input.attributes('type')).toBe('text');
        expect((input.element as HTMLInputElement).value).toBe('hi');
        expect(input.classes()).toContain('fs-control');
        expect(input.classes()).not.toContain('is-invalid');
        expect(input.attributes('aria-invalid')).toBeUndefined();
    });

    it('honours type/placeholder/invalid/describedby and emits on input', async () => {
        const wrapper = mount(FsTextInput, {
            props: {
                id: 'pw',
                type: 'password',
                placeholder: 'Password',
                invalid: true,
                describedby: 'pw-error',
                modelValue: '',
            },
        });
        const input = wrapper.find('input');

        expect(input.attributes('type')).toBe('password');
        expect(input.attributes('placeholder')).toBe('Password');
        expect(input.classes()).toContain('is-invalid');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('pw-error');

        await input.setValue('secret');
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['secret']);
    });

    it('renders the disabled attribute when disabled', () => {
        const wrapper = mount(FsTextInput, {props: {id: 'd', disabled: true, modelValue: ''}});
        expect(wrapper.find('input').attributes('disabled')).toBeDefined();
    });
});
