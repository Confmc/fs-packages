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
import {computed, getCurrentInstance, onMounted, ref, useTemplateRef} from 'vue';

import {warnWhenUnnamed} from '../internal/accessible-name';
import {devWarningsSuppressed} from '../internal/dev-warning';
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

// Read in setup, where `<script setup>` guarantees an instance. `vnode.props` is null when the
// consumer passes nothing at all, which is itself the unbound case.
const vnodeProps = getCurrentInstance()?.vnode.props;

/**
 * Dev-only guard for the cost of the trade above: `defineModel` cannot tell "no model bound" from
 * "model bound, holding `undefined`", and `onClick` skips the assignment on `undefined` to keep an
 * UNBOUND Pressable from claiming toggle semantics. A consumer who binds a `ref<boolean>()` they
 * never initialised therefore gets a control that silently never toggles and never emits.
 *
 * The two cases ARE distinguishable, just not through the model ref: a binding passes an
 * `onUpdate:pressed` listener alongside the prop. Verified to hold for `v-model:pressed` AND for a
 * hand-written `:pressed` + `@update:pressed` pair, and to stay absent for both a bare `<Pressable>`
 * and `:pressed` with no listener — so this cannot fire on correct code.
 */
const warnWhenModelUninitialised = (): void => {
    if (devWarningsSuppressed()) return;
    if (pressed.value !== undefined) return;
    if (vnodeProps?.['onUpdate:pressed'] === undefined) return;

    console.warn(
        '[ui-inputs] <Pressable> has `v-model:pressed` bound to `undefined`, so it renders no ' +
            '`aria-pressed` and never toggles or emits. Initialise the bound ref to a boolean.',
    );
};

// `label` is optional and the default slot may render empty, so a consumer can end up with a
// focusable, correctly-roled, UNNAMED control. Dev-only, mount-time, once per instance.
onMounted(() => {
    warnWhenUnnamed(ensureRefValueExists(control), 'Pressable', 'the `label` prop, default-slot content');
    warnWhenModelUninitialised();
});

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

/**
 * Whether a key event belongs to a focusable DESCENDANT rather than to this control. A keyboard
 * event targets the FOCUSED element and then bubbles, so without this the fallback translates a
 * child's keys as its own: every Space typed into a nested `<input>` is `preventDefault()`ed and
 * converted into an activation of the row — the text box loses its spacebar entirely — and Enter
 * on a nested `<button>` activates the row instead of the button (measured, both).
 *
 * **This must NOT be applied to `onClick`, and the asymmetry is not an oversight.** A click
 * targets the element under the POINTER, so the ordinary `<Pressable as="div"><span>Label</span>`
 * shape legitimately has `target !== currentTarget` — the same check there would make the most
 * common use of the escape hatch stop responding to the mouse. Keys follow focus; clicks follow
 * the pointer. Both directions are spec-pinned, including a click on a non-focusable child.
 */
const isChildsOwnKey = (event: KeyboardEvent): boolean => event.target !== event.currentTarget;

const onClick = (event: MouseEvent): void => {
    if (disabled) {
        // Stopping — not returning — is what keeps the two paths from diverging. A real browser
        // dispatches NO click on a disabled <button>, so nothing downstream runs on the native
        // path; the fallback has no such protection (it stays fully in hit-testing, deliberately —
        // see the .is-disabled rule — and a programmatic dispatch reaches both paths anyway), so a
        // bare early return would leave a consumer's own fall-through @click running on a control
        // that is supposed to be inert.
        // Vue merges this handler ahead of the fallthrough one and patches the event so a stop
        // inside the merged array skips the rest — spec-pinned, not assumed.
        event.stopImmediatePropagation();
        return;
    }
    if (pressed.value !== undefined) pressed.value = !pressed.value;
};

const onKeydown = (event: KeyboardEvent): void => {
    if (isChildsOwnKey(event)) return;
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
    // Origin check AFTER the disarm, deliberately: a keyup from a child still clears a latch the
    // root armed (focus moved into a nested control mid-press), which is the conservative end of
    // the same stale-latch failure the disarm exists to close.
    if (isChildsOwnKey(event)) return;
    if (!handlesKeys() || !armed) return;
    (event.currentTarget as HTMLElement).click();
};
</script>
