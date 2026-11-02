import type {Ref} from 'vue';

import {nextTick, useId} from 'vue';

import type {FieldBinding} from '../types';
import type {FieldModel, SubmitOutcome, UseDraftForm, UseDraftFormOptions, UseForm, UseFormOptions} from './types';

import {createFormError, createFormLabel, fieldId, messageId} from './field';
import {useFormSubmit} from './form-submit';
import {readPath, writePath} from './path';
import {scrollToFirstError} from './scroll-to-first-error';
import {useValidationErrors} from './validation-errors';

// A draft typed `any` has every path, so its form would check no name. It gets `DraftTypeUnknown`
// instead, every member `never`: reading a member's value, calling `handleSubmit` or assigning the form to
// anything but a form is an error. It still fits `UseDraftForm` (as `never` did), because a helper generic
// over D returns the unresolved `DraftFormOf<D>`, which TypeScript accepts only when both branches fit.
// A shallowRef over a generic D is read as `any`, as TypeScript cannot read it as a Ref<D>; name the type
// there: useForm<D>({draft}).
type DraftTypeUnknown = {readonly [K in keyof UseForm]: never};
type DraftFormOf<D extends object> = unknown extends D ? DraftTypeUnknown : UseDraftForm<D>;

/**
 * The type of `useForm`: two call shapes, names as free strings, or, with a `draft`, the draft's paths.
 * Exported so a wrapper that configures `useForm` can be typed as `useForm` itself, keeping both shapes.
 */
// The overloads are a type; the one implementation below is cast to it, since an arrow function cannot
// declare overloads.
export interface UseFormCall {
    <D extends object>(options: UseDraftFormOptions<D>): DraftFormOf<D>;
    // `draft` refused here: a draft the first overload cannot take (not a ref) is an error, even from a
    // variable an excess-property check never sees, never a form with free names.
    <T extends string = string>(options?: UseFormOptions<T> & {draft?: never}): UseForm<T>;
}

const useFormBody = <T extends string = string>(
    options: UseFormOptions<T> & {draft?: Ref<object>} = {},
): UseForm<T> => {
    const {keyMapper, fields, scrollToError = true, idPrefix, draft} = options;
    const validation = useValidationErrors<T>({keyMapper, fields});
    const submit = useFormSubmit(validation);

    // Unique per form instance by default, so two forms with the same names never share an id.
    const unique = idPrefix === undefined ? {suffix: useId()} : {prefix: idPrefix};
    const id = (name: T): string => fieldId(name, unique);
    const message = (name: T): string | undefined => validation.errors.value[name] || undefined;

    const field = (name: T): FieldBinding | (FieldBinding & FieldModel<unknown>) => {
        const error = message(name);
        const wiring = {id: id(name), invalid: Boolean(error), describedby: error ? messageId(id(name)) : undefined};
        if (!draft) return wiring;

        return {
            ...wiring,
            modelValue: readPath(draft.value, name),
            'onUpdate:modelValue': (value: unknown) => writePath(draft.value, name, value),
        };
    };

    const handleSubmit = async (action: () => Promise<unknown>): Promise<SubmitOutcome> => {
        const outcome = await submit.handleSubmit(action);

        if (outcome === 'refused' && scrollToError) {
            // The lookup is by id, so a message element rendered only once refused must be in the DOM
            // first. Today Vue's flush already ran while the submit awaited, so no test can see this
            // tick go; it stays so the scroll never depends on that microtask order.
            // Stryker disable next-line all: equivalent while the flush precedes the resume (see above)
            await nextTick();
            scrollToFirstError(validation.errors.value, id as (name: string) => string);
        }

        return outcome;
    };

    return {
        ...validation,
        submitting: submit.submitting,
        handleSubmit,
        field,
        FormLabel: createFormLabel(id),
        FormError: createFormError(message, id),
    };
};

/**
 * One-call form composable. Wires `useValidationErrors` and `useFormSubmit` together so a page gets
 * the field-error bag, the refusal signal, the in-flight `submitting` (loading) flag, and a
 * validation-aware `handleSubmit` from a single call instead of composing two, plus everything that
 * links a field to the form.
 *
 * It needs no HTTP service: `handleSubmit` takes the 422 its own action rejects with, so a form holds
 * exactly its own requests' refusals; a dialog's never lands in the page form behind it. A 422 caught
 * outside a submit goes in with `take(error)`. Any other rejection propagates. The action must let the
 * 422 reject: one it catches itself never reaches the form. Reach for `useValidationErrors` /
 * `useFormSubmit` directly when you need one half without the other.
 *
 * `field(name)` is a field's link to the form: its id, whether it is invalid, and the message id its
 * `aria-describedby` names while it has one: `<TextInput v-bind="field('email')" v-model="email" />` +
 * `<FormError name="email" />`, with `<FormLabel name="email" label="E-mail" />` pointing at the same id.
 * `field()` reads the form when it is called, so call it in the render (the template), not once in
 * `setup()`: a result kept from setup never changes.
 *
 * Unless `scrollToError` is `false`, a submit that ends `'refused'` scrolls the first refused field into
 * view before it resolves, found by this form's own ids. Only a submit scrolls: a 422 handed to `take` or
 * a cleared bag never moves the page.
 *
 * With a `draft`, the field names are the draft's paths (`useForm({draft})` names `errors` and `fields` by
 * `Path<D>`), and `field(name)` also carries the value at that path and writes changes back into the
 * draft; without one they are free strings, or the union given as `T`.
 *
 * Call `useForm` in a component's `setup()`: its ids end in a part from Vue's `useId()`, unless a fixed
 * `idPrefix` is given. `useId()` counts per app, so two Vue apps mounted on one page need their own
 * `app.config.idPrefix` to keep their forms' ids apart.
 *
 * @param options `keyMapper`, `fields`, `scrollToError`, `idPrefix`, `draft` — see `UseFormOptions` and
 *                `UseDraftFormOptions`.
 */
// The cast sits here, apart from the body, so mutation testing reaches the body (Stryker does not
// mutate inside a type assertion).
export const useForm = useFormBody as UseFormCall;
