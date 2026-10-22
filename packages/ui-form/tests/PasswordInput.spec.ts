// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import PasswordInput from '../src/components/PasswordInput.vue';

const mountPassword = (props: Record<string, unknown> = {}) =>
    mount(PasswordInput, {props: {modelValue: 'geheim', ...props}, attachTo: document.body});

const keydown = (capsLock: boolean): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {key: 'a'});
    Object.defineProperty(event, 'getModifierState', {value: (key: string) => key === 'CapsLock' && capsLock});
    return event;
};

describe('PasswordInput', () => {
    it('hides the password, asks the browser for the saved one, and emits what is typed', async () => {
        const wrapper = mountPassword();
        const input = wrapper.find('input');

        expect(input.attributes('type')).toBe('password');
        expect(input.attributes('autocomplete')).toBe('current-password');
        await input.setValue('nieuw');
        expect(wrapper.emitted('update:modelValue')).toEqual([['nieuw']]);
        wrapper.unmount();
    });

    it('asks for a new password to save when told to', () => {
        const wrapper = mountPassword({autocomplete: 'new-password'});

        expect(wrapper.find('input').attributes('autocomplete')).toBe('new-password');
        wrapper.unmount();
    });

    it('shows and hides it with a toggle button that says which, keeping focus on a mouse click', async () => {
        const wrapper = mountPassword();
        const toggle = wrapper.find('.ui-input__button');

        expect(toggle.attributes('aria-label')).toBe('Show password');
        expect(toggle.attributes('aria-pressed')).toBe('false');
        expect(toggle.attributes('aria-controls')).toBe(wrapper.find('input').attributes('id'));
        const down = new MouseEvent('mousedown', {cancelable: true});
        toggle.element.dispatchEvent(down);
        expect(down.defaultPrevented).toBe(true);

        await toggle.trigger('click');
        expect(wrapper.find('input').attributes('type')).toBe('text');
        expect(toggle.attributes('aria-label')).toBe('Hide password');
        expect(toggle.attributes('aria-pressed')).toBe('true');

        await toggle.trigger('click');
        expect(wrapper.find('input').attributes('type')).toBe('password');
        wrapper.unmount();
    });

    it('names the toggle as asked, and disables it with the field', () => {
        const wrapper = mountPassword({showPasswordLabel: 'Toon wachtwoord', disabled: true});
        const toggle = wrapper.find('.ui-input__button');

        expect(toggle.attributes('aria-label')).toBe('Toon wachtwoord');
        expect(toggle.attributes()).toHaveProperty('disabled');
        wrapper.unmount();
    });

    it('warns while Caps Lock is on, read with the field, and stops when it goes off', async () => {
        const wrapper = mountPassword({describedby: 'pw-error', capsLockText: 'Capslock staat aan'});
        const input = wrapper.find('input');

        input.element.dispatchEvent(keydown(true));
        await wrapper.vm.$nextTick();
        const caps = wrapper.find('.ui-password__caps');
        expect(caps.text()).toBe('Capslock staat aan');
        expect(caps.attributes('role')).toBe('status');
        expect(input.attributes('aria-describedby')).toBe(`pw-error ${caps.attributes('id')}`);

        input.element.dispatchEvent(keydown(false));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.ui-password__caps').exists()).toBe(false);
        expect(input.attributes('aria-describedby')).toBe('pw-error');
        wrapper.unmount();
    });

    it('marks itself with the error icon from error, and focuses on mount with autofocus', () => {
        const wrapper = mountPassword({error: 'Onjuist', autofocus: true});

        expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
        expect(wrapper.find('.ui-input__icon').exists()).toBe(true);
        expect(document.activeElement).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    it('does not emit while an IME composes, as TextInput', async () => {
        const wrapper = mountPassword({modelValue: ''});
        const input = wrapper.find('input');

        await input.trigger('compositionstart');
        input.element.value = 'ぱ';
        await input.trigger('input');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        await input.trigger('compositionend');
        expect(wrapper.emitted('update:modelValue')).toEqual([['ぱ']]);
        wrapper.unmount();
    });

    it('puts class and style on the root and every other attribute on the input', () => {
        const wrapper = mount(PasswordInput, {props: {modelValue: null}, attrs: {class: 'w-60', name: 'password'}});

        expect(wrapper.classes()).toContain('w-60');
        expect(wrapper.find('input').attributes('name')).toBe('password');
        expect(wrapper.find('input').element.value).toBe('');
    });
});
