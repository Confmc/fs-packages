// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import {FieldMessage} from '../src';

describe('FieldMessage', () => {
    it("renders the message under the id the control's aria-describedby names, as an alert", () => {
        const wrapper = mount(FieldMessage, {
            props: {id: 'email', invalid: true, describedby: 'email-error', error: 'Taken'},
        });

        const message = wrapper.find('p');
        expect(message.text()).toBe('Taken');
        expect(message.attributes('id')).toBe('email-error');
        expect(message.attributes('role')).toBe('alert');
        // the whole field object binds without leaving any key behind as an attribute
        expect(message.attributes()).not.toHaveProperty('invalid');
        expect(message.attributes()).not.toHaveProperty('error');
    });

    it('renders nothing for a clean field', () => {
        const wrapper = mount(FieldMessage, {
            props: {id: 'email', invalid: false, describedby: undefined, error: undefined},
        });

        expect(wrapper.find('p').exists()).toBe(false);
    });
});
