<template>
    <div ref="root" class="fs-select" @keydown="onKey">
        <button
            :id="id"
            ref="reference"
            type="button"
            class="fs-control fs-select__trigger"
            :class="{'is-open': open, 'has-value': selected !== undefined, 'is-invalid': invalid}"
            :disabled="disabled"
            role="combobox"
            aria-haspopup="listbox"
            :aria-expanded="open"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedby"
            @click="toggle"
        >
            <span v-if="selected === undefined" class="fs-select__placeholder">{{ placeholder }}</span>
            <span v-else class="fs-select__value">{{ getLabel(selected, label) }}</span>
            <svg class="fs-select__chevron" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
        </button>

        <ul
            v-if="open"
            ref="floating"
            class="fs-select__menu"
            role="listbox"
            aria-label="Options"
            :style="floatingStyles"
        >
            <li v-if="!options.length" class="fs-select__empty">{{ emptyText }}</li>
            <li
                v-for="(option, index) in sorted"
                :key="String(option.id)"
                class="fs-select__option"
                :class="{'is-active': pointer === index}"
                role="option"
                :aria-selected="pointer === index"
                @mouseover="pointer = index"
                @click="choose(option)"
            >
                {{ getLabel(option, label) }}
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import {autoUpdate, flip, hide, offset, shift, useFloating} from '@floating-ui/vue';
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {getLabel} from '../internal/label';
import {reduceSelectKey} from '../internal/select-keyboard';
import {sortByLabel} from '../internal/sort';

const {
    options,
    label,
    placeholder = 'Select…',
    disabled = false,
    alphabeticalSort = true,
    invalid = false,
    describedby,
    emptyText = 'No options',
} = defineProps<{
    options: T[];
    /** property name or getter for an option's display string. */
    label: LabelKey<T>;
    /** stable id — required so the trigger can pair with a label/error. */
    id: string;
    placeholder?: string;
    disabled?: boolean;
    alphabeticalSort?: boolean;
    invalid?: boolean;
    describedby?: string;
    emptyText?: string;
}>();

const model = defineModel<T['id'] | null>({required: true});

const selected = computed(() => options.find((option) => option.id === model.value));
const sorted = computed(() => (alphabeticalSort ? sortByLabel(options, label) : options));

const open = ref(false);
const pointer = ref(-1);

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

const onKey = (event: KeyboardEvent) => {
    if (disabled) return; // the trigger's native :disabled blocks clicks; guard the keyboard path too.
    const next = reduceSelectKey({open: open.value, pointer: pointer.value}, event.key, sorted.value.length);
    if (next.preventDefault) event.preventDefault();
    // reduceSelectKey only signals commit when a real option is highlighted (pointer >= 0).
    if (next.commit) {
        choose(sorted.value[pointer.value]);
        return;
    }
    open.value = next.open;
    pointer.value = next.pointer;
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
