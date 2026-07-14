// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import FsError from '../src/components/FsError.vue';

describe('FsError', () => {
    it('renders nothing when there is no error', () => {
        const wrapper = mount(FsError, {props: {}});
        expect(wrapper.find('p').exists()).toBe(false);
    });

    it('renders the error text with its id and alert role', () => {
        const wrapper = mount(FsError, {props: {error: 'Required', id: 'email-error'}});
        const paragraph = wrapper.find('p.fs-error');
        expect(paragraph.text()).toBe('Required');
        expect(paragraph.attributes('id')).toBe('email-error');
        expect(paragraph.attributes('role')).toBe('alert');
    });
});
