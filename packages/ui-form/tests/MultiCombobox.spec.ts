// @vitest-environment happy-dom
import {useFloating} from '@floating-ui/vue';
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {h} from 'vue';

import MultiCombobox from '../src/components/MultiCombobox.vue';
import {menu} from './find-menu';

// The real floating-ui, spied on so the placement case can read what MultiCombobox hands it.
vi.mock('@floating-ui/vue', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@floating-ui/vue')>();
    return {...actual, useFloating: vi.fn(actual.useFloating)};
});

interface Fruit {
    id: number;
    name: string;
}

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC + VTU mount inference
const mountMultiCombobox = (props: Record<string, unknown>, slots?: Record<string, unknown>) =>
    mount(MultiCombobox as any, {
        // Sorted on purpose: the cases below index the sorted order (the default is caller order).
        props: {options: FRUITS, optionLabel: 'name', id: 'fruit', modelValue: [], alphabeticalSort: true, ...props},
        slots,
        attachTo: document.body,
    });

// A user types into a focused field, and MultiCombobox opens on typing only while the input has focus.
const typeInto = async (
    input: {element: HTMLElement; setValue: (value: string) => Promise<void>},
    value: string,
): Promise<void> => {
    input.element.focus();
    await input.setValue(value);
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('MultiCombobox', () => {
    it('renders a combobox input with no menu until opened, then the sorted options in a multiselectable listbox', async () => {
        const wrapper = mountMultiCombobox({placeholder: 'Pick some'});
        const input = wrapper.find('input');

        expect(input.attributes('role')).toBe('combobox');
        expect(input.attributes('aria-autocomplete')).toBe('list');
        expect(input.attributes('aria-expanded')).toBe('false');
        expect(input.attributes('placeholder')).toBe('Pick some');
        expect(input.attributes('aria-required')).toBeUndefined();
        expect(menu(wrapper).exists()).toBe(false);

        await input.trigger('click');

        expect(input.attributes('aria-expanded')).toBe('true');
        expect(wrapper.find('.ui-multicombobox__box').classes()).toContain('is-open');
        expect(
            menu(wrapper)
                .findAll('.ui-multicombobox__option')
                .map((o) => o.text()),
        ).toEqual(['Apricot', 'Mango', 'Watermelon']);
        expect(menu(wrapper).attributes('aria-label')).toBe('Options');
        expect(menu(wrapper).attributes('aria-multiselectable')).toBe('true');
    });

    it('opens on focus — the input is the trigger, and the list is its context', async () => {
        const wrapper = mountMultiCombobox({});
        await wrapper.find('input').trigger('focus');
        expect(menu(wrapper).exists()).toBe(true);
    });

    it.each([
        ['click', {}],
        ['focus', {}],
        ['keydown', {key: 'ArrowDown'}],
        ['input', {}],
    ])("opens on %s before a consumer's listener runs, so that listener cannot hold it back", async (type, init) => {
        // Merged listeners run in order; one calling stopImmediatePropagation skips the ones after it.
        const listener = `on${type[0].toUpperCase()}${type.slice(1)}`;
        const wrapper = mount(MultiCombobox as never, {
            props: {options: FRUITS, optionLabel: 'name', id: 'fruit', modelValue: []},
            attrs: {[listener]: (event: Event) => event.stopImmediatePropagation()},
            attachTo: document.body,
        });

        // A user acts on a focused field: start there, with the list the focus opened shut again by a
        // click elsewhere, which reaches none of the input's listeners.
        wrapper.find('input').element.focus();
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        await wrapper.find('input').trigger(type, init);

        expect(menu(wrapper).exists()).toBe(true);
        wrapper.unmount();
    });

    it("removes the last chip on Backspace before a consumer's keydown listener runs", async () => {
        const wrapper = mount(MultiCombobox as never, {
            props: {options: FRUITS, optionLabel: 'name', id: 'fruit', modelValue: [2]},
            attrs: {onKeydown: (event: Event) => event.stopImmediatePropagation()},
            attachTo: document.body,
        });

        await wrapper.find('input').trigger('keydown', {key: 'Backspace'});

        expect(wrapper.emitted('update:modelValue')).toEqual([[[]]]);
        wrapper.unmount();
    });

    it('renders chips for the committed values, has-value, required and invalid state, no placeholder', () => {
        const wrapper = mountMultiCombobox({
            modelValue: [3, 1],
            required: true,
            invalid: true,
            describedby: 'fruit-error',
        });
        const input = wrapper.find('input');

        // Chips follow the order the options are shown in, not the model's.
        expect(wrapper.findAll('.ui-multicombobox__chip').map((chip) => chip.text())).toEqual(['Mango', 'Watermelon']);
        expect(wrapper.find('.ui-multicombobox__box').classes()).toContain('has-value');
        expect(wrapper.find('.ui-multicombobox__box').classes()).toContain('is-invalid');
        expect(input.attributes('placeholder')).toBeUndefined(); // chips replace the placeholder
        expect(input.attributes('aria-required')).toBe('true');
        expect(input.attributes('aria-invalid')).toBe('true');
        // The consumer's describedby AND the selection summary — both announced.
        expect(input.attributes('aria-describedby')).toBe('fruit-error fruit-selection');
    });

    it('shows the placeholder and no has-value while no committed id has a chip yet', () => {
        const wrapper = mountMultiCombobox({modelValue: [99], placeholder: 'Pick some'});

        expect(wrapper.findAll('.ui-multicombobox__chip')).toHaveLength(0);
        expect(wrapper.find('input').attributes('placeholder')).toBe('Pick some');
        expect(wrapper.find('.ui-multicombobox__box').classes()).not.toContain('has-value');
    });

    it('conveys the committed selection through an aria-describedby summary (the input-as-trigger value surface)', () => {
        const wrapper = mountMultiCombobox({modelValue: [2, 1]});

        // No consumer describedby → the summary id stands alone.
        expect(wrapper.find('input').attributes('aria-describedby')).toBe('fruit-selection');
        expect(wrapper.find('#fruit-selection').text()).toBe('Apricot, Watermelon'); // display order
    });

    it.each([
        ['absent', {}],
        ['empty', {describedby: ''}],
    ])('names only the selection summary when the consumer describedby is %s', (_, props) => {
        const wrapper = mountMultiCombobox(props);

        expect(wrapper.find('input').attributes('aria-describedby')).toBe('fruit-selection');
    });

    it('filters the list as the user types, and an empty query shows all options', async () => {
        const wrapper = mountMultiCombobox({});
        const input = wrapper.find('input');

        await typeInto(input, 'ap');
        expect(input.attributes('aria-expanded')).toBe('true');
        expect(
            menu(wrapper)
                .findAll('.ui-multicombobox__option')
                .map((o) => o.text()),
        ).toEqual(['Apricot']);

        await typeInto(input, 'm');
        expect(
            menu(wrapper)
                .findAll('.ui-multicombobox__option')
                .map((o) => o.text()),
        ).toEqual(['Mango', 'Watermelon']);

        await typeInto(input, '');
        expect(
            menu(wrapper)
                .findAll('.ui-multicombobox__option')
                .map((o) => o.text()),
        ).toEqual(['Apricot', 'Mango', 'Watermelon']);

        await typeInto(input, 'zzz');
        expect(menu(wrapper).findAll('.ui-multicombobox__option')).toHaveLength(0);
        expect(menu(wrapper).find('.ui-multicombobox__empty').exists()).toBe(true);
    });

    it('commits a filtered option on Enter: toggles, STAYS OPEN, clears the query, and keeps focus on the input', async () => {
        const wrapper = mountMultiCombobox({});
        const input = wrapper.find('input');

        await typeInto(input, 'm'); // filtered: Mango, Watermelon
        await input.trigger('keydown', {key: 'ArrowDown'}); // pointer → 0 (Mango)
        expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-0');

        await input.trigger('keydown', {key: 'Enter'});

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[3]]); // Mango toggled in
        expect(menu(wrapper).exists()).toBe(true); // stays open
        expect(input.element.value).toBe(''); // query cleared — the full list is re-offered
        expect(menu(wrapper).findAll('.ui-multicombobox__option')).toHaveLength(3);
        expect(input.attributes('aria-activedescendant')).toBeUndefined(); // highlight reset with the list change
        expect(document.activeElement).toBe(input.element); // focus stays on the input
    });

    it('keeps the pointer in place on an unfiltered keyboard toggle, so Enter can toggle in place (MultiSelect parity)', async () => {
        const wrapper = mountMultiCombobox({});
        const input = wrapper.find('input');

        await input.trigger('keydown', {key: 'ArrowDown'}); // opens (pointer stays -1)
        await input.trigger('keydown', {key: 'ArrowDown'}); // pointer → 0 (Apricot)
        await input.trigger('keydown', {key: 'Enter'}); // toggle Apricot in
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2]]);
        expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-0'); // pointer preserved

        await wrapper.setProps({modelValue: [2]});
        await input.trigger('keydown', {key: 'Enter'}); // toggle Apricot back OUT, same position
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]]);
        expect(menu(wrapper).exists()).toBe(true);
    });

    it('toggles membership on click, stays open, and returns DOM focus to the input', async () => {
        const wrapper = mountMultiCombobox({modelValue: [3]}); // Mango committed
        const input = wrapper.find('input');
        await input.trigger('click');

        const apricot = menu(wrapper).findAll('.ui-multicombobox__option')[0]; // sorted first
        await apricot.trigger('mouseover');
        expect(apricot.classes()).toContain('is-active');

        await apricot.trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[3, 2]]); // appended
        expect(menu(wrapper).exists()).toBe(true); // stays open
        expect(document.activeElement).toBe(input.element); // refocused after the pointer commit
    });

    it('marks committed membership aria-selected while the pointer rides aria-activedescendant', async () => {
        const wrapper = mountMultiCombobox({modelValue: [2]}); // Apricot committed
        const input = () => wrapper.find('input');

        expect(input().attributes('aria-controls')).toBeUndefined();
        expect(input().attributes('aria-activedescendant')).toBeUndefined();

        await input().trigger('keydown', {key: 'ArrowDown'}); // opens, pointer stays -1
        expect(input().attributes('aria-controls')).toBe('fruit-listbox');
        expect(menu(wrapper).attributes('id')).toBe('fruit-listbox');

        await input().trigger('keydown', {key: 'ArrowDown'}); // → Apricot (position 0)
        await input().trigger('keydown', {key: 'ArrowDown'}); // → Mango (position 1)
        expect(input().attributes('aria-activedescendant')).toBe('fruit-opt-1');

        // The pointer moved to Mango, but aria-selected still marks the COMMITTED Apricot.
        expect(
            menu(wrapper)
                .findAll('.ui-multicombobox__option')
                .map((o) => o.attributes('aria-selected')),
        ).toEqual(['true', 'false', 'false']);

        const ids = menu(wrapper)
            .findAll('.ui-multicombobox__option')
            .map((o) => o.attributes('id'));
        expect(ids).toEqual(['fruit-opt-0', 'fruit-opt-1', 'fruit-opt-2']);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('removes a committed value via its chip button without opening the menu, and localises removeLabel', async () => {
        const wrapper = mountMultiCombobox({modelValue: [1, 2], removeLabel: 'Verwijder'});

        const chips = wrapper.findAll('.ui-multicombobox__chip');
        expect(chips.map((chip) => chip.text())).toEqual(['Apricot', 'Watermelon']);
        expect(chips[1].find('.ui-multicombobox__chip-remove').attributes('aria-label')).toBe('Verwijder Watermelon');

        await chips[1].find('.ui-multicombobox__chip-remove').trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2]]);
        expect(menu(wrapper).exists()).toBe(false); // chip remove ≠ open
        // Removal unmounts the focused button — focus must land on the input, not the body
        // (#185 review Minor: the APG chip treatment).
        expect(document.activeElement).toBe(wrapper.find('input').element);
    });

    it('removing a chip while the list is open keeps it open — the refocus never toggles the list', async () => {
        const wrapper = mountMultiCombobox({modelValue: [1, 2]});

        await wrapper.find('input').trigger('focus');
        expect(menu(wrapper).exists()).toBe(true);

        await wrapper.find('.ui-multicombobox__chip-remove').trigger('click'); // Apricot, shown first
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[1]]);
        expect(menu(wrapper).exists()).toBe(true); // stays open
        expect(document.activeElement).toBe(wrapper.find('input').element);
    });

    it('removes the last chip on Backspace only while the query is empty, and does nothing with no chip', async () => {
        const wrapper = mountMultiCombobox({modelValue: [2, 1]});
        const input = wrapper.find('input');

        await input.trigger('keydown', {key: 'Backspace'}); // empty query → pop
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2]]);
        expect(menu(wrapper).exists()).toBe(false); // Backspace never opens

        await typeInto(input, 'ap'); // now the query holds text…
        await input.trigger('keydown', {key: 'Backspace'}); // …so Backspace stays native editing
        expect(wrapper.emitted('update:modelValue')).toHaveLength(1); // no second pop

        await typeInto(input, '');
        await wrapper.setProps({modelValue: []});
        await input.trigger('keydown', {key: 'Backspace'});
        expect(wrapper.emitted('update:modelValue')).toHaveLength(1); // nothing to pop
    });

    it('keeps an unresolved id in the model (no chip) until its option arrives, and Backspace leaves it', async () => {
        const wrapper = mountMultiCombobox({modelValue: [3, 99]});

        // id 99 has no option yet — no chip, but the model keeps it (async-options window).
        expect(wrapper.findAll('.ui-multicombobox__chip').map((chip) => chip.text())).toEqual(['Mango']);

        // Backspace removes the last chip shown, never the model's tail.
        await wrapper.find('input').trigger('keydown', {key: 'Backspace'});
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[99]]);
    });

    it('closes and clears the query on Escape, Tab, and click-outside — the resting state is empty + placeholder', async () => {
        const wrapper = mountMultiCombobox({});
        const input = wrapper.find('input');

        await typeInto(input, 'ap'); // open + half-typed filter
        await input.trigger('keydown', {key: 'Escape'});
        expect(menu(wrapper).exists()).toBe(false);
        expect(input.element.value).toBe(''); // cleared, never a committed-label snap

        await typeInto(input, 'm');
        await input.trigger('keydown', {key: 'Tab'});
        expect(menu(wrapper).exists()).toBe(false);
        expect(input.element.value).toBe('');

        await typeInto(input, 'zzz');
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(menu(wrapper).exists()).toBe(false);
        expect(input.element.value).toBe('');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined(); // nothing committed
    });

    it('survives the filtered list shrinking under the pointer, and Enter no-ops on a drained list', async () => {
        const wrapper = mountMultiCombobox({});
        const input = () => wrapper.find('input');

        await input().trigger('keydown', {key: 'ArrowDown'}); // open
        await input().trigger('keydown', {key: 'ArrowDown'}); // → 0
        await input().trigger('keydown', {key: 'ArrowDown'}); // → 1
        await input().trigger('keydown', {key: 'ArrowDown'}); // → 2 (last)
        expect(input().attributes('aria-activedescendant')).toBe('fruit-opt-2');

        // A narrowing that lands under the pointer must clamp, not dangle.
        await wrapper.setProps({options: FRUITS.slice(0, 1)});
        expect(menu(wrapper).findAll('.ui-multicombobox__option')).toHaveLength(1);
        const active = input().attributes('aria-activedescendant');
        if (active !== undefined) expect(menu(wrapper).find(`#${active}`).exists()).toBe(true);

        // Enter must commit the surviving option rather than index off the end.
        await input().trigger('keydown', {key: 'Enter'});
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[FRUITS[0].id]]);

        // Draining to nothing empties the highlight and Enter becomes a no-op.
        await wrapper.setProps({options: []});
        expect(input().attributes('aria-activedescendant')).toBeUndefined();
        await input().trigger('keydown', {key: 'Enter'});
        expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
        expect(menu(wrapper).find('.ui-multicombobox__empty').text()).toBe('No options');
    });

    it('round-trips string ids, resolves labels via a getter, and preserves given order unsorted', async () => {
        interface Tag {
            id: string;
            title: string;
        }
        const tags: Tag[] = [
            {id: 'b', title: 'beta'},
            {id: 'a', title: 'alpha'},
        ];
        const wrapper = mountMultiCombobox({
            options: tags,
            optionLabel: (tag: Tag) => tag.title.toUpperCase(),
            modelValue: ['a'],
            alphabeticalSort: false,
        });

        expect(wrapper.findAll('.ui-multicombobox__chip').map((chip) => chip.text())).toEqual(['ALPHA']);

        await wrapper.find('input').trigger('click');
        const options = menu(wrapper).findAll('.ui-multicombobox__option');
        expect(options.map((option) => option.text())).toEqual(['BETA', 'ALPHA']); // given order kept
        expect(options.map((option) => option.attributes('aria-selected'))).toEqual(['false', 'true']);

        await options[0].trigger('click'); // add 'b'
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['a', 'b']]);
    });

    it('renders per-option custom content through the #option scoped slot over the FILTERED list', async () => {
        const wrapper = mountMultiCombobox(
            {modelValue: [3]}, // Mango committed
            {
                option: (props: {option: Fruit; index: number; selected: boolean}) =>
                    h('b', {class: 'swatch'}, `${props.option.name}#${props.index}${props.selected ? '*' : ''}`),
            },
        );
        const input = wrapper.find('input');

        await input.trigger('click');
        await typeInto(input, 'm'); // filtered + sorted: Mango, Watermelon
        expect(
            menu(wrapper)
                .findAll('.swatch')
                .map((el) => el.text()),
        ).toEqual(['Mango#0*', 'Watermelon#1']);

        // Slotted content toggles exactly like the plain text — and the menu stays open.
        await menu(wrapper).findAll('.ui-multicombobox__option')[1].trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[3, 1]]); // + Watermelon
        expect(menu(wrapper).exists()).toBe(true);
    });

    it('marks mutedOptions with .is-muted while keeping them committable', async () => {
        const wrapper = mountMultiCombobox({mutedOptions: [2]}); // Apricot
        await wrapper.find('input').trigger('click');

        const options = menu(wrapper).findAll('.ui-multicombobox__option'); // Apricot, Mango, Watermelon
        expect(options.map((o) => o.classes().includes('is-muted'))).toEqual([true, false, false]);

        // Muted ≠ disabled: a muted option still toggles membership.
        await options[0].trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2]]);
    });

    it('uses a custom optionsLabel and emptyText', async () => {
        const wrapper = mountMultiCombobox({options: [], optionsLabel: 'Fruits', emptyText: 'Nothing here'});
        await wrapper.find('input').trigger('click');
        expect(menu(wrapper).attributes('aria-label')).toBe('Fruits');
        expect(menu(wrapper).find('.ui-multicombobox__empty').text()).toBe('Nothing here');
    });

    it('stays fully inert when disabled — synthetic keyboard included', async () => {
        const wrapper = mountMultiCombobox({modelValue: [1], disabled: true});
        const input = wrapper.find('input');

        expect(wrapper.find('.ui-multicombobox__box').classes()).toContain('is-disabled');
        expect(input.attributes('disabled')).toBeDefined();
        expect(wrapper.find('.ui-multicombobox__chip-remove').attributes('disabled')).toBeDefined();

        // Dispatched natively: VTU's trigger() silently SKIPS disabled elements, which would
        // leave the handler's disabled guard unexercised and the assertions vacuous — the
        // event must actually reach the handler to prove the guard.
        input.element.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(menu(wrapper).exists()).toBe(false);
        input.element.dispatchEvent(new KeyboardEvent('keydown', {key: 'Backspace', bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('exposes an imperative focus() handle that moves DOM focus to the input', () => {
        const wrapper = mountMultiCombobox({});
        const inputEl = wrapper.find('input').element;
        expect(document.activeElement).not.toBe(inputEl);

        (wrapper.vm as unknown as {focus: () => void}).focus();
        expect(document.activeElement).toBe(inputEl);
    });

    it('removes its document listener on unmount', async () => {
        const wrapper = mountMultiCombobox({});
        await wrapper.find('input').trigger('click');
        wrapper.unmount();
        // Exercises onBeforeUnmount cleanup — a stray document click must not throw.
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });

    it('jumps to the first/last option on Home/End while open (WR-0521)', async () => {
        const wrapper = mountMultiCombobox({});
        const input = wrapper.find('input');

        await input.trigger('click'); // open, pointer -1
        await input.trigger('keydown', {key: 'End'});
        expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-2');
        await input.trigger('keydown', {key: 'Home'});
        expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-0');
    });

    it('announces drain-to-empty through the polite live region (WR-0521)', async () => {
        const wrapper = mountMultiCombobox({emptyText: 'No match'});
        const region = wrapper.find('[aria-live="polite"]');
        const input = wrapper.find('input');

        expect(region.attributes('role')).toBe('status');
        expect(region.text()).toBe(''); // closed → silent

        await input.trigger('click');
        expect(region.text()).toBe(''); // open with options → silent

        await typeInto(input, 'zzz'); // typing drains the filtered list
        expect(region.text()).toBe('No match');

        await typeInto(input, 'm'); // matches return → the region empties again
        expect(region.text()).toBe('');
    });

    // An IME composes a character through several `input` events. The query is bound with `v-model`,
    // which ignores them until `compositionend`, so a candidate never filters the list. Neither
    // happy-dom nor Chromium can be driven by a real IME from a test; these are the events one sends.
    describe('IME composition', () => {
        const compose = (field: HTMLInputElement, value: string): void => {
            field.value = value;
            field.dispatchEvent(new InputEvent('input', {bubbles: true, isComposing: true}));
        };

        it('filters nothing while composing, then filters by the committed text', async () => {
            const wrapper = mountMultiCombobox({});
            const field = wrapper.find('input').element;
            const shown = () =>
                menu(wrapper)
                    .findAll('.ui-multicombobox__option')
                    .map((o) => o.text());

            field.focus(); // opens
            field.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
            compose(field, 'z');
            compose(field, 'm');
            await wrapper.vm.$nextTick();
            expect(shown()).toEqual(['Apricot', 'Mango', 'Watermelon']);

            field.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: 'm'}));
            await wrapper.vm.$nextTick();
            expect(shown()).toEqual(['Mango', 'Watermelon']);
        });

        it('opens nothing while composing on a closed list, then opens on the committed text', async () => {
            const wrapper = mountMultiCombobox({});
            const input = wrapper.find('input');
            const field = input.element;

            field.focus(); // opens
            await input.trigger('keydown', {key: 'Escape'});
            field.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
            compose(field, 'm');
            await wrapper.vm.$nextTick();
            expect(menu(wrapper).exists()).toBe(false);

            field.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: 'm'}));
            await wrapper.vm.$nextTick();
            expect(menu(wrapper).exists()).toBe(true);
        });

        it('drops the highlight on a composing input', async () => {
            const wrapper = mountMultiCombobox({});
            const input = wrapper.find('input');

            await input.trigger('keydown', {key: 'ArrowDown'}); // open
            await input.trigger('keydown', {key: 'ArrowDown'}); // → Apricot
            expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-0');

            input.element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
            compose(input.element, 'か');
            await wrapper.vm.$nextTick();

            expect(input.attributes('aria-activedescendant')).toBeUndefined();
        });

        it.each([
            ['isComposing', {isComposing: true}],
            ['keyCode 229', {keyCode: 229}],
        ])('commits no highlighted option on an Enter flagged by %s', async (_, flag) => {
            const wrapper = mountMultiCombobox({});
            const input = wrapper.find('input');

            await input.trigger('keydown', {key: 'ArrowDown'}); // open
            await input.trigger('keydown', {key: 'ArrowDown'}); // → Apricot
            input.element.dispatchEvent(
                new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true, ...flag}),
            );
            await wrapper.vm.$nextTick();

            expect(wrapper.emitted('update:modelValue')).toBeUndefined();
            expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-0');
        });

        // The keys inside a composition carry `isComposing`; the keydown that starts one fires before
        // `compositionstart` and carries only keyCode 229. An IME moves through its candidates with
        // the arrow keys, confirms one with Enter and edits it with Backspace, so none may reach the
        // list or the chips.
        it.each([
            ['isComposing', {isComposing: true}],
            ['keyCode 229', {keyCode: 229}],
        ])('leaves ArrowDown, Enter and Backspace flagged by %s to the input method', async (_, flag) => {
            const wrapper = mountMultiCombobox({modelValue: [2]});
            const input = wrapper.find('input');
            const press = (key: string): void => {
                input.element.dispatchEvent(
                    new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...flag}),
                );
            };

            await input.trigger('keydown', {key: 'ArrowDown'}); // open
            input.element.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
            compose(input.element, 'か');
            press('ArrowDown');
            press('Enter');
            press('Backspace');
            await wrapper.vm.$nextTick();

            expect(input.attributes('aria-activedescendant')).toBeUndefined();
            expect(wrapper.emitted('update:modelValue')).toBeUndefined();
            expect(menu(wrapper).exists()).toBe(true);
        });

        it('does not open when a blur commits the composition after focus has left', async () => {
            const wrapper = mountMultiCombobox({});
            const input = wrapper.find('input');
            const field = input.element;
            const outside = document.createElement('button');
            document.body.append(outside);

            field.focus(); // opens
            await input.trigger('keydown', {key: 'Escape'});
            field.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
            compose(field, 'm');
            outside.focus();
            field.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: 'm'}));
            await wrapper.vm.$nextTick();

            expect(menu(wrapper).exists()).toBe(false);
        });

        it('keeps the candidate text in the field across a re-render while composing', async () => {
            const wrapper = mountMultiCombobox({});
            const field = wrapper.find('input').element;

            field.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
            compose(field, 'か');
            await wrapper.setProps({placeholder: 'Pick some'});

            expect(field.value).toBe('か');
        });
    });
});

describe('MultiCombobox model order', () => {
    // Caller order: Banana(1), Apple(2), Cherry(3).
    const fruits = [
        {id: 1, name: 'Banana'},
        {id: 2, name: 'Apple'},
        {id: 3, name: 'Cherry'},
    ];

    const mountFruits = (modelValue: number[], alphabeticalSort = false) =>
        mount(MultiCombobox, {
            props: {options: fruits, optionLabel: 'name', id: 'fruit', modelValue, alphabeticalSort},
            attachTo: document.body,
        });

    it.each([
        ["the caller's order", false, ['Banana', 'Apple', 'Cherry']],
        ['alphabetical order', true, ['Apple', 'Banana', 'Cherry']],
    ])(
        'shows the chips in %s when alphabeticalSort is %s, whatever order the model arrived in',
        (_, sort, expected) => {
            const wrapper = mountFruits([3, 2, 1], sort);

            expect(wrapper.findAll('.ui-multicombobox__chip').map((chip) => chip.text())).toEqual(expected);
            expect(wrapper.find('#fruit-selection').text()).toBe(expected.join(', '));
            wrapper.unmount();
        },
    );

    it('keeps every chip while a typed query narrows the list', async () => {
        const wrapper = mountFruits([3, 1]);
        const input = wrapper.find('input');
        await typeInto(input, 'app');

        expect(
            menu(wrapper)
                .findAll('li[role="option"]')
                .map((option) => option.text()),
        ).toEqual(['Apple']);
        expect(wrapper.findAll('.ui-multicombobox__chip').map((chip) => chip.text())).toEqual(['Banana', 'Cherry']);
        wrapper.unmount();
    });

    it('keeps the chips already shown in place when a pick adds one', async () => {
        const wrapper = mountFruits([3, 1]);
        await wrapper.find('input').trigger('click');
        await menu(wrapper).findAll('li[role="option"]')[1].trigger('click'); // Apple
        await wrapper.setProps({modelValue: wrapper.emitted<number[][]>('update:modelValue')!.at(-1)![0]});

        expect(wrapper.findAll('.ui-multicombobox__chip').map((chip) => chip.text())).toEqual([
            'Banana',
            'Apple',
            'Cherry',
        ]);
        wrapper.unmount();
    });

    // Cherry is the last chip, so all three paths drop it from the same membership.
    it.each([
        [
            'its chip button',
            async (wrapper: ReturnType<typeof mountFruits>) => {
                await wrapper.findAll('.ui-multicombobox__chip-remove')[2].trigger('click');
            },
        ],
        [
            'Backspace',
            async (wrapper: ReturnType<typeof mountFruits>) => {
                await wrapper.find('input').trigger('keydown', {key: 'Backspace'});
            },
        ],
        [
            'the list',
            async (wrapper: ReturnType<typeof mountFruits>) => {
                await wrapper.find('input').trigger('click');
                await menu(wrapper).findAll('li[role="option"]')[2].trigger('click');
            },
        ],
    ])("removing through %s drops the id in place, keeping the consumer's order", async (_, removeCherry) => {
        const wrapper = mountFruits([2, 3, 99, 1]);
        await removeCherry(wrapper);

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2, 99, 1]]);
        wrapper.unmount();
    });

    it('adds a pick at the end of the model, after an id with no option yet', async () => {
        const wrapper = mountFruits([99, 3]);
        await wrapper.find('input').trigger('click');
        await menu(wrapper).findAll('li[role="option"]')[0].trigger('click');

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[99, 3, 1]]);
        wrapper.unmount();
    });
});

describe('MultiCombobox placement', () => {
    it.each([
        [undefined, 'bottom-start'],
        ['top', 'top'],
    ] as const)('hands floating-ui placement %s as %s', (placement, expected) => {
        const wrapper = mountMultiCombobox(placement === undefined ? {} : {placement});

        expect(vi.mocked(useFloating).mock.calls.at(-1)?.[2]).toMatchObject({placement: expected});
        wrapper.unmount();
    });
});
