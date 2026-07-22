// @vitest-environment happy-dom
import {useFloating} from '@floating-ui/vue';
import {mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';
import {defineComponent, h, shallowRef} from 'vue';

import type {ListboxFloatingOptions} from '../src/composables/useListbox';

import {useListbox} from '../src/composables/useListbox';

// The component suites (SingleSelect / Combobox) exercise the composable's behaviour against
// the REAL floating-ui. This suite pins the one thing they cannot see: the exact layout
// policy handed to floating-ui — the family defaults, and the `floatingOptions` overrides.
// Middleware factories return opaque objects, so each is mocked to a marker recording its
// args (vi.mock is hoisted above the imports, so the top-level import gets the mock too).
vi.mock('@floating-ui/vue', () => ({
    useFloating: vi.fn(() => ({floatingStyles: {value: {}}})),
    autoUpdate: vi.fn(),
    offset: vi.fn((value: number) => ({name: 'offset', value})),
    flip: vi.fn((config: unknown) => ({name: 'flip', config})),
    shift: vi.fn((config: unknown) => ({name: 'shift', config})),
    hide: vi.fn(() => ({name: 'hide'})),
}));

const Harness = defineComponent({
    props: {floatingOptions: {type: Object, default: undefined}},
    setup(props) {
        const root = shallowRef<HTMLElement | null>(null);
        const reference = shallowRef<HTMLElement | null>(null);
        const floating = shallowRef<HTMLElement | null>(null);
        useListbox({
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
            floatingOptions: props.floatingOptions as ListboxFloatingOptions | undefined,
        });
        return () => h('div', {ref: root});
    },
});

const lastFloatingConfig = () => vi.mocked(useFloating).mock.calls.at(-1)?.[2];

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
                floatingOptions: {
                    placement: 'top-end',
                    offset: 12,
                    fallbackPlacements: ['bottom-end'],
                    shiftPadding: 2,
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
