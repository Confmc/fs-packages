<template>
    <li
        :id="optionId(index)"
        class="ui-select__option"
        :class="{'is-active': active, 'is-muted': muted}"
        role="option"
        :aria-selected="selected"
        @mouseover="emit('hover', index)"
        @mousedown.prevent
        @click="emit('commit', index)"
    >
        <slot />
    </li>
</template>

<script setup lang="ts">
/**
 * ONE selectable listbox option `<li>` — INTERNAL, not barrel-exported. This is the single
 * source of the option-row markup `OptionList` renders: the `role="option"` / position-keyed
 * `id` / committed-value `aria-selected` / `is-active`+`is-muted` chrome / `hover`+`commit`
 * wiring all live HERE.
 *
 * Index-based like `useListbox` and its listbox parents: the option type `T` never crosses
 * this boundary. The owner passes the index plus the same index-keyed lookups it feeds the
 * listbox (`optionId`, and the resolved `active`/`muted`/`selected` flags) and gets `hover`
 * (pointer move) / `commit` (activation) back by index — it stays the sole owner of `pointer`
 * and the commit disposition. Per-option content flows through the default slot; the parent
 * keeps the highlight/selection chrome on this `<li>`, outside the slot, so custom content
 * never re-creates it.
 *
 * `mousedown.prevent` keeps DOM focus on the trigger through a pointer pick. The row is not
 * focusable, so a mousedown on it would otherwise move focus to the body, and the user would
 * be left on nothing after the commit (APG select-only combobox: focus stays on the combobox).
 * Only the row's own default is cancelled: a mousedown on the listbox's scrollbar lands on the
 * `<ul>`, never here, so dragging it still scrolls.
 */
const {index, optionId, active, muted, selected} = defineProps<{
    /** the option's position in the listbox index space — its identity for id/hover/commit. */
    index: number;
    /** position-keyed option-id scheme from `useListbox` (`${id}-opt-${index}`). */
    optionId: (index: number) => string;
    /** whether this option holds the highlight (`.is-active`) — the pointer, owned by the parent. */
    active: boolean;
    /** whether this option is visually MUTED (`.is-muted`) — still committable. */
    muted: boolean;
    /** whether this option is the COMMITTED value (`aria-selected`), never the pointer. */
    selected: boolean;
}>();

const emit = defineEmits<{hover: [index: number]; commit: [index: number]}>();
</script>
