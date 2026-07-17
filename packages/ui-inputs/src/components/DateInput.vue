<template>
    <input
        :id="id"
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
        @input="onInput"
    />
</template>

<script setup lang="ts">
defineProps<{
    id: string;
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

const model = defineModel<string | null>({required: true});

// Coerce a cleared date to null (not the empty string), so a nullable date column
// receives null rather than "" — the latter fails backend date validation.
function onInput(event: Event) {
    const {value} = event.target as HTMLInputElement;
    model.value = value === '' ? null : value;
}
</script>
