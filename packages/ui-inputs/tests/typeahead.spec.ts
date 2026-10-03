// @vitest-environment happy-dom
// WR-1991: typeahead on the select-only listboxes. Key handling is the component's own logic over
// the keydown it receives — no platform default is involved — so happy-dom runs the real path.
import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Combobox from '../src/components/Combobox.vue';
import GroupSelect from '../src/components/GroupSelect.vue';
import MultiSelect from '../src/components/MultiSelect.vue';
import SingleSelect from '../src/components/SingleSelect.vue';

interface Fruit {
    id: number;
    name: string;
}

// Caller order: Apricot(0), Avocado(1), Banana(2), Blue moon(3), Blueberry(4), cherry(5).
const FRUITS: Fruit[] = [
    {id: 1, name: 'Apricot'},
    {id: 2, name: 'Avocado'},
    {id: 3, name: 'Banana'},
    {id: 4, name: 'Blue moon'},
    {id: 5, name: 'Blueberry'},
    {id: 6, name: 'cherry'},
];

const SELECT_ONLY = [
    {
        name: 'SingleSelect',
        mountIt: () =>
            mount(SingleSelect, {
                props: {options: FRUITS, label: 'name', id: 'f', modelValue: null, alphabeticalSort: false},
                attachTo: document.body,
            }),
        keyTarget: '.ui-select',
    },
    {
        name: 'MultiSelect',
        mountIt: () =>
            mount(MultiSelect, {
                props: {options: FRUITS, label: 'name', id: 'f', modelValue: [] as number[], alphabeticalSort: false},
                attachTo: document.body,
            }),
        keyTarget: '.ui-multiselect__trigger',
    },
    {
        name: 'GroupSelect',
        mountIt: () =>
            mount(GroupSelect, {
                props: {
                    groups: [
                        {text: 'A', options: FRUITS.slice(0, 2)},
                        {text: 'B', options: FRUITS.slice(2, 5)},
                        {text: 'C', options: FRUITS.slice(5)},
                    ],
                    label: 'name',
                    id: 'f',
                    modelValue: null,
                },
                attachTo: document.body,
            }),
        keyTarget: '.ui-groupselect',
    },
] as const;

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe.each(SELECT_ONLY)('$name — typeahead', ({mountIt, keyTarget}) => {
    const setup = async (open = true) => {
        const wrapper = mountIt();
        const target = wrapper.find(keyTarget);
        const press = async (key: string, init: Record<string, unknown> = {}) => {
            await target.trigger('keydown', {key, ...init});
        };
        const active = () => wrapper.find('[role="combobox"]').attributes('aria-activedescendant');
        if (open) await press('ArrowDown');
        return {wrapper, press, active};
    };

    it('a printable character moves the active option to the first match, case-insensitively', async () => {
        const {press, active} = await setup();

        await press('C');

        expect(active()).toBe('f-opt-5');
    });

    it('the same character again cycles through the options that start with it', async () => {
        const {press, active} = await setup();

        await press('b');
        expect(active()).toBe('f-opt-2');
        await press('b');
        expect(active()).toBe('f-opt-3');
        await press('b');
        expect(active()).toBe('f-opt-4');
    });

    it('a quickly typed string matches by prefix, a space inside it included', async () => {
        const {press, active} = await setup();

        for (const key of 'blueb') await press(key);
        expect(active()).toBe('f-opt-4');
    });

    it('a highlight that still matches the growing string stays put', async () => {
        const {press, active} = await setup();

        for (const key of 'blu') await press(key);

        // "blu" matches Blue moon and Blueberry; a search from the NEXT option would skip ahead.
        expect(active()).toBe('f-opt-3');
    });

    it('a space typed mid-string is part of the string and is prevented from clicking the trigger', async () => {
        const {wrapper, press, active} = await setup();

        for (const key of 'blue') await press(key);
        const space = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
        wrapper.find(keyTarget).element.dispatchEvent(space);
        await press('m');

        expect(space.defaultPrevented).toBe(true);
        expect(active()).toBe('f-opt-3');
    });

    it('the string resets after a short idle, so the next key starts a new search', async () => {
        const {press, active} = await setup();

        await press('a');
        expect(active()).toBe('f-opt-0');
        vi.advanceTimersByTime(600);
        await press('v');

        // Without the reset this reads "av" and lands on Avocado.
        expect(active()).toBe('f-opt-0');
    });

    it('wraps around past the last option', async () => {
        const {press, active} = await setup();

        await press('End');
        await press('a');

        expect(active()).toBe('f-opt-0');
    });

    it('a character no option starts with moves nothing', async () => {
        const {press, active} = await setup();

        await press('b');
        await press('z');

        expect(active()).toBe('f-opt-2');
    });

    it('a modified key is not typeahead', async () => {
        const {press, active} = await setup();

        await press('a', {ctrlKey: true});
        await press('b', {metaKey: true});
        await press('c', {altKey: true});

        expect(active()).toBeUndefined();
    });

    it('closed, a character opens the list on the first match and commits nothing', async () => {
        const {wrapper, press, active} = await setup(false);

        await press('c');

        expect(wrapper.find('[role="combobox"]').attributes('aria-expanded')).toBe('true');
        expect(active()).toBe('f-opt-5');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('closed, a character no option starts with opens nothing', async () => {
        const {wrapper, press} = await setup(false);

        await press('z');

        expect(wrapper.find('[role="combobox"]').attributes('aria-expanded')).toBe('false');
    });

    it('closing drops a half-typed string', async () => {
        const {press, active} = await setup();

        await press('b');
        await press('Escape');
        await press('ArrowDown');
        await press('l');

        // Without the drop this reads "bl" and lands on Blue moon.
        expect(active()).toBeUndefined();
    });
});

describe('Combobox — typeahead belongs to the text input', () => {
    it('NEGATIVE PIN — typing filters the query and never jumps the highlight', async () => {
        const wrapper = mount(Combobox, {
            props: {options: FRUITS, label: 'name', id: 'f', modelValue: null, alphabeticalSort: false},
            attachTo: document.body,
        });
        const input = wrapper.find('input');

        await input.trigger('keydown', {key: 'ArrowDown'});
        await input.trigger('keydown', {key: 'c'});

        expect(input.attributes('aria-activedescendant')).toBeUndefined();
    });
});
