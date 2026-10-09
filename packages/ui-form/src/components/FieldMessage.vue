<template>
    <FormError v-if="error && describedby" :error :id="describedby" />
</template>

<script setup lang="ts">
import FormError from './FormError.vue';

// The whole `field(name)` object binds here (`<FieldMessage v-bind="field('email')" />`), so all four
// keys are declared: none falls through as an attribute.
defineProps<{id?: string; invalid?: boolean; describedby?: string; error?: string}>();
</script>
