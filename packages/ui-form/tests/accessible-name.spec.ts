// @vitest-environment happy-dom
import type {Component} from 'vue';

import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h} from 'vue';

import Checkbox from '../src/components/Checkbox.vue';
import CheckboxGroup from '../src/components/CheckboxGroup.vue';
import Disclosure from '../src/components/Disclosure.vue';
import Pressable from '../src/components/Pressable.vue';
import RadioGroup from '../src/components/RadioGroup.vue';
import Switch from '../src/components/Switch.vue';
import {warnWhenUnnamed} from '../src/internal/accessible-name';

/**
 * The family members whose name is OPTIONAL in the types — each takes an optional `label` and a
 * slot that may render empty — so each can produce a focusable, correctly-roled, unnamed control.
 * The guard is asserted in BOTH directions on ALL of them: a false positive here would teach
 * consumers to ignore it, which costs more than the catch.
 *
 * Checkbox and Switch are the label-root shape: the attribute routes land on the re-aimed
 * `<input>` while the text sits in the wrapping `<label>`. The shared cases below already split
 * the two — the `label`/slot cases carry text and no attribute, the attribute cases carry an
 * attribute and no text — so a guard reading both routes off either single element fails one set.
 */
const CONTROLS = [
    {name: 'Pressable', component: Pressable as Component, props: {}, slot: 'default'},
    {name: 'Disclosure', component: Disclosure as Component, props: {id: 'details'}, slot: 'trigger'},
    {name: 'Checkbox', component: Checkbox as Component, props: {id: 'agree', modelValue: false}, slot: 'default'},
    {name: 'Switch', component: Switch as Component, props: {id: 'alerts', modelValue: false}, slot: 'default'},
] as const;

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe.each(CONTROLS)('$name — accessible-name guard', ({name, component, props, slot}) => {
    it('warns when neither the label prop nor the slot supplies content', () => {
        mount(component, {props});

        expect(warn).toHaveBeenCalledTimes(1); // once per instance, at mount
        const message = String(warn.mock.calls[0]?.[0]);
        expect(message).toContain(`<${name}>`);
        expect(message).toContain('WCAG 4.1.2');
        // Names every route out, so the warning is actionable without opening the source.
        for (const route of ['aria-label', 'aria-labelledby', 'title']) expect(message).toContain(route);
    });

    it('warns when the label is present but whitespace-only — a name has to be a name', () => {
        mount(component, {props: {...props, label: '   '}});

        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stays silent when the label prop names it', () => {
        mount(component, {props: {...props, label: 'Details'}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('stays silent when the slot names it', () => {
        mount(component, {props, slots: {[slot]: '<span>Rich</span>'}});

        expect(warn).not.toHaveBeenCalled();
    });

    // Icon-only controls are legitimate and MUST stay silent — each attribute route on its own.
    it.each(['aria-label', 'aria-labelledby', 'title'])('stays silent on %s alone', (attribute) => {
        mount(component, {props, attrs: {[attribute]: 'Show the details'}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('is stripped in production — the gate is `process.env.NODE_ENV`, not `import.meta.env`', () => {
        // `import.meta` is a syntax error in the CJS half of this package's dual-format dist, so
        // the Vite-idiomatic `import.meta.env.DEV` cannot be the gate here. Asserting the
        // production leg is what keeps a future "simplification" back to it from passing.
        vi.stubEnv('NODE_ENV', 'production');

        mount(component, {props});

        expect(warn).not.toHaveBeenCalled();
    });

    it('stays SILENT rather than crashing when NOTHING replaced the token and `process` is absent', () => {
        // A browser has no `process`. Vite and webpack substitute the token by default; rollup on
        // its own does NOT (it needs `@rollup/plugin-replace`), so an unreplaced token reaching a
        // browser is a real shipping state — and reading `.env` off a missing global there is a
        // ReferenceError at MOUNT, taking down the component whose entire job is accessibility.
        // Fails safe to silent, never to warning: a library must not warn into a host it cannot
        // identify.
        const original = Reflect.get(globalThis, 'process');
        Reflect.deleteProperty(globalThis, 'process');

        try {
            expect(() => mount(component, {props})).not.toThrow();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            Reflect.set(globalThis, 'process', original);
        }
    });

    it('stays SILENT rather than crashing on a PARTIAL shim — `process` present, `env` missing', () => {
        // `globalThis.process = {}` is a real browser-polyfill shape, and it is NOT closed by the
        // absent-`process` guard above: `typeof process` is 'object', so the `.env.NODE_ENV`
        // dereference runs and throws at mount. A shim without `env` is exactly "an environment
        // this package cannot read", so it must suppress on the same fail-safe-silent rule.
        const original = Reflect.get(globalThis, 'process');
        Reflect.set(globalThis, 'process', {});

        try {
            expect(() => mount(component, {props})).not.toThrow();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            Reflect.set(globalThis, 'process', original);
        }
    });

    it('WARNS on a shim carrying an empty `env` — an unset NODE_ENV is readable, not unreadable', () => {
        // The other side of the partial-shim guard, and the one that keeps it from over-reaching:
        // `{env: {}}` IS a readable environment that simply is not production, so the dev warning
        // must still fire. Suppressing here would silence every consumer whose bundler shims `env`
        // but leaves NODE_ENV unset — a far larger set than the one the guard exists for.
        const original = Reflect.get(globalThis, 'process');
        Reflect.set(globalThis, 'process', {env: {}});

        try {
            mount(component, {props});
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            Reflect.set(globalThis, 'process', original);
        }
    });
});

/**
 * `textContent` is NOT the accessible name. An `aria-hidden="true"` subtree contributes nothing to
 * the name computation, so counting it lets the exact shape this guard exists for — a control whose
 * only content is a decorative icon — silence the guard and ship unnamed. Both directions on both
 * controls: the filter must drop hidden content without dropping content beside it.
 */
describe.each(CONTROLS)('$name — aria-hidden content names nothing', ({component, props, slot}) => {
    it('WARNS when the only slot content is aria-hidden', () => {
        mount(component, {props, slots: {[slot]: '<span aria-hidden="true">★</span>'}});

        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stays silent when a hidden decoration sits BESIDE real text', () => {
        mount(component, {props, slots: {[slot]: '<span aria-hidden="true">★</span>Details'}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('stays silent on aria-hidden="false" — only the literal "true" hides a subtree', () => {
        mount(component, {props, slots: {[slot]: '<span aria-hidden="false">Details</span>'}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('descends through plain wrappers — nesting does not hide a name', () => {
        mount(component, {props, slots: {[slot]: '<span><b>Details</b></span>'}});

        expect(warn).not.toHaveBeenCalled();
    });

    it("WARNS when the slot renders nothing — a v-if'd-out child is not content", () => {
        mount(component, {props, slots: {[slot]: '<span v-if="false">Details</span>'}});

        expect(warn).toHaveBeenCalledTimes(1);
    });
});

/** The label-root pair can also be named from OUTSIDE — the `<label for>` their `id` exists to pair with. */
describe.each(CONTROLS.filter(({name}) => name === 'Checkbox' || name === 'Switch'))(
    '$name — an external <label for> names it',
    ({component, props}) => {
        const withExternalLabel = (text: string): Component =>
            defineComponent({render: () => [h('label', {for: props.id}, text), h(component, props)]});

        afterEach(() => {
            document.body.innerHTML = '';
        });

        it('stays silent when a paired external label carries text', () => {
            mount(withExternalLabel('Accept the terms'), {attachTo: document.body});

            expect(warn).not.toHaveBeenCalled();
        });

        it('WARNS when the paired external label is empty — pairing is not naming', () => {
            mount(withExternalLabel('  '), {attachTo: document.body});

            expect(warn).toHaveBeenCalledTimes(1);
        });

        it('lands the attribute routes on the INPUT, where the guard reads them', () => {
            const wrapper = mount(component, {props, attrs: {'aria-label': 'Accept the terms'}});

            expect(wrapper.element.hasAttribute('aria-label')).toBe(false);
            expect(wrapper.find('input').attributes('aria-label')).toBe('Accept the terms');
            expect(warn).not.toHaveBeenCalled();
        });
    },
);

/**
 * A fieldset group is named by its legend. The guard is the same defect one level up, and it has
 * its own wrong-element trap: the fieldset's own text includes every OPTION label, so reading
 * content off the fieldset would let the options silence a group whose question is missing.
 */
const OPTIONS = [
    {id: 1, name: 'Apple'},
    {id: 2, name: 'Pear'},
];
const GROUPS = [
    {name: 'CheckboxGroup', component: CheckboxGroup as Component, modelValue: []},
    {name: 'RadioGroup', component: RadioGroup as Component, modelValue: null},
] as const;

describe.each(GROUPS)('$name — accessible-name guard', ({name, component, modelValue}) => {
    const props = (label: string) => ({id: 'fruit', options: OPTIONS, optionLabel: 'name', label, modelValue});

    it('warns when the legend is empty, however well its options are named', () => {
        mount(component, {props: props('')});

        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0]?.[0]);
        expect(message).toContain(`<${name}>`);
        expect(message).toContain('legend');
    });

    it('warns when the legend is whitespace-only', () => {
        mount(component, {props: props('   ')});

        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stays silent when the label names the legend', () => {
        mount(component, {props: props('Fruit')});

        expect(warn).not.toHaveBeenCalled();
    });

    it.each(['aria-label', 'aria-labelledby', 'title'])('stays silent on %s on the fieldset alone', (attribute) => {
        mount(component, {props: props(''), attrs: {[attribute]: 'Fruit'}});

        expect(warn).not.toHaveBeenCalled();
    });

    // The required conveyance lives in the legend too (CheckboxGroup's sr-only `requiredLabel`), and
    // a status is not a name: "(required)" alone must not silence the guard.
    it('warns when the legend is empty on a REQUIRED group — the required text is not a name', () => {
        mount(component, {props: {...props(''), required: true}});

        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stays silent on a required group with a real label', () => {
        mount(component, {props: {...props('Fruit'), required: true}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('is stripped in production', () => {
        vi.stubEnv('NODE_ENV', 'production');

        mount(component, {props: props('')});

        expect(warn).not.toHaveBeenCalled();
    });
});

describe('warnWhenUnnamed — a non-labelable element', () => {
    it('reads the attribute routes alone when `labels` is null', () => {
        // The spec returns null from `labels` on a non-labelable element (a hidden input); happy-dom
        // returns an empty list instead, so the null is passed literally to reach that leg.
        const element = document.createElement('input');

        warnWhenUnnamed(element, 'Probe', 'content', null);
        expect(warn).toHaveBeenCalledTimes(1);

        element.setAttribute('aria-label', 'Named');
        warnWhenUnnamed(element, 'Probe', 'content', null);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
