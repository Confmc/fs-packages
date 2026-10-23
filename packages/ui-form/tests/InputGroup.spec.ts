// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';
import {h} from 'vue';

import InputGroup from '../src/components/InputGroup.vue';

describe('InputGroup', () => {
    it('joins the addon texts around its control, each with an id the control can name', () => {
        const wrapper = mount(InputGroup, {
            props: {prepend: '€', append: 'per maand', id: 'rate'},
            slots: {default: () => h('input', {id: 'rate'})},
        });
        const [start, end] = wrapper.findAll('.ui-input-group__addon');

        expect(start!.text()).toBe('€');
        expect(start!.attributes('id')).toBe('rate-prepend');
        expect(end!.text()).toBe('per maand');
        expect(end!.attributes('id')).toBe('rate-append');
        expect(wrapper.find('.is-start + input + .is-end').exists()).toBe(true);
    });

    it('renders only the addons it is given, with its own ids when no id is passed', () => {
        const wrapper = mount(InputGroup, {props: {append: 'dagen'}, slots: {default: () => h('input')}});

        expect(wrapper.findAll('.ui-input-group__addon')).toHaveLength(1);
        expect(wrapper.find('.is-end').attributes('id')).toMatch(/-append$/);

        const start = mount(InputGroup, {props: {prepend: '€'}, slots: {default: () => h('input')}});
        expect(start.findAll('.ui-input-group__addon')).toHaveLength(1);
        expect(start.find('.is-start').attributes('id')).toMatch(/-prepend$/);
    });
});
