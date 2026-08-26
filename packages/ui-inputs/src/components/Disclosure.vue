<template>
    <div class="ui-disclosure">
        <!-- The heading CONTAINS the button; it never behaves as one. The live shape this
             replaces is `<h2 @click="collapse?.toggle">` — a heading with a click handler is
             invisible to the keyboard and lies about its role. Pass `headingLevel` and the
             wrapper becomes a real <h2>…<h6> whose only child is the trigger, so the section
             keeps its place in the document outline AND the control is a real button. -->
        <component :is="headingTag" class="ui-disclosure__header">
            <!-- `@click` sits ABOVE the `$attrs` spread on purpose, and moving it back is a
                 regression. `mergeProps` preserves source order, so a consumer's fall-through
                 `onClick` arriving through `$attrs` would otherwise be merged AHEAD of ours and
                 run before `toggle` could stop it — leaving a disabled trigger that still runs
                 the consumer's handler. Measured in real Chromium; spec-pinned in the browser
                 suite, because happy-dom reports the defect as absent.

                 `type` rides INSIDE the spread rather than sitting above it as a static attribute,
                 and that is the same source-order rule pointing the other way: an attribute placed
                 before the spread LOSES to it, so a consumer's `type="submit"` beat the static
                 `type="button"` and made this trigger submit its surrounding form on toggle
                 (measured in Chromium: the form submitted AND the panel expanded). The bindings
                 below the spread — `class`, `:disabled`, `:aria-*` — already win by position. -->
            <button
                :id="id"
                ref="trigger"
                @click="toggle"
                v-bind="{...$attrs, type: 'button'}"
                class="ui-pressable ui-disclosure__trigger"
                :disabled="disabled"
                :aria-expanded="expanded"
                :aria-controls="panelId"
            >
                <slot name="trigger">{{ label }}</slot>
                <svg class="ui-disclosure__chevron" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" />
                </svg>
            </button>
        </component>

        <!-- The panel is always MOUNTED and hidden with v-show, never v-if: `aria-controls` is an
             IDREF, and one pointing at nothing names no relationship for assistive tech to expose.
             The APG disclosure pattern keeps the reference resolvable in both states, and
             `display: none` takes the collapsed content out of the accessibility tree — which
             `hidden`-as-an-attribute cannot guarantee once a consumer stylesheet sets a display.
             MEASURED, not assumed: axe-core reports a dangling aria-controls as neither a violation
             NOR an incomplete, so only the hand-written IDREF-resolution assertions in the specs
             catch a regression here. Cost: the slot's content mounts even while collapsed — wrap
             genuinely expensive content in your own `v-if`.

             No landmark role: a disclosure panel is not automatically a region, and stamping one
             on every instance would flood the landmark list. -->
        <div v-show="expanded" :id="panelId" class="ui-disclosure__panel">
            <slot />
        </div>
    </div>
</template>

<script setup lang="ts">
import {computed, onMounted, useTemplateRef} from 'vue';

import {warnWhenUnnamed} from '../internal/accessible-name';
import {ensureRefValueExists} from '../internal/reactivity';

// The root is the wrapper div, so attrs are re-aimed at the trigger button — the element that
// actually wants `aria-label`, `title`, `data-*` — per the family's fall-through contract
// (see Checkbox/Switch for the same re-aim off a non-interactive root).
defineOptions({inheritAttrs: false});

const {
    id,
    headingLevel,
    label,
    disabled = false,
} = defineProps<{
    /** stable id — the trigger's own id, and the stem the panel's `${id}-panel` derives from. */
    id: string;
    /** trigger text; the `trigger` slot overrides it for rich content. Supply one of the two — a
     *  chevron alone is not an accessible name, and the dev-only mount check warns when neither
     *  they nor `aria-label`/`aria-labelledby`/`title` names the trigger. */
    label?: string;
    /**
     * wraps the trigger in a real `<h1>`…`<h6>`. Omit it where the disclosure is not a section
     * heading (an inline "show more") — the wrapper is then a plain div and the outline is
     * untouched.
     */
    headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
    disabled?: boolean;
}>();

/**
 * Expansion is UI state, not form data, so — unlike the value-carrying family members whose model
 * is `required` — this one carries a default and works UNCONTROLLED out of the box: bind
 * `v-model:expanded` only when the parent needs to drive or observe it.
 */
const expanded = defineModel<boolean>('expanded', {default: false});

const headingTag = computed(() => (headingLevel === undefined ? 'div' : `h${headingLevel}`));

const panelId = computed(() => `${id}-panel`);

const trigger = useTemplateRef<HTMLElement>('trigger');

// `label` is optional and the `trigger` slot may render empty — leaving a trigger whose only
// content is the aria-hidden chevron, i.e. nothing at all for assistive tech. Dev-only,
// mount-time, once per instance.
onMounted(() =>
    warnWhenUnnamed(ensureRefValueExists(trigger), 'Disclosure', 'the `label` prop, `trigger`-slot content'),
);

const toggle = (event: MouseEvent): void => {
    if (disabled) {
        // Stopping — not returning — is the guard, the same shape `Pressable.onClick` uses. The
        // browser withholds a click on a disabled <button> only for USER ACTIVATION; a
        // `dispatchEvent` still runs every listener on it (measured in Chromium), and a consumer's
        // fall-through `@click` arrives through `$attrs` on the very same element. A bare early
        // return would leave that handler running on a trigger that is supposed to be inert.
        event.stopImmediatePropagation();
        return;
    }
    expanded.value = !expanded.value;
};
</script>
