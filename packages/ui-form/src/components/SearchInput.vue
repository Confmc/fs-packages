<template>
    <span v-bind="rootAttrs($attrs)" class="ui-input-wrap">
        <!-- class/style style the whole control (this root); everything else lands on the <input>. -->
        <!-- the magnifier; decorative, the input's role already says it is a search -->
        <svg class="ui-input__lead" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
                fill="currentColor"
                fill-rule="evenodd"
                d="M6.75 1a5.75 5.75 0 0 1 4.6 9.2l3.45 3.45-1.06 1.06-3.45-3.45A5.75 5.75 0 1 1 6.75 1zm0 1.5a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5z"
            />
        </svg>
        <input
            v-bind="controlAttrs($attrs)"
            ref="input"
            :id="controlId"
            type="search"
            class="ui-control ui-input ui-search has-lead"
            :class="{'is-invalid': marked, 'has-clear': showClear}"
            :value="shown"
            :placeholder="placeholder"
            :disabled="disabled"
            :aria-required="required || undefined"
            :aria-invalid="marked || undefined"
            :aria-describedby="describedby"
            @input="onInput"
            @compositionstart="onCompositionstart"
            @compositionend="onCompositionend"
            @change="onChange"
        />
        <!-- mousedown is prevented so the click keeps focus on the input -->
        <button
            v-if="showClear"
            type="button"
            class="ui-input__clear"
            tabindex="-1"
            :aria-label="clearButtonLabel"
            @mousedown.prevent
            @click="clear"
        >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M4.5 4.5l7 7m0-7l-7 7" />
            </svg>
        </button>
        <ErrorIcon v-if="marked" />
    </span>
</template>

<script setup lang="ts">
import {computed, onMounted, useId, useTemplateRef} from 'vue';

import {commitOutsideComposition} from '../internal/composition';
import {controlAttrs, rootAttrs} from '../internal/split-attrs';
import ErrorIcon from './ErrorIcon.vue';

const {
    id,
    disabled = false,
    invalid = undefined,
    error,
    clearable = true,
    clearButtonLabel = 'Clear',
    autofocus = false,
} = defineProps<{
    /** control id; inside a `FormField` the field passes its own, standalone it defaults to `useId()`. */
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    /**
     * the field's message (`field(name)` passes it). It marks the control invalid unless `invalid`
     * says otherwise: `invalid: false` shows a message without the mark.
     */
    error?: string;
    /** overrides the mark `error` sets; omitted, the mark follows `error`. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
    /** offer a clear button while there is text. */
    clearable?: boolean;
    /** the clear button's accessible name. */
    clearButtonLabel?: string;
    /** focus the input when it mounts; in script, since the native attribute only acts on page load. */
    autofocus?: boolean;
}>();

defineOptions({inheritAttrs: false});

// The mark: `invalid` when given, otherwise whether there is a message.
const marked = computed(() => invalid ?? Boolean(error));

const ownId = useId();
const controlId = computed(() => id ?? ownId);

// As TextInput: binds null as empty, emits '' when cleared.
const model = defineModel<string | null>({required: true});

const {shown, onInput, onCompositionstart, onCompositionend, onChange} = commitOutsideComposition(
    () => model.value,
    (value) => {
        model.value = value;
    },
);

const showClear = computed(() => clearable && !disabled && Boolean(shown.value));

const input = useTemplateRef<HTMLInputElement>('input');

const clear = (): void => {
    model.value = '';
    input.value?.focus();
};

onMounted(() => {
    if (autofocus) input.value?.focus();
});
</script>
