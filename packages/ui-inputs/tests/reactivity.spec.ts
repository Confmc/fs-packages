// @vitest-environment happy-dom

import {describe, expect, it} from 'vitest';
import {ref} from 'vue';

import {componentEl, ensureRefValueExists, MissingRefValue} from '../src/internal/reactivity';

describe('ensureRefValueExists', () => {
    it('returns the value when the ref is set', () => {
        const source = ref<number | undefined>(10);
        expect(ensureRefValueExists(source)).toBe(10);
    });

    it('throws a named MissingRefValue on undefined — not an anonymous TypeError', () => {
        const source = ref<number | undefined>(undefined);
        expect(() => ensureRefValueExists(source)).toThrow(MissingRefValue);
        expect(() => ensureRefValueExists(source)).toThrow(/isn't mounted yet/);
    });

    it('throws MissingRefValue on null (the unmounted-template-ref shape)', () => {
        const source = ref<HTMLElement | null>(null);
        expect(() => ensureRefValueExists(source)).toThrow(MissingRefValue);
    });

    it('names the error class for instanceof discrimination in consumer handlers', () => {
        const error = new MissingRefValue();
        expect(error.name).toBe('MissingRefValue');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('componentEl', () => {
    // The helper is structurally typed on `$el` alone — the specs hand it exactly that shape.
    const asInstance = (value: {$el?: unknown} | null): {$el?: unknown} | null => value;

    it('derives the root element from a mounted instance ($el)', () => {
        const element = document.createElement('ul');
        const instance = ref(asInstance({$el: element}));
        expect(componentEl(instance).value).toBe(element);
    });

    it('is null while the child is unmounted (v-if closed)', () => {
        const instance = ref(asInstance(null));
        expect(componentEl(instance).value).toBeNull();
    });

    it('is null when the instance has no resolved $el yet', () => {
        const instance = ref(asInstance({$el: undefined}));
        expect(componentEl(instance).value).toBeNull();
    });

    it('tracks mount reactively — the ref goes element → null as the child unmounts', () => {
        const element = document.createElement('ul');
        const instance = ref(asInstance({$el: element}));
        const el = componentEl(instance);
        expect(el.value).toBe(element);

        instance.value = null;
        expect(el.value).toBeNull();
    });
});
