<template>
    <div ref="root" class="ui-combobox" @keydown="onKey">
        <input
            :id="id"
            ref="input"
            type="text"
            class="ui-control ui-combobox__input"
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
            :value="query"
            @input="onInput"
            @click="onClick"
        />

        <OptionList
            v-if="open"
            ref="menu"
            variant="ui-combobox"
            :labels="optionLabels"
            :keys="optionKeys"
            :pointer="pointer"
            :listbox-id="listboxId"
            :option-id="optionId"
            :is-selected="isSelected"
            :floating-styles="floatingStyles"
            :options-label="optionsLabel"
            :empty-text="emptyText"
            @hover="pointer = $event"
            @commit="commit"
        />
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import {computed, ref, useTemplateRef, watch} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';
import {componentEl, ensureRefValueExists} from '../internal/reactivity';
import OptionList from './OptionList.vue';

const {
    options,
    label,
    id,
    placeholder = 'Select…',
    disabled = false,
    alphabeticalSort = true,
    required = false,
    invalid = false,
    describedby,
    emptyText = 'No options',
    optionsLabel = 'Options',
} = defineProps<{
    options: T[];
    /** property name or getter for an option's display string. */
    label: LabelKey<T>;
    /** stable id — required so the input can pair with a label/error. */
    id: string;
    placeholder?: string;
    disabled?: boolean;
    alphabeticalSort?: boolean;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    invalid?: boolean;
    describedby?: string;
    emptyText?: string;
    /** accessible name for the listbox popup (`aria-label`). */
    optionsLabel?: string;
}>();

const model = defineModel<T['id'] | null>({required: true});

/** Resolve an option's display string from the `label` prop (property name or getter). */
const labelOf = (option: T): string =>
    typeof label === 'function'
        ? label(option)
        : String((option as Record<PropertyKey, unknown>)[label as PropertyKey]);

const selected = computed(() => options.find((option) => option.id === model.value));
const selectedLabel = computed(() => (selected.value ? labelOf(selected.value) : ''));

// The input's text is LOCAL state so the user can filter freely — it is not a mirror
// of the committed label the way SingleSelect's trigger text is. It starts on the
// committed label, follows the user's typing while open, and is snapped back to the
// committed label on commit / dismiss so a half-typed non-match never lingers.
const query = ref(selectedLabel.value);

// The visible list = filter by the trimmed, case-folded query (empty query ⇒ all),
// then the same optional alphabetical pass SingleSelect applies. Both aria-activedescendant
// and Enter index into THIS filtered list, not the raw `options`.
const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase();
    const matched = needle ? options.filter((option) => labelOf(option).toLowerCase().includes(needle)) : options;
    return alphabeticalSort ? [...matched].sort((a, b) => labelOf(a).localeCompare(labelOf(b))) : matched;
});

// The index-based view OptionList renders — parallel arrays derived from `filtered`, which
// stays the single list every index (pointer, commit, aria) is keyed against.
const optionLabels = computed(() => filtered.value.map(labelOf));
const optionKeys = computed(() => filtered.value.map((option) => String(option.id)));
/** `aria-selected` marks the COMMITTED value — OptionList only asks about rendered indices. */
const isSelected = (index: number): boolean => filtered.value[index].id === model.value;

const root = useTemplateRef<HTMLElement>('root');
// The input is both the floating-ui reference and the target of the imperative focus
// handle isms's command-palette focus trap (WR-0448) consumes.
const input = useTemplateRef<HTMLInputElement>('input');
// OptionList's root <ul>, derived from the instance's `$el` (null while closed) — the family
// keeps `defineExpose` off internal plumbing, see `componentEl`.
const menu = useTemplateRef<InstanceType<typeof OptionList>>('menu');
const floating = componentEl(menu);

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through this
// one guard. Read through a local rather than indexing blind: the clamp watcher normally keeps
// `pointer` in range, but a keypress landing between a filter change and the watcher flush
// would otherwise index off the end.
const commit = (index: number): boolean => {
    const highlighted = filtered.value[index];
    if (!highlighted) return false;
    choose(highlighted);
    return true;
};

const {open, pointer, listboxId, optionId, activeDescendant, floatingStyles, onKey, close} = useListbox({
    root,
    reference: input,
    floating,
    id: () => id,
    disabled: () => disabled,
    listLength: () => filtered.value.length,
    // Only ArrowDown opens a closed list — a printable key must fall through to the input so
    // it can filter, so it is deliberately not an open key (never preventDefault-ed here).
    openKeys: (key) => key === 'ArrowDown',
    onCommit: commit,
    onDismiss: () => dismiss(),
    onOutside: () => dismiss(),
});

// The input text is local, but it must still track the committed label when it changes
// from OUTSIDE while the control is idle. Watch `selectedLabel` (not `model`): the label
// depends on BOTH the model AND `options`, so this also re-syncs when a pre-set model's
// option arrives asynchronously (the edit-form pattern — model set before an async
// options load, where `selected` is briefly undefined and the label would otherwise stay
// blank). While the menu is open the user is actively typing, so an external change must
// not yank the text out from under them.
watch(selectedLabel, (label) => {
    if (!open.value) query.value = label;
});

// Snap the input back to the committed label so a half-typed non-match never survives a
// close-without-commit (Escape, Tab, or a click outside the control).
const dismiss = (): void => {
    query.value = selectedLabel.value;
    close();
};
const choose = (option: T): void => {
    model.value = option.id;
    query.value = labelOf(option);
    close();
};

// Typing filters and opens; the raw value is bound through `query`, and every keystroke
// resets the highlight (nothing is pre-selected — Enter with no highlight is a no-op).
const onInput = (event: Event) => {
    query.value = (event.target as HTMLInputElement).value;
    open.value = true;
    pointer.value = -1;
};
// Clicking the (enabled) input opens the list. A disabled input never dispatches click.
const onClick = () => {
    open.value = true;
};

// The one sanctioned defineExpose: a PUBLIC imperative handle (isms WR-0448 focus trap).
// The input is non-null by lifetime; the loud accessor names the assumption if it ever breaks.
defineExpose({focus: () => ensureRefValueExists(input).focus()});
</script>
