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

    it('renders the required marker when required', () => {
        const wrapper = mount(FormLabel, {props: {htmlFor: 'name', required: true}, slots: {default: 'Name'}});
        expect(wrapper.find('.ui-label__req').exists()).toBe(true);
    });
});
