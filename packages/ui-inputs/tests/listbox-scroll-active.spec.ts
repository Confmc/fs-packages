// @vitest-environment happy-dom
// WR-2903: a key that moves the highlight scrolls the active row into the menu's view. happy-dom has
// no layout, so this pins the mechanism (which element is revealed, how, and when not); the real
// scroll geometry is in tests/browser/interaction.browser.spec.ts.
import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {nextTick} from 'vue';

import Combobox from '../src/components/Combobox.vue';
import SingleSelect from '../src/components/SingleSelect.vue';

const FRUITS = [
    {id: 1, name: 'Apricot'},
    {id: 2, name: 'Mango'},
    {id: 3, name: 'Zebra'},
];

let revealed: {id: string; options: unknown}[];
beforeEach(() => {
    revealed = [];
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement, options) {
        revealed.push({id: this.id, options});
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

const keydown = async (target: Element, key: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
    await nextTick();
    await nextTick();
};

const mountSelect = (props: Record<string, unknown> = {}) =>
    mount(SingleSelect, {
        props: {options: FRUITS, label: 'name', id: 'f', modelValue: null, ...props},
        attachTo: document.body,
    });

describe('the active option is scrolled into view (WR-2903)', () => {
    it('ArrowDown, End and Home reveal the row they land on, by the nearest edge', async () => {
        const wrapper = mountSelect();
        const trigger = wrapper.get('#f').element;

        await keydown(trigger, 'Enter'); // opens, nothing highlighted: nothing to reveal
        expect(revealed).toEqual([]);

        await keydown(trigger, 'ArrowDown');
        await keydown(trigger, 'End');
        await keydown(trigger, 'Home');
        expect(revealed).toEqual([
            {id: 'f-opt-0', options: {block: 'nearest'}},
            {id: 'f-opt-2', options: {block: 'nearest'}},
            {id: 'f-opt-0', options: {block: 'nearest'}},
        ]);
        wrapper.unmount();
    });

    it('a typeahead key on the closed trigger opens the list and reveals its match', async () => {
        const wrapper = mountSelect();

        await keydown(wrapper.get('#f').element, 'z');
        expect(revealed).toEqual([{id: 'f-opt-2', options: {block: 'nearest'}}]);
        wrapper.unmount();
    });

    it('the clear entry is revealed when the highlight moves onto it', async () => {
        const wrapper = mountSelect({clearLabel: 'None'});
        const trigger = wrapper.get('#f').element;

        await keydown(trigger, 'Enter');
        await keydown(trigger, 'ArrowDown');
        expect(revealed).toEqual([{id: 'f-clear', options: {block: 'nearest'}}]);
        wrapper.unmount();
    });

    it('a key that leaves the highlight where it was, or closes the list, reveals nothing', async () => {
        const wrapper = mountSelect();
        const trigger = wrapper.get('#f').element;

        await keydown(trigger, 'Enter');
        await keydown(trigger, 'End');
        revealed.length = 0;

        await keydown(trigger, 'ArrowDown'); // already on the last option
        await keydown(trigger, 'Escape');
        expect(revealed).toEqual([]);
        wrapper.unmount();
    });

    it('a pointer hover moves the highlight but scrolls nothing', async () => {
        const wrapper = mountSelect();

        await wrapper.get('#f').trigger('click');
        document.getElementById('f-opt-2')?.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
        await nextTick();
        await nextTick();
        expect(wrapper.get('#f').attributes('aria-activedescendant')).toBe('f-opt-2');
        expect(revealed).toEqual([]);
        wrapper.unmount();
    });

    it('Combobox: ArrowDown reveals the option it highlights', async () => {
        const wrapper = mount(Combobox, {
            props: {options: FRUITS, label: 'name', id: 'f', modelValue: null},
            attachTo: document.body,
        });
        const input = wrapper.get('#f').element;

        await keydown(input, 'ArrowDown'); // opens
        await keydown(input, 'ArrowDown');
        expect(revealed).toEqual([{id: 'f-opt-0', options: {block: 'nearest'}}]);
        wrapper.unmount();
    });
});
