// @vitest-environment happy-dom
import type {Component} from 'vue';

import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Disclosure from '../src/components/Disclosure.vue';
import Pressable from '../src/components/Pressable.vue';

/**
 * `Pressable` and `Disclosure` are the two family members whose name is OPTIONAL in the types —
 * both take an optional `label` and a slot that may render empty — so both can produce a
 * focusable, correctly-roled, unnamed control. The guard is asserted in BOTH directions on BOTH:
 * a false positive here would teach consumers to ignore it, which costs more than the catch.
 */
const CONTROLS = [
    {name: 'Pressable', component: Pressable as Component, props: {}, slot: 'default'},
    {name: 'Disclosure', component: Disclosure as Component, props: {id: 'details'}, slot: 'trigger'},
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
