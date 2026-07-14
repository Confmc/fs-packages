// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import FormField from '../src/components/FormField.vue';

// A slot stub that renders the wiring the field exposes, so we can assert it.
const wiringSlot = (scope: {controlId: string; errorId: string; invalid: boolean; describedby?: string}) =>
    `ctl:${scope.controlId}|err:${scope.errorId}|inv:${scope.invalid}|db:${scope.describedby}`;

describe('FormField', () => {
    it('renders a label, generates matching control/error ids, and reports valid state', () => {
        const wrapper = mount(FormField, {
            props: {label: 'Email', required: true, id: 'email'},
            slots: {default: wiringSlot},
        });

        expect(wrapper.find('label.ui-label').text()).toContain('Email');
        expect(wrapper.find('.ui-label__req').exists()).toBe(true);
        expect(wrapper.text()).toContain('ctl:email|err:email-error|inv:false|db:undefined');
        expect(wrapper.find('.ui-error').exists()).toBe(false);
    });

    it('renders the error and threads describedby to the slot when invalid', () => {
        const wrapper = mount(FormField, {
            props: {label: 'Email', id: 'email', error: 'Bad email'},
            slots: {default: wiringSlot},
        });

        expect(wrapper.find('.ui-error').text()).toBe('Bad email');
        expect(wrapper.text()).toContain('inv:true|db:email-error');
    });

    it('omits the label when none is given and falls back to a generated id', () => {
        const wrapper = mount(FormField, {slots: {default: wiringSlot}});

        expect(wrapper.find('label').exists()).toBe(false);
        // useId() yields a non-empty string; the control id is not the literal 'undefined'.
        expect(wrapper.text()).toMatch(/ctl:[^|]+\|/);
        expect(wrapper.text()).not.toContain('ctl:undefined');
    });
});
