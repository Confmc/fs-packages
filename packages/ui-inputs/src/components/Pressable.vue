<template>
    <component
        :is="as"
        ref="control"
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
import {computed, onMounted, ref, useTemplateRef} from 'vue';

import {warnWhenUnnamed} from '../internal/accessible-name';
import {ensureRefValueExists} from '../internal/reactivity';

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
    /** label text; the default slot overrides it (icon-only? supply `aria-label` via attrs — the
     *  dev-only mount check warns when no route names the control at all). */
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

const control = useTemplateRef<HTMLElement>('control');

// `label` is optional and the default slot may render empty, so a consumer can end up with a
// focusable, correctly-roled, UNNAMED control. Dev-only, mount-time, once per instance.
onMounted(() => warnWhenUnnamed(ensureRefValueExists(control), 'Pressable', 'the `label` prop, default-slot content'));

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

const onClick = (event: MouseEvent): void => {
    if (disabled) {
        // Stopping — not returning — is what keeps the two paths from diverging. A real browser
        // dispatches NO click on a disabled <button>, so nothing downstream runs on the native
        // path; the fallback has no such protection (its pointer block is CSS-only, and a
        // programmatic dispatch reaches both paths anyway), so a bare early return would leave a
        // consumer's own fall-through @click running on a control that is supposed to be inert.
        // Vue merges this handler ahead of the fallthrough one and patches the event so a stop
        // inside the merged array skips the rest — spec-pinned, not assumed.
        event.stopImmediatePropagation();
        return;
    }
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
    if (event.key !== ' ') return;
    // Disarm on EVERY Space keyup, before anything can bail out: a press interrupted by the
    // control going disabled mid-key would otherwise leave the latch set, and the next Space
    // keyup after re-enable — including the keyup of that same cancelled press — would activate.
    const armed = spaceArmed.value;
    spaceArmed.value = false;
    if (!handlesKeys() || !armed) return;
    (event.currentTarget as HTMLElement).click();
};
</script>
