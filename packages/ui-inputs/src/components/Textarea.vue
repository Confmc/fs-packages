<template>
    <textarea
        :id="id"
        class="ui-control ui-textarea"
        :class="{'is-invalid': invalid}"
        :value="model ?? ''"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="rows"
        :aria-required="required || undefined"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedby"
        @input="onInput"
    />
</template>

<script setup lang="ts">
defineProps<{
    id: string;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    /** invalid styling + aria; drive it from the field's error. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
}>();

const model = defineModel<string | null>({required: true});

// Coerce a cleared textarea to null (not the empty string), mirroring DateInput,
// so a nullable text column receives null rather than "".
function onInput(event: Event) {
    const {value} = event.target as HTMLTextAreaElement;
    model.value = value === '' ? null : value;
}
</script>
