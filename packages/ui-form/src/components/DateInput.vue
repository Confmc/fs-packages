<template>
    <input
        :id="controlId"
        type="date"
        class="ui-control ui-input"
        :class="{'is-invalid': invalid}"
        :value="model"
        :disabled="disabled"
        :min="min"
        :max="max"
        :aria-required="required || undefined"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedby"
        @input="model = ($event.target as HTMLInputElement).value"
    />
</template>

<script setup lang="ts">
import {computed, useId} from 'vue';

const {id} = defineProps<{
    /** stable id, pairing the control with its label and error; omit it and the control generates one with `useId()`. */
    id?: string;
    disabled?: boolean;
    /** ISO date bound (`YYYY-MM-DD`) for the native picker. */
    min?: string;
    max?: string;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    /** invalid styling + aria; drive it from the field's error. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
}>();

const ownId = useId();
const controlId = computed(() => id ?? ownId);

// Accepts null so it binds a nullable date column directly (Vue renders null as an
// empty control); a cleared date emits '', which the fleet's
// ConvertEmptyStringsToNull middleware converts back to null on submit.
const model = defineModel<string | null>({required: true});
</script>
