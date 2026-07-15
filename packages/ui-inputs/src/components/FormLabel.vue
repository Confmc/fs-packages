<template>
    <label class="ui-label" :for="htmlFor">
        <slot />
        <span v-if="required" class="ui-label__req" aria-hidden="true">*</span>
    </label>
</template>

<script setup lang="ts">
defineProps<{
    /** id of the control this label describes (`for` attribute). */
    htmlFor: string;
    /** render the required marker. */
    required?: boolean;
}>();
</script>
