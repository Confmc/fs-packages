// @vitest-environment happy-dom
// WR-2588: Space on an OPEN select-only list commits the active option, as Enter does. The keydown
// is cancelled whenever it commits, which on a real button also cancels the keyup click that would
// toggle the list straight back (tests/browser/interaction.browser.spec.ts walks that in Chromium).
// On a combobox Space is a query character and the listbox core leaves it alone.
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it} from 'vitest';

import Combobox from '../src/components/Combobox.vue';
import GroupCombobox from '../src/components/GroupCombobox.vue';
import GroupSelect from '../src/components/GroupSelect.vue';
import MultiCombobox from '../src/components/MultiCombobox.vue';
import MultiSelect from '../src/components/MultiSelect.vue';
import SingleSelect from '../src/components/SingleSelect.vue';

const FRUITS = [
    {id: 1, name: 'Apricot'},
    {id: 2, name: 'Mango'},
];
const GROUPS = [
    {text: 'A', options: FRUITS.slice(0, 1)},
    {text: 'B', options: FRUITS.slice(1)},
];

afterEach(() => {
    document.body.innerHTML = '';
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFCs
const mountIt = (component: any, props: Record<string, unknown>) =>
    mount(component, {props: {label: 'name', id: 'f', ...props}, attachTo: document.body});

const keydown = (target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init});
    target.dispatchEvent(event);
    return event;
};

const SELECT_ONLY = [
    {name: 'SingleSelect', component: SingleSelect, props: {options: FRUITS, modelValue: null}, multi: false},
    {name: 'GroupSelect', component: GroupSelect, props: {groups: GROUPS, modelValue: null}, multi: false},
    {name: 'MultiSelect', component: MultiSelect, props: {options: FRUITS, modelValue: []}, multi: true},
];

const COMBOBOXES = [
    {name: 'Combobox', component: Combobox, props: {options: FRUITS, modelValue: null}},
    {name: 'GroupCombobox', component: GroupCombobox, props: {groups: GROUPS, modelValue: null}},
    {name: 'MultiCombobox', component: MultiCombobox, props: {options: FRUITS, modelValue: []}},
];

describe('Space on an open select-only list (WR-2588)', () => {
    for (const member of SELECT_ONLY) {
        it(`${member.name}: commits the active option and cancels the key${member.multi ? '; the list stays open' : '; the list closes'}`, async () => {
            const wrapper = mountIt(member.component, member.props);
            const trigger = wrapper.get('#f').element;

            keydown(trigger, 'Enter');
            await wrapper.vm.$nextTick();
            keydown(trigger, 'ArrowDown');
            await wrapper.vm.$nextTick();

            expect(keydown(trigger, ' ').defaultPrevented).toBe(true);
            await wrapper.vm.$nextTick();
            expect(wrapper.emitted('update:modelValue')).toEqual([[member.multi ? [1] : 1]]);
            expect(trigger.getAttribute('aria-expanded')).toBe(String(member.multi));
            wrapper.unmount();
        });

        it(`${member.name}: a Space with Ctrl, Alt or Meta passes through, a held Space's repeats are cancelled; neither commits`, async () => {
            const wrapper = mountIt(member.component, member.props);
            const trigger = wrapper.get('#f').element;

            keydown(trigger, 'Enter');
            await wrapper.vm.$nextTick();
            keydown(trigger, 'ArrowDown');
            await wrapper.vm.$nextTick();

            // Ctrl+Space switches the input source on some systems: it passes through untouched
            for (const init of [{ctrlKey: true}, {altKey: true}, {metaKey: true}]) {
                expect(keydown(trigger, ' ', init).defaultPrevented).toBe(false);
            }
            // a held Space's repeats are cancelled, so they neither reopen the list nor click the trigger
            expect(keydown(trigger, ' ', {repeat: true}).defaultPrevented).toBe(true);
            await wrapper.vm.$nextTick();
            expect(wrapper.emitted('update:modelValue')).toBeUndefined();
            wrapper.unmount();
        });

        it(`${member.name}: a held arrow key is left alone, its repeats keep moving the highlight`, async () => {
            const wrapper = mountIt(member.component, member.props);
            const trigger = wrapper.get('#f').element;

            keydown(trigger, 'Enter');
            await wrapper.vm.$nextTick();
            keydown(trigger, 'ArrowDown');
            await wrapper.vm.$nextTick();
            keydown(trigger, 'ArrowDown', {repeat: true});
            await wrapper.vm.$nextTick();

            expect(trigger.getAttribute('aria-activedescendant')).toBe('f-opt-1');
            wrapper.unmount();
        });

        it(`${member.name}: with nothing highlighted, Space commits nothing and is not cancelled`, async () => {
            const wrapper = mountIt(member.component, member.props);
            const trigger = wrapper.get('#f').element;

            keydown(trigger, 'Enter');
            await wrapper.vm.$nextTick();

            // Not cancelled, exactly like Enter with nothing highlighted: the button's own click
            // then toggles the list closed.
            expect(keydown(trigger, ' ').defaultPrevented).toBe(false);
            expect(wrapper.emitted('update:modelValue')).toBeUndefined();
            wrapper.unmount();
        });
    }

    it('SingleSelect: Space on the highlighted clear entry commits null and closes', async () => {
        const wrapper = mountIt(SingleSelect, {options: FRUITS, modelValue: 2, clearLabel: 'None'});
        const trigger = wrapper.get('#f').element;

        keydown(trigger, 'Enter');
        await wrapper.vm.$nextTick();
        keydown(trigger, 'ArrowDown');
        await wrapper.vm.$nextTick();
        expect(trigger.getAttribute('aria-activedescendant')).toBe('f-clear');

        expect(keydown(trigger, ' ').defaultPrevented).toBe(true);
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('update:modelValue')).toEqual([[null]]);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        wrapper.unmount();
    });

    for (const member of COMBOBOXES) {
        it(`${member.name}: Space on an open list stays a query character — nothing commits, nothing is cancelled`, async () => {
            const wrapper = mountIt(member.component, member.props);
            const input = wrapper.get('#f').element;

            keydown(input, 'ArrowDown');
            await wrapper.vm.$nextTick();
            keydown(input, 'ArrowDown');
            await wrapper.vm.$nextTick();
            expect(input.getAttribute('aria-activedescendant')).toBe('f-opt-0');

            expect(keydown(input, ' ').defaultPrevented).toBe(false);
            // a held Space types spaces into the query: its repeats are not cancelled either
            expect(keydown(input, ' ', {repeat: true}).defaultPrevented).toBe(false);
            expect(wrapper.emitted('update:modelValue')).toBeUndefined();
            expect(input.getAttribute('aria-expanded')).toBe('true');
            wrapper.unmount();
        });
    }
});
