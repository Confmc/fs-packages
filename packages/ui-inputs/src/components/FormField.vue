<template>
    <div class="ui-field">
        <FormLabel v-if="label" :html-for="controlId" :required="required">{{ label }}</FormLabel>
        <!-- the control slot receives the wiring it needs to stay accessible -->
        <slot
            :control-id="controlId"
            :error-id="errorId"
            :invalid="Boolean(error)"
            :describedby="error ? errorId : undefined"
        />
        <FormError :error="error" :id="errorId" />
    </div>
</template>

<script setup lang="ts">
import {useId} from 'vue';

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
    /** override the generated control id. */
    id?: string;
}>();

const controlId = id ?? useId();
const errorId = `${controlId}-error`;
</script>
