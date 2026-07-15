<template>
    <p :id="id" class="ui-error" role="alert">{{ error }}</p>
</template>

<script setup lang="ts">
defineProps<{
    /**
     * the resolved error string. Supplied by the consumer — never read from a service.
     * Guard rendering with `v-if` in the parent (as `FormField` does); do not pass an
     * empty string, or an empty `role="alert"` element is announced.
     */
    error: string;
    /** id used to pair with a control's `aria-describedby`. */
    id: string;
}>();
</script>
