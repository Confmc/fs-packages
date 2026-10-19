<template>
    <div class="ui-field" :class="{'is-horizontal': orientation === 'horizontal' && Boolean(label)}">
        <!-- with an aside the label shares a row with it; without one the label stays a direct child, as in 0.17 -->
        <div v-if="label && $slots.aside" class="ui-field__head">
            <FormLabel :html-for="field.id" :required="required">
                {{ label }}<template #after><slot name="label-after" /></template>
            </FormLabel>
            <slot name="aside" :field="field" />
        </div>
        <FormLabel v-else-if="label" :html-for="field.id" :required="required">
            {{ label }}<template #after><slot name="label-after" /></template>
        </FormLabel>
        <!-- the slot receives `field`, whose keys are the control's own prop names, so one
             `v-bind="field"` wires the control; the wrapper keeps multi-node slot content in one
             grid cell when horizontal (display: contents otherwise) -->
        <div class="ui-field__control">
            <slot :field="field" />
        </div>
        <div v-if="$slots.hint" :id="hintId(field.id)" class="ui-hint"><slot name="hint" /></div>
        <FormError v-if="message" :error="message" :id="errorId" />
    </div>
</template>

<script setup lang="ts">
import {computed, useId, useSlots} from 'vue';

import type {FieldBinding} from '../types';

import {hintId, messageId} from '../form/field';
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

defineSlots<{
    default?: (scope: {field: FieldBinding}) => unknown;
    /** inside the label, after its text and required mark: a tooltip. */
    'label-after'?: () => unknown;
    /** at the far end of the label's row, e.g. a switch that belongs to the field. */
    aside?: (scope: {field: FieldBinding}) => unknown;
    /** under the control, above the message: what the field expects. Read with the field after the message. */
    hint?: () => unknown;
}>();
const slots = useSlots();

const generatedId = useId();
const errorId = computed(() => messageId(id ?? generatedId));
const message = computed(() => error || undefined);

const field = computed<FieldBinding>(() => {
    const own = id ?? generatedId;
    const describedby = [message.value && errorId.value, slots.hint && hintId(own)].filter(Boolean).join(' ');

    return {id: own, invalid: Boolean(message.value), describedby: describedby || undefined, error: message.value};
});
</script>
