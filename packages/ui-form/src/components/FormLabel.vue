<template>
    <label class="ui-label" :for="htmlFor">
        <slot />
        <span v-if="required" class="ui-label__req" aria-hidden="true">*</span>
        <!-- read with the label, unlike the mark: it is the only place the field says it may stay empty -->
        <span v-else-if="optionalNote" class="ui-label__optional">{{ optionalNote }}</span>
        <!-- content after the label text and its mark or note, e.g. a tooltip -->
        <slot name="after" />
    </label>
</template>

<script setup lang="ts">
defineProps<{
    /** id of the control this label describes (`for` attribute). */
    htmlFor: string;
    /** render the required marker. */
    required?: boolean;
    /** a note shown on a field that is not required ("optional"); omitted, such a field shows nothing. */
    optionalNote?: string;
}>();
</script>
