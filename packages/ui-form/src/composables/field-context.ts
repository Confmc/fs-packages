import type {ComputedRef, MaybeRefOrGetter, Ref} from 'vue';

import {computed, inject, provide, toValue, useId} from 'vue';

import type {ValidationErrors} from '../form/types';

/** Where a form's fields read their errors: a ref to the bag (useForm's `errors`) or a getter. */
type FieldErrorSource = Readonly<Ref<ValidationErrors>> | (() => ValidationErrors);

/** The wiring a `FormField` hands the control inside it. */
export interface FieldControl {
    id: string;
    invalid: boolean;
    describedby: string | undefined;
    required: boolean;
}

/** The props a control was given itself; `undefined` means "not given", so the field decides. */
export interface OwnControlProps {
    id?: string;
    invalid?: boolean;
    describedby?: string;
    required?: boolean;
}

// String keys, not Symbols: a top-level `Symbol()` is a call at module load, which the side-effect
// gate rejects (scripts/lint-pkg.mjs). Namespaced, so no host key collides with them.
const FIELD_ERRORS = '@script-development/ui-form:field-errors';
const FIELD_CONTROL = '@script-development/ui-form:field-control';

/**
 * Provide a form's error bag to every `FormField` below the calling component, so a field finds its
 * message by `name`. The nearest provider wins. The consumer still owns the bag; the package only
 * reads it by name, verbatim, so `name` must equal the bag key (after fs-form's `keyMapper`).
 */
export const provideFieldErrors = (source: FieldErrorSource): void => {
    provide(
        FIELD_ERRORS,
        computed(() => toValue(source)),
    );
};

/** The nearest provided error bag, or `null` outside any form. */
export const injectFieldErrors = (): ComputedRef<ValidationErrors> | null =>
    inject<ComputedRef<ValidationErrors> | null>(FIELD_ERRORS, null);

/**
 * A field's message, read by name from the nearest provided error bag (`provideFieldErrors`).
 * `undefined` when there is no name, no bag, or no message: an empty string is no message, the rule
 * `FormField` uses. `FormField` reads its own message through this; a custom field layout, a message
 * rendered elsewhere, or a test double can call it too.
 */
export const useFieldError = (name: MaybeRefOrGetter<string | undefined>): ComputedRef<string | undefined> => {
    const errors = injectFieldErrors();

    return computed(() => {
        const key = toValue(name);
        if (key === undefined) return undefined;

        return errors?.value[key] || undefined;
    });
};

/** Hand the wiring to the controls below a field. Package-internal: `FormField` calls it. */
export const provideFieldControl = (control: ComputedRef<FieldControl>): void => {
    provide(FIELD_CONTROL, control);
};

/**
 * A control's resolved wiring: each prop the control was given wins, an explicit `false` included;
 * otherwise the enclosing `FormField` decides; outside a field the control gets its own id and no
 * mark. Declare `invalid` and `required` with an `undefined` default, or Vue casts an absent boolean
 * prop to `false` and the field never reaches the control.
 *
 * `isolate` is for a control that renders other controls (a group): it takes the field's wiring
 * itself and hides it from its members, so they do not repeat the group's `aria-describedby`.
 */
export const useFieldControl = (
    own: () => OwnControlProps,
    options: {isolate?: boolean} = {},
): ComputedRef<FieldControl> => {
    const field = inject<ComputedRef<FieldControl> | null>(FIELD_CONTROL, null);
    const ownId = useId();

    if (options.isolate) provide(FIELD_CONTROL, null);

    return computed(() => {
        const given = own();

        return {
            id: given.id ?? field?.value.id ?? ownId,
            invalid: given.invalid ?? field?.value.invalid ?? false,
            describedby: given.describedby ?? field?.value.describedby,
            required: given.required ?? field?.value.required ?? false,
        };
    });
};
