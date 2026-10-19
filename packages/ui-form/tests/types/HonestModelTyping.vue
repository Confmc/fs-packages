<!--
  Type test (see DraftTyping.vue): a form over an honest model, no FormDraft. A bound control takes a path
  when it can read the value there and the value's type holds what the control writes: a field that is
  never emptied stays non-null.
-->
<template>
    <TextField name="title" label="Titel" />
    <TextField name="note" label="Notitie" />
    <DateField name="startDate" label="Start" />
    <DateField name="endDate" label="Einde" />
    <!-- @vue-expect-error a text field writes any string; this path holds only two -->
    <TextField name="kind" />
    <!-- @vue-expect-error a number field writes null when emptied -->
    <NumberField name="count" />
    <NumberField name="limit" label="Limiet" />
    <SingleSelectField name="debtorId" :options="debtors" option-label="name" label="Debiteur" />
    <SingleSelectField name="kind" :options="kinds" option-label="name" label="Soort" />
    <!-- @vue-expect-error a clear entry writes null -->
    <SingleSelectField name="debtorId" :options="debtors" option-label="name" clear-label="Geen" />
    <SingleSelectField name="ownerId" :options="debtors" option-label="name" clear-label="Geen" />
    <ComboboxField name="debtorId" :options="debtors" option-label="name" />
    <GroupSelectField name="debtorId" :groups="[{text: 'A', options: debtors}]" option-label="name" />
    <GroupComboboxField name="debtorId" :groups="[{text: 'A', options: debtors}]" option-label="name" />
    <RadioGroupField name="debtorId" :options="debtors" option-label="name" label="Debiteur" />
</template>

<script setup lang="ts">
import {ref} from 'vue';

import {useForm} from '../../src/form/form';

interface Financing {
    title: string;
    note: string | null;
    kind: 'zin' | 'pgb';
    startDate: string;
    endDate: string | null;
    count: number;
    limit: number | null;
    debtorId: number;
    ownerId: number | null;
}

const debtors: {id: number; name: string}[] = [];
const kinds: {id: 'zin' | 'pgb'; name: string}[] = [];
const draft = ref({} as Financing);
const {
    TextField,
    DateField,
    NumberField,
    SingleSelectField,
    ComboboxField,
    GroupSelectField,
    GroupComboboxField,
    RadioGroupField,
} = useForm({draft});
</script>
