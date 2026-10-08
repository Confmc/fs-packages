<template>
    <div class="ui-field" :class="{'is-horizontal': orientation === 'horizontal' && Boolean(label)}">
        <FormLabel v-if="label" :html-for="controlId" :required="required">{{ label }}</FormLabel>
        <!-- the control slot receives the wiring it needs to stay accessible; the wrapper keeps
             multi-node slot content in one grid cell when horizontal (display: contents otherwise).
             A control that reads the field itself (useFieldControl) needs none of the slot props. -->
        <div class="ui-field__control">
            <slot
                :control-id="controlId"
                :error-id="errorId"
                :required="required"
                :invalid="Boolean(message)"
                :describedby="message ? errorId : undefined"
            />
        </div>
        <FormError v-if="message" :error="message" :id="errorId" />
    </div>
</template>

<script setup lang="ts">
import {computed, useId} from 'vue';

import {injectFieldErrors, provideFieldControl, useFieldError} from '../composables/field-context';
import {devWarningsSuppressed} from '../internal/dev-warning';
import FormError from './FormError.vue';
import FormLabel from './FormLabel.vue';

const {
    label,
    required = false,
    error,
    name,
    id,
    orientation = 'vertical',
} = defineProps<{
    /** label text; omit for an unlabelled field. */
    label?: string;
    required?: boolean;
    /** resolved error string, supplied by the consumer (error-as-prop). Wins over `name`. */
    error?: string;
    /**
     * the field's key in the error bag a form provides (`provideFieldErrors`); the message is read
     * verbatim as `errors[name]`. Ignored when `error` is passed.
     */
    name?: string;
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

const generatedId = useId();
const fromBag = useFieldError(() => name);

if (name !== undefined && injectFieldErrors() === null && !devWarningsSuppressed()) {
    console.warn(
        `[ui-form] <FormField name="${name}"> found no error bag, so it can never show this ` +
            "field's message. Provide the form's errors above it (`provideFieldErrors`) or pass `error`.",
    );
}

const controlId = computed(() => id ?? generatedId);
const errorId = computed(() => `${controlId.value}-error`);
const message = computed(() => error ?? fromBag.value);

provideFieldControl(
    computed(() => ({
        id: controlId.value,
        invalid: Boolean(message.value),
        describedby: message.value ? errorId.value : undefined,
        required,
    })),
);
</script>
