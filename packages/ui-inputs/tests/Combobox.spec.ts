// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it} from 'vitest';

import Combobox from '../src/components/Combobox.vue';

type Fruit = {id: number; name: string};

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC + VTU mount inference
const mountCombobox = (props: Record<string, unknown>) =>
    mount(Combobox as any, {
        props: {options: FRUITS, label: 'name', id: 'fruit', modelValue: null, ...props},
        attachTo: document.body,
    });

afterEach(() => {
    document.body.innerHTML = '';
});

describe('Combobox', () => {
    it('renders a combobox input with no menu until opened, then the sorted options', async () => {
        const wrapper = mountCombobox({placeholder: 'Pick one'});
        const input = wrapper.find('input');

        expect(input.attributes('role')).toBe('combobox');
        expect(input.attributes('aria-autocomplete')).toBe('list');
        expect(input.attributes('aria-expanded')).toBe('false');
        expect(input.attributes('placeholder')).toBe('Pick one');
        expect(input.attributes('aria-required')).toBeUndefined();
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);

        await input.trigger('click');

        expect(input.attributes('aria-expanded')).toBe('true');
        expect(input.classes()).toContain('is-open');
        const options = wrapper.findAll('.ui-combobox__option');
        expect(options.map((o) => o.text())).toEqual(['Apricot', 'Mango', 'Watermelon']);
        expect(wrapper.find('.ui-combobox__menu').attributes('aria-label')).toBe('Options');
    });

    it('shows the committed value in the input and reflects required/invalid state', () => {
        const wrapper = mountCombobox({modelValue: 3, required: true, invalid: true, describedby: 'fruit-error'});
        const input = wrapper.find('input');

        expect(input.element.value).toBe('Mango');
        expect(input.classes()).toContain('is-invalid');
        expect(input.attributes('aria-required')).toBe('true');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('fruit-error');
    });

    it('uses a custom optionsLabel as the listbox accessible name', async () => {
        const wrapper = mountCombobox({optionsLabel: 'Fruits'});
        await wrapper.find('input').trigger('click');
        expect(wrapper.find('.ui-combobox__menu').attributes('aria-label')).toBe('Fruits');
    });

    it('resolves the display value via a getter label', () => {
        const wrapper = mountCombobox({label: (o: Fruit) => `${o.name}!`, modelValue: 2});
        expect(wrapper.find('input').element.value).toBe('Apricot!');
    });

    it('preserves given order when alphabeticalSort is false and shows empty text with no options', async () => {
        const unsorted = mountCombobox({alphabeticalSort: false});
        await unsorted.find('input').trigger('click');
        expect(unsorted.findAll('.ui-combobox__option').map((o) => o.text())).toEqual([
            'Watermelon',
            'Apricot',
            'Mango',
        ]);

        const empty = mountCombobox({options: [], emptyText: 'Nothing here'});
        await empty.find('input').trigger('click');
        expect(empty.find('.ui-combobox__empty').text()).toBe('Nothing here');
        expect(empty.findAll('.ui-combobox__option')).toHaveLength(0);
    });

    it('filters the list as the user types, and an empty query shows all options', async () => {
        const wrapper = mountCombobox({});
        const input = wrapper.find('input');

        await input.setValue('ap');
        expect(input.attributes('aria-expanded')).toBe('true'); // typing opens
        expect(wrapper.findAll('.ui-combobox__option').map((o) => o.text())).toEqual(['Apricot']);

        await input.setValue('m');
        expect(wrapper.findAll('.ui-combobox__option').map((o) => o.text())).toEqual(['Mango', 'Watermelon']);

        await input.setValue('');
        expect(wrapper.findAll('.ui-combobox__option').map((o) => o.text())).toEqual([
            'Apricot',
            'Mango',
            'Watermelon',
        ]);

        await input.setValue('zzz');
        expect(wrapper.findAll('.ui-combobox__option')).toHaveLength(0);
        expect(wrapper.find('.ui-combobox__empty').exists()).toBe(true);
    });

    it('navigates the filtered list with the keyboard and commits the highlighted option on Enter', async () => {
        const wrapper = mountCombobox({});
        const root = wrapper.find('.ui-combobox');
        const input = wrapper.find('input');

        await input.setValue('m'); // filtered: Mango, Watermelon
        await root.trigger('keydown', {key: 'ArrowDown'}); // pointer → 0 (Mango)
        expect(wrapper.findAll('.ui-combobox__option')[0].classes()).toContain('is-active');
        expect(wrapper.findAll('.ui-combobox__option')[0].attributes('aria-selected')).toBe('false');

        await root.trigger('keydown', {key: 'ArrowDown'}); // pointer → 1 (Watermelon)
        await root.trigger('keydown', {key: 'ArrowUp'}); // pointer → 0 (Mango)
        await root.trigger('keydown', {key: 'Enter'});

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3]); // Mango
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false); // closed
        expect(input.element.value).toBe('Mango'); // commit shows the chosen label
    });

    it('exposes the keyboard-focused filtered option via aria-activedescendant', async () => {
        const wrapper = mountCombobox({});
        const root = wrapper.find('.ui-combobox');
        const input = () => wrapper.find('input');

        // Closed: nothing owned, nothing focused.
        expect(input().attributes('aria-controls')).toBeUndefined();
        expect(input().attributes('aria-activedescendant')).toBeUndefined();

        await root.trigger('keydown', {key: 'ArrowDown'}); // opens, pointer stays -1
        expect(input().attributes('aria-controls')).toBe('fruit-listbox');
        expect(wrapper.find('.ui-combobox__menu').attributes('id')).toBe('fruit-listbox');
        expect(input().attributes('aria-activedescendant')).toBeUndefined(); // open, nothing highlighted

        await root.trigger('keydown', {key: 'ArrowDown'}); // → Apricot (position 0)
        expect(input().attributes('aria-activedescendant')).toBe('fruit-opt-0');

        await root.trigger('keydown', {key: 'ArrowDown'}); // → Mango (position 1)
        expect(input().attributes('aria-activedescendant')).toBe('fruit-opt-1');

        await root.trigger('keydown', {key: 'ArrowUp'}); // back to Apricot
        expect(input().attributes('aria-activedescendant')).toBe('fruit-opt-0');

        const ids = wrapper.findAll('.ui-combobox__option').map((o) => o.attributes('id'));
        expect(ids).toEqual(['fruit-opt-0', 'fruit-opt-1', 'fruit-opt-2']);
        expect(new Set(ids).size).toBe(ids.length);

        await root.trigger('keydown', {key: 'Escape'});
        expect(input().attributes('aria-activedescendant')).toBeUndefined();
        expect(input().attributes('aria-controls')).toBeUndefined();
    });

    it('clamps the pointer when the option list shrinks under it while open', async () => {
        const wrapper = mountCombobox({});
        const root = wrapper.find('.ui-combobox');
        const input = wrapper.find('input');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open, pointer -1
        await root.trigger('keydown', {key: 'ArrowDown'}); // → 0
        await root.trigger('keydown', {key: 'ArrowDown'}); // → 1

        // A shrink that stays clear of the pointer must leave the highlight alone.
        await wrapper.setProps({options: FRUITS.slice(0, 2)}); // Watermelon, Apricot → sorted Apricot, Watermelon
        expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-1');

        await wrapper.setProps({options: FRUITS});
        await root.trigger('keydown', {key: 'ArrowDown'}); // → 2 (last)
        expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-2');

        // A narrowing that lands under the pointer must clamp, not dangle.
        await wrapper.setProps({options: FRUITS.slice(0, 1)}); // one option
        expect(wrapper.findAll('.ui-combobox__option')).toHaveLength(1);
        const active = input.attributes('aria-activedescendant');
        if (active !== undefined) expect(wrapper.find(`#${active}`).exists()).toBe(true);

        // Enter must commit the surviving option rather than index off the end.
        await root.trigger('keydown', {key: 'Enter'});
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([FRUITS[0].id]);
    });

    it('empties the highlight when options drain to nothing while open', async () => {
        const wrapper = mountCombobox({});
        const root = wrapper.find('.ui-combobox');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open
        await root.trigger('keydown', {key: 'ArrowDown'}); // → 0

        await wrapper.setProps({options: []});

        expect(wrapper.find('input').attributes('aria-activedescendant')).toBeUndefined();
        await root.trigger('keydown', {key: 'Enter'}); // no-op, not a crash
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('marks the committed value as aria-selected, not the hovered option', async () => {
        const wrapper = mountCombobox({modelValue: 3}); // Mango — query starts as 'Mango'
        const input = wrapper.find('input');

        await input.trigger('click');
        await input.setValue(''); // clear the filter to reveal every option
        const options = wrapper.findAll('.ui-combobox__option'); // Apricot, Mango, Watermelon
        expect(options.map((o) => o.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);

        await options[2].trigger('mouseover'); // hover Watermelon
        expect(options[2].classes()).toContain('is-active');
        expect(wrapper.findAll('.ui-combobox__option').map((o) => o.attributes('aria-selected'))).toEqual([
            'false',
            'true',
            'false',
        ]);
    });

    it('reverts a half-typed non-match to the committed label on Escape and shows empty text meanwhile', async () => {
        const wrapper = mountCombobox({modelValue: 3}); // Mango
        const input = wrapper.find('input');
        const root = wrapper.find('.ui-combobox');

        await input.trigger('click');
        await input.setValue('zzz'); // no match
        expect(wrapper.find('.ui-combobox__empty').exists()).toBe(true);
        expect(input.element.value).toBe('zzz');

        await root.trigger('keydown', {key: 'Escape'});
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);
        expect(input.element.value).toBe('Mango'); // reverted to the committed label
    });

    it('reverts a half-typed query to the empty committed state on click-outside', async () => {
        const wrapper = mountCombobox({}); // no selection
        const input = wrapper.find('input');

        await input.setValue('ap');
        expect(input.element.value).toBe('ap');
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(true);

        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);
        expect(input.element.value).toBe(''); // nothing committed → reverts to empty
    });

    it('re-syncs the input to the committed label when the model changes from outside while idle', async () => {
        const wrapper = mountCombobox({});
        const input = wrapper.find('input');
        expect(input.element.value).toBe('');

        await wrapper.setProps({modelValue: 1}); // external change while closed → Watermelon
        expect(input.element.value).toBe('Watermelon');
    });

    it('does not disrupt the typed query when the model changes from outside while the menu is open', async () => {
        const wrapper = mountCombobox({});
        const input = wrapper.find('input');

        await input.trigger('click'); // open, query ''
        await wrapper.setProps({modelValue: 1}); // external change while OPEN must not yank the text
        expect(input.element.value).toBe('');
    });

    it('does nothing on Enter with no highlight, and ignores unhandled keys while open', async () => {
        const wrapper = mountCombobox({});
        const root = wrapper.find('.ui-combobox');

        await root.trigger('keydown', {key: 'ArrowDown'}); // opens, pointer -1
        await root.trigger('keydown', {key: 'Enter'}); // pointer < 0 → no commit
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(true);

        await root.trigger('keydown', {key: 'ArrowRight'}); // unhandled → no state change
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(true);
    });

    it('ignores a non-opening key while closed', async () => {
        const wrapper = mountCombobox({});
        await wrapper.find('.ui-combobox').trigger('keydown', {key: 'ArrowRight'});
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);
    });

    it('closes and reverts on Escape', async () => {
        const wrapper = mountCombobox({});
        const root = wrapper.find('.ui-combobox');
        await root.trigger('keydown', {key: 'ArrowDown'});
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(true);
        await root.trigger('keydown', {key: 'Escape'});
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);
    });

    it('commits an option on click and sets the pointer on mouseover', async () => {
        const wrapper = mountCombobox({});
        await wrapper.find('input').trigger('click');

        const mango = wrapper.findAll('.ui-combobox__option')[1]; // sorted: Apricot, Mango, Watermelon
        await mango.trigger('mouseover');
        expect(mango.classes()).toContain('is-active');

        await mango.trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3]); // Mango
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);
        expect(wrapper.find('input').element.value).toBe('Mango');
    });

    it('does not open when disabled, by click or by keyboard', async () => {
        const wrapper = mountCombobox({disabled: true});
        await wrapper.find('input').trigger('click');
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);

        await wrapper.find('.ui-combobox').trigger('keydown', {key: 'ArrowDown'});
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);
    });

    it('closes and reverts on Tab', async () => {
        const wrapper = mountCombobox({});
        const root = wrapper.find('.ui-combobox');
        const input = wrapper.find('input');
        await input.setValue('zzz'); // open + half-typed non-match
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(true);
        await root.trigger('keydown', {key: 'Tab'});
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);
        expect(input.element.value).toBe(''); // reverted
    });

    it('exposes an imperative focus() handle that moves DOM focus to the input', () => {
        const wrapper = mountCombobox({});
        const inputEl = wrapper.find('input').element;
        expect(document.activeElement).not.toBe(inputEl);

        (wrapper.vm as unknown as {focus: () => void}).focus();
        expect(document.activeElement).toBe(inputEl);
    });

    it('closes when a click lands outside the component', async () => {
        const wrapper = mountCombobox({});
        await wrapper.find('input').trigger('click');
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(true);

        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.ui-combobox__menu').exists()).toBe(false);
    });

    it('removes its document listener on unmount', async () => {
        const wrapper = mountCombobox({});
        await wrapper.find('input').trigger('click');
        wrapper.unmount();
        // Exercises onBeforeUnmount cleanup — a stray document click must not throw.
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });
});
