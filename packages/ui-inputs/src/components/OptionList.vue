<template>
    <ul :id="listboxId" :class="`${variant}__menu`" role="listbox" :aria-label="optionsLabel" :style="floatingStyles">
        <li v-if="!labels.length" :class="`${variant}__empty`">{{ emptyText }}</li>
        <li
            v-for="(optionLabel, index) in labels"
            :id="optionId(index)"
            :key="keys[index]"
            :class="[`${variant}__option`, {'is-active': pointer === index}]"
            role="option"
            :aria-selected="isSelected(index)"
            @mouseover="emit('hover', index)"
            @click="emit('commit', index)"
        >
            {{ optionLabel }}
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
 * commit disposition.
 *
 * The single `<ul>` root is LOAD-BEARING: parents reach the floating element through the
 * instance's `$el` (via `componentEl` in `internal/reactivity`) — no `defineExpose`, which the
 * family reserves for public imperative handles, never internal plumbing. A second root node
 * (or a root comment outside the `<ul>`) would break `$el` resolution for every consumer.
 */
const {labels, keys, pointer, listboxId, optionId, isSelected, floatingStyles, variant, optionsLabel, emptyText} =
    defineProps<{
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
        /** floating-ui positioning styles for the popup. */
        floatingStyles: CSSProperties;
        /** class prefix of the owning control — the only visual divergence across the family. */
        variant: 'ui-select' | 'ui-combobox';
        /** accessible name for the listbox popup (`aria-label`). */
        optionsLabel: string;
        /** shown when `labels` is empty. */
        emptyText: string;
    }>();

const emit = defineEmits<{hover: [index: number]; commit: [index: number]}>();
</script>
