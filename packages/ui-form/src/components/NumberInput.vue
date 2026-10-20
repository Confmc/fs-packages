<template>
    <span v-bind="rootAttrs($attrs)" class="ui-input-wrap">
        <!-- class/style style the whole control (this root); everything else lands on the <input>, as on TextInput -->
        <input
            v-bind="controlAttrs($attrs)"
            ref="input"
            :id="controlId"
            type="number"
            class="ui-control ui-input ui-number"
            :class="{'is-invalid': marked}"
            :value="model"
            :placeholder="placeholder"
            :disabled="disabled"
            :min="min"
            :max="max"
            :step="step"
            :aria-required="required || undefined"
            :aria-invalid="marked || undefined"
            :aria-describedby="describedby"
            @input="onInput"
        />
        <ErrorIcon v-if="marked" />
    </span>
</template>

<script setup lang="ts">
import {computed, onMounted, useId, useTemplateRef} from 'vue';

import {controlAttrs, rootAttrs} from '../internal/split-attrs';
import ErrorIcon from './ErrorIcon.vue';

defineOptions({inheritAttrs: false});

const {
    id,
    invalid = undefined,
    error,
    autofocus = false,
} = defineProps<{
    /** stable id, pairing the control with its label and error; omit it and the control generates one with `useId()`. */
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    min?: number;
    max?: number;
    step?: number;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    /**
     * the field's message (`field(name)` passes it). It marks the control invalid unless `invalid`
     * says otherwise: `invalid: false` shows a message without the mark.
     */
    error?: string;
    /** overrides the mark `error` sets; omitted, the mark follows `error`. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
    /** focus the input when it mounts; in script, since the native attribute only acts on page load. */
    autofocus?: boolean;
}>();

// The mark: `invalid` when given, otherwise whether there is a message.
const marked = computed(() => invalid ?? Boolean(error));

const input = useTemplateRef<HTMLInputElement>('input');
onMounted(() => {
    if (autofocus) input.value?.focus();
});

const ownId = useId();
const controlId = computed(() => id ?? ownId);

const model = defineModel<number | null>({required: true});

// Own the empty-input coercion ONCE, so no consumer reinvents it: a native number
// input yields NaN for an empty or unparseable value — map that to null so the
// model is always a real number or an explicit "no value", never NaN.
const onInput = (event: Event) => {
    const {valueAsNumber} = event.target as HTMLInputElement;
    model.value = Number.isNaN(valueAsNumber) ? null : valueAsNumber;
};
</script>
