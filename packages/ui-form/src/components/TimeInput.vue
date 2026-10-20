<template>
    <span v-bind="rootAttrs($attrs)" class="ui-input-wrap">
        <!-- class/style style the whole control (this root); everything else lands on the <input>. -->
        <!-- the clock glyph; decorative, it stands in for the browser's own (hidden in the sheet) -->
        <svg class="ui-input__lead" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
                fill="currentColor"
                fill-rule="evenodd"
                d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM8.75 4v3.69l2.28 2.28-1.06 1.06L7.25 8.31V4z"
            />
        </svg>
        <input
            v-bind="controlAttrs($attrs)"
            ref="input"
            :id="controlId"
            type="time"
            class="ui-control ui-input ui-time has-lead"
            :class="{'is-invalid': marked, 'has-button': showClear}"
            :value="model ?? ''"
            :step="step === undefined ? undefined : step * 60"
            :disabled="disabled"
            :aria-required="required || undefined"
            :aria-invalid="marked || undefined"
            :aria-describedby="describedby"
            @input="onInput"
            @click="togglePicker"
            @blur="pickerOpen = false"
        />
        <!-- mousedown is prevented so the click keeps focus on the input -->
        <button
            v-if="showClear"
            type="button"
            class="ui-input__button"
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
import {computed, onMounted, ref, useId, useTemplateRef} from 'vue';

import {controlAttrs, rootAttrs} from '../internal/split-attrs';
import ErrorIcon from './ErrorIcon.vue';

const {
    id,
    disabled = false,
    invalid = undefined,
    error,
    step,
    clearable = true,
    clearButtonLabel = 'Clear',
    autofocus = false,
} = defineProps<{
    /** control id; inside a `FormField` the field passes its own, standalone it defaults to `useId()`. */
    id?: string;
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
    /** the minute step of the picker and the arrow keys (`15` for quarter hours). */
    step?: number;
    /** offer a clear button while there is a time; `false` for a time that must always be set. */
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

// `HH:MM`, or null for no time: the native input reports a cleared time as '', which is no time too.
const model = defineModel<string | null>({required: true});

const showClear = computed(() => clearable && !disabled && Boolean(model.value));

const input = useTemplateRef<HTMLInputElement>('input');
const pickerOpen = ref(false);

const onInput = (event: Event): void => {
    model.value = (event.target as HTMLInputElement).value || null;
};

// A click opens the browser's picker, a second click closes it again (the input keeps focus). The
// picker is a browser feature: where it is missing or refused, the click just edits the field.
const togglePicker = (): void => {
    const element = input.value as HTMLInputElement;
    if (pickerOpen.value) {
        pickerOpen.value = false;
        return;
    }
    try {
        element.showPicker();
        pickerOpen.value = true;
    } catch {
        pickerOpen.value = false;
    }
};

const clear = (): void => {
    model.value = null;
    pickerOpen.value = false;
    input.value?.focus();
};

onMounted(() => {
    if (autofocus) input.value?.focus();
});
</script>
