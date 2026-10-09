<template>
    <label class="ui-switch" :class="{'is-disabled': disabled}">
        <span class="ui-switch__control">
            <!-- role="switch" on the native checkbox itself is the standard pattern: the native
                 checked state maps to aria-checked (HTML-AAM), so the component never sets
                 aria-checked by hand — double-setting could contradict the real state. -->
            <input
                :id="controlId"
                ref="input"
                v-guard-while-disabled="disabled"
                v-bind="$attrs"
                type="checkbox"
                role="switch"
                class="ui-switch__input"
                :class="{'is-invalid': marked}"
                :checked="model"
                :disabled="disabled"
                :aria-required="required || undefined"
                :aria-invalid="marked || undefined"
                :aria-describedby="describedby"
                @change="onChange"
            />
            <span class="ui-switch__thumb" aria-hidden="true"></span>
        </span>
        <span v-if="label !== undefined || $slots.default" class="ui-switch__label"
            ><slot>{{ label }}</slot></span
        >
    </label>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, useId, useTemplateRef} from 'vue';

import {warnWhenUnnamed} from '../internal/accessible-name';
import {vGuardWhileDisabled} from '../internal/disabled-guard';
import {ensureRefValueExists} from '../internal/reactivity';

// The root is the <label> (implicit labelling), so attrs are re-aimed at the native input —
// see Checkbox for the fall-through rationale.
defineOptions({inheritAttrs: false});

const input = useTemplateRef<HTMLInputElement>('input');

// The same naming guard as Checkbox, for the same attribute/text split — see there.
onMounted(() => {
    const control = ensureRefValueExists(input);
    warnWhenUnnamed(control, 'Switch', 'the `label` prop, default-slot content, a `<label for>`', control.labels);
});

const {
    id,
    label,
    disabled = false,
    required = false,
    invalid = undefined,
    error,
    describedby,
} = defineProps<{
    /** stable id, pairing the control with its label and error; omit it and the control generates one with `useId()`. */
    id?: string;
    /** label text rendered beside the track; the default slot overrides it. */
    label?: string;
    disabled?: boolean;
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
}>();

// The mark: `invalid` when given, otherwise whether there is a message.
const marked = computed(() => invalid ?? Boolean(error));

const ownId = useId();
const controlId = computed(() => id ?? ownId);

// On/off is boolean by nature — non-nullable, like Checkbox (and no indeterminate: a switch
// has no mixed state).
const model = defineModel<boolean>({required: true});

// change (not input) is the native checkbox commit event; the input follows the model once the host
// has rendered, for the reason Checkbox gives (WR-1922).
const onChange = (event: Event): void => {
    const control = event.target as HTMLInputElement;
    model.value = control.checked;
    void nextTick(() => {
        control.checked = model.value;
    });
};
</script>
