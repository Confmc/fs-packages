import type {Ref} from 'vue';

export class MissingRefValue extends Error {
    constructor() {
        super("Value from ref does not exist. Either it isn't mounted yet, or there is no value with this ref");

        this.name = 'MissingRefValue';
    }
}

/**
 * Loud accessor for a ref that is non-null by lifetime — a mounted template ref read from a
 * handler that only runs while the component is mounted. Returns the value; throws a named
 * `MissingRefValue` when the lifetime assumption is broken, instead of the anonymous
 * `TypeError` a bare `!` assertion produces at the same point. Same states fail, but the
 * failure names the assumption — and a spec can assert it.
 *
 * Mirrors a consumer's helper of the same name (message included), so code migrating onto the
 * package reads familiar.
 */
export const ensureRefValueExists = <T>(refVariable: Readonly<Ref<T | undefined | null>>): T => {
    if (refVariable.value !== undefined && refVariable.value !== null) return refVariable.value;

    throw new MissingRefValue();
};
