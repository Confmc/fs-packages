<template>
    <span class="ui-input-group">
        <span v-if="prepend" :id="`${id}-prepend`" class="ui-input-group__addon is-start">{{ prepend }}</span>
        <slot />
        <span v-if="append" :id="`${id}-append`" class="ui-input-group__addon is-end">{{ append }}</span>
    </span>
</template>

<script setup lang="ts">
defineProps<{
    /**
     * the control's id; the addons take `${id}-prepend` / `${id}-append`, so the control can name them
     * in its `aria-describedby`.
     */
    id: string;
    /** text joined to the start of the control (`€`). */
    prepend?: string;
    /** text joined to the end of the control (`days`). */
    append?: string;
}>();
</script>
