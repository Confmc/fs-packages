// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import Checkbox from '../src/components/Checkbox.vue';

describe('Checkbox', () => {
    it('renders a native checkbox with its prop label, reflecting an unchecked model and valid state', () => {
        const wrapper = mount(Checkbox, {props: {id: 'accept', label: 'Accept the terms', modelValue: false}});
        const input = wrapper.find('input');

        expect(input.attributes('type')).toBe('checkbox');
        expect(input.attributes('id')).toBe('accept');
        expect((input.element as HTMLInputElement).checked).toBe(false);
        expect(wrapper.find('.ui-check__label').text()).toBe('Accept the terms');
        expect(input.classes()).not.toContain('is-invalid');
        expect(input.attributes('aria-invalid')).toBeUndefined();
        expect(input.attributes('aria-required')).toBeUndefined();
        // Native required is NEVER set — validation is external, aria-required is the conveyance.
        expect(input.attributes('required')).toBeUndefined();
    });

    it('round-trips the boolean model: checking emits true, unchecking emits false, prop drives checked', async () => {
        const wrapper = mount(Checkbox, {props: {id: 'c', modelValue: false}});
        const input = wrapper.find('input');

        await input.setValue(true);
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);

        await wrapper.setProps({modelValue: true});
        expect((input.element as HTMLInputElement).checked).toBe(true);

        await input.setValue(false);
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
    });

    it('honours required/invalid/describedby aria wiring', () => {
        const wrapper = mount(Checkbox, {
            props: {id: 'c', modelValue: false, required: true, invalid: true, describedby: 'c-error'},
        });
        const input = wrapper.find('input');

        expect(input.attributes('aria-required')).toBe('true');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('c-error');
        expect(input.classes()).toContain('is-invalid');
    });

    it('mirrors the indeterminate prop onto the element property without touching the model', async () => {
        const wrapper = mount(Checkbox, {props: {id: 'c', modelValue: false, indeterminate: true}});
        const input = wrapper.find('input').element as HTMLInputElement;

        expect(input.indeterminate).toBe(true);
        // Purely visual — the boolean model never saw an emit from the prop.
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();

        await wrapper.setProps({indeterminate: false});
        expect(input.indeterminate).toBe(false);
    });

    it('lets the default slot override the prop label, and renders no label span with neither', () => {
        const slotted = mount(Checkbox, {
            props: {id: 'c', modelValue: false, label: 'Plain'},
            slots: {default: '<em>Rich</em> label'},
        });
        expect(slotted.find('.ui-check__label').text()).toBe('Rich label');

        const bare = mount(Checkbox, {props: {id: 'c', modelValue: false}});
        expect(bare.find('.ui-check__label').exists()).toBe(false);
    });

    it('renders disabled and ignores a change reaching the handler anyway', async () => {
        const wrapper = mount(Checkbox, {props: {id: 'c', modelValue: false, disabled: true}});
        const input = wrapper.find('input');

        expect(input.attributes('disabled')).toBeDefined();
        expect(wrapper.find('.ui-check').classes()).toContain('is-disabled');

        // Dispatched natively: VTU's trigger()/setValue() silently SKIP disabled elements,
        // which would leave the handler's disabled guard unexercised and the no-emit
        // assertion vacuous — the event must actually reach the handler to prove the guard.
        (input.element as HTMLInputElement).checked = true;
        input.element.dispatchEvent(new Event('change', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('falls native attrs through to the input, not the label root', () => {
        const wrapper = mount(Checkbox, {
            props: {id: 'c', modelValue: false},
            attrs: {name: 'accept', 'data-qa': 'terms'},
        });

        expect(wrapper.find('input').attributes('name')).toBe('accept');
        expect(wrapper.find('input').attributes('data-qa')).toBe('terms');
        expect(wrapper.find('label').attributes('name')).toBeUndefined();
    });
});
