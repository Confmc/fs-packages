<!--
  Type test (see DraftTyping.vue): a form-bound control takes only a draft path of its own value type.
-->
<template>
    <TextField name="name" label="Naam" placeholder="Vul in" />
    <TextareaField name="remarks" label="Opmerkingen" :rows="3" />
    <NumberField name="contractNumber" label="Nummer" :min="0" />
    <DateField name="startDate" label="Start" />
    <TimeField name="startTime" label="Tijd" :step="15" />
    <!-- @vue-expect-error a number path on a time field -->
    <TimeField name="contractNumber" />
    <CheckboxField name="active" label="Actief" />
    <SwitchField name="active" label="Actief" />
    <SingleSelectField name="debtorId" :options="debtors" option-label="name" label="Debiteur" />
    <ComboboxField name="debtorId" :options="debtors" option-label="name" label="Debiteur" />
    <MultiSelectField name="tagIds" :options="debtors" option-label="name" label="Tags" />
    <RadioGroupField name="debtorId" :options="debtors" option-label="name" label="Debiteur" />
    <CheckboxGroupField name="tagIds" :options="debtors" option-label="name" label="Tags" />
    <TextField name="goals.0.title" label="Doel" />
    <!-- @vue-expect-error a number path on a text field -->
    <TextField name="contractNumber" />
    <!-- @vue-expect-error a string path on a number field -->
    <NumberField name="name" />
    <!-- @vue-expect-error a string path on a checkbox -->
    <CheckboxField name="name" />
    <!-- @vue-expect-error a typo -->
    <TextField name="nmae" />
    <!-- @vue-expect-error a string path for numeric option ids -->
    <SingleSelectField name="name" :options="debtors" option-label="name" />
    <!-- @vue-expect-error a single id path on a multi-select -->
    <MultiSelectField name="debtorId" :options="debtors" option-label="name" />
    <!-- @vue-expect-error an optionLabel the options do not have -->
    <SingleSelectField name="debtorId" :options="debtors" option-label="nope" />
    <!-- @vue-expect-error the control's own props stay typed -->
    <NumberField name="contractNumber" :min="'0'" />
    <!-- @vue-expect-error name is required -->
    <TextField label="x" />
    <!-- @vue-expect-error a radio group needs its legend -->
    <RadioGroupField name="debtorId" :options="debtors" option-label="name" />
    <!-- @vue-expect-error a checkbox group needs its legend -->
    <CheckboxGroupField name="tagIds" :options="debtors" option-label="name" />
    <PlainText name="anything" v-model="free" />
</template>

<script setup lang="ts">
import {ref} from 'vue';

import type {FormDraft} from '../../src';

import {useForm} from '../../src/form/form';

interface Contract {
    name: string;
    remarks: string;
    contractNumber: number;
    startDate: string;
    startTime: string;
    active: boolean;
    debtorId: number;
    tagIds: number[];
    goals: {title: string}[];
}

const debtors: {id: number; name: string}[] = [];
const draft = ref({} as FormDraft<Contract>);
const {
    TextField,
    TextareaField,
    NumberField,
    DateField,
    TimeField,
    CheckboxField,
    SwitchField,
    SingleSelectField,
    ComboboxField,
    MultiSelectField,
    RadioGroupField,
    CheckboxGroupField,
} = useForm({draft});

// without a draft, names are free and the value comes from v-model
const {TextField: PlainText} = useForm();
const free = ref<string | null>(null);
</script>
