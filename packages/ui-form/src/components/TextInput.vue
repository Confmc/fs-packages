<template>
    <span v-bind="rootAttrs($attrs)" class="ui-input-wrap">
        <!-- class/style style the whole control (this root); everything else, `data-*` and listeners
             included, lands on the <input>, as on the select family. -->
        <input
            @input="onInput"
            @compositionstart="onCompositionstart"
            @compositionend="onCompositionend"
            @change="onChange"
            v-bind="controlAttrs($attrs)"
            ref="input"
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
        />
        <ErrorIcon v-if="marked" />
    </span>
</template>

<script setup lang="ts">
import {computed, onMounted, useId, useTemplateRef} from 'vue';

import {commitOutsideComposition} from '../internal/composition';
import {controlAttrs, rootAttrs} from '../internal/split-attrs';
import ErrorIcon from './ErrorIcon.vue';

const {
    type = 'text',
    id,
    invalid = undefined,
    error,
    autofocus = false,
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
    /**
     * focus the input when it mounts. Done in script, not with the native attribute: the browser only
     * honours `autofocus` on page load, so an input in a dialog that opens later would stay unfocused.
     */
    autofocus?: boolean;
}>();

defineOptions({inheritAttrs: false});

// The mark: `invalid` when given, otherwise whether there is a message.
const marked = computed(() => invalid ?? Boolean(error));

const input = useTemplateRef<HTMLInputElement>('input');
onMounted(() => {
    if (autofocus) input.value?.focus();
});

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
