<template>
    <div ref="root" v-bind="rootAttrs($attrs)" class="ui-groupselect">
        <button
            @click="toggle"
            @keydown="onKey"
            v-bind="controlAttrs($attrs)"
            :id="id"
            ref="reference"
            type="button"
            class="ui-control ui-groupselect__trigger"
            :class="{'is-open': open, 'has-value': selected !== undefined, 'is-invalid': invalid}"
            :disabled="disabled"
            role="combobox"
            aria-haspopup="listbox"
            :aria-expanded="open"
            :aria-required="required || undefined"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedby"
            :aria-controls="open ? listboxId : undefined"
            :aria-activedescendant="activeDescendant"
        >
            <span
                v-if="selected === undefined && emptyDisplayValue === undefined"
                class="ui-groupselect__placeholder"
                >{{ placeholder }}</span
            >
            <!-- A NAMED empty state ("No sprint (backlog)"): renders as a value, not as muted
                 placeholder text — but `has-value` stays keyed on an actual selection, because
                 the model IS null. -->
            <span v-else-if="selected === undefined" class="ui-groupselect__value">{{ emptyDisplayValue }}</span>
            <span v-else class="ui-groupselect__value">{{ labelOf(selected) }}</span>
            <svg class="ui-groupselect__chevron" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
        </button>

        <!-- WR-0521: the empty state must be ANNOUNCED, not just painted — a persistent,
             visually-hidden live region (mounted for the component's whole lifetime, so
             the emptyText lands as a content CHANGE, the reliable live-region path). One
             treatment, for every select in the family. -->
        <span class="ui-live-region" role="status" aria-live="polite">{{
            open && flatOptions.length === 0 ? emptyText : ''
        }}</span>

        <!-- KD-1136. The anchor is promoted to the TOP LAYER in place (Popover API) — it is
             never moved in the DOM, so no ancestor's overflow can clip it and no stacking
             context can bury it, while scoped `--ui-*` maps still reach it. floating-ui
             positions the ANCHOR, not the <ul>: the size() middleware sizes it to the
             trigger, so the menu's `min-width: 100%` measures the trigger. -->
        <div v-if="open" ref="floating" popover="manual" class="ui-menu-anchor" :style="floatingStyles">
            <OptionList
                variant="ui-groupselect"
                :rows="rows"
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
                        :option="flatOptions[index]"
                        :index="index"
                        :selected="isSelected(index)"
                        :active="pointer === index"
                    >
                        {{ labelOf(flatOptions[index]) }}
                    </slot>
                </template>
            </OptionList>
        </div>
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import type {Placement} from '@floating-ui/vue';

import {computed, useTemplateRef} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';
import {buildGroupRows} from '../internal/group-rows';
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
    /** stable id — required so the trigger can pair with a label/error. */
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
     * display string of a committing CLEAR ENTRY rendered above the options — commits
     * `null` and closes. Lives outside the option index space.
     */
    clearLabel?: string;
    /** what the trigger renders when the model is null — as a VALUE, not muted placeholder text. */
    emptyDisplayValue?: string;
    /**
     * where the list opens against the trigger (default `'bottom-start'`). With no room it flips to
     * the opposite side at the same alignment (`bottom-start` → `top-start`), never to the other
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

// The groups as shown: caller-ordered, each group's options sorted by display string when
// `alphabeticalSort` is set. `slice()` copies a group's options with its holes still holes, so
// the hole-skipping `flatMap` and `buildGroupRows` keep agreeing; a spread would fill them.
const shownGroups = computed(() =>
    alphabeticalSort
        ? groups.map((group) => ({
              ...group,
              options: group.options.slice().sort((a, b) => labelOf(a).localeCompare(labelOf(b))),
          }))
        : groups,
);
// All options across all groups in the order shown — the flat index space useListbox and
// commit/isSelected/isMuted operate on.
const flatOptions = computed(() => shownGroups.value.flatMap((g) => g.options));
const selected = computed(() => flatOptions.value.find((option) => option.id === model.value));
// Stable `v-for` keys for OptionList, indexed by the flat option index `rows` navigates.
const optionKeys = computed(() => flatOptions.value.map((option) => String(option.id)));

// The mixed header/boundary/option row sequence — the encoding lives once in `buildGroupRows`,
// so the boundary/empty-group rules stay a single-site invariant.
const rows = computed(() => buildGroupRows(shownGroups.value));

/** `aria-selected` marks the COMMITTED value — OptionList only asks about rendered indices. */
const isSelected = (index: number): boolean => flatOptions.value[index].id === model.value;
/** `.is-muted` marks visual de-emphasis only — a muted option stays committable. */
const isMuted = (index: number): boolean =>
    mutedOptions !== undefined && mutedOptions.includes(flatOptions.value[index].id);

const root = useTemplateRef<HTMLElement>('root');
const reference = useTemplateRef<HTMLElement>('reference');
// The `.ui-menu-anchor` (null while closed) — floating-ui's floating element, promoted to the
// top layer in place, so it stays inside `root` and click-outside needs no check of its own.
// The <ul> inside it is positioned by nothing.
const floating = useTemplateRef<HTMLElement>('floating');

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through
// this one guard. Read through a local rather than indexing blind: the clamp watcher normally
// keeps `pointer` in range, but a keypress landing between a `groups` change and the watcher
// flush would otherwise index off the end.
const commit = (index: number): boolean => {
    const highlighted = flatOptions.value[index];
    if (!highlighted) return false;
    model.value = highlighted.id;
    close();
    return true;
};

// The clear entry commits the family's other legal value — null — and closes, exactly like
// choosing an option. Always a real commit (null is always committable), so always `true`.
const commitClear = (): boolean => {
    model.value = null;
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
    close,
    toggle,
    clearHighlighted,
    clearId,
    highlightClear,
} = useListbox({
    root,
    reference,
    floating,
    id: () => id,
    disabled: () => disabled,
    listLength: () => flatOptions.value.length,
    // A closed GroupSelect opens on Enter, ArrowDown, or Space.
    openKeys: (key) => ['Enter', 'ArrowDown', ' '].includes(key),
    onCommit: commit,
    onDismiss: () => close(),
    onOutside: () => close(),
    typeaheadLabels: () => flatOptions.value.map(labelOf),
    committedIndex: () => flatOptions.value.findIndex((option) => option.id === model.value),
    clearEntry: () => clearLabel !== undefined,
    onClearCommit: commitClear,
    floatingOptions: {placement},
});
</script>
