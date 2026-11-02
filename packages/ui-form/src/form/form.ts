import {nextTick} from 'vue';

import type {SubmitOutcome, UseForm, UseFormOptions} from './types';

import {useFormSubmit} from './form-submit';
import {scrollToFirstError} from './scroll-to-first-error';
import {useValidationErrors} from './validation-errors';

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
 * @param options `keyMapper`, `fields`, `scrollToError`, `scrollRoot`, `scrollTarget` — see `UseFormOptions`.
 */
export const useForm = <T extends string = string>(options: UseFormOptions<T> = {}): UseForm<T> => {
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
