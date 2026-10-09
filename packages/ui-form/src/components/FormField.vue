<template>
    <div class="ui-field" :class="{'is-horizontal': orientation === 'horizontal' && Boolean(label)}">
        <FormLabel v-if="label" :html-for="field.id" :required="required">{{ label }}</FormLabel>
        <!-- the slot receives `field`, whose keys are the control's own prop names, so one
             `v-bind="field"` wires the control; the wrapper keeps multi-node slot content in one
             grid cell when horizontal (display: contents otherwise) -->
        <div class="ui-field__control">
            <slot :field="field" />
        </div>
        <FormError v-if="message" :error="message" :id="errorId" />
    </div>
</template>

<script setup lang="ts">
import {computed, useId} from 'vue';

import type {FieldBinding} from '../types';

import {messageId} from '../form/field';
import FormError from './FormError.vue';
import FormLabel from './FormLabel.vue';

const {
    label,
    required = false,
    error,
    id,
    orientation = 'vertical',
} = defineProps<{
    /** label text; omit for an unlabelled field. */
    label?: string;
    required?: boolean;
    /** resolved error string, supplied by the consumer (error-as-prop); empty means no error. */
    error?: string;
    /** control id; omit and the field generates one with `useId()`. */
    id?: string;
    /**
     * field layout. `'vertical'` (default) stacks the label above the control; `'horizontal'`
     * places the label in a fixed left column (width `--ui-field-label-width`) with the control
     * to its right and the error beneath the control. An unlabelled field ignores it — there is
     * no label to give a column to, so the control keeps the full width.
     */
    orientation?: 'vertical' | 'horizontal';
}>();

defineSlots<{default?: (scope: {field: FieldBinding}) => unknown}>();

const generatedId = useId();
const errorId = computed(() => messageId(id ?? generatedId));
const message = computed(() => error || undefined);

const field = computed<FieldBinding>(() => ({
    id: id ?? generatedId,
    invalid: Boolean(message.value),
    describedby: message.value ? errorId.value : undefined,
}));
</script>
