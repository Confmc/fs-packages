<template>
    <div class="fs-field">
        <FsLabel v-if="label" :html-for="controlId" :required="required">{{ label }}</FsLabel>
        <!-- the control slot receives the wiring it needs to stay accessible -->
        <slot
            :control-id="controlId"
            :error-id="errorId"
            :invalid="Boolean(error)"
            :describedby="error ? errorId : undefined"
        />
        <FsError :error="error" :id="errorId" />
    </div>
</template>

<script setup lang="ts">
import {useId} from 'vue';

import {fieldErrorId} from '../internal/ids';
import FsError from './FsError.vue';
import FsLabel from './FsLabel.vue';

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
const errorId = fieldErrorId(controlId);
</script>
