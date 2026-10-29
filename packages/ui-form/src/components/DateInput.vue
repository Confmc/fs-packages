<template>
    <input
        v-model="model"
        :id="id"
        type="date"
        class="ui-control ui-input"
        :class="{'is-invalid': invalid}"
        :disabled="disabled"
        :min="min"
        :max="max"
        :aria-required="required || undefined"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedby"
    />
</template>

<script setup lang="ts">
// The native date input keeps the browser's own picker, so it has no wrapper and no in-input error
// icon, and no placeholder: a native date input shows none.
defineProps<{
    /** control id, pairing the input with its label and error; inside a `FormField` the field passes its own. */
    id: string;
    disabled?: boolean;
    /** ISO date bound (`YYYY-MM-DD`) for the native picker. */
    min?: string;
    max?: string;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    /** marks the input invalid; the field around it decides the message. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
}>();

// Accepts null so it binds a nullable date column directly (Vue renders null as an
// empty control); a cleared date emits '', which the fleet's
// ConvertEmptyStringsToNull middleware converts back to null on submit.
const model = defineModel<string | null>({required: true});
</script>
