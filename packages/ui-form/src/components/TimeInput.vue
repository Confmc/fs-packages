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
            v-model="model"
            @click="togglePicker"
            @keydown.escape="pickerOpen = false"
            @blur="pickerOpen = false"
            v-bind="controlAttrs($attrs)"
            ref="input"
            :id="id"
            type="time"
            class="ui-control ui-input ui-time has-lead"
            :class="{'is-invalid': invalid, 'has-button': showClear}"
            :step="step === undefined ? undefined : step * 60"
            :disabled="disabled"
            :aria-required="required || undefined"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedby"
        />
        <!-- mousedown is prevented so a pointer click keeps focus on the input; the keyboard reaches it by Tab -->
        <button
            v-if="showClear"
            type="button"
            class="ui-input__button"
            :aria-label="clearLabel"
            @mousedown.prevent
            @click="clear"
        >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M4.5 4.5l7 7m0-7l-7 7" />
            </svg>
        </button>
        <ErrorIcon v-if="invalid" />
    </span>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, useTemplateRef} from 'vue';

import {controlAttrs, rootAttrs} from '../internal/split-attrs';
import ErrorIcon from './ErrorIcon.vue';

// No placeholder: a native time input shows none.
const {
    disabled = false,
    invalid = false,
    step,
    clearLabel,
    autofocus = false,
} = defineProps<{
    /** control id, pairing the input with its label and error; inside a `FormField` the field passes its own. */
    id: string;
    disabled?: boolean;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    /** marks the input invalid, with the error icon; the field around it decides the message. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
    /** the minute step of the picker and the arrow keys (`15` for quarter hours). */
    step?: number;
    /** the clear button's accessible name: given, a clear button shows while there is a time. Leave it out for a time that must always be set. */
    clearLabel?: string;
    /** focus the input when it mounts; in script, since the native attribute only acts on page load. */
    autofocus?: boolean;
}>();

defineOptions({inheritAttrs: false});

// `HH:MM`. As TextInput: binds null as empty, emits '' when cleared (by the button or the keyboard), which
// the fleet's ConvertEmptyStringsToNull middleware converts back to null.
const model = defineModel<string | null>({required: true});

const showClear = computed(() => clearLabel !== undefined && !disabled && Boolean(model.value));

const input = useTemplateRef<HTMLInputElement>('input');
const pickerOpen = ref(false);

// A click opens the browser's picker. The browser closes it on the next click, on Escape or on a blur; this
// state follows, so the click after that opens it again. The picker is a browser feature: where it is
// missing or refused, the click just edits the field.
const togglePicker = (): void => {
    if (pickerOpen.value) {
        pickerOpen.value = false;
        return;
    }
    try {
        input.value?.showPicker();
        pickerOpen.value = true;
    } catch {
        // no picker here: the click edits the field, and the picker stays closed
    }
};

// The clear button keeps focus on the input, so no blur resets the picker state.
const clear = (): void => {
    model.value = '';
    pickerOpen.value = false;
    input.value?.focus();
};

onMounted(() => {
    if (autofocus) input.value?.focus();
});
</script>
