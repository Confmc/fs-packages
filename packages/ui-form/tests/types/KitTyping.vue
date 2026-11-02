<!--
  Type test (see DraftTyping.vue): a form-bound control takes only a draft path of its own value type.
-->
<template>
    <TextField name="name" label="Naam" placeholder="Vul in" />
    <TextField name="code" label="Code" placeholder="Vul in" />
    <TextField name="goals.0.title" label="Doel" placeholder="Vul in" />
    <!-- @vue-expect-error a number path on a text field -->
    <TextField name="contractNumber" placeholder="Vul in" />
    <!-- @vue-expect-error a typo -->
    <TextField name="nmae" placeholder="Vul in" />
    <!-- @vue-expect-error name is required -->
    <TextField label="x" placeholder="Vul in" />
    <!-- @vue-expect-error the control's own props stay typed -->
    <TextField name="name" :placeholder="1" />
    <!-- a v-model at the call site overrides the draft (a proxy that converts), typed by the control's value -->
    <TextField name="name" v-model="free" placeholder="Vul in" />
    <!-- @vue-expect-error an override takes what the control writes -->
    <TextField name="name" v-model="count" placeholder="Vul in" />
    <FormField v-slot="{field}" name="contractNumber" label="Nummer">
        <TextInput v-bind="field" v-model="free" placeholder="Vul in" />
    </FormField>
    <!-- the slot's model is the value at the frame's name: a text path binds a text input -->
    <FormField v-slot="{field, model}" name="name" label="Naam" class="w-40">
        <TextInput v-bind="{...field, ...model}" placeholder="Vul in" />
    </FormField>
    <FormField v-slot="{field, model}" name="goals.0.title" label="Doel">
        <TextInput
            v-bind="field"
            :model-value="model.modelValue"
            placeholder="Vul in"
            @update:model-value="model['onUpdate:modelValue']"
        />
    </FormField>
    <FormField v-slot="{field, model}" name="contractNumber" label="Nummer">
        <!-- @vue-expect-error a number path's model on a text input -->
        <TextInput v-bind="{...field, ...model}" placeholder="Vul in" />
    </FormField>
    <!-- a proxy that converts takes the field alone, with its own v-model -->
    <FormField v-slot="{field}" name="contractNumber" label="Uren">
        <TextInput v-bind="field" v-model="hours" placeholder="Vul in" />
    </FormField>
    <!-- @vue-expect-error no model on a form without a draft -->
    <NamedFrame v-slot="{model}" name="email" label="E-mail">{{ model }}</NamedFrame>
    <!-- @vue-expect-error not a path of the draft -->
    <FormField name="nope" label="x" />
    <PlainText name="anything" v-model="free" placeholder="Vul in" />
    <NamedText name="email" v-model="free" placeholder="Vul in" />
    <!-- @vue-expect-error the value is what the control writes, on a form named by a union too -->
    <NamedText name="email" v-model="count" placeholder="Vul in" />
    <!-- @vue-expect-error the value is what the control writes -->
    <PlainText name="email" v-model="count" placeholder="Vul in" />
    <!-- @vue-expect-error not one of the form's names -->
    <NamedText name="emial" v-model="free" placeholder="Vul in" />
    <!-- @vue-expect-error not one of the form's names -->
    <NamedFrame name="emial" label="x" />
</template>

<script setup lang="ts">
import {ref} from 'vue';

import TextInput from '../../src/components/TextInput.vue';
import {useForm} from '../../src/form/form';

interface Contract {
    name: string | null;
    code: string;
    contractNumber: number | null;
    goals: {title: string | null}[];
}

const draft = ref<Contract>({name: null, code: '', contractNumber: null, goals: []});
const {TextField, FormField} = useForm({draft});

// without a draft, names are the form's (free strings, or the union given) and the value comes from v-model
const {TextField: PlainText} = useForm();
const {TextField: NamedText, FormField: NamedFrame} = useForm<'email' | 'name'>();
const free = ref<string | null>(null);
const count = ref(1);
const hours = ref<string | null>(null);
</script>
