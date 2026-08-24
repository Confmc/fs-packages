// Browser-mode FLOATING-UI spec (real Chromium layout) — scope: contract + interaction only;
// unit behaviour stays in the happy-dom suite; never duplicate a happy-dom spec here.
//
// happy-dom has no layout engine, so floating-ui positioning is meaningless there. The
// load-bearing claim here is POSITION-EXISTS: the open menu gets real non-zero coordinates
// below the trigger. Viewport-flip behaviour is deliberately NOT asserted (flaky across
// runner viewports); the family shares one useListbox floating config, so one control
// (SingleSelect) plus a Combobox sanity pass covers the wiring.
// The hide() gate (WR-0542) IS asserted here: it needs a real clipping ancestor and real
// scroll geometry, which happy-dom cannot produce — the unit layer pins the gate's wiring
// against a mocked middlewareData, this file proves it fires in a real browser.
import {describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-vue';
import {userEvent} from 'vitest/browser';
import {defineComponent, h, ref} from 'vue';

import Combobox from '../../src/components/Combobox.vue';
import SingleSelect from '../../src/components/SingleSelect.vue';
import '../../styles.css';

type Fruit = {id: number; name: string};

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
const renderSelect = (component: any) => {
    const model = ref<number | null>(null);
    render(
        defineComponent(
            () => () =>
                h(component, {
                    options: FRUITS,
                    label: 'name',
                    id: 'fruit',
                    modelValue: model.value,
                    'onUpdate:modelValue': (value: number | null) => {
                        model.value = value;
                    },
                }),
        ),
    );
};

describe('floating-ui reality — the open menu is actually positioned', () => {
    it('positions the SingleSelect menu below the trigger with real non-zero dimensions', async () => {
        renderSelect(SingleSelect);
        const trigger = document.getElementById('fruit') as HTMLElement;

        await userEvent.click(trigger);
        const popup = document.querySelector('.ui-select__menu') as HTMLElement;
        expect(popup).not.toBeNull();

        // floating-ui computes position async (autoUpdate + computePosition) — poll.
        await expect.poll(() => popup.getBoundingClientRect().width).toBeGreaterThan(0);
        await expect.poll(() => popup.getBoundingClientRect().height).toBeGreaterThan(0);

        const triggerRect = trigger.getBoundingClientRect();
        // bottom-start placement with offset(4): below the trigger. Tolerant — assert
        // "at or below the trigger's bottom edge", not the exact 4px offset.
        await expect.poll(() => popup.getBoundingClientRect().top).toBeGreaterThanOrEqual(triggerRect.bottom);
        // Width tracks the trigger via --ui-menu-reference-width after teleport. This fixture
        // renders full-bleed, so trigger width and viewport width coincide and the assertion
        // cannot separate the two — the narrow-wrapper test in the KD-1136 block does that.
        await expect.poll(() => popup.getBoundingClientRect().width).toBeGreaterThanOrEqual(triggerRect.width);
        // Horizontally on-screen (shift(8) keeps it inside the viewport).
        expect(popup.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    });

    it('positions the Combobox menu below the input (shared useListbox floating config)', async () => {
        renderSelect(Combobox);
        const input = document.getElementById('fruit') as HTMLElement;

        await userEvent.click(input);
        const popup = document.querySelector('.ui-combobox__menu') as HTMLElement;
        expect(popup).not.toBeNull();

        await expect.poll(() => popup.getBoundingClientRect().height).toBeGreaterThan(0);
        const inputRect = input.getBoundingClientRect();
        await expect.poll(() => popup.getBoundingClientRect().top).toBeGreaterThanOrEqual(inputRect.bottom);
    });
});

describe('floating-ui hide() — the open menu follows its clipped-away trigger', () => {
    // Regression pin for the dead-middleware bug (WR-0542 item 5): hide() was applied but
    // `middlewareData.hide.referenceHidden` was never consumed, so an open menu stayed
    // painted, floating detached, while its trigger scrolled out of a clipping ancestor
    // (under a sticky header, say). The gate now overlays `visibility: hidden` on the
    // floating styles; this walks the real scroll geometry in Chromium, both directions.
    it('hides the menu when the trigger scrolls out of its clipping ancestor, and shows it again on scroll-back', async () => {
        const model = ref<number | null>(null);
        render(
            defineComponent(
                () => () =>
                    h('div', {id: 'clip', style: 'height: 120px; overflow: auto; position: relative;'}, [
                        h(SingleSelect, {
                            options: FRUITS,
                            label: 'name',
                            id: 'fruit',
                            modelValue: model.value,
                            'onUpdate:modelValue': (value: number | null) => {
                                model.value = value;
                            },
                        }),
                        // Enough filler that the trigger can scroll fully out of the clip box.
                        h('div', {style: 'height: 600px;'}),
                    ]),
            ),
        );
        const clip = document.getElementById('clip') as HTMLElement;
        const trigger = document.getElementById('fruit') as HTMLElement;

        await userEvent.click(trigger);
        const popup = document.querySelector('.ui-select__menu') as HTMLElement;
        expect(popup).not.toBeNull();

        // Open in view: positioned, and NOT visibility-gated.
        await expect.poll(() => popup.getBoundingClientRect().height).toBeGreaterThan(0);
        expect(popup.style.visibility).not.toBe('hidden');

        // Scroll the trigger fully out of the clip box — autoUpdate recomputes on ancestor
        // scroll, hide() reports referenceHidden, and the gate must paint the menu away.
        clip.scrollTop = 400;
        await expect.poll(() => popup.style.visibility).toBe('hidden');

        // Scroll back — the gate must release (an overlay, not a one-way latch).
        clip.scrollTop = 0;
        await expect.poll(() => popup.style.visibility).not.toBe('hidden');
    });
});

describe('listbox teleport — the open menu escapes a clipping ancestor (KD-1136)', () => {
    it('sizes the teleported menu to the TRIGGER, not to the teleport target', async () => {
        const model = ref<number | null>(null);
        render(
            defineComponent(
                () => () =>
                    h('div', {style: 'width: 200px;'}, [
                        h(SingleSelect, {
                            options: FRUITS,
                            label: 'name',
                            id: 'fruit',
                            modelValue: model.value,
                            'onUpdate:modelValue': (value: number | null) => {
                                model.value = value;
                            },
                        }),
                    ]),
            ),
        );
        const trigger = document.getElementById('fruit') as HTMLElement;

        await userEvent.click(trigger);
        const popup = document.querySelector('.ui-select__menu') as HTMLElement;
        await expect.poll(() => popup.getBoundingClientRect().width).toBeGreaterThan(0);

        // A 200px trigger inside a much wider viewport: the pre-fix `min-width: 100%` measured
        // the teleported popup's containing block (the viewport) and blew the menu out to full
        // width. --ui-menu-reference-width pins it back to the trigger.
        const triggerWidth = trigger.getBoundingClientRect().width;
        expect(triggerWidth).toBeLessThan(document.documentElement.clientWidth);
        await expect.poll(() => Math.round(popup.getBoundingClientRect().width)).toBe(Math.round(triggerWidth));
    });

    it('renders the SingleSelect menu on document.body, fully visible above a following sibling', async () => {
        const model = ref<number | null>(null);
        render(
            defineComponent(
                () => () =>
                    h('div', {id: 'page'}, [
                        h('div', {id: 'clip', style: 'height: 48px; overflow: hidden; position: relative;'}, [
                            h(SingleSelect, {
                                options: FRUITS,
                                label: 'name',
                                id: 'fruit',
                                modelValue: model.value,
                                'onUpdate:modelValue': (value: number | null) => {
                                    model.value = value;
                                },
                            }),
                        ]),
                        h('div', {
                            id: 'cover',
                            style: 'height: 240px; background: rgb(200, 0, 0); position: relative; z-index: 1;',
                        }),
                    ]),
            ),
        );
        const trigger = document.getElementById('fruit') as HTMLElement;

        await userEvent.click(trigger);
        const popup = document.querySelector('.ui-select__menu') as HTMLElement;
        expect(popup).not.toBeNull();
        expect(popup.parentElement).toBe(document.body);

        await expect.poll(() => popup.getBoundingClientRect().height).toBeGreaterThan(0);
        const popupRect = popup.getBoundingClientRect();
        const clipRect = (document.getElementById('clip') as HTMLElement).getBoundingClientRect();
        // The menu is taller than the clip box — without teleport it would be cut off.
        expect(popupRect.height).toBeGreaterThan(clipRect.height);

        // The pixels of the menu that sit over the covering sibling are the MENU, not the cover.
        const hit = document.elementFromPoint(popupRect.left + 8, popupRect.top + Math.min(16, popupRect.height / 2));
        expect(popup.contains(hit)).toBe(true);
    });

    it('teleports into the nearest dialog rather than body (native-dialog top-layer)', async () => {
        const model = ref<number | null>(null);
        render(
            defineComponent(
                () => () =>
                    h('dialog', {id: 'dlg', open: true}, [
                        h(SingleSelect, {
                            options: FRUITS,
                            label: 'name',
                            id: 'fruit',
                            modelValue: model.value,
                            'onUpdate:modelValue': (value: number | null) => {
                                model.value = value;
                            },
                        }),
                    ]),
            ),
        );
        const trigger = document.getElementById('fruit') as HTMLElement;

        await userEvent.click(trigger);
        const popup = document.querySelector('.ui-select__menu') as HTMLElement;
        expect(popup).not.toBeNull();
        expect(popup.parentElement).toBe(document.getElementById('dlg'));
        expect(popup.parentElement).not.toBe(document.body);
        await expect.poll(() => popup.getBoundingClientRect().height).toBeGreaterThan(0);
    });
});
