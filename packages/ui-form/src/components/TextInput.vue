<template>
    <input
        :id="control.id"
        :type="type"
        class="ui-control ui-input"
        :class="{'is-invalid': control.invalid}"
        :value="shown"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-required="control.required || undefined"
        :aria-invalid="control.invalid || undefined"
        :aria-describedby="control.describedby"
        @input="onInput"
        @compositionstart="onCompositionstart"
        @compositionend="onCompositionend"
        @change="onChange"
    />
</template>

<script setup lang="ts">
import {useFieldControl} from '../composables/field-context';
import {commitOutsideComposition} from '../internal/composition';

const {
    type = 'text',
    id,
    invalid = undefined,
    describedby,
    required = undefined,
} = defineProps<{
    /** control id; inside a `FormField` it defaults to the field's. */
    id?: string;
    type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
    placeholder?: string;
    disabled?: boolean;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    /** invalid styling + aria; drive it from the field's error. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
}>();

// Absent `invalid`/`required` must stay `undefined` (not Vue's boolean-cast `false`), so the
// enclosing FormField can decide them.
const control = useFieldControl(() => ({id, invalid, describedby, required}));

// Accepts null so it binds a nullable backend field directly (Vue renders null as
// an empty control); a cleared input emits '', which the fleet's
// ConvertEmptyStringsToNull middleware converts back to null on submit.
const model = defineModel<string | null>({required: true});

const {shown, onInput, onCompositionstart, onCompositionend, onChange} = commitOutsideComposition(
    () => model.value,
    (value) => {
        model.value = value;
    },
);
</script>
