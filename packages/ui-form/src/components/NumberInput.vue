<template>
    <input
        :id="controlId"
        type="number"
        class="ui-control ui-input"
        :class="{'is-invalid': marked}"
        :value="model"
        :placeholder="placeholder"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        :aria-required="required || undefined"
        :aria-invalid="marked || undefined"
        :aria-describedby="describedby"
        @input="onInput"
    />
</template>

<script setup lang="ts">
import {computed, useId} from 'vue';

const {
    id,
    invalid = undefined,
    error,
} = defineProps<{
    /** stable id, pairing the control with its label and error; omit it and the control generates one with `useId()`. */
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    min?: number;
    max?: number;
    step?: number;
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

const model = defineModel<number | null>({required: true});

// Own the empty-input coercion ONCE, so no consumer reinvents it: a native number
// input yields NaN for an empty or unparseable value — map that to null so the
// model is always a real number or an explicit "no value", never NaN.
const onInput = (event: Event) => {
    const {valueAsNumber} = event.target as HTMLInputElement;
    model.value = Number.isNaN(valueAsNumber) ? null : valueAsNumber;
};
</script>
