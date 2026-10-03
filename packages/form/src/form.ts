import type {HttpService} from '@script-development/fs-http';

import type {UseForm, UseFormOptions} from './types';

import {useFormSubmit} from './form-submit';
import {useScrollToFirstError} from './scroll-to-first-error';
import {useValidationErrors} from './validation-errors';

/**
 * One-call form composable. Wires `useValidationErrors` and `useFormSubmit`
 * together so a page gets the field-error bag, the refusal signal, the in-flight
 * `submitting` (loading) flag, and a validation-aware `handleSubmit` from a single
 * call instead of composing two. Call it in a page or component `setup()`: the
 * 422 middleware unregisters on unmount.
 *
 * A 422 populates `errors` and raises `refused` via the internal response
 * middleware — also when the action catches the 422 itself — and is swallowed by
 * `handleSubmit`, so the form is preserved; any other rejection propagates. Reach
 * for the underlying `useValidationErrors` / `useFormSubmit` primitives directly
 * when you need one half without the other (e.g. a validation-less confirm action).
 *
 * @param httpService the fs-http service whose 422 responses to observe.
 * @param options     `keyMapper`, `fields`, `onlyWhileSubmitting`, `scrollToError`, `scrollRoot`,
 *                    `scrollTarget` — see `UseFormOptions`.
 */
export const useForm = <T extends string = string>(
    httpService: HttpService,
    options: UseFormOptions<T> = {},
): UseForm<T> => {
    const {onlyWhileSubmitting = false, scrollToError = false, scrollRoot, scrollTarget} = options;
    const validation = useValidationErrors<T>(httpService, {
        ...options,
        acceptWhen: onlyWhileSubmitting ? () => submit.submitting.value : undefined,
    });
    const submit = useFormSubmit(validation);

    if (scrollToError) useScrollToFirstError(validation.errors, scrollRoot, scrollTarget);

    return {...validation, ...submit};
};
