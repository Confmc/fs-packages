import {nextTick} from 'vue';

import type {SubmitOutcome, UseDraftForm, UseDraftFormOptions, UseForm, UseFormOptions} from './types';

import {useFormSubmit} from './form-submit';
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

// Two call shapes: names are free strings, or, with a `draft`, the draft's paths. The overloads are a
// type; the one implementation below is cast to it, since an arrow function cannot declare overloads.
export interface UseFormCall {
    <D extends object>(options: UseDraftFormOptions<D>): DraftFormOf<D>;
    // `draft` refused here: a draft the first overload cannot take (not a ref) is an error, even from a
    // variable an excess-property check never sees, never a form with free names.
    <T extends string = string>(options?: UseFormOptions<T> & {draft?: never}): UseForm<T>;
}

const useFormBody = <T extends string = string>(options: UseFormOptions<T> = {}): UseForm<T> => {
    const {keyMapper, fields, scrollToError = false, scrollRoot, scrollTarget} = options;
    const validation = useValidationErrors<T>({keyMapper, fields});
    const submit = useFormSubmit(validation);

    const handleSubmit = async (action: () => Promise<unknown>): Promise<SubmitOutcome> => {
        const outcome = await submit.handleSubmit(action);

        if (outcome === 'refused' && scrollToError) {
            // The refused fields are marked once the DOM shows the new bag.
            await nextTick();
            scrollToFirstError(validation.errors.value, scrollRoot, scrollTarget);
        }

        return outcome;
    };

    return {...validation, submitting: submit.submitting, handleSubmit};
};

/**
 * One-call form composable. Wires `useValidationErrors` and `useFormSubmit` together so a page gets
 * the field-error bag, the refusal signal, the in-flight `submitting` (loading) flag, and a
 * validation-aware `handleSubmit` from a single call instead of composing two.
 *
 * It needs no HTTP service: `handleSubmit` takes the 422 its own action rejects with, so a form holds
 * exactly its own requests' refusals; a dialog's never lands in the page form behind it. A 422 caught
 * outside a submit goes in with `take(error)`. Any other rejection propagates. The action must let the
 * 422 reject: one it catches itself never reaches the form. Reach for `useValidationErrors` /
 * `useFormSubmit` directly when you need one half without the other.
 *
 * With `scrollToError`, a submit that ends `'refused'` scrolls the first invalid field into view before
 * it resolves. Only a submit scrolls: a 422 handed to `take` or a cleared bag never moves the page.
 *
 * With a `draft`, the field names are the draft's paths (`useForm({draft})` names `errors` and `fields` by
 * `Path<D>`); without one they are free strings, or the union given as `T`.
 *
 * @param options `keyMapper`, `fields`, `scrollToError`, `scrollRoot`, `scrollTarget`, `draft` — see
 *                `UseFormOptions` and `UseDraftFormOptions`.
 */
// The cast sits here, apart from the body, so mutation testing reaches the body (Stryker does not
// mutate inside a type assertion).
export const useForm = useFormBody as UseFormCall;
