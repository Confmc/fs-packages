import type {UseForm, UseFormOptions} from './types';

import {useFormSubmit} from './form-submit';
import {useScrollToFirstError} from './scroll-to-first-error';
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
 * With `scrollToError`, call it in a component's `setup()`: the scroll watcher stops on unmount.
 *
 * @param options `keyMapper`, `fields`, `scrollToError`, `scrollRoot`, `scrollTarget` — see `UseFormOptions`.
 */
export const useForm = <T extends string = string>(options: UseFormOptions<T> = {}): UseForm<T> => {
    const {keyMapper, fields, scrollToError = false, scrollRoot, scrollTarget} = options;
    const validation = useValidationErrors<T>({keyMapper, fields});
    const submit = useFormSubmit(validation);

    if (scrollToError) useScrollToFirstError(validation.errors, scrollRoot, scrollTarget);

    return {...validation, ...submit};
};
