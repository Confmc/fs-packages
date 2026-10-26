// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import FormLabel from '../src/components/FormLabel.vue';

describe('FormLabel', () => {
    it('renders slot content and the for attribute, without a required marker', () => {
        const wrapper = mount(FormLabel, {props: {htmlFor: 'email'}, slots: {default: 'Email'}});
        expect(wrapper.text()).toContain('Email');
        expect(wrapper.find('label').attributes('for')).toBe('email');
        expect(wrapper.find('.ui-label__req').exists()).toBe(false);
    });

    it('renders the required marker when required, hidden from assistive tech', () => {
        const wrapper = mount(FormLabel, {props: {htmlFor: 'name', required: true}, slots: {default: 'Name'}});
        // the control conveys the required state through aria-required; the marker is only visual
        expect(wrapper.find('.ui-label__req').attributes('aria-hidden')).toBe('true');
    });
});
