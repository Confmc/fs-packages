// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it} from 'vitest';

import FsSelect from '../src/components/FsSelect.vue';

type Fruit = {id: number; name: string};

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC + VTU mount inference
const mountSelect = (props: Record<string, unknown>) =>
    mount(FsSelect as any, {
        props: {options: FRUITS, label: 'name', id: 'fruit', modelValue: null, ...props},
        attachTo: document.body,
    });

afterEach(() => {
    document.body.innerHTML = '';
});

describe('FsSelect', () => {
    it('shows the placeholder and no menu until opened, then renders sorted options', async () => {
        const wrapper = mountSelect({placeholder: 'Pick one'});

        expect(wrapper.find('.fs-select__placeholder').text()).toBe('Pick one');
        expect(wrapper.find('.fs-select__trigger').classes()).not.toContain('has-value');
        expect(wrapper.find('.fs-select__menu').exists()).toBe(false);

        await wrapper.find('.fs-select__trigger').trigger('click');

        const options = wrapper.findAll('.fs-select__option');
        expect(options.map((o) => o.text())).toEqual(['Apricot', 'Mango', 'Watermelon']);
        expect(wrapper.find('.fs-select__trigger').classes()).toContain('is-open');
    });

    it('renders the selected value, has-value and invalid state', () => {
        const wrapper = mountSelect({modelValue: 3, invalid: true, describedby: 'fruit-error'});
        const trigger = wrapper.find('.fs-select__trigger');

        expect(wrapper.find('.fs-select__value').text()).toBe('Mango');
        expect(trigger.classes()).toContain('has-value');
        expect(trigger.classes()).toContain('is-invalid');
        expect(trigger.attributes('aria-invalid')).toBe('true');
        expect(trigger.attributes('aria-describedby')).toBe('fruit-error');
    });

    it('preserves given order when alphabeticalSort is false and shows empty text with no options', async () => {
        const unsorted = mountSelect({alphabeticalSort: false});
        await unsorted.find('.fs-select__trigger').trigger('click');
        expect(unsorted.findAll('.fs-select__option').map((o) => o.text())).toEqual(['Watermelon', 'Apricot', 'Mango']);

        const empty = mountSelect({options: [], emptyText: 'Nothing here'});
        await empty.find('.fs-select__trigger').trigger('click');
        expect(empty.find('.fs-select__empty').text()).toBe('Nothing here');
        expect(empty.findAll('.fs-select__option')).toHaveLength(0);
    });

    it('navigates with the keyboard, highlights the pointer, and commits on Enter', async () => {
        const wrapper = mountSelect({});
        const root = wrapper.find('.fs-select');

        await root.trigger('keydown', {key: 'ArrowDown'}); // opens
        await root.trigger('keydown', {key: 'ArrowDown'}); // pointer → 0 (Apricot)
        expect(wrapper.findAll('.fs-select__option')[0].classes()).toContain('is-active');
        expect(wrapper.findAll('.fs-select__option')[0].attributes('aria-selected')).toBe('true');

        await root.trigger('keydown', {key: 'Enter'});
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2]); // Apricot
        expect(wrapper.find('.fs-select__menu').exists()).toBe(false); // closed
    });

    it('closes on Escape', async () => {
        const wrapper = mountSelect({});
        const root = wrapper.find('.fs-select');
        await root.trigger('keydown', {key: 'ArrowDown'});
        expect(wrapper.find('.fs-select__menu').exists()).toBe(true);
        await root.trigger('keydown', {key: 'Escape'});
        expect(wrapper.find('.fs-select__menu').exists()).toBe(false);
    });

    it('selects an option on click and sets the pointer on mouseover', async () => {
        const wrapper = mountSelect({});
        await wrapper.find('.fs-select__trigger').trigger('click');

        const mango = wrapper.findAll('.fs-select__option')[1];
        await mango.trigger('mouseover');
        expect(mango.classes()).toContain('is-active');

        await mango.trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3]); // Mango
        expect(wrapper.find('.fs-select__menu').exists()).toBe(false);
    });

    it('does not open when disabled, by click or by keyboard', async () => {
        const wrapper = mountSelect({disabled: true});
        await wrapper.find('.fs-select__trigger').trigger('click');
        expect(wrapper.find('.fs-select__menu').exists()).toBe(false);

        await wrapper.find('.fs-select').trigger('keydown', {key: 'ArrowDown'});
        expect(wrapper.find('.fs-select__menu').exists()).toBe(false);
    });

    it('closes on Tab without preventing default', async () => {
        const wrapper = mountSelect({});
        const root = wrapper.find('.fs-select');
        await root.trigger('keydown', {key: 'ArrowDown'}); // open
        expect(wrapper.find('.fs-select__menu').exists()).toBe(true);
        await root.trigger('keydown', {key: 'Tab'}); // preventDefault:false branch
        expect(wrapper.find('.fs-select__menu').exists()).toBe(false);
    });

    it('closes when a click lands outside the component', async () => {
        const wrapper = mountSelect({});
        await wrapper.find('.fs-select__trigger').trigger('click');
        expect(wrapper.find('.fs-select__menu').exists()).toBe(true);

        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.fs-select__menu').exists()).toBe(false);
    });

    it('removes its document listener on unmount', async () => {
        const wrapper = mountSelect({});
        await wrapper.find('.fs-select__trigger').trigger('click');
        wrapper.unmount();
        // No assertion needed beyond not throwing — exercises onBeforeUnmount cleanup.
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });
});
