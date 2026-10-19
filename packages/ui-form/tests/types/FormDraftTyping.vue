<!--
  Type test (see DraftTyping.vue): FormDraft<T> makes a record's draft bindable by every control.
-->
<template>
    <TextInput v-bind="field('name')" />
    <TextInput v-bind="field('startDate')" />
    <NumberInput v-bind="field('contractNumber')" />
    <SingleSelect v-bind="field('debtorId')" :options="debtors" option-label="name" />
    <MultiSelect v-bind="field('careLegislationIds')" :options="debtors" option-label="name" />
    <Checkbox v-bind="field('active')" label="Actief" />
    <TextInput v-bind="field('traject.notes')" />
    <TextInput v-bind="field('learningGoals.0.title')" />
    <!-- @vue-expect-error the record itself is not form state: its non-nullable string takes no null back -->
    <TextInput v-bind="raw('startDate')" />
</template>

<script setup lang="ts">
import {ref} from 'vue';

import type {FormDraft} from '../../src';

import Checkbox from '../../src/components/Checkbox.vue';
import MultiSelect from '../../src/components/MultiSelect.vue';
import NumberInput from '../../src/components/NumberInput.vue';
import SingleSelect from '../../src/components/SingleSelect.vue';
import TextInput from '../../src/components/TextInput.vue';
import {useForm} from '../../src/form/form';

interface Contract {
    readonly name: string | null;
    readonly contractNumber: number;
    readonly debtorId: number;
    readonly careLegislationIds: readonly number[];
    readonly active: boolean;
    readonly startDate: string;
    readonly signedAt: Date;
    readonly traject: {readonly notes: string};
    readonly learningGoals: readonly {readonly title: string}[];
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(): T => true as T;

// the shape FormDraft gives, field by field
expectType<Equal<FormDraft<Contract>['startDate'], string | null>>();
expectType<Equal<FormDraft<Contract>['contractNumber'], number | null>>();
expectType<Equal<FormDraft<Contract>['active'], boolean>>();
expectType<Equal<FormDraft<Contract>['careLegislationIds'], number[]>>();
expectType<Equal<FormDraft<Contract>['signedAt'], Date | null>>();
expectType<Equal<FormDraft<Contract>['traject'], {notes: string | null}>>();
expectType<Equal<FormDraft<Contract>['learningGoals'], {title: string | null}[]>>();

const debtors: {id: number; name: string}[] = [];
const draft = ref<FormDraft<Contract>>({
    name: null,
    contractNumber: null,
    debtorId: null,
    careLegislationIds: [],
    active: false,
    startDate: null,
    signedAt: null,
    traject: {notes: null},
    learningGoals: [],
});
// a draft is edited: readonly is gone
draft.value.careLegislationIds.push(1);
const {field} = useForm({draft});

const record = ref({} as Contract);
const {field: raw} = useForm({draft: record});
</script>
