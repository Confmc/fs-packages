// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it} from 'vitest';

import SingleSelect from '../src/components/SingleSelect.vue';

type Fruit = {id: number; name: string};

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC + VTU mount inference
const mountSelect = (props: Record<string, unknown>) =>
    mount(SingleSelect as any, {
        props: {options: FRUITS, label: 'name', id: 'fruit', modelValue: null, ...props},
        attachTo: document.body,
    });

afterEach(() => {
    document.body.innerHTML = '';
});

describe('SingleSelect', () => {
    it('shows the placeholder and no menu until opened, then renders sorted options', async () => {
        const wrapper = mountSelect({placeholder: 'Pick one'});

        expect(wrapper.find('.ui-select__placeholder').text()).toBe('Pick one');
        expect(wrapper.find('.ui-select__trigger').classes()).not.toContain('has-value');
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false);

        await wrapper.find('.ui-select__trigger').trigger('click');

        const options = wrapper.findAll('.ui-select__option');
        expect(options.map((o) => o.text())).toEqual(['Apricot', 'Mango', 'Watermelon']);
        expect(wrapper.find('.ui-select__trigger').classes()).toContain('is-open');
    });

    it('renders the selected value, has-value and invalid state', () => {
        const wrapper = mountSelect({modelValue: 3, invalid: true, describedby: 'fruit-error'});
        const trigger = wrapper.find('.ui-select__trigger');

        expect(wrapper.find('.ui-select__value').text()).toBe('Mango');
        expect(trigger.classes()).toContain('has-value');
        expect(trigger.classes()).toContain('is-invalid');
        expect(trigger.attributes('aria-invalid')).toBe('true');
        expect(trigger.attributes('aria-describedby')).toBe('fruit-error');
    });

    it('resolves the display value via a getter label', () => {
        const wrapper = mountSelect({label: (o: Fruit) => `${o.name}!`, modelValue: 2});
        expect(wrapper.find('.ui-select__value').text()).toBe('Apricot!');
    });

    it('preserves given order when alphabeticalSort is false and shows empty text with no options', async () => {
        const unsorted = mountSelect({alphabeticalSort: false});
        await unsorted.find('.ui-select__trigger').trigger('click');
        expect(unsorted.findAll('.ui-select__option').map((o) => o.text())).toEqual(['Watermelon', 'Apricot', 'Mango']);

        const empty = mountSelect({options: [], emptyText: 'Nothing here'});
        await empty.find('.ui-select__trigger').trigger('click');
        expect(empty.find('.ui-select__empty').text()).toBe('Nothing here');
        expect(empty.findAll('.ui-select__option')).toHaveLength(0);
    });

    it('navigates with the keyboard (down/up), highlights the pointer, and commits on Enter', async () => {
        const wrapper = mountSelect({});
        const root = wrapper.find('.ui-select');

        await root.trigger('keydown', {key: 'ArrowDown'}); // opens (pointer stays -1)
        await root.trigger('keydown', {key: 'ArrowDown'}); // pointer → 0 (Apricot)
        expect(wrapper.findAll('.ui-select__option')[0].classes()).toContain('is-active');
        expect(wrapper.findAll('.ui-select__option')[0].attributes('aria-selected')).toBe('true');

        await root.trigger('keydown', {key: 'ArrowDown'}); // pointer → 1
        await root.trigger('keydown', {key: 'ArrowUp'}); // pointer → 0
        await root.trigger('keydown', {key: 'Enter'});
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2]); // Apricot
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false); // closed
    });

    it('does nothing on Enter with no highlight, and ignores unhandled keys while open', async () => {
        const wrapper = mountSelect({});
        const root = wrapper.find('.ui-select');

        await root.trigger('keydown', {key: 'ArrowDown'}); // opens, pointer -1
        await root.trigger('keydown', {key: 'Enter'}); // pointer < 0 → no commit
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(wrapper.find('.ui-select__menu').exists()).toBe(true);

        await root.trigger('keydown', {key: 'x'}); // unhandled → no state change
        expect(wrapper.find('.ui-select__menu').exists()).toBe(true);
    });

    it('ignores a non-opening key while closed', async () => {
        const wrapper = mountSelect({});
        await wrapper.find('.ui-select').trigger('keydown', {key: 'x'});
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false);
    });

    it('closes on Escape', async () => {
        const wrapper = mountSelect({});
        const root = wrapper.find('.ui-select');
        await root.trigger('keydown', {key: 'ArrowDown'});
        expect(wrapper.find('.ui-select__menu').exists()).toBe(true);
        await root.trigger('keydown', {key: 'Escape'});
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false);
    });

    it('selects an option on click and sets the pointer on mouseover', async () => {
        const wrapper = mountSelect({});
        await wrapper.find('.ui-select__trigger').trigger('click');

        const mango = wrapper.findAll('.ui-select__option')[1];
        await mango.trigger('mouseover');
        expect(mango.classes()).toContain('is-active');

        await mango.trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3]); // Mango
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false);
    });

    it('does not open when disabled, by click or by keyboard', async () => {
        const wrapper = mountSelect({disabled: true});
        await wrapper.find('.ui-select__trigger').trigger('click');
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false);

        await wrapper.find('.ui-select').trigger('keydown', {key: 'ArrowDown'});
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false);
    });

    it('closes on Tab', async () => {
        const wrapper = mountSelect({});
        const root = wrapper.find('.ui-select');
        await root.trigger('keydown', {key: 'ArrowDown'}); // open
        expect(wrapper.find('.ui-select__menu').exists()).toBe(true);
        await root.trigger('keydown', {key: 'Tab'});
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false);
    });

    it('closes when a click lands outside the component', async () => {
        const wrapper = mountSelect({});
        await wrapper.find('.ui-select__trigger').trigger('click');
        expect(wrapper.find('.ui-select__menu').exists()).toBe(true);

        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.ui-select__menu').exists()).toBe(false);
    });

    it('removes its document listener on unmount', async () => {
        const wrapper = mountSelect({});
        await wrapper.find('.ui-select__trigger').trigger('click');
        wrapper.unmount();
        // Exercises onBeforeUnmount cleanup — a stray document click must not throw.
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });
});
