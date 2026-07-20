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
import {autoUpdate, flip, hide, offset, shift, useFloating} from '@floating-ui/vue';
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch} from 'vue';

import type {LabelKey, SelectItem} from '../types';

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

const open = ref(false);
const pointer = ref(-1);

// Keyboard focus lives on the trigger, so the focused option is conveyed to assistive
// tech via aria-activedescendant rather than real DOM focus. That IDREF only resolves
// if the referenced element sits inside the listbox the trigger owns, which is why the
// trigger also carries aria-controls while open.
const listboxId = computed(() => `${id}-listbox`);
// Keyed by POSITION, not by option.id: `SelectItem['id']` is an unconstrained
// `string | number`, and an id containing ASCII whitespace is not a valid IDREF —
// aria-activedescendant would silently resolve to nothing. Slugifying would trade that
// for a worse bug (`red apple` and `red-apple` would collide onto one id, making the
// IDREF ambiguous rather than absent). The position is consistent within a render, which
// is the only window in which the trigger's IDREF and the option's id are read together.
const optionId = (index: number): string => `${id}-opt-${index}`;
// Absent (not empty) when there is nothing focused — a dangling IDREF is worse than none.
// The upper bound is load-bearing: `options` is a reactive prop and can shrink while the
// listbox is open, leaving `pointer` past the end.
const activeDescendant = computed(() =>
    open.value && pointer.value >= 0 && pointer.value < sorted.value.length ? optionId(pointer.value) : undefined,
);

// `options` shrinking while open leaves `pointer` dangling. Clamping here (flush: 'pre',
// so it lands before the re-render that would read a stale index) keeps the highlight
// honest AND keeps Enter safe — `choose()` indexes the same array.
watch(
    () => sorted.value.length,
    (length) => {
        if (pointer.value >= length) pointer.value = length - 1;
    },
);

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

// Listbox keyboard navigation. The trigger's native :disabled blocks clicks; this
// guards the keyboard path too.
const onKey = (event: KeyboardEvent) => {
    if (disabled) return;
    if (event.key === 'Tab') {
        close();
        return;
    }
    if (!open.value) {
        if (['Enter', 'ArrowDown', ' '].includes(event.key)) {
            event.preventDefault();
            open.value = true;
        }
        return;
    }
    switch (event.key) {
        case 'ArrowDown':
            pointer.value = Math.min(pointer.value + 1, sorted.value.length - 1);
            event.preventDefault();
            break;
        case 'ArrowUp':
            pointer.value = Math.max(pointer.value - 1, -1);
            event.preventDefault();
            break;
        case 'Enter': {
            // Read through a local rather than indexing blind: the clamp watcher normally
            // keeps `pointer` in range, but a keypress landing between an `options` change
            // and the watcher flush would otherwise index off the end.
            const highlighted = pointer.value >= 0 ? sorted.value[pointer.value] : undefined;
            if (highlighted) {
                choose(highlighted);
                event.preventDefault();
            }
            break;
        }
        case 'Escape':
            close();
            event.preventDefault();
            break;
    }
};

// click-outside — closes the menu without a shared directive dependency.
const root = useTemplateRef<HTMLElement>('root');
const onDocumentPointer = (event: MouseEvent) => {
    // The listener is attached only between mount and unmount, so the ref is non-null here.
    if (!root.value!.contains(event.target as Node)) close();
};
onMounted(() => document.addEventListener('click', onDocumentPointer));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentPointer));

const reference = useTemplateRef<HTMLElement>('reference');
const floating = useTemplateRef<HTMLElement>('floating');
const {floatingStyles} = useFloating(reference, floating, {
    placement: 'bottom-start',
    middleware: [offset(4), flip({fallbackPlacements: ['top-start']}), shift({padding: 8}), hide()],
    whileElementsMounted: autoUpdate,
});
</script>
