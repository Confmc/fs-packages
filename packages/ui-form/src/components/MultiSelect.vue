<template>
    <div ref="root" v-bind="rootAttrs($attrs)" class="ui-multiselect">
        <div
            class="ui-control ui-multiselect__box"
            :class="{'is-open': open, 'has-value': model.length > 0, 'is-invalid': invalid, 'is-disabled': disabled}"
        >
            <!-- Chips are OUTSIDE the trigger button (a button may not nest a button), inside
                 the flex box that carries the control chrome. Removing must not open the menu:
                 structurally guaranteed — only the trigger button toggles, and a chip click
                 never reaches it. -->
            <span v-for="chip in chips" :key="String(chip.id)" class="ui-multiselect__chip">
                {{ labelOf(chip) }}
                <button
                    type="button"
                    class="ui-multiselect__chip-remove"
                    :disabled="disabled"
                    :aria-label="`${removeLabel} ${labelOf(chip)}`"
                    @click="remove(chip.id)"
                >
                    <svg class="ui-multiselect__chip-x" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2" />
                    </svg>
                </button>
            </span>

            <!-- The trigger flexes over all remaining space, so clicking the empty part of the
                 chip bar is clicking the trigger. Keyboard listens HERE (not on the root, unlike
                 SingleSelect): the chip-remove buttons are focusable children of the
                 root, and Enter on one must remove the chip — never leak into the listbox
                 skeleton and open the menu. -->
            <button
                @click="toggle"
                @keydown="onTriggerKey"
                v-bind="controlAttrs($attrs)"
                :id="id"
                ref="reference"
                type="button"
                class="ui-multiselect__trigger"
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
                <span v-if="!model.length" class="ui-multiselect__placeholder">{{ placeholder }}</span>
                <!-- The trigger's accessible VALUE (WCAG 4.1.2): the chips render OUTSIDE this
                     button (a button may not nest the chip-remove buttons), which would leave a
                     populated closed control announcing nothing. This visually-hidden span gives
                     the trigger the same value-as-content surface SingleSelect's visible label
                     span provides — the option labels themselves, so nothing needs translating. -->
                <span v-else class="ui-multiselect__sr-value">{{ selectedSummary }}</span>
                <svg class="ui-multiselect__chevron" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" />
                </svg>
            </button>
        </div>

        <!-- WR-0521: the empty state must be ANNOUNCED, not just painted — a persistent,
             visually-hidden live region (mounted for the component's whole lifetime, so
             the emptyText lands as a content CHANGE, the reliable live-region path). One
             treatment, for every select in the family. -->
        <span class="ui-live-region" role="status" aria-live="polite">{{
            open && optionLabels.length === 0 ? emptyText : ''
        }}</span>

        <!-- KD-1136. The anchor is promoted to the TOP LAYER in place (Popover API) — it is
             never moved in the DOM, so no ancestor's overflow can clip it and no stacking
             context can bury it, while scoped `--ui-*` maps still reach it. floating-ui
             positions the ANCHOR, not the <ul>: the size() middleware sizes it to the
             trigger, so the menu's `min-width: 100%` measures the trigger. -->
        <div v-if="open" ref="floating" popover="manual" class="ui-menu-anchor" :style="floatingStyles">
            <OptionList
                variant="ui-multiselect"
                multiselectable
                :rows="rows"
                :keys="optionKeys"
                :pointer="pointer"
                :listbox-id="listboxId"
                :option-id="optionId"
                :is-selected="isSelected"
                :is-muted="isMuted"
                :options-label="optionsLabel"
                :empty-text="emptyText"
                @hover="pointer = $event"
                @commit="commit"
            >
                <!-- Re-scope OptionList's index into the typed per-option payload; the fallback
                     (the plain labelOf text) keeps slotless consumers byte-identical. -->
                <template #option="{index}">
                    <slot
                        name="option"
                        :option="sorted[index]"
                        :index="index"
                        :selected="isSelected(index)"
                        :active="pointer === index"
                    >
                        {{ optionLabels[index] }}
                    </slot>
                </template>
            </OptionList>
        </div>
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import type {Placement} from '@floating-ui/vue';

import {computed, useTemplateRef} from 'vue';

import type {GroupRow} from '../internal/group-rows';
import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';
import {controlAttrs, rootAttrs} from '../internal/split-attrs';
import OptionList from './OptionList.vue';

// `class`/`style` → root, every other attr → the combobox element (see split-attrs).
defineOptions({inheritAttrs: false});

const {
    options,
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
    removeLabel = 'Remove',
    mutedOptions,
    placement,
} = defineProps<{
    options: T[];
    /** property name or getter for an option's display string. */
    optionLabel: LabelKey<T>;
    /** stable id — required so the trigger can pair with a label/error. */
    id: string;
    placeholder?: string;
    disabled?: boolean;
    /** sort the rendered options by display string — off by default, so the caller's order is kept. */
    alphabeticalSort?: boolean;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    invalid?: boolean;
    describedby?: string;
    emptyText?: string;
    /** accessible name for the listbox popup (`aria-label`). */
    optionsLabel?: string;
    /**
     * verb prefixed to a chip's remove-button accessible name (`"${removeLabel} ${option text}"`) —
     * a prop, not a literal, so a consumer can localise it; the default is English.
     */
    removeLabel?: string;
    /** ids rendered visually muted (`.is-muted`) — still committable, still in the keyboard path. */
    mutedOptions?: T['id'][];
    /** where the list opens against the box (default `'bottom-start'`; it still flips when there is no room). Read once. */
    placement?: Placement;
}>();

defineSlots<{
    /**
     * Per-option content (swatches, icons, rich labels). Highlight/selection chrome stays
     * on the option row, outside the slot. Fallback: the plain display string.
     */
    option?: (props: {option: T; index: number; selected: boolean; active: boolean}) => unknown;
}>();

/**
 * The committed membership: an array of option ids. Its order is the consumer's: an add appends and a
 * remove drops in place, so nothing the control shows depends on it.
 */
const model = defineModel<T['id'][]>({required: true});

/** Resolve an option's display string from the `optionLabel` prop (property name or getter). */
const labelOf = (option: T): string =>
    typeof optionLabel === 'function'
        ? optionLabel(option)
        : String((option as Record<PropertyKey, unknown>)[optionLabel as PropertyKey]);

const sorted = computed(() =>
    alphabeticalSort ? [...options].sort((a, b) => labelOf(a).localeCompare(labelOf(b))) : options,
);

// The chip bar renders the committed options in display order, whatever order the model arrived
// in, so a pick never moves the chips already there. An id whose option has not arrived yet (the
// async-options edit-form window) has no label to show — it stays in the model but renders no
// chip until its option loads.
const chips = computed(() => sorted.value.filter((option) => model.value.includes(option.id)));

/** The committed labels, in display order — the closed trigger's screen-reader value. */
const selectedSummary = computed(() => chips.value.map(labelOf).join(', '));

// The index-based view OptionList renders — parallel arrays derived from `sorted`, which
// stays the single list every index (pointer, commit, aria) is keyed against.
const optionLabels = computed(() => sorted.value.map(labelOf));
const optionKeys = computed(() => sorted.value.map((option) => String(option.id)));
// A flat control renders one headerless run — an all-option row sequence OptionList lays out
// flat (no group wrappers), the same component a grouped select feeds a header/option mix.
const rows = computed<GroupRow[]>(() => sorted.value.map((_, index) => ({type: 'option', index})));
/** `aria-selected` marks committed MEMBERSHIP — the pointer is conveyed by aria-activedescendant. */
const isSelected = (index: number): boolean => model.value.includes(sorted.value[index].id);
/** `.is-muted` marks visual de-emphasis only — a muted option stays committable. */
const isMuted = (index: number): boolean => mutedOptions !== undefined && mutedOptions.includes(sorted.value[index].id);

const root = useTemplateRef<HTMLElement>('root');
const reference = useTemplateRef<HTMLElement>('reference');
// The `.ui-menu-anchor` (null while closed) — floating-ui's floating element, promoted to the
// top layer in place, so it stays inside `root` and click-outside needs no check of its own.
// The <ul> inside it is positioned by nothing.
const floating = useTemplateRef<HTMLElement>('floating');

/** Toggle an id's membership — add when absent, drop when present. Always emits a fresh array. */
const toggleValue = (value: T['id']): void => {
    model.value = model.value.includes(value)
        ? model.value.filter((member) => member !== value)
        : [...model.value, value];
};

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through this
// one guard. Toggle-in-place: a commit flips membership and the menu STAYS OPEN — the
// composable's never-close-on-commit contract exists for exactly this consumer. Read through
// a local rather than indexing blind: the clamp watcher normally keeps `pointer` in range,
// but a keypress landing between an `options` change and the watcher flush would otherwise
// index off the end.
const commit = (index: number): boolean => {
    const highlighted = sorted.value[index];
    if (!highlighted) return false;
    toggleValue(highlighted.id);
    return true;
};

const {open, pointer, listboxId, optionId, activeDescendant, floatingStyles, onKey, close, toggle} = useListbox({
    root,
    reference,
    floating,
    id: () => id,
    disabled: () => disabled,
    listLength: () => sorted.value.length,
    // A closed MultiSelect opens on Enter, ArrowDown, or Space — the SingleSelect skeleton.
    openKeys: (key) => ['Enter', 'ArrowDown', ' '].includes(key),
    onCommit: commit,
    onDismiss: () => close(),
    onOutside: () => close(),
    typeaheadLabels: () => optionLabels.value,
    floatingOptions: {placement},
});

/** Per-chip remove — drops one committed id; never touches `open`. */
const remove = (value: T['id']): void => {
    model.value = model.value.filter((member) => member !== value);
};
/**
 * Backspace on the focused trigger removes the LAST CHIP — the last one shown, never the model's tail,
 * which can be an id with no chip yet. No-op when no chip shows.
 */
const removeLastChip = (): void => {
    const last = chips.value.at(-1);
    if (last) remove(last.id);
};
// Backspace is the multiselect analogue of clearing a text input; everything else follows
// the shared listbox keyboard skeleton. The disabled guard mirrors the composable's own —
// the native :disabled blocks focus in a real browser, but the guard keeps synthetic
// dispatch honest too.
const onTriggerKey = (event: KeyboardEvent): void => {
    if (disabled) return;
    if (event.key === 'Backspace') {
        removeLastChip();
        return;
    }
    onKey(event);
};
</script>
