// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import FormError from '../src/components/FormError.vue';

describe('FormError', () => {
    it('renders the error text with its id and alert role', () => {
        const wrapper = mount(FormError, {props: {error: 'Required', id: 'email-error'}});
        const paragraph = wrapper.find('p.ui-error');
        expect(paragraph.text()).toBe('Required');
        expect(paragraph.attributes('id')).toBe('email-error');
        expect(paragraph.attributes('role')).toBe('alert');
    });
});
