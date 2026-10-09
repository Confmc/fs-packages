<template>
    <input
        :id="controlId"
        :type="type"
        class="ui-control ui-input"
        :class="{'is-invalid': marked}"
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
</template>

<script setup lang="ts">
import {computed, useId} from 'vue';

import {commitOutsideComposition} from '../internal/composition';

const {
    type = 'text',
    id,
    invalid = undefined,
    error,
} = defineProps<{
    /** control id; inside a `FormField` the field passes its own, standalone it defaults to `useId()`. */
    id?: string;
    type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
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
}>();

// The mark: `invalid` when given, otherwise whether there is a message.
const marked = computed(() => invalid ?? Boolean(error));

const ownId = useId();
const controlId = computed(() => id ?? ownId);

// Accepts null so it binds a nullable backend field directly (Vue renders null as
// an empty control); a cleared input emits '', which the fleet's
// ConvertEmptyStringsToNull middleware converts back to null on submit.
const model = defineModel<string | null>({required: true});

const {shown, onInput, onCompositionstart, onCompositionend, onChange} = commitOutsideComposition(
    () => model.value,
    (value) => {
        model.value = value;
    },
);
</script>
