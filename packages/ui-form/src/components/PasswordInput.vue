<template>
    <span v-bind="rootAttrs($attrs)" class="ui-password">
        <!-- class/style style the whole control (this root); everything else lands on the <input>. -->
        <span class="ui-input-wrap">
            <input
                @input="onInput"
                @compositionstart="onCompositionstart"
                @compositionend="onCompositionend"
                @change="onChange"
                @keydown="checkCapsLock"
                @keyup="checkCapsLock"
                v-bind="controlAttrs($attrs)"
                ref="input"
                :id="controlId"
                :type="shown ? 'text' : 'password'"
                class="ui-control ui-input has-button"
                :class="{'is-invalid': marked}"
                :value="text"
                :placeholder="placeholder"
                :disabled="disabled"
                :autocomplete="autocomplete"
                :aria-required="required || undefined"
                :aria-invalid="marked || undefined"
                :aria-describedby="describedbyWithCaps"
            />
            <button
                type="button"
                class="ui-input__button"
                :aria-label="shown ? hidePasswordLabel : showPasswordLabel"
                :aria-pressed="shown"
                :aria-controls="controlId"
                :disabled="disabled"
                @mousedown.prevent
                @click="shown = !shown"
            >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path
                        fill="currentColor"
                        fill-rule="evenodd"
                        d="M8 3c3.3 0 5.9 2.3 7 5-1.1 2.7-3.7 5-7 5S2.1 10.7 1 8c1.1-2.7 3.7-5 7-5zm0 1.5A3.5 3.5 0 1 0 8 11.5 3.5 3.5 0 0 0 8 4.5zM8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"
                    />
                    <path
                        v-if="shown"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        d="M2.5 2.5l11 11"
                    />
                </svg>
            </button>
            <ErrorIcon v-if="marked" />
        </span>
        <span v-if="capsLock" :id="capsId" class="ui-password__caps" role="status">{{ capsLockText }}</span>
    </span>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, useId, useTemplateRef} from 'vue';

import {commitOutsideComposition} from '../internal/composition';
import {controlAttrs, rootAttrs} from '../internal/split-attrs';
import ErrorIcon from './ErrorIcon.vue';

const {
    id,
    disabled = false,
    invalid = undefined,
    error,
    describedby,
    autocomplete = 'current-password',
    showPasswordLabel = 'Show password',
    hidePasswordLabel = 'Hide password',
    capsLockText = 'Caps Lock is on',
    autofocus = false,
} = defineProps<{
    /** control id; inside a `FormField` the field passes its own, standalone it defaults to `useId()`. */
    id?: string;
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
    /** what the browser offers: the saved password, or a new one to save. */
    autocomplete?: 'current-password' | 'new-password';
    /** the toggle's accessible name while the password is hidden. */
    showPasswordLabel?: string;
    /** the toggle's accessible name while the password is shown. */
    hidePasswordLabel?: string;
    /** the warning shown while Caps Lock is on. */
    capsLockText?: string;
    /** focus the input when it mounts; in script, since the native attribute only acts on page load. */
    autofocus?: boolean;
}>();

defineOptions({inheritAttrs: false});

// The mark: `invalid` when given, otherwise whether there is a message.
const marked = computed(() => invalid ?? Boolean(error));

const ownId = useId();
const controlId = computed(() => id ?? ownId);
const capsId = computed(() => `${controlId.value}-caps`);

// As TextInput: binds null as empty, emits '' when cleared.
const model = defineModel<string | null>({required: true});

const {
    shown: text,
    onInput,
    onCompositionstart,
    onCompositionend,
    onChange,
} = commitOutsideComposition(
    () => model.value,
    (value) => {
        model.value = value;
    },
);

const shown = ref(false);
const capsLock = ref(false);

// A key event says whether Caps Lock is on; a value the browser fills in arrives without one and says nothing.
const checkCapsLock = (event: KeyboardEvent): void => {
    capsLock.value = event.getModifierState('CapsLock');
};

// The warning is read with the field while it shows.
const describedbyWithCaps = computed(
    () => [describedby, capsLock.value ? capsId.value : undefined].filter(Boolean).join(' ') || undefined,
);

const input = useTemplateRef<HTMLInputElement>('input');
onMounted(() => {
    if (autofocus) input.value?.focus();
});
</script>
