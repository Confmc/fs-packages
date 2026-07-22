<template>
    <div ref="root" class="ui-select" @keydown="onKey">
        <button
            :id="id"
            ref="reference"
            type="button"
            class="ui-control ui-select__trigger"
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
            @click="toggle"
        >
            <span v-if="selected === undefined" class="ui-select__placeholder">{{ placeholder }}</span>
            <span v-else class="ui-select__value">{{ labelOf(selected) }}</span>
            <svg class="ui-select__chevron" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
        </button>

        <OptionList
            v-if="open"
            ref="menu"
            variant="ui-select"
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
import {computed, useTemplateRef} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';
import {componentEl} from '../internal/reactivity';
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
    /** stable id — required so the trigger can pair with a label/error. */
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
const sorted = computed(() =>
    alphabeticalSort ? [...options].sort((a, b) => labelOf(a).localeCompare(labelOf(b))) : options,
);

// The index-based view OptionList renders — parallel arrays derived from `sorted`, which
// stays the single list every index (pointer, commit, aria) is keyed against.
const optionLabels = computed(() => sorted.value.map(labelOf));
const optionKeys = computed(() => sorted.value.map((option) => String(option.id)));
/** `aria-selected` marks the COMMITTED value — OptionList only asks about rendered indices. */
const isSelected = (index: number): boolean => sorted.value[index].id === model.value;

const root = useTemplateRef<HTMLElement>('root');
const reference = useTemplateRef<HTMLElement>('reference');
// OptionList's root <ul>, derived from the instance's `$el` (null while closed) — the family
// keeps `defineExpose` off internal plumbing, see `componentEl`.
const menu = useTemplateRef<InstanceType<typeof OptionList>>('menu');
const floating = componentEl(menu);

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through this
// one guard. Read through a local rather than indexing blind: the clamp watcher normally keeps
// `pointer` in range, but a keypress landing between an `options` change and the watcher flush
// would otherwise index off the end.
const commit = (index: number): boolean => {
    const highlighted = sorted.value[index];
    if (!highlighted) return false;
    choose(highlighted);
    return true;
};

const {open, pointer, listboxId, optionId, activeDescendant, floatingStyles, onKey, close} = useListbox({
    root,
    reference,
    floating,
    id: () => id,
    disabled: () => disabled,
    listLength: () => sorted.value.length,
    // A closed SingleSelect opens on Enter, ArrowDown, or Space.
    openKeys: (key) => ['Enter', 'ArrowDown', ' '].includes(key),
    onCommit: commit,
    onDismiss: () => close(),
    onOutside: () => close(),
});

const toggle = () => {
    open.value = !open.value;
};
const choose = (option: T): void => {
    model.value = option.id;
    close();
};
</script>
