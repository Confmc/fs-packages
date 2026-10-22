<template>
    <component
        :is="as"
        ref="control"
        class="ui-pressable"
        :class="{'is-disabled': !native && disabled, 'keeps-tag-display': keepsTagDisplay}"
        :aria-pressed="pressed"
        @click="onClick"
        @keydown="onKeydown"
        @keyup="onKeyup"
        v-bind="{...forwardedAttrs, ...chassis}"
    >
        <slot>{{ label }}</slot>
    </component>
</template>

<script setup lang="ts">
import {computed, getCurrentInstance, onMounted, ref, useAttrs, useTemplateRef, watch} from 'vue';

import {warnWhenUnnamed} from '../internal/accessible-name';
import {devWarningsSuppressed} from '../internal/dev-warning';
import {ensureRefValueExists} from '../internal/reactivity';

/**
 * The root IS the interactive element here (unlike Checkbox/Switch, whose root is the <label>), so
 * attrs must NOT be re-aimed: `aria-label`, `title`, `data-*`, a consumer's own `@click` — all
 * reach the control that actually receives them. They are routed by HAND rather than by
 * `inheritAttrs`, because Vue merges fallthrough attrs onto the root AFTER the template bindings
 * and, for every attribute except `class`/`style`, the fallthrough WINS. That let a consumer's
 * `type="submit"` beat the chassis `type="button"` and submit the surrounding form — the one thing
 * the `as` docblock below promises a Pressable never does.
 *
 * Two halves, and BOTH are load-bearing:
 *
 * - `{...$attrs, ...chassis}` resolves `chassis` last, so the chassis wins the attribute contest.
 * - The `v-bind` stays the LAST binding in the template. `mergeProps` concatenates handlers in
 *   SOURCE order, so a spread placed above `@click` would merge the consumer's listener FIRST and
 *   run it ahead of this component's own. The disabled-KEY guard no longer rides this ordering:
 *   `forwardedAttrs` withholds `onKeydown`/`onKeyup` from the spread entirely and this component
 *   invokes them by hand — see `runConsumerKeyHandler`.
 */
defineOptions({inheritAttrs: false});

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
     * Never point it at an element that is ALREADY activatable (`a[href]`, `summary`): the
     * component would hand-roll semantics the element already has. Development warns when it does.
     *
     * Compared case-insensitively wherever the component branches on it, because
     * `<component :is>` resolves HTML tag names case-INsensitively: `as="BUTTON"` renders a
     * genuine native button and must take the native path with it.
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

/**
 * The rendered tag, normalised. `<component :is>` resolves an HTML tag name case-insensitively,
 * so `as="BUTTON"` mounts a real `<button>`; a case-SENSITIVE `=== 'button'` then read `false`
 * and handed that button the fallback chassis — no `type="button"` (the default type is SUBMIT)
 * and no native `disabled`. Only the comparisons normalise: `as` is still rendered verbatim,
 * because a lowercased string would stop resolving a registered component name.
 */
const tag = computed(() => as.toLowerCase());

const native = computed(() => tag.value === 'button');

/**
 * Tags whose parent's layout algorithm requires the child's own `display` — a `<tr>` forced to
 * `inline-flex` stops being a table row and its cells lose their table boxes. The clickable
 * `<tr>` is the documented `as` example, so the chassis must not paint over it.
 */
const STRUCTURAL_DISPLAY_TAGS = new Set([
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
    'caption',
    'colgroup',
    'col',
]);

const keepsTagDisplay = computed(() => STRUCTURAL_DISPLAY_TAGS.has(tag.value));

/** Tags the browser activates by itself, from both the pointer and the keyboard. */
const SELF_ACTIVATING_TAGS = new Set(['a', 'summary']);

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
 * hand-written `:pressed` + `@update:pressed` pair, and to stay absent for both a bare <Pressable>
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

/**
 * Dev-only bound on the `as` escape hatch. Aiming it at an element the browser already activates
 * gives that element a hand-rolled `role="button"` and a second Enter/Space translation on top of
 * the one it already has, and on the disabled path a native default action the fallback chassis
 * has no `disabled` to withhold. The prohibition was documentation-only; documentation is the
 * weakest rung of the enforcement ladder and every review round found another leak below it.
 *
 * Asserted against the RENDERED element rather than the prop, so `as="a"` without an `href` — an
 * anchor that activates nothing — stays silent. A warning that fires on correct code would cost
 * this one its authority, exactly as it would the accessible-name guard.
 */
const warnWhenSelfActivating = (element: HTMLElement): void => {
    if (devWarningsSuppressed()) return;

    const rendered = element.tagName.toLowerCase();
    if (!SELF_ACTIVATING_TAGS.has(rendered)) return;
    if (rendered === 'a' && !element.hasAttribute('href')) return;

    console.warn(
        `[ui-inputs] <Pressable as="${as}"> aims the escape hatch at an element the browser ` +
            'already activates, so it now carries a hand-rolled `role="button"` and a second ' +
            'key-to-click translation on top of its own. Render a `<button>`, or an element that ' +
            'activates nothing.',
    );
};

// `label` is optional and the default slot may render empty, so a consumer can end up with a
// focusable, correctly-roled, UNNAMED control. Dev-only, mount-time, once per instance.
onMounted(() => {
    const element = ensureRefValueExists(control);
    warnWhenUnnamed(element, 'Pressable', 'the `label` prop, default-slot content');
    warnWhenModelUninitialised();
    warnWhenSelfActivating(element);
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
 * Whether a key event belongs to a focusable DESCENDANT rather than to this control. A keyboard
 * event targets the FOCUSED element and then bubbles, so without this the fallback translates a
 * child's keys as its own: every Space typed into a nested `<input>` is `preventDefault()`ed and
 * converted into an activation of the row — the text box loses its spacebar entirely — and Enter
 * on a nested `<button>` activates the row instead of the button (measured, both).
 *
 * **This must NOT be applied to the click guard, and the asymmetry is not an oversight.** A click
 * targets the element under the POINTER, so the ordinary `<Pressable as="div"><span>Label</span>`
 * shape legitimately has `target !== currentTarget` — the same check there would make the most
 * common use of the escape hatch stop responding to the mouse. Keys follow focus; clicks follow
 * the pointer. Both directions are spec-pinned, including a click on a non-focusable child.
 */
const isChildsOwnKey = (event: KeyboardEvent): boolean => event.target !== event.currentTarget;

/**
 * Disabled inertness for clicks, in the CAPTURE phase — the only phase that reaches a click
 * before the element it landed on. Three things follow from that and none of them from a
 * bubble-phase stop:
 *
 * - A click on a DESCENDANT (a nested `<a href>`, a nested `<button @click>`) is stopped before
 *   the child's own handler runs. A bubble-phase stop on the root arrives after it.
 * - `preventDefault()` withholds the element's own default action, which is what keeps a disabled
 *   `as="a href"` from navigating: the fallback chassis is role/tabindex/aria-disabled only, so
 *   there is no native `disabled` to withhold it.
 * - The consumer's fall-through `@click` is stopped without depending on Vue's handler merge
 *   order — a capture listener on the target runs before EVERY bubble listener on it.
 *
 * The browser is no help on either path: it withholds a click on a disabled <button> only for
 * USER ACTIVATION (`dispatchEvent` still runs every listener on one — measured in Chromium), and
 * the fallback stays fully in hit-testing deliberately, see the `.is-disabled` rule. Making the
 * subtree inert while disabled is also what `role="button"` already claims: its descendants are
 * presentational to assistive tech, so a live interactive child inside one is the defect.
 */
const onClickCapture = (event: Event): void => {
    if (!disabled) return;

    event.preventDefault();
    event.stopImmediatePropagation();
};

/**
 * Attached NATIVELY rather than as a second `@click.capture` binding, and that is load-bearing:
 * Vue stamps `_vts` on the first of ITS OWN invokers to see an event and then skips every invoker
 * attached no later than that stamp, so a template capture binding makes the element's bubble
 * invoker drop the consumer's fall-through `@click` whenever the click lands in the same
 * millisecond as the patch. Measured — the ENABLED-arm specs went intermittently red on it, which
 * is the shape a real consumer would hit as an unreproducible dropped click.
 *
 * Sync flush, because a Pressable can be clicked in the same tick it mounts; re-aimed on the ref
 * because `<component :is>` builds a NEW element when `as` changes, and the old listener dies with
 * the old element.
 */
watch(
    control,
    (element, previous) => {
        previous?.removeEventListener('click', onClickCapture, true);
        element?.addEventListener('click', onClickCapture, true);
    },
    {flush: 'sync'},
);

const onClick = (): void => {
    if (pressed.value !== undefined) pressed.value = !pressed.value;
};

/**
 * The consumer's own `@keydown`/`@keyup` are withheld from the fallthrough spread and invoked by
 * hand at the end of this component's handlers. That indirection IS the disabled-key guard, and it
 * exists because the DOM has no primitive that silences a sibling listener on one node without also
 * halting the event's climb. `stopImmediatePropagation()` bought fall-through inertness at the
 * price of every ANCESTOR: a disabled fallback is mouse-focusable at `tabindex="-1"` and stays in
 * hit-testing deliberately, so an Escape pressed on one died at the control instead of reaching the
 * dialog around it. Declining to call a handler this component holds itself costs ancestors
 * nothing. (PR #211, thread r3861464309.)
 *
 * Only the BUBBLE-phase pair is intercepted. `onKeydownCapture`/`onKeydownOnce` and friends stay in
 * the spread and still fire while disabled — a capture listener runs before this component sees the
 * event at all, so covering them would need the very propagation stop this removes.
 */
const attrs = useAttrs();

const forwardedAttrs = computed(() => {
    const {onKeydown: _withheldKeydown, onKeyup: _withheldKeyup, ...rest} = attrs;

    return rest;
});

/**
 * Replays what Vue's own invoker does for a MERGED handler array, using only public DOM API: a
 * nested fallthrough (a wrapper component spreading its `$attrs` into a Pressable) arrives here as
 * an array, and Vue's array path skips the remainder once an earlier handler calls
 * `stopImmediatePropagation()`. Hand-invoking without this would start running handlers the
 * consumer had already stopped.
 */
const runConsumerKeyHandler = (name: 'onKeydown' | 'onKeyup', event: KeyboardEvent): void => {
    type KeyHandler = (event: KeyboardEvent) => void;
    const bound = attrs[name] as KeyHandler | KeyHandler[] | undefined;
    if (!bound) return;

    if (!Array.isArray(bound)) {
        bound(event);
        return;
    }

    let stopped = false;
    const propagate = event.stopImmediatePropagation;
    event.stopImmediatePropagation = function patched(): void {
        stopped = true;
        propagate.call(event);
    };

    try {
        for (const handler of bound) {
            if (stopped) break;
            handler(event);
        }
    } finally {
        Reflect.deleteProperty(event, 'stopImmediatePropagation');
    }
};

/** The component's own key-to-click translation, with no consumer or disabled leg of its own. */
const translateKeydown = (event: KeyboardEvent): void => {
    if (isChildsOwnKey(event)) return;
    // A native button already translates Enter/Space itself; repeating it fires every handler twice.
    if (native.value) return;

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

const onKeydown = (event: KeyboardEvent): void => {
    // Deaf while disabled, and that covers EVERY key rather than the two translated ones: the leak
    // is the consumer's handler, which does not care which key produced it. Reachable, not
    // theoretical — see the mouse-focusable note above. Propagation is untouched by design.
    if (disabled) return;

    translateKeydown(event);
    runConsumerKeyHandler('onKeydown', event);
};

const onKeyup = (event: KeyboardEvent): void => {
    const isSpace = event.key === ' ';
    // Disarm on EVERY Space keyup, before anything can bail out: a press interrupted by the
    // control going disabled mid-key would otherwise leave the latch set, and the next Space
    // keyup after re-enable — including the keyup of that same cancelled press — would activate.
    const armed = isSpace && spaceArmed.value;
    if (isSpace) spaceArmed.value = false;

    // The disabled leg sits AFTER the disarm, deliberately: the latch must be cleared even on the
    // keyup the control is about to go inert for.
    if (disabled) return;

    if (!isChildsOwnKey(event) && !native.value && armed) {
        (event.currentTarget as HTMLElement).click();
    }

    runConsumerKeyHandler('onKeyup', event);
};
</script>
