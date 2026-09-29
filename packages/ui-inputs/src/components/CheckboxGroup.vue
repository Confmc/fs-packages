<template>
    <!-- ONE described-by story: the error IDREF lives on the fieldset only — members never
         repeat it. aria-invalid is ARIA-global, so the fieldset (role=group) may carry it;
         aria-required is NOT valid on `group` (axe aria-allowed-attr), so the required state
         is conveyed group-level through the legend instead: the family's visual * marker plus
         screen-reader-only text (localisable via requiredLabel), announced when AT enters the
         fieldset. -->
    <fieldset
        :id="id"
        ref="group"
        class="ui-check-group"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedby"
    >
        <legend ref="legend" class="ui-label ui-check-group__legend">
            {{ label }}<span v-if="required" class="ui-label__req" aria-hidden="true">*</span
            ><span v-if="required" class="ui-check-group__sr">{{ requiredLabel }}</span>
        </legend>
        <Checkbox
            v-for="(option, index) in options"
            :id="`${id}-opt-${index}`"
            :key="String(option.id)"
            :label="labelOf(option)"
            :disabled="disabled"
            :invalid="invalid"
            :model-value="model.includes(option.id)"
            @update:model-value="toggle(option.id)"
        />
    </fieldset>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import {onMounted, useTemplateRef} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {warnWhenUnnamed} from '../internal/accessible-name';
import {ensureRefValueExists} from '../internal/reactivity';
import Checkbox from './Checkbox.vue';

const {
    options,
    optionLabel,
    label,
    id,
    disabled = false,
    required = false,
    invalid = false,
    describedby,
    requiredLabel = '(required)',
} = defineProps<{
    options: T[];
    /**
     * property name or getter for an option's display string (the family's labelOf
     * convention — named optionLabel here because `label` is the group legend).
     */
    optionLabel: LabelKey<T>;
    /** the group legend. */
    label: string;
    /** stable id — on the fieldset, and the base for position-keyed member ids. */
    id: string;
    disabled?: boolean;
    /** conveys the required state at group level (legend marker + sr-only text). */
    required?: boolean;
    /** invalid styling + aria — mirrored onto the members so the boxes show it. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby` (fieldset only). */
    describedby?: string;
    /**
     * screen-reader-only required conveyance appended to the legend — a prop, not a
     * literal, so Dutch territories can localise it (the `optionsLabel` ruling).
     */
    requiredLabel?: string;
}>();

/** The committed membership: an array of option ids, kept in OPTIONS order. */
const model = defineModel<T['id'][]>({required: true});

const group = useTemplateRef<HTMLElement>('group');
const legend = useTemplateRef<HTMLElement>('legend');

// `label` is typed as a string but `''` passes the type. The legend alone names the group: the option
// text inside the fieldset names the options, never the question. Dev-only, mount-time.
onMounted(() =>
    warnWhenUnnamed(ensureRefValueExists(group), 'CheckboxGroup', 'the `label` prop (the legend)', [
        ensureRefValueExists(legend),
    ]),
);

/** Resolve an option's display string from the `optionLabel` prop (property name or getter). */
const labelOf = (option: T): string =>
    typeof optionLabel === 'function'
        ? optionLabel(option)
        : String((option as Record<PropertyKey, unknown>)[optionLabel as PropertyKey]);

// Membership keeps a stable OPTIONS order, not click order: adding re-derives the resolved
// members from the options list. An id whose option has not arrived yet (the async-options
// edit-form window) is preserved at the tail rather than silently dropped by the re-derive.
const toggle = (value: T['id']): void => {
    if (model.value.includes(value)) {
        model.value = model.value.filter((member) => member !== value);
        return;
    }
    const next = new Set([...model.value, value]);
    const resolved = options.filter((option) => next.has(option.id)).map((option) => option.id);
    const unresolved = model.value.filter((member) => !options.some((option) => option.id === member));
    model.value = [...resolved, ...unresolved];
};
</script>
