import type {Ref} from 'vue';

import {computed} from 'vue';

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
 * Mirrors emmie's `helpers/reactivity` helper of the same name (message included), so the
 * eventual emmie migration onto ui-inputs reads familiar code.
 */
export const ensureRefValueExists = <T>(refVariable: Readonly<Ref<T | undefined | null>>): T => {
    if (refVariable.value !== undefined && refVariable.value !== null) return refVariable.value;

    throw new MissingRefValue();
};

/**
 * The root DOM element of a child component, as a ref — `null` while the child is unmounted
 * (e.g. behind `v-if`). A template ref on a component resolves to the INSTANCE, and the family
 * reserves `defineExpose` for public imperative handles (Combobox `focus()`), never internal
 * plumbing — so the element is derived from the instance's built-in `$el` instead of an
 * exposed ref. Requires a single-root child: OptionList's lone `<ul>` root is load-bearing.
 *
 * Structurally typed on `$el` alone (the repo duck-type convention): the SFC-generated
 * instance type is not assignable to nominal `ComponentPublicInstance` in a generic position.
 */
export const componentEl = (instance: Readonly<Ref<{$el?: unknown} | null>>): Readonly<Ref<HTMLElement | null>> =>
    computed(() => (instance.value?.$el as HTMLElement | undefined) ?? null);
