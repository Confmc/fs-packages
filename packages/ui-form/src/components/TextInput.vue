<template>
    <span v-bind="rootAttrs($attrs)" class="ui-input-wrap">
        <!-- class/style style the whole control (this root); everything else, `data-*` and listeners
             included, lands on the <input>, as on the select family. -->
        <input
            v-bind="controlAttrs($attrs)"
            :id="controlId"
            :type="type"
            class="ui-control ui-input"
            :class="{'is-invalid': marked}"
            :value="shown"
            :placeholder="placeholder"
            :disabled="disabled"
            :aria-required="required || undefined"
            :aria-invalid="marked || undefined"
            :aria-describedby="describedby"
            @input="onInput"
            @compositionstart="onCompositionstart"
            @compositionend="onCompositionend"
            @change="onChange"
        />
        <!-- emmie's in-input error icon; decorative, the message itself is read via aria-describedby -->
        <svg v-if="marked" class="ui-input__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
                fill="currentColor"
                fill-rule="evenodd"
                d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM7.1 4.4a.9.9 0 0 1 1.8 0v4.2a.9.9 0 0 1-1.8 0zM8 10.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"
            />
        </svg>
    </span>
</template>

<script setup lang="ts">
import {computed, useId} from 'vue';

import {commitOutsideComposition} from '../internal/composition';
import {controlAttrs, rootAttrs} from '../internal/split-attrs';

const {
    type = 'text',
    id,
    invalid = undefined,
    error,
} = defineProps<{
    /** control id; inside a `FormField` the field passes its own, standalone it defaults to `useId()`. */
    id?: string;
    type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
    placeholder?: string;
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
defineOptions({inheritAttrs: false});

const marked = computed(() => invalid ?? Boolean(error));

const ownId = useId();
const controlId = computed(() => id ?? ownId);

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
