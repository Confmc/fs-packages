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

        <ul
            v-if="open"
            :id="listboxId"
            ref="floating"
            class="ui-select__menu"
            role="listbox"
            :aria-label="optionsLabel"
            :style="floatingStyles"
        >
            <li v-if="!options.length" class="ui-select__empty">{{ emptyText }}</li>
            <li
                v-for="(option, index) in sorted"
                :id="optionId(index)"
                :key="String(option.id)"
                class="ui-select__option"
                :class="{'is-active': pointer === index}"
                role="option"
                :aria-selected="option.id === model"
                @mouseover="pointer = index"
                @click="choose(option)"
            >
                {{ labelOf(option) }}
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import {computed, useTemplateRef} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';

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

const root = useTemplateRef<HTMLElement>('root');
const reference = useTemplateRef<HTMLElement>('reference');
const floating = useTemplateRef<HTMLElement>('floating');

const {open, pointer, listboxId, optionId, activeDescendant, floatingStyles, onKey} = useListbox({
    root,
    reference,
    floating,
    id: () => id,
    disabled: () => disabled,
    listLength: () => sorted.value.length,
    // A closed SingleSelect opens on Enter, ArrowDown, or Space.
    openKeys: (key) => ['Enter', 'ArrowDown', ' '].includes(key),
    onCommit: (index) => {
        // Read through a local rather than indexing blind: the clamp watcher normally keeps
        // `pointer` in range, but a keypress landing between an `options` change and the
        // watcher flush would otherwise index off the end.
        const highlighted = sorted.value[index];
        if (!highlighted) return false;
        choose(highlighted);
        return true;
    },
    onDismiss: () => close(),
    onOutside: () => close(),
});

const toggle = () => {
    open.value = !open.value;
};
const close = () => {
    open.value = false;
    pointer.value = -1;
};
const choose = (option: T) => {
    model.value = option.id;
    close();
};
</script>
