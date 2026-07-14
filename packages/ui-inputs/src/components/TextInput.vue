<template>
    <input
        :id="id"
        :type="type"
        class="ui-control ui-input"
        :class="{'is-invalid': invalid}"
        :value="model"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedby"
        @input="model = ($event.target as HTMLInputElement).value"
    />
</template>

<script setup lang="ts">
const {type = 'text'} = defineProps<{
    id?: string;
    type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
    placeholder?: string;
    disabled?: boolean;
    /** invalid styling + aria; drive it from the field's error. */
    invalid?: boolean;
    /** id of the paired error element for `aria-describedby`. */
    describedby?: string;
}>();

const model = defineModel<string>({default: ''});
</script>
