<!--
  Type test, not a runtime spec: `npm run typecheck` checks this file with vue-tsc
  (tsconfig.types.json). Every @vue-expect-error / @ts-expect-error marks a mistake the types must
  reject; if one stops being rejected, its marker is unused and the typecheck fails.
-->
<template>
    <TextInput v-bind="field('firstName')" />
    <TextInput v-bind="field('learningGoals.0.title')" />
    <NumberInput v-bind="field('age')" />
    <!-- @vue-expect-error a number path on a text control -->
    <TextInput v-bind="field('age')" />
    <!-- @vue-expect-error a string path on a number control -->
    <NumberInput v-bind="field('firstName')" />
    <!-- @vue-expect-error not a path of the draft -->
    <TextInput v-bind="field('frstName')" />
    <!-- @vue-expect-error a non-nullable string: the text control writes null back -->
    <TextInput v-bind="field('code')" />
    <FormLabel name="learningGoals.0.title" label="Titel" required />
    <FormError name="learningGoals.0.title" />
    <!-- @vue-expect-error FormLabel takes only paths of the draft -->
    <FormLabel name="nope" label="x" />
    <!-- @vue-expect-error FormError takes only paths of the draft -->
    <FormError name="nope" />
</template>

<script setup lang="ts">
import {ref} from 'vue';

import NumberInput from '../../src/components/NumberInput.vue';
import TextInput from '../../src/components/TextInput.vue';
import {useForm} from '../../src/form/form';

interface Goal {
    title: string | null;
}
interface Draft {
    firstName: string | null;
    code: string;
    age: number | null;
    born: Date;
    learningGoals: Goal[];
    parent: Draft | null;
}

const draft = ref<Draft>({firstName: null, code: '', age: null, born: new Date(), learningGoals: [], parent: null});
const {field, FormLabel, FormError, refuse, withdraw, setRefusals} = useForm({draft});

// the value and the write-back are typed by the path
const age: number | null = field('age').modelValue;
field('learningGoals.0.title')['onUpdate:modelValue']('Lezen');
// @ts-expect-error the write-back takes the path's value type
field('age')['onUpdate:modelValue']('x');

// every name-taking API is typed on the draft's paths, through nullable branches and array indexes
refuse('parent.learningGoals.3.title', 'Required');
withdraw('learningGoals.0.title', 'age');
setRefusals({firstName: 'Required'});
// @ts-expect-error a leaf's own members are not paths
refuse('born.getTime', 'x');
// @ts-expect-error not a path of the draft
withdraw('nope');

// without a draft, names are free strings and field() carries no value
const plain = useForm();
plain.refuse('anything', 'x');
// @ts-expect-error no draft, no modelValue
void plain.field('anything').modelValue;

void age;
</script>
