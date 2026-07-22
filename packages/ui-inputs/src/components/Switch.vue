<template>
    <label class="ui-switch" :class="{'is-disabled': disabled}">
        <span class="ui-switch__control">
            <!-- role="switch" on the native checkbox itself is the standard pattern: the native
                 checked state maps to aria-checked (HTML-AAM), so the component never sets
                 aria-checked by hand — double-setting could contradict the real state. -->
            <input
                :id="id"
                v-bind="$attrs"
                type="checkbox"
                role="switch"
                class="ui-switch__input"
                :class="{'is-invalid': invalid}"
                :checked="model"
                :disabled="disabled"
                :aria-required="required || undefined"
                :aria-invalid="invalid || undefined"
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
// The root is the <label> (implicit labelling), so attrs are re-aimed at the native input —
// see Checkbox for the fall-through rationale.
defineOptions({inheritAttrs: false});

const {
    label,
    disabled = false,
    required = false,
    invalid = false,
    describedby,
} = defineProps<{
    /** stable id — required so the control can pair with an external label/error. */
    id: string;
    /** label text rendered beside the track; the default slot overrides it. */
    label?: string;
    disabled?: boolean;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    /** invalid styling + aria; drive it from the field's error. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
}>();

// On/off is boolean by nature — non-nullable, like Checkbox (and no indeterminate: a switch
// has no mixed state).
const model = defineModel<boolean>({required: true});

// change (not input) is the native checkbox commit event. The disabled guard keeps synthetic
// dispatch honest — a real browser never fires change on a disabled control.
const onChange = (event: Event): void => {
    if (disabled) return;
    model.value = (event.target as HTMLInputElement).checked;
};
</script>
