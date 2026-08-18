<template>
    <component
        :is="as"
        v-bind="chassis"
        class="ui-pressable"
        :class="{'is-disabled': !native && disabled}"
        :aria-pressed="pressed"
        @click="onClick"
        @keydown="onKeydown"
        @keyup="onKeyup"
    >
        <slot>{{ label }}</slot>
    </component>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue';

// The root IS the interactive element here (unlike Checkbox/Switch, whose root is the <label>),
// so attrs must NOT be re-aimed: `aria-label`, `title`, `data-*`, a consumer's own `@click` —
// all fall through to the control that actually receives them. inheritAttrs stays on.

const {
    as = 'button',
    label,
    disabled = false,
} = defineProps<{
    /**
     * the element to render. Defaults to a real `<button>` — and it should stay one: a native
     * button supplies focusability, Enter/Space activation, disabled semantics and forced-colors
     * treatment for free and correctly, which is exactly what the 131 fleet-wide bare
     * `<div @click>` / `<span @click>` controls were missing.
     *
     * **The escape hatch is DISCOURAGED.** Pass another tag only where a button genuinely cannot
     * be used (a clickable `<tr>`, an element whose parent forbids interactive content). The
     * component then hand-rolls the full contract together — `role="button"`, `tabindex`, Enter
     * on keydown, Space on keyup, a disabled emulation — because half of it is worse than none.
     * Never point it at an element that is ALREADY activatable (`a[href]`, `summary`): the browser
     * would translate the keypress too and every handler would run twice.
     */
    as?: string;
    /** label text; the default slot overrides it (icon-only? supply `aria-label` via attrs). */
    label?: string;
    disabled?: boolean;
}>();

/**
 * Toggle mode, opt-in: bind `v-model:pressed` and the control conveys `aria-pressed` and flips
 * it on activation. Left unbound the attribute is ABSENT — a plain action button must not claim
 * toggle semantics.
 *
 * Unlike `Switch` (where `role="switch"` on a native checkbox lets the native checked state map
 * to `aria-checked`, so the component never sets it by hand), a `<button>` has NO native pressed
 * state: `aria-pressed` is the only conveyance there is, so setting it here is the honest move
 * rather than a double-set.
 *
 * The `| undefined` in the type and the explicit `default: undefined` are BOTH load-bearing, and
 * neither is decoration. Vue casts an ABSENT prop whose runtime type is Boolean to `false` — but
 * only when the prop declares no default at all. Without the default, every plain Pressable
 * renders `aria-pressed="false"` and announces itself as an un-pressed toggle (verified by
 * deleting it: the "no aria-pressed until v-model:pressed is bound" spec goes red with
 * `"false"`); without the widened type, `default: undefined` does not typecheck against
 * `DefineModelDefault<boolean>`.
 */
const pressed = defineModel<boolean | undefined>('pressed', {default: undefined});

const native = computed(() => as === 'button');

/** Per-path chassis: native semantics, or the hand-rolled equivalents the fallback must supply. */
const chassis = computed(() =>
    native.value
        ? {type: 'button', disabled}
        : {role: 'button', tabindex: disabled ? -1 : 0, 'aria-disabled': disabled || undefined},
);

// Space activates on keyUP natively, so keydown only arms it. The flag keeps a keyup that
// arrived without our own keydown (focus moved in mid-press) from activating.
const spaceArmed = ref(false);

/**
 * Whether THIS element must translate keys into activation. A native button already does it —
 * repeating it would fire every handler twice — and a disabled control does nothing at all.
 */
const handlesKeys = (): boolean => !native.value && !disabled;

const onClick = (): void => {
    // The disabled guard keeps synthetic dispatch honest (the Switch/Checkbox precedent): a real
    // browser never fires click on a disabled button, and the fallback path blocks the pointer in
    // CSS — but a programmatic dispatch reaches both.
    if (disabled) return;
    if (pressed.value !== undefined) pressed.value = !pressed.value;
};

const onKeydown = (event: KeyboardEvent): void => {
    if (!handlesKeys()) return;
    if (event.key === 'Enter') {
        event.preventDefault();
        // Dispatch a REAL click rather than calling the handler: that is what the browser does for
        // a native button, so the consumer's own fallthrough @click runs on the fallback path too.
        (event.currentTarget as HTMLElement).click();
    } else if (event.key === ' ') {
        event.preventDefault(); // a bare Space would scroll the page
        spaceArmed.value = true;
    }
};

const onKeyup = (event: KeyboardEvent): void => {
    if (!handlesKeys() || event.key !== ' ' || !spaceArmed.value) return;
    spaceArmed.value = false;
    (event.currentTarget as HTMLElement).click();
};
</script>
