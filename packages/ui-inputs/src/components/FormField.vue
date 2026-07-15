<template>
    <div class="ui-field">
        <FormLabel v-if="label" :html-for="id" :required="required">{{ label }}</FormLabel>
        <!-- the control slot receives the wiring it needs to stay accessible -->
        <slot
            :control-id="id"
            :error-id="errorId"
            :invalid="Boolean(error)"
            :describedby="error ? errorId : undefined"
        />
        <FormError v-if="error" :error="error" :id="errorId" />
    </div>
</template>

<script setup lang="ts">
import FormError from './FormError.vue';
import FormLabel from './FormLabel.vue';

const {
    label,
    required = false,
    error,
    id,
} = defineProps<{
    /** label text; omit for an unlabelled field. */
    label?: string;
    required?: boolean;
    /** resolved error string, supplied by the consumer (error-as-prop). */
    error?: string;
    /** stable control id — pass `useId()` at the call site if you have no natural one. */
    id: string;
}>();

const errorId = `${id}-error`;
</script>
