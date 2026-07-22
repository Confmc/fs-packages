<template>
    <!-- role="radiogroup" (overriding fieldset's implicit `group`) because radiogroup — unlike
         group — legitimately carries aria-required, giving the group-level required conveyance
         as a real attribute; the legend still names the fieldset. ONE described-by story: the
         error IDREF lives on the fieldset only. -->
    <fieldset
        :id="id"
        class="ui-radio-group"
        role="radiogroup"
        :aria-required="required || undefined"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedby"
    >
        <legend class="ui-label ui-radio-group__legend">
            {{ label }}<span v-if="required" class="ui-label__req" aria-hidden="true">*</span>
        </legend>
        <!-- Native radios sharing one name: the browser provides the roving tabindex and the
             arrow-key selection (never hand-rolled here) — the component only mirrors the
             model from the native change event. -->
        <label
            v-for="(option, index) in options"
            :key="String(option.id)"
            class="ui-check ui-radio"
            :class="{'is-disabled': disabled}"
        >
            <span class="ui-check__control">
                <input
                    :id="`${id}-opt-${index}`"
                    type="radio"
                    class="ui-check__input ui-radio__input"
                    :class="{'is-invalid': invalid}"
                    :name="id"
                    :value="String(option.id)"
                    :checked="model === option.id"
                    :disabled="disabled"
                    @change="onChange(option.id)"
                />
                <svg class="ui-check__icon" viewBox="0 0 20 20" aria-hidden="true">
                    <circle class="ui-radio__dot" cx="10" cy="10" r="4.5" fill="currentColor" />
                </svg>
            </span>
            <span class="ui-check__label">{{ labelOf(option) }}</span>
        </label>
    </fieldset>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import type {LabelKey, SelectItem} from '../types';

const {
    options,
    optionLabel,
    label,
    id,
    disabled = false,
    required = false,
    invalid = false,
    describedby,
} = defineProps<{
    options: T[];
    /**
     * property name or getter for an option's display string (the family's labelOf
     * convention — named optionLabel here because `label` is the group legend).
     */
    optionLabel: LabelKey<T>;
    /** the group legend. */
    label: string;
    /** stable id — on the fieldset, the shared radio `name`, and the member-id base. */
    id: string;
    disabled?: boolean;
    /** conveys the required state to assistive tech via `aria-required` (radiogroup). */
    required?: boolean;
    /** invalid styling + aria; drive it from the field's error. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby` (fieldset only). */
    describedby?: string;
}>();

/** The committed choice — `null` while nothing is selected (the SingleSelect model shape). */
const model = defineModel<T['id'] | null>({required: true});

/** Resolve an option's display string from the `optionLabel` prop (property name or getter). */
const labelOf = (option: T): string =>
    typeof optionLabel === 'function'
        ? optionLabel(option)
        : String((option as Record<PropertyKey, unknown>)[optionLabel as PropertyKey]);

// The model follows the native change event (keyboard arrows and clicks both land here). The
// disabled guard keeps synthetic dispatch honest — a real browser never fires change on a
// disabled control.
const onChange = (value: T['id']): void => {
    if (disabled) return;
    model.value = value;
};
</script>
