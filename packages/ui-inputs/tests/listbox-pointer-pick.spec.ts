// @vitest-environment happy-dom
// A mouse pick keeps DOM focus on the trigger: every option row and the clear entry cancel their
// mousedown default, which is what moves focus onto a non-focusable target (the body). happy-dom
// has no focus-on-mousedown default to observe, so this pins the mechanism; the real focus walk
// is in tests/browser/interaction.browser.spec.ts.
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

const MEMBERS = [
    {name: 'SingleSelect', component: SingleSelect, props: {options: FRUITS, modelValue: null, clearLabel: 'None'}},
    {name: 'MultiSelect', component: MultiSelect, props: {options: FRUITS, modelValue: []}},
    {name: 'GroupSelect', component: GroupSelect, props: {groups: GROUPS, modelValue: null, clearLabel: 'None'}},
    {name: 'Combobox', component: Combobox, props: {options: FRUITS, modelValue: null, clearLabel: 'None'}},
    {name: 'MultiCombobox', component: MultiCombobox, props: {options: FRUITS, modelValue: []}},
    {name: 'GroupCombobox', component: GroupCombobox, props: {groups: GROUPS, modelValue: null, clearLabel: 'None'}},
];

afterEach(() => {
    document.body.innerHTML = '';
});

const mousedown = (target: Element): MouseEvent => {
    const event = new MouseEvent('mousedown', {bubbles: true, cancelable: true});
    target.dispatchEvent(event);
    return event;
};

describe('listbox family — a pointer pick cancels the mousedown that would steal focus', () => {
    for (const member of MEMBERS) {
        it(`${member.name}: option rows${'clearLabel' in member.props ? ' and the clear entry' : ''} cancel mousedown; the listbox itself does not`, async () => {
            const wrapper = mount(member.component as never, {
                props: {label: 'name', id: 'f', ...member.props},
                attachTo: document.body,
            });
            await wrapper.get('#f').trigger('click');

            const options = document.querySelectorAll('[role="option"]');
            expect(options.length).toBeGreaterThan(0);
            for (const option of options) expect(mousedown(option).defaultPrevented).toBe(true);

            // A scrollbar drag starts with a mousedown on the <ul>: that one must keep its default.
            expect(mousedown(document.querySelector('[role="listbox"]') as Element).defaultPrevented).toBe(false);
            wrapper.unmount();
        });
    }

    it('MultiSelect: a chip-remove button keeps its mousedown default', () => {
        const wrapper = mount(MultiSelect, {
            props: {options: FRUITS, label: 'name', id: 'f', modelValue: [1]},
            attachTo: document.body,
        });

        expect(mousedown(wrapper.get('.ui-multiselect__chip-remove').element).defaultPrevented).toBe(false);
        wrapper.unmount();
    });
});
