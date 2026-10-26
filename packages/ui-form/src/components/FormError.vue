<template>
    <p v-if="error" :id="id" class="ui-error" role="alert">{{ error }}</p>
</template>

<script setup lang="ts">
defineProps<{
    /**
     * the resolved error string. Supplied by the consumer — never read from a service. An empty
     * string renders nothing, so no empty `role="alert"` element is announced.
     */
    error: string;
    /** id used to pair with a control's `aria-describedby`. */
    id: string;
}>();
</script>
