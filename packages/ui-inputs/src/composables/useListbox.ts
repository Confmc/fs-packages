import type {Placement} from '@floating-ui/vue';
import type {Ref} from 'vue';

import {autoUpdate, flip, hide, offset, shift, useFloating} from '@floating-ui/vue';
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import {ensureRefValueExists} from '../internal/reactivity';

/**
 * A readonly ref to the element or null — a `useTemplateRef` result, or a computed deriving
 * the element from a child component's exposed handle (the `OptionList` case).
 */
type ElementRef = Readonly<Ref<HTMLElement | null>>;

/**
 * Overrides for the floating-ui layout policy. Every value defaults to the family standard,
 * so the knob is a no-op until a consumer opts in.
 */
export interface ListboxFloatingOptions {
    /** floating-ui placement of the popup (default `'bottom-start'`). */
    placement?: Placement;
    /** `offset()` main-axis distance between reference and popup, in px (default `4`). */
    offset?: number;
    /** `flip()` fallback placements tried when the primary placement overflows (default `['top-start']`). */
    fallbackPlacements?: Placement[];
    /** `shift()` viewport padding, in px (default `8`). */
    shiftPadding?: number;
}

export interface UseListboxOptions {
    /** the component root — click-outside is measured against it. */
    root: ElementRef;
    /** the floating-ui reference element (the trigger button / the combobox input). */
    reference: ElementRef;
    /** the floating-ui floating element (the listbox popup). */
    floating: ElementRef;
    /** the stable `id` prop, as a getter so the derived IDREFs track it reactively. */
    id: () => string;
    /** whether the control is disabled — the keyboard path guards on it, as a getter so it stays live. */
    disabled: () => boolean;
    /** length of the currently-rendered option list (SingleSelect `sorted`, Combobox/MultiSelect `filtered`). */
    listLength: () => number;
    /** whether a key pressed while CLOSED should open the list (SingleSelect Enter/ArrowDown/Space; Combobox ArrowDown only). */
    openKeys: (key: string) => boolean;
    /**
     * Commit the option at `index`; returns whether a commit actually happened, which is what
     * decides whether Enter is `preventDefault`-ed. The callback owns the read-through-a-local
     * race guard (the array read) AND the close decision — the composable NEVER closes on commit,
     * so a MultiSelect callback can toggle membership and stay open while a SingleSelect one closes.
     */
    onCommit: (index: number) => boolean;
    /** dismiss the list (Escape / Tab). SingleSelect closes; Combobox reverts-then-closes. */
    onDismiss: () => void;
    /** click-outside disposition. SingleSelect closes; Combobox reverts-then-closes. */
    onOutside: () => void;
    /** floating-ui layout-policy overrides — layout is the caller's business, not the core's. */
    floatingOptions?: ListboxFloatingOptions;
}

/**
 * The behavioural core shared by every ui-inputs listbox control (SingleSelect, Combobox, and —
 * forthcoming — MultiSelect). Entirely position/index-based, so the option type `T` never crosses
 * this boundary: the caller owns the derived list and hands back only its length and index-keyed
 * callbacks. Owns `open`/`pointer`, the position-keyed IDREFs, `aria-activedescendant`, the
 * clamp watcher, click-outside, floating-ui, and the keyboard-nav skeleton.
 */
export function useListbox(options: UseListboxOptions) {
    const {
        root,
        reference,
        floating,
        id,
        disabled,
        listLength,
        openKeys,
        onCommit,
        onDismiss,
        onOutside,
        floatingOptions = {},
    } = options;

    const open = ref(false);
    const pointer = ref(-1);

    // The one dismissal step every consumer needs: close the list AND reset the highlight.
    // Owned here so a future consumer cannot forget the `-1` — a stale pointer would resurface
    // as a phantom highlight (and a phantom aria-activedescendant) on the next open. The
    // composable still never calls this on commit: closing after a commit stays the caller's
    // decision (`onCommit` — the MultiSelect toggle-and-stay-open contract).
    const close = () => {
        open.value = false;
        pointer.value = -1;
    };

    // Keyboard focus lives on the trigger, so the focused option is conveyed to assistive
    // tech via aria-activedescendant rather than real DOM focus. That IDREF only resolves
    // if the referenced element sits inside the listbox the trigger owns, which is why the
    // trigger also carries aria-controls while open.
    const listboxId = computed(() => `${id()}-listbox`);
    // Keyed by POSITION, not by option.id: `SelectItem['id']` is an unconstrained
    // `string | number`, and an id containing ASCII whitespace is not a valid IDREF —
    // aria-activedescendant would silently resolve to nothing. Slugifying would trade that
    // for a worse bug (`red apple` and `red-apple` would collide onto one id, making the
    // IDREF ambiguous rather than absent). The position is consistent within a render, which
    // is the only window in which the trigger's IDREF and the option's id are read together.
    const optionId = (index: number): string => `${id()}-opt-${index}`;
    // Absent (not empty) when there is nothing focused — a dangling IDREF is worse than none.
    // The upper bound is load-bearing: the rendered list can shrink while the listbox is open
    // (a reactive `options` prop reloading, or a combobox filter narrowing), leaving `pointer`
    // past the end.
    const activeDescendant = computed(() =>
        open.value && pointer.value >= 0 && pointer.value < listLength() ? optionId(pointer.value) : undefined,
    );

    // The list shrinking while open leaves `pointer` dangling. Clamping on `flush: 'pre'` (so it
    // lands before the re-render that would read a stale index) keeps the highlight honest AND
    // keeps Enter safe — the commit callback indexes the same array. (The SFCs long carried a
    // `flush: 'pre'` comment but never passed the option; it is set here for real, in one place.)
    watch(
        listLength,
        (length) => {
            if (pointer.value >= length) pointer.value = length - 1;
        },
        {flush: 'pre'},
    );

    // Listbox keyboard navigation. The trigger's native :disabled blocks pointer input; this
    // guards the keyboard path too.
    const onKey = (event: KeyboardEvent) => {
        if (disabled()) return;
        if (event.key === 'Tab') {
            onDismiss();
            return;
        }
        if (!open.value) {
            if (openKeys(event.key)) {
                event.preventDefault();
                open.value = true;
            }
            return;
        }
        switch (event.key) {
            case 'ArrowDown':
                pointer.value = Math.min(pointer.value + 1, listLength() - 1);
                event.preventDefault();
                break;
            case 'ArrowUp':
                pointer.value = Math.max(pointer.value - 1, -1);
                event.preventDefault();
                break;
            case 'Enter':
                // The commit callback owns the read-through-a-local race guard and the close
                // decision; it reports whether it committed, and only a real commit swallows Enter.
                if (onCommit(pointer.value)) event.preventDefault();
                break;
            case 'Escape':
                onDismiss();
                event.preventDefault();
                break;
        }
    };

    // click-outside — closes/reverts without a shared directive dependency.
    const onDocumentPointer = (event: MouseEvent) => {
        // The listener is attached only between mount and unmount, so the ref is non-null here.
        // Non-null by lifetime (the listener only exists while mounted) — loud, named accessor
        // over a bare `!`: the same impossible state throws, but names the broken assumption.
        if (!ensureRefValueExists(root).contains(event.target as Node)) onOutside();
    };
    onMounted(() => document.addEventListener('click', onDocumentPointer));
    onBeforeUnmount(() => document.removeEventListener('click', onDocumentPointer));

    const {floatingStyles} = useFloating(reference, floating, {
        placement: floatingOptions.placement ?? 'bottom-start',
        middleware: [
            offset(floatingOptions.offset ?? 4),
            flip({fallbackPlacements: floatingOptions.fallbackPlacements ?? ['top-start']}),
            shift({padding: floatingOptions.shiftPadding ?? 8}),
            hide(),
        ],
        whileElementsMounted: autoUpdate,
    });

    return {open, pointer, listboxId, optionId, activeDescendant, floatingStyles, onKey, close};
}
