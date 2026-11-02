<template>
    <div ref="root" v-bind="rootAttrs($attrs)" class="ui-groupcombobox">
        <input
            v-model="query"
            @input="onInput"
            @keydown="onInputKey"
            @click="onClick"
            v-bind="controlAttrs($attrs)"
            :id="id"
            ref="input"
            type="text"
            class="ui-control ui-groupcombobox__input"
            :class="{'is-open': open, 'is-invalid': invalid}"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            :aria-expanded="open"
            :aria-required="required || undefined"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedby"
            :aria-controls="open ? listboxId : undefined"
            :aria-activedescendant="activeDescendant"
            :placeholder="placeholder"
            :disabled="disabled"
        />

        <!-- WR-0521: the empty state must be ANNOUNCED, not just painted — a persistent,
             visually-hidden live region (mounted for the component's whole lifetime, so
             the emptyText lands as a content CHANGE, the reliable live-region path).
             Matters most here, where typing can drain the filtered list. -->
        <span class="ui-live-region" role="status" aria-live="polite">{{
            open && filteredOptions.length === 0 ? emptyText : ''
        }}</span>

        <!-- KD-1136. The anchor is promoted to the TOP LAYER in place (Popover API) — it is
             never moved in the DOM, so no ancestor's overflow can clip it and no stacking
             context can bury it, while scoped `--ui-*` maps still reach it. floating-ui
             positions the ANCHOR, not the <ul>: the size() middleware sizes it to the
             trigger, so the menu's `min-width: 100%` measures the trigger. -->
        <div v-if="open" ref="floating" popover="manual" class="ui-menu-anchor" :style="floatingStyles">
            <OptionList
                variant="ui-groupcombobox"
                :rows="filteredRows"
                :keys="optionKeys"
                :pointer="pointer"
                :listbox-id="listboxId"
                :option-id="optionId"
                :is-selected="isSelected"
                :is-muted="isMuted"
                :options-label="optionsLabel"
                :empty-text="emptyText"
                :clear-label="clearLabel"
                :clear-id="clearId"
                :clear-active="clearHighlighted"
                :clear-selected="model === null"
                @hover="pointer = $event"
                @commit="commit"
                @clear-hover="highlightClear"
                @clear-commit="commitClear"
            >
                <!-- Re-scope OptionList's index into the typed per-option payload; the fallback
                     (the plain labelOf text) keeps slotless consumers byte-identical. -->
                <template #option="{index}">
                    <slot
                        name="option"
                        :option="filteredOptions[index]"
                        :index="index"
                        :selected="isSelected(index)"
                        :active="pointer === index"
                    >
                        {{ labelOf(filteredOptions[index]) }}
                    </slot>
                </template>
            </OptionList>
        </div>
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import type {Placement} from '@floating-ui/vue';

import {computed, ref, useTemplateRef, watch} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';
import {buildGroupRows} from '../internal/group-rows';
import {ensureRefValueExists} from '../internal/reactivity';
import {controlAttrs, rootAttrs} from '../internal/split-attrs';
import OptionList from './OptionList.vue';

// `class`/`style` → root, every other attr → the combobox element (see split-attrs).
defineOptions({inheritAttrs: false});

const {
    groups,
    optionLabel,
    id,
    placeholder = 'Select…',
    disabled = false,
    alphabeticalSort = false,
    required = false,
    invalid = false,
    describedby,
    emptyText = 'No options',
    optionsLabel = 'Options',
    mutedOptions,
    clearLabel,
    emptyDisplayValue,
    placement,
} = defineProps<{
    /** caller-ordered groups, each with options and a display header. */
    groups: {options: T[]; text: string; header?: boolean}[];
    /** property name or getter for an option's display string. */
    optionLabel: LabelKey<T>;
    /** stable id — required so the input can pair with a label/error. */
    id: string;
    placeholder?: string;
    disabled?: boolean;
    /**
     * sort each group's options by display string — off by default, so the caller's order is kept.
     * The groups always keep the caller's order.
     */
    alphabeticalSort?: boolean;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    invalid?: boolean;
    describedby?: string;
    emptyText?: string;
    /** accessible name for the listbox popup (`aria-label`). */
    optionsLabel?: string;
    /** ids rendered visually muted (`.is-muted`) — still committable, still in the keyboard path. */
    mutedOptions?: T['id'][];
    /**
     * display string of a committing CLEAR ENTRY rendered above the (filtered) options —
     * commits `null` and closes. Lives outside the option index space and outside the filter.
     */
    clearLabel?: string;
    /** what the input renders when the model is null — a NAMED empty state instead of `''`. */
    emptyDisplayValue?: string;
    /**
     * where the list opens against the input (default `'bottom-start'`). With no room it flips to the
     * opposite side at the same alignment (`bottom-start` → `top-start`), never to the other
     * alignment. Read once.
     */
    placement?: Placement;
}>();

defineSlots<{
    /**
     * Per-option content (swatches, icons, rich labels). Highlight/selection chrome stays
     * on the option row, outside the slot. Fallback: the plain display string.
     */
    option?: (props: {option: T; index: number; selected: boolean; active: boolean}) => unknown;
}>();

const model = defineModel<T['id'] | null>({required: true});

/** Resolve an option's display string from the `optionLabel` prop (property name or getter). */
const labelOf = (option: T): string =>
    typeof optionLabel === 'function'
        ? optionLabel(option)
        : String((option as Record<PropertyKey, unknown>)[optionLabel as PropertyKey]);

// All options across all groups in declaration order — the base flat list.
const allOptions = computed(() => groups.flatMap((g) => g.options));
const selected = computed(() => allOptions.value.find((option) => option.id === model.value));
// The committed-null rendering: `emptyDisplayValue` names the empty state ("No sprint
// (backlog)") as a value; without it the input reverts to blank as before.
const selectedLabel = computed(() => (selected.value ? labelOf(selected.value) : (emptyDisplayValue ?? '')));

// The input's text is LOCAL state so the user can filter freely — it is not a mirror of the
// committed label. It starts on the committed label, follows the user's typing while open, and
// is snapped back to the committed label on commit / dismiss so a half-typed non-match never
// lingers.
const query = ref(selectedLabel.value);

// The groups as shown: caller-ordered, each group's options filtered by the trimmed, case-folded
// query (empty query ⇒ all), then sorted by display string when `alphabeticalSort` is set. A group
// the filter empties is dropped. The sort runs on a copy, never mutating the caller's array.
//
// WR-0576 (browse-to-change): a query EQUAL to the committed rendering does NOT filter. The
// query rests on that rendering, so without this rule opening a FILLED combobox narrowed the
// list to the already-chosen option and forced a manual clear to browse elsewhere.
const filteredData = computed(() => {
    const engaged = query.value !== selectedLabel.value;
    const needle = engaged ? query.value.trim().toLowerCase() : '';
    return groups
        .map((group) => {
            const matched = needle
                ? group.options.filter((option) => labelOf(option).toLowerCase().includes(needle))
                : group.options;
            return {
                ...group,
                options: alphabeticalSort ? [...matched].sort((a, b) => labelOf(a).localeCompare(labelOf(b))) : matched,
            };
        })
        .filter((group) => group.options.length > 0);
});

// The flat list every index (pointer, commit, isSelected) is keyed against — derived from
// filteredData so indices align with filteredRows.
const filteredOptions = computed(() => filteredData.value.flatMap((g) => g.options));
// Stable `v-for` keys for OptionList, indexed by the flat (filtered) option index `rows` navigates.
const optionKeys = computed(() => filteredOptions.value.map((option) => String(option.id)));

// The mixed header/boundary/option row sequence over the filtered groups — same single-site
// `buildGroupRows` encoding GroupSelect uses.
const filteredRows = computed(() => buildGroupRows(filteredData.value));

/** `aria-selected` marks the COMMITTED value — OptionList only asks about rendered indices. */
const isSelected = (index: number): boolean => filteredOptions.value[index].id === model.value;
/** `.is-muted` marks visual de-emphasis only — a muted option stays committable. */
const isMuted = (index: number): boolean =>
    mutedOptions !== undefined && mutedOptions.includes(filteredOptions.value[index].id);

const root = useTemplateRef<HTMLElement>('root');
// The input is both the floating-ui reference and the target of the imperative focus handle.
const input = useTemplateRef<HTMLInputElement>('input');
// The `.ui-menu-anchor` (null while closed) — floating-ui's floating element, promoted to the
// top layer in place, so it stays inside `root` and click-outside needs no check of its own.
// The <ul> inside it is positioned by nothing.
const floating = useTemplateRef<HTMLElement>('floating');

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through
// this one guard. Read through a local rather than indexing blind: Enter on an open list with
// nothing highlighted hands it `commit(-1)`, and a keypress landing between a filter change
// and the clamp watcher's flush would otherwise index off the end.
const commit = (index: number): boolean => {
    const highlighted = filteredOptions.value[index];
    if (!highlighted) return false;
    model.value = highlighted.id;
    query.value = labelOf(highlighted);
    close();
    return true;
};

// The clear entry commits null — the input snaps to the committed-null rendering
// (`emptyDisplayValue`, or blank) through the same `selectedLabel` read every other close path
// uses. Always a real commit, so always `true`.
const commitClear = (): boolean => {
    model.value = null;
    query.value = selectedLabel.value;
    close();
    return true;
};

const {
    open,
    pointer,
    listboxId,
    optionId,
    activeDescendant,
    floatingStyles,
    onKey,
    openList,
    close,
    clearHighlighted,
    clearId,
    highlightClear,
    resetHighlight,
} = useListbox({
    root,
    reference: input,
    floating,
    id: () => id,
    disabled: () => disabled,
    listLength: () => filteredOptions.value.length,
    // Only ArrowDown opens a closed list — a printable key must fall through to the input so
    // it can filter, so it is deliberately not an open key (never preventDefault-ed here).
    openKeys: (key) => key === 'ArrowDown',
    onCommit: commit,
    onDismiss: () => dismiss(),
    onOutside: () => dismiss(),
    clearEntry: () => clearLabel !== undefined,
    onClearCommit: commitClear,
    floatingOptions: {placement},
});

// The input text is local, but it must still track the committed label when it changes from
// OUTSIDE while the control is idle. Watch `selectedLabel` (not `model`): the label depends
// on BOTH the model AND `groups`, so this also re-syncs when a pre-set model's option arrives
// asynchronously (the edit-form pattern). While the menu is open the user is actively typing,
// so an external change must not yank the text out from under them.
watch(selectedLabel, (lbl) => {
    if (!open.value) query.value = lbl;
});

// WR-0576 (select-all-on-open): when the popup opens with the committed rendering in the
// input, select the text so the first keystroke REPLACES it and starts a fresh filter.
// Guarded on equality, NOT on mere non-emptiness: when TYPING is what opened the popup
// (`onInput`), the query has already diverged and selecting would eat the user's edit.
watch(open, (isOpen) => {
    if (isOpen && query.value !== '' && query.value === selectedLabel.value) {
        ensureRefValueExists(input).select();
    }
});

// Snap the input back to the committed label so a half-typed non-match never survives a
// close-without-commit (Escape, Tab, or a click outside the control).
const dismiss = (): void => {
    query.value = selectedLabel.value;
    close();
};

// Typing filters and opens. `v-model` writes `query` (its listener runs before this one), and
// skips the `input` events an IME sends while composing, writing the committed text on
// `compositionend`, so a candidate never filters the list. Every keystroke resets the highlight
// (nothing is pre-selected — Enter with no highlight is a no-op), a composing one too, so the
// Enter that confirms a candidate commits no option. `resetHighlight` (not a bare pointer write)
// so a hovered clear entry drops too. Opening waits for the committed text: a composition started
// on a closed list would otherwise open it on the unchanged query, and select-all-on-open (above)
// would select the text the IME is composing. A blur commits a composition too, with the plain
// `input` v-model sends on `compositionend` — after focus has left, so the list stays shut then.
// The input's own root answers for focus, so a control inside a shadow root reads it there.
const onInput = (event: Event) => {
    resetHighlight();
    const field = event.target as HTMLInputElement;
    const focused = (field.getRootNode() as Document | ShadowRoot).activeElement === field;
    if (focused && !(event as InputEvent).isComposing) openList();
};
// A key pressed during a composition belongs to the input method: it moves through its candidates
// with the arrow keys and confirms one with Enter, so the list must not move or commit on them.
// The keys inside a composition carry `isComposing`. The keydown that starts one fires before
// `compositionstart`, so it carries `isComposing: false` and only keyCode 229 marks it.
const onInputKey = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    onKey(event);
};
// Clicking the (enabled) input opens the list. A disabled input never dispatches click.
const onClick = openList;

// The one sanctioned defineExpose: a PUBLIC imperative handle (isms WR-0448 focus trap).
defineExpose({focus: () => ensureRefValueExists(input).focus()});
</script>
