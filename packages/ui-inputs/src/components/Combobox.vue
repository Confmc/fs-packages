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

        <ul
            v-if="open"
            :id="listboxId"
            ref="floating"
            class="ui-combobox__menu"
            role="listbox"
            :aria-label="optionsLabel"
            :style="floatingStyles"
        >
            <li v-if="!filtered.length" class="ui-combobox__empty">{{ emptyText }}</li>
            <li
                v-for="(option, index) in filtered"
                :id="optionId(index)"
                :key="String(option.id)"
                class="ui-combobox__option"
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

const open = ref(false);
const pointer = ref(-1);

// Keyboard focus lives on the input, so the focused option is conveyed to assistive
// tech via aria-activedescendant rather than real DOM focus. That IDREF only resolves
// if the referenced element sits inside the listbox the input owns, which is why the
// input also carries aria-controls while open.
const listboxId = computed(() => `${id}-listbox`);
// Keyed by POSITION, not by option.id: `SelectItem['id']` is an unconstrained
// `string | number`, and an id containing ASCII whitespace is not a valid IDREF —
// aria-activedescendant would silently resolve to nothing. Slugifying would trade that
// for a worse bug (`red apple` and `red-apple` would collide onto one id, making the
// IDREF ambiguous rather than absent). The position is consistent within a render, which
// is the only window in which the input's IDREF and the option's id are read together.
const optionId = (index: number): string => `${id}-opt-${index}`;
// Absent (not empty) when there is nothing focused — a dangling IDREF is worse than none.
// The upper bound is load-bearing: the filtered list shrinks as the user types (or as
// `options` reloads), leaving `pointer` past the end.
const activeDescendant = computed(() =>
    open.value && pointer.value >= 0 && pointer.value < filtered.value.length ? optionId(pointer.value) : undefined,
);

// The filtered list shrinking (a keystroke narrowing it, or `options` reloading) leaves
// `pointer` dangling. Clamping here (flush: 'pre', so it lands before the re-render that
// would read a stale index) keeps the highlight honest AND keeps Enter safe — `choose()`
// indexes the same array.
watch(
    () => filtered.value.length,
    (length) => {
        if (pointer.value >= length) pointer.value = length - 1;
    },
);

// The input text is local, but it must still track the committed value when the model
// changes from OUTSIDE (e.g. a form reset to null) while the control is idle. While the
// menu is open the user is actively typing, so an external change must not yank the text
// out from under them.
watch(model, () => {
    if (!open.value) query.value = selectedLabel.value;
});

const close = () => {
    open.value = false;
    pointer.value = -1;
};
// Snap the input back to the committed label so a half-typed non-match never survives a
// close-without-commit (Escape, Tab, or a click outside the control).
const dismiss = () => {
    query.value = selectedLabel.value;
    close();
};
const choose = (option: T) => {
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

// Listbox keyboard navigation. The keydown listener sits on the root so it fires even
// though the input is the focused element; the native :disabled blocks input events, and
// this guards the keyboard path too.
const onKey = (event: KeyboardEvent) => {
    if (disabled) return;
    if (event.key === 'Tab') {
        dismiss();
        return;
    }
    if (!open.value) {
        // Only ArrowDown opens a closed list — a printable key must fall through to the
        // input so it can filter, so it is never preventDefault-ed here.
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            open.value = true;
        }
        return;
    }
    switch (event.key) {
        case 'ArrowDown':
            pointer.value = Math.min(pointer.value + 1, filtered.value.length - 1);
            event.preventDefault();
            break;
        case 'ArrowUp':
            pointer.value = Math.max(pointer.value - 1, -1);
            event.preventDefault();
            break;
        case 'Enter': {
            // Read through a local rather than indexing blind: the clamp watcher normally
            // keeps `pointer` in range, but a keypress landing between a filter change and
            // the watcher flush would otherwise index off the end.
            const highlighted = pointer.value >= 0 ? filtered.value[pointer.value] : undefined;
            if (highlighted) {
                choose(highlighted);
                event.preventDefault();
            }
            break;
        }
        case 'Escape':
            dismiss();
            event.preventDefault();
            break;
    }
};

// click-outside — reverts + closes without a shared directive dependency.
const root = useTemplateRef<HTMLElement>('root');
const onDocumentPointer = (event: MouseEvent) => {
    // The listener is attached only between mount and unmount, so the ref is non-null here.
    if (!root.value!.contains(event.target as Node)) dismiss();
};
onMounted(() => document.addEventListener('click', onDocumentPointer));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentPointer));

// The input is both the floating-ui reference and the target of the imperative focus
// handle isms's command-palette focus trap (WR-0448) consumes.
const input = useTemplateRef<HTMLInputElement>('input');
const floating = useTemplateRef<HTMLElement>('floating');
const {floatingStyles} = useFloating(input, floating, {
    placement: 'bottom-start',
    middleware: [offset(4), flip({fallbackPlacements: ['top-start']}), shift({padding: 8}), hide()],
    whileElementsMounted: autoUpdate,
});

defineExpose({focus: () => input.value!.focus()});
</script>
