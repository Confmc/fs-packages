// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';

import TimeInput from '../src/components/TimeInput.vue';

afterEach(() => {
    vi.restoreAllMocks();
});

const mountTime = (props: Record<string, unknown> = {}) =>
    mount(TimeInput, {props: {modelValue: '09:30', ...props}, attachTo: document.body});

describe('TimeInput', () => {
    it('shows the time, and emits the typed one, an emptied field as null (no time)', async () => {
        const wrapper = mountTime();
        const input = wrapper.find('input');

        expect(input.attributes('type')).toBe('time');
        expect(input.element.value).toBe('09:30');
        await input.setValue('14:15');
        await input.setValue('');

        expect(wrapper.emitted('update:modelValue')).toEqual([['14:15'], [null]]);
        wrapper.unmount();
    });

    it('renders null as an empty field', () => {
        const wrapper = mountTime({modelValue: null});

        expect(wrapper.find('input').element.value).toBe('');
        wrapper.unmount();
    });

    it('offers a clear button while there is a time, which clears to null and keeps focus on the input', async () => {
        const wrapper = mountTime();
        const clear = wrapper.find('.ui-input__button');

        expect(clear.attributes('aria-label')).toBe('Clear');
        expect(clear.attributes('tabindex')).toBe('-1');
        const down = new MouseEvent('mousedown', {cancelable: true});
        clear.element.dispatchEvent(down);
        expect(down.defaultPrevented).toBe(true);

        await clear.trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
        expect(document.activeElement).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    it.each([
        ['no time', {modelValue: null}],
        ['disabled', {disabled: true}],
        ['clearable false', {clearable: false}],
    ])('has no clear button with %s', (_, props) => {
        const wrapper = mountTime(props);

        expect(wrapper.find('.ui-input__button').exists()).toBe(false);
        expect(wrapper.find('input').classes()).not.toContain('has-button');
        wrapper.unmount();
    });

    it('names the clear button as asked', () => {
        const wrapper = mountTime({clearButtonLabel: 'Wis tijd'});

        expect(wrapper.find('.ui-input__button').attributes('aria-label')).toBe('Wis tijd');
        wrapper.unmount();
    });

    it('steps in minutes', () => {
        const wrapper = mountTime({step: 15});
        const plain = mountTime();

        expect(wrapper.find('input').attributes('step')).toBe('900');
        expect(plain.find('input').attributes()).not.toHaveProperty('step');
        wrapper.unmount();
        plain.unmount();
    });

    it('opens the picker on a click and closes it on the next, or on blur', async () => {
        const showPicker = vi.fn();
        Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {value: showPicker, configurable: true});
        const wrapper = mountTime();
        const input = wrapper.find('input');

        await input.trigger('click');
        await input.trigger('click');
        await input.trigger('click');
        await input.trigger('blur');
        await input.trigger('click');

        expect(showPicker).toHaveBeenCalledTimes(3);
        wrapper.unmount();
        Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker');
    });

    it('leaves a click to the field where the browser has no picker or refuses it', async () => {
        // happy-dom has no showPicker, as an older browser: calling it throws, and nothing breaks
        const wrapper = mountTime();

        await expect(wrapper.find('input').trigger('click')).resolves.not.toThrow();
        wrapper.unmount();
    });

    it('marks itself and shows the error icon from error, unless invalid says otherwise', () => {
        const marked = mountTime({error: 'Vul een tijd in'});
        const quiet = mountTime({error: 'Vul een tijd in', invalid: false});

        expect(marked.find('input').attributes('aria-invalid')).toBe('true');
        expect(marked.find('.ui-input__icon').exists()).toBe(true);
        expect(quiet.find('input').attributes('aria-invalid')).toBeUndefined();
        expect(quiet.find('.ui-input__icon').exists()).toBe(false);
        marked.unmount();
        quiet.unmount();
    });

    it('focuses on mount with autofocus', () => {
        const wrapper = mountTime({autofocus: true});

        expect(document.activeElement).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    it('puts class and style on the wrapper and every other attribute on the input', () => {
        const wrapper = mount(TimeInput, {
            props: {modelValue: null, id: 'start'},
            attrs: {class: 'w-37', 'data-test': 'start-time'},
        });

        expect(wrapper.classes()).toContain('w-37');
        expect(wrapper.find('input').attributes('data-test')).toBe('start-time');
        expect(wrapper.find('input').attributes('id')).toBe('start');
    });
});
