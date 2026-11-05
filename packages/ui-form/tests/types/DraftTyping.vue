<!--
  Type test, not a runtime spec: `npm run typecheck` checks this file with vue-tsc
  (tsconfig.types.json). Every @vue-expect-error / @ts-expect-error marks a mistake the types must
  reject; if one stops being rejected, its marker is unused and the typecheck fails.
-->
<template>
    <TextInput v-bind="field('firstName')" placeholder="Voornaam" />
    <TextInput v-bind="field('learningGoals.0.title')" placeholder="Titel" />
    <!-- @vue-expect-error a number path on a text control -->
    <TextInput v-bind="field('age')" placeholder="Leeftijd" />
    <!-- @vue-expect-error not a path of the draft -->
    <TextInput v-bind="field('frstName')" placeholder="Voornaam" />
    <!-- a non-nullable string binds: the text control writes a string back, never null -->
    <TextInput v-bind="field('code')" placeholder="Code" />
    <FormLabel name="learningGoals.0.title" label="Titel" required />
    <FormError name="learningGoals.0.title" />
    <!-- @vue-expect-error FormLabel takes only paths of the draft -->
    <FormLabel name="nope" label="x" />
    <!-- @vue-expect-error FormError takes only paths of the draft -->
    <FormError name="nope" />
</template>

<script setup lang="ts">
import {ref} from 'vue';

import TextInput from '../../src/components/TextInput.vue';
import {useForm} from '../../src/form/form';

interface Goal {
    title: string | null;
}
interface Draft {
    firstName: string | null;
    code: string;
    age: number | null;
    learningGoals: Goal[];
}

const draft = ref<Draft>({firstName: null, code: '', age: null, learningGoals: []});
const {field, FormLabel, FormError} = useForm({draft});
</script>
