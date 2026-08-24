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
});
