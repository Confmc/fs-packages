// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it} from 'vitest';

import Combobox from '../src/components/Combobox.vue';
import MultiCombobox from '../src/components/MultiCombobox.vue';
import MultiSelect from '../src/components/MultiSelect.vue';
import SingleSelect from '../src/components/SingleSelect.vue';

type Fruit = {id: number; name: string};

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

const FAMILY = [
    {
        name: 'SingleSelect',
        component: SingleSelect,
        menuClass: '.ui-select__menu',
        modelValue: null as number | null | number[],
    },
    {
        name: 'Combobox',
        component: Combobox,
        menuClass: '.ui-combobox__menu',
        modelValue: null as number | null | number[],
    },
    {
        name: 'MultiSelect',
        component: MultiSelect,
        menuClass: '.ui-multiselect__menu',
        modelValue: [] as number | null | number[],
    },
    {
        name: 'MultiCombobox',
        component: MultiCombobox,
        menuClass: '.ui-multicombobox__menu',
        modelValue: [] as number | null | number[],
    },
] as const;

// VTU stubs Teleport by default (content stays in-tree). These specs turn the stub off so
// the menu actually moves — the KD-1136 contract the component suites cannot see.
const mountOpen = (
    component: (typeof FAMILY)[number]['component'],
    modelValue: number | null | number[],
    attachTo: Element = document.body,
) =>
    mount(component as never, {
        props: {options: FRUITS, label: 'name', id: 'fruit', modelValue},
        attachTo,
        global: {stubs: {teleport: false}},
    });

afterEach(() => {
    document.body.innerHTML = '';
});

describe('select-family listbox teleport (KD-1136)', () => {
    it.each(FAMILY)('$name teleports the open menu to document.body', async ({component, menuClass, modelValue}) => {
        const wrapper = mountOpen(component, modelValue);
        await wrapper.find('#fruit').trigger('click');

        const menu = document.querySelector(menuClass);
        expect(menu).not.toBeNull();
        // The menu sits inside the positioning anchor; the ANCHOR is what lands on the target.
        const anchor = menu?.parentElement;
        expect(anchor?.className).toBe('ui-menu-anchor');
        expect(anchor?.parentElement).toBe(document.body);
        // Not a descendant of the control — that is the clip-escape.
        expect(wrapper.element.contains(menu)).toBe(false);
    });

    it('teleports into the closest dialog rather than body (native-dialog top-layer)', async () => {
        const dialog = document.createElement('dialog');
        dialog.setAttribute('open', '');
        document.body.append(dialog);
        const wrapper = mountOpen(SingleSelect, null, dialog);
        await wrapper.find('#fruit').trigger('click');

        const menu = document.querySelector('.ui-select__menu');
        expect(menu).not.toBeNull();
        const anchor = menu?.parentElement;
        expect(anchor?.className).toBe('ui-menu-anchor');
        expect(anchor?.parentElement).toBe(dialog);
        expect(document.body.contains(menu)).toBe(true);
        expect(anchor?.parentElement).not.toBe(document.body);
    });
});
