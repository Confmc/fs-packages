// @vitest-environment happy-dom
import {useFloating} from '@floating-ui/vue';
import {mount} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, shallowRef} from 'vue';

import type {UseListboxOptions} from '../src/composables/useListbox';

import {useListbox} from '../src/composables/useListbox';

// The component suites (SingleSelect / Combobox) exercise the composable's behaviour against
// the REAL floating-ui. This suite pins the things they cannot see: the exact layout policy
// handed to floating-ui (the family defaults, and the `floatingOptions` overrides), the
// hide()-middleware visibility gate (driven off a controlled `middlewareData`), and the
// clear-entry option combinations no component produces (a rendered entry without a commit
// callback). Middleware factories return opaque objects, so each is mocked to a marker
// recording its args (vi.mock is hoisted above the imports, so the top-level import gets the
// mock too).
const floatingMock = vi.hoisted(() => ({
    styles: {position: 'absolute', top: '0px'} as Record<string, string>,
    middlewareData: {} as Record<string, unknown>,
}));

vi.mock('@floating-ui/vue', () => ({
    useFloating: vi.fn(() => ({
        floatingStyles: {value: floatingMock.styles},
        middlewareData: {value: floatingMock.middlewareData},
    })),
    autoUpdate: vi.fn(),
    offset: vi.fn((value: number) => ({name: 'offset', value})),
    flip: vi.fn((config: unknown) => ({name: 'flip', config})),
    shift: vi.fn((config: unknown) => ({name: 'shift', config})),
    hide: vi.fn(() => ({name: 'hide'})),
}));

beforeEach(() => {
    floatingMock.middlewareData = {};
});

// Captures the composable's return so specs can drive the keyboard skeleton and read the
// gated floating styles directly — the artificial option combos have no component host.
let api: ReturnType<typeof useListbox>;

const Harness = defineComponent({
    props: {overrides: {type: Object, default: undefined}},
    setup(props) {
        const root = shallowRef<HTMLElement | null>(null);
        const reference = shallowRef<HTMLElement | null>(null);
        const floating = shallowRef<HTMLElement | null>(null);
        api = useListbox({
            root,
            reference,
            floating,
            id: () => 'harness',
            disabled: () => false,
            listLength: () => 0,
            openKeys: () => false,
            onCommit: () => false,
            onDismiss: () => {},
            onOutside: () => {},
            ...(props.overrides as Partial<UseListboxOptions> | undefined),
        });
        return () => h('div', {ref: root});
    },
});

const lastFloatingConfig = () => vi.mocked(useFloating).mock.calls.at(-1)?.[2];

const key = (name: string): KeyboardEvent => new KeyboardEvent('keydown', {key: name, cancelable: true});

describe('useListbox floating options', () => {
    it('applies the family layout policy by default (bottom-start, offset 4, top-start flip, shift 8)', () => {
        const wrapper = mount(Harness);

        expect(lastFloatingConfig()).toMatchObject({
            placement: 'bottom-start',
            middleware: [
                {name: 'offset', value: 4},
                {name: 'flip', config: {fallbackPlacements: ['top-start']}},
                {name: 'shift', config: {padding: 8}},
                {name: 'hide'},
            ],
        });
        wrapper.unmount();
    });

    it('honours every floatingOptions override', () => {
        const wrapper = mount(Harness, {
            props: {
                overrides: {
                    floatingOptions: {
                        placement: 'top-end',
                        offset: 12,
                        fallbackPlacements: ['bottom-end'],
                        shiftPadding: 2,
                    },
                },
            },
        });

        expect(lastFloatingConfig()).toMatchObject({
            placement: 'top-end',
            middleware: [
                {name: 'offset', value: 12},
                {name: 'flip', config: {fallbackPlacements: ['bottom-end']}},
                {name: 'shift', config: {padding: 2}},
                {name: 'hide'},
            ],
        });
        wrapper.unmount();
    });
});

describe('useListbox hide() visibility gate', () => {
    it('passes the floating styles through untouched while the reference is visible', () => {
        floatingMock.middlewareData = {hide: {referenceHidden: false}};
        const wrapper = mount(Harness);

        expect(api.floatingStyles.value).toEqual({position: 'absolute', top: '0px'});
        expect(api.floatingStyles.value.visibility).toBeUndefined();
        wrapper.unmount();
    });

    it('overlays visibility:hidden when hide() reports the reference fully clipped away', () => {
        floatingMock.middlewareData = {hide: {referenceHidden: true}};
        const wrapper = mount(Harness);

        // The positioning styles survive — only visibility is overlaid, so un-hiding on a
        // scroll-back never has to re-run layout.
        expect(api.floatingStyles.value).toEqual({position: 'absolute', top: '0px', visibility: 'hidden'});
        wrapper.unmount();
    });

    it('treats absent hide middleware data as visible (first paint, before computePosition lands)', () => {
        floatingMock.middlewareData = {};
        const wrapper = mount(Harness);

        expect(api.floatingStyles.value.visibility).toBeUndefined();
        wrapper.unmount();
    });
});

describe('useListbox Home/End (WR-0521)', () => {
    it('End jumps to the last option and Home back to the first, both swallowing the key', () => {
        const wrapper = mount(Harness, {props: {overrides: {listLength: () => 3}}});

        api.open.value = true;
        const end = key('End');
        api.onKey(end);
        expect(api.pointer.value).toBe(2);
        expect(end.defaultPrevented).toBe(true);

        const home = key('Home');
        api.onKey(home);
        expect(api.pointer.value).toBe(0);
        expect(home.defaultPrevented).toBe(true);
        wrapper.unmount();
    });

    it('an empty list leaves the highlight untouched but still swallows the key while open', () => {
        const wrapper = mount(Harness); // listLength 0

        api.open.value = true;
        const home = key('Home');
        api.onKey(home);
        expect(api.pointer.value).toBe(-1);
        expect(api.activeDescendant.value).toBeUndefined();
        expect(home.defaultPrevented).toBe(true);
        wrapper.unmount();
    });

    it('Home drops a clear-entry highlight and lands on the first OPTION', () => {
        const wrapper = mount(Harness, {
            props: {overrides: {clearEntry: () => true, onClearCommit: () => true, listLength: () => 2}},
        });

        api.open.value = true;
        api.onKey(key('ArrowDown')); // "nothing" → the clear entry
        expect(api.clearHighlighted.value).toBe(true);

        api.onKey(key('Home'));
        expect(api.clearHighlighted.value).toBe(false);
        expect(api.pointer.value).toBe(0);
        expect(api.activeDescendant.value).toBe('harness-opt-0');
        wrapper.unmount();
    });
});

describe('useListbox clear-entry option combinations', () => {
    // The components always pass `clearEntry` and `onClearCommit` together; the composable
    // treats them as independent optionals, so the decoupled combinations are pinned here.
    it('a rendered clear entry with NO commit callback highlights but never swallows Enter', () => {
        const wrapper = mount(Harness, {props: {overrides: {clearEntry: () => true, listLength: () => 2}}});

        api.open.value = true;
        api.onKey(key('ArrowDown')); // "nothing" → the clear entry
        expect(api.clearHighlighted.value).toBe(true);
        expect(api.activeDescendant.value).toBe('harness-clear');

        const enter = key('Enter');
        api.onKey(enter); // no onClearCommit → nothing commits, Enter falls through
        expect(enter.defaultPrevented).toBe(false);
        expect(api.open.value).toBe(true);
        wrapper.unmount();
    });

    it('a clear commit callback returning false does not swallow Enter', () => {
        const wrapper = mount(Harness, {
            props: {overrides: {clearEntry: () => true, onClearCommit: () => false, listLength: () => 2}},
        });

        api.open.value = true;
        api.onKey(key('ArrowDown'));
        expect(api.clearHighlighted.value).toBe(true);

        const enter = key('Enter');
        api.onKey(enter);
        expect(enter.defaultPrevented).toBe(false);
        wrapper.unmount();
    });

    it('ArrowDown stays on the clear entry when the option list is empty', () => {
        const wrapper = mount(Harness, {
            props: {overrides: {clearEntry: () => true, onClearCommit: () => true, listLength: () => 0}},
        });

        api.open.value = true;
        api.onKey(key('ArrowDown')); // → clear entry
        api.onKey(key('ArrowDown')); // empty list → nowhere to go, stays
        expect(api.clearHighlighted.value).toBe(true);

        const enter = key('Enter');
        api.onKey(enter); // the callback commits → swallowed
        expect(enter.defaultPrevented).toBe(true);
        wrapper.unmount();
    });
});
