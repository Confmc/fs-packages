<template>
    <ul
        :id="listboxId"
        :class="`${variant}__menu`"
        role="listbox"
        :aria-label="optionsLabel"
        :aria-multiselectable="multiselectable || undefined"
        :style="floatingStyles"
    >
        <!-- The committing clear entry (SingleSelect/Combobox `clearLabel`) renders OUTSIDE
             the index space — its own <li> above the v-for, its own id (`${id}-clear`), its
             own highlight flag — so every option index below keeps mapping 1:1 onto the
             parent's list. It is an option to assistive tech (role="option" inside the
             listbox); aria-selected marks the committed-null state. -->
        <li
            v-if="clearLabel !== undefined"
            :id="clearId"
            :class="[`${variant}__clear`, {'is-active': clearActive}]"
            role="option"
            :aria-selected="clearSelected"
            @mouseover="emit('clearHover')"
            @click="emit('clearCommit')"
        >
            {{ clearLabel }}
        </li>
        <li v-if="!labels.length" :class="`${variant}__empty`">{{ emptyText }}</li>
        <li
            v-for="(optionLabel, index) in labels"
            :id="optionId(index)"
            :key="keys[index]"
            :class="[`${variant}__option`, {'is-active': pointer === index, 'is-muted': isMuted(index)}]"
            role="option"
            :aria-selected="isSelected(index)"
            @mouseover="emit('hover', index)"
            @click="emit('commit', index)"
        >
            <!-- Index-scoped so `T` never crosses this boundary: the parent re-scopes the
                 index into its typed payload ({option, selected, active}) and owns the
                 slotless fallback (the labelOf text) — this component renders whatever
                 comes down. Highlight/selection chrome stays on the <li>, outside the slot,
                 so custom option content never has to re-create it. -->
            <slot name="option" :index="index" />
        </li>
    </ul>
</template>

<script setup lang="ts">
import type {CSSProperties} from 'vue';

/**
 * The listbox popup shared by every ui-inputs select control — INTERNAL, deliberately not
 * exported from the barrel (like `useListbox`, its behavioural twin). Where the composable
 * dedupes behaviour, this component dedupes markup: one `<ul>/<li>` body, parameterised only
 * by the class-prefix `variant`, so the `role="listbox"` / `role="option"` / position-keyed
 * `optionId` / committed-value `aria-selected` semantics stay byte-identical across the family.
 *
 * Entirely index-based, mirroring `useListbox`: the option type `T` never crosses this
 * boundary. The parent hands down parallel `labels`/`keys` arrays derived from ITS list
 * (SingleSelect `sorted`, Combobox `filtered`) plus index-keyed lookups, and receives
 * `hover`/`commit` back by index — the parent stays the sole owner of `pointer` and of the
 * commit disposition. Per-option content flows through the index-scoped `option` slot; the
 * clear entry (`clear*` props) sits above the list, outside the index space.
 *
 * The single `<ul>` root is LOAD-BEARING: parents reach the floating element through the
 * instance's `$el` (via `componentEl` in `internal/reactivity`) — no `defineExpose`, which the
 * family reserves for public imperative handles, never internal plumbing. A second root node
 * (or a root comment outside the `<ul>`) would break `$el` resolution for every consumer.
 */
const {
    labels,
    keys,
    pointer,
    listboxId,
    optionId,
    isSelected,
    isMuted,
    floatingStyles,
    variant,
    optionsLabel,
    emptyText,
    multiselectable = false,
    clearLabel,
    clearId,
    clearActive = false,
    clearSelected = false,
} = defineProps<{
    /** display strings, in render order — parallel to `keys`. */
    labels: string[];
    /** stable `v-for` keys (stringified option ids), parallel to `labels`. */
    keys: string[];
    /** the highlighted index (`-1` for none) — owned by the parent, moved via `hover`. */
    pointer: number;
    /** the listbox `id` the trigger's `aria-controls` points at. */
    listboxId: string;
    /** position-keyed option-id scheme from `useListbox` (`${id}-opt-${index}`). */
    optionId: (index: number) => string;
    /** whether the option at an index is the COMMITTED value (`aria-selected`), never the pointer. */
    isSelected: (index: number) => boolean;
    /** whether the option at an index is visually MUTED (`.is-muted`) — still committable. */
    isMuted: (index: number) => boolean;
    /** floating-ui positioning styles for the popup. */
    floatingStyles: CSSProperties;
    /** class prefix of the owning control — the only visual divergence across the family. */
    variant: 'ui-select' | 'ui-combobox' | 'ui-multiselect' | 'ui-multicombobox';
    /** accessible name for the listbox popup (`aria-label`). */
    optionsLabel: string;
    /** shown when `labels` is empty. */
    emptyText: string;
    /** marks the listbox `aria-multiselectable` (MultiSelect) — absent, not "false", otherwise. */
    multiselectable?: boolean;
    /** display string of the committing clear entry — absent means no entry renders. */
    clearLabel?: string;
    /** the clear entry's activedescendant id (`${id}-clear`, from `useListbox`). */
    clearId?: string;
    /** whether the clear entry holds the highlight (`useListbox.clearHighlighted`). */
    clearActive?: boolean;
    /** whether the clear entry is the COMMITTED state (`aria-selected` — model is null). */
    clearSelected?: boolean;
}>();

const emit = defineEmits<{hover: [index: number]; commit: [index: number]; clearHover: []; clearCommit: []}>();
</script>
