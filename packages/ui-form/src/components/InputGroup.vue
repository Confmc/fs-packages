<template>
    <span class="ui-input-group">
        <span v-if="prepend" :id="prependId" class="ui-input-group__addon is-start">{{ prepend }}</span>
        <slot />
        <span v-if="append" :id="appendId" class="ui-input-group__addon is-end">{{ append }}</span>
    </span>
</template>

<script setup lang="ts">
import {computed, useId} from 'vue';

const {id, prepend, append} = defineProps<{
    /** text joined to the start of the control (`€`). */
    prepend?: string;
    /** text joined to the end of the control (`dagen`). */
    append?: string;
    /**
     * the control's id; the addons take `${id}-prepend` / `${id}-append`, so the control can name them
     * in its `aria-describedby` (the form-bound fields do that themselves).
     */
    id?: string;
}>();

const ownId = useId();
const prependId = computed(() => `${id ?? ownId}-prepend`);
const appendId = computed(() => `${id ?? ownId}-append`);
</script>
