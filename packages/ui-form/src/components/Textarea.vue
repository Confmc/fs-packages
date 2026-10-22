<template>
    <textarea
        ref="textarea"
        :id="controlId"
        class="ui-control ui-textarea"
        :class="{'is-invalid': isInvalid, 'is-autogrow': autogrow}"
        :value="shown"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="rows"
        :aria-required="required || undefined"
        :aria-invalid="isInvalid || undefined"
        :aria-describedby="describedby"
        @input="onInput"
        @compositionstart="onCompositionstart"
        @compositionend="onCompositionend"
        @change="onChange"
    />
</template>

<script setup lang="ts">
import {computed, onMounted, useId, useTemplateRef, watch} from 'vue';

import {commitOutsideComposition} from '../internal/composition';

const {
    id,
    invalid = undefined,
    error,
    autogrow = false,
    maxRows,
} = defineProps<{
    /** control id; inside a `FormField` the field passes its own, standalone it defaults to `useId()`. */
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
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
    /** grow with the text instead of scrolling: from `rows` upward, on mount and on every change. */
    autogrow?: boolean;
    /** with `autogrow`, stop growing at this many lines and scroll from there. */
    maxRows?: number;
}>();

// The mark: `invalid` when given, otherwise whether there is a message.
const isInvalid = computed(() => invalid ?? Boolean(error));

const ownId = useId();
const controlId = computed(() => id ?? ownId);

// Accepts null so it binds a nullable text column directly (Vue renders null as an
// empty control); a cleared textarea emits '', which the fleet's
// ConvertEmptyStringsToNull middleware converts back to null on submit.
const model = defineModel<string | null>({required: true});

const {shown, onInput, onCompositionstart, onCompositionend, onChange} = commitOutsideComposition(
    () => model.value,
    (value) => {
        model.value = value;
    },
);

const textarea = useTemplateRef<HTMLTextAreaElement>('textarea');

const px = (value: string): number => Number.parseFloat(value) || 0;

// Fit the height to the content: measure from `auto` (so deleted lines shrink it), add the borders
// (the control is border-box, scrollHeight is not), and cap it at maxRows lines, scrolling past that.
const fit = (): void => {
    const element = textarea.value;
    if (!autogrow || !element) return;

    const style = getComputedStyle(element);
    const frame = px(style.borderTopWidth) + px(style.borderBottomWidth);
    element.style.height = 'auto';
    const content = element.scrollHeight + frame;

    const lineHeight = px(style.lineHeight) || px(style.fontSize) * 1.2;
    const cap = maxRows ? lineHeight * maxRows + px(style.paddingTop) + px(style.paddingBottom) + frame : Infinity;

    element.style.height = `${Math.min(content, cap)}px`;
    element.style.overflowY = content > cap ? 'auto' : 'hidden';
};

onMounted(fit);
watch(shown, fit, {flush: 'post'});
</script>
