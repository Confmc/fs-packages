// @vitest-environment happy-dom
// WR-1991 (Commander ruling 2026-10-03): `alphabeticalSort` defaults to false — the caller's order
// is the order, and sorting is the opt-in.
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it} from 'vitest';

import Combobox from '../src/components/Combobox.vue';
import GroupCombobox from '../src/components/GroupCombobox.vue';
import GroupSelect from '../src/components/GroupSelect.vue';
import MultiCombobox from '../src/components/MultiCombobox.vue';
import MultiSelect from '../src/components/MultiSelect.vue';
import SingleSelect from '../src/components/SingleSelect.vue';

const CALLER_ORDER = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

const SORTABLE = [
    {name: 'SingleSelect', component: SingleSelect, modelValue: null, opener: 'button'},
    {name: 'MultiSelect', component: MultiSelect, modelValue: [], opener: '.ui-multiselect__trigger'},
    {name: 'Combobox', component: Combobox, modelValue: null, opener: 'input'},
    {name: 'MultiCombobox', component: MultiCombobox, modelValue: [], opener: 'input'},
] as const;

afterEach(() => {
    document.body.innerHTML = '';
});

describe.each(SORTABLE)('$name — option order', ({component, modelValue, opener}) => {
    const renderedOrder = async (extra: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- four generic SFCs through one mount
        const wrapper = mount(component as any, {
            props: {options: CALLER_ORDER, optionLabel: 'name', id: 'f', modelValue, ...extra},
            attachTo: document.body,
        });
        await wrapper.find(opener).trigger(opener === 'input' ? 'focus' : 'click');
        if (opener === 'input') await wrapper.find(opener).trigger('keydown', {key: 'ArrowDown'});
        return wrapper.findAll('[role="option"]').map((option) => option.text());
    };

    it("keeps the caller's order by default", async () => {
        expect(await renderedOrder({})).toEqual(['Watermelon', 'Apricot', 'Mango']);
    });

    it('sorts by display string when `alphabeticalSort` is set', async () => {
        expect(await renderedOrder({alphabeticalSort: true})).toEqual(['Apricot', 'Mango', 'Watermelon']);
    });
});

// Grouped: the groups are the caller's order either way; the opt-in sorts the options within each group.
const CALLER_GROUPS = [
    {text: 'Zeta', options: [CALLER_ORDER[0], CALLER_ORDER[1]]},
    {text: 'Alpha', options: [CALLER_ORDER[2], {id: 4, name: 'Banana'}]},
];

const GROUPED = [
    {name: 'GroupSelect', component: GroupSelect, opener: 'button'},
    {name: 'GroupCombobox', component: GroupCombobox, opener: 'input'},
] as const;

describe.each(GROUPED)('$name — option order', ({component, opener}) => {
    const renderedOrder = async (extra: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- two generic SFCs through one mount
        const wrapper = mount(component as any, {
            props: {groups: CALLER_GROUPS, optionLabel: 'name', id: 'f', modelValue: null, ...extra},
            attachTo: document.body,
        });
        await wrapper.find(opener).trigger(opener === 'input' ? 'focus' : 'click');
        if (opener === 'input') await wrapper.find(opener).trigger('keydown', {key: 'ArrowDown'});
        return wrapper.findAll('[role="option"]').map((option) => option.text());
    };

    it("keeps the caller's order by default", async () => {
        expect(await renderedOrder({})).toEqual(['Watermelon', 'Apricot', 'Mango', 'Banana']);
    });

    it('sorts the options within each group, and keeps the groups in order, when `alphabeticalSort` is set', async () => {
        expect(await renderedOrder({alphabeticalSort: true})).toEqual(['Apricot', 'Watermelon', 'Banana', 'Mango']);
    });
});
