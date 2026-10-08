import type {Ref} from 'vue';

import {computed, readonly, ref} from 'vue';

import type {FormHttpService} from './http-contract';
import type {UseForm, UseFormOptions, ValidationErrors} from './types';

import {provideFieldErrors} from '../composables/field-context';
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
 * The form's fields find their own messages: every `FormField` with a `name` below the calling
 * component reads `fieldErrors` (the server's errors with the form's own `refuse`s on top). Two
 * forms in one component would provide over each other; give each its own component.
 *
 * @param httpService the fs-http service whose 422 responses to observe.
 * @param options     `keyMapper`, `fields`, `onlyWhileSubmitting`, `scrollToError`, `scrollRoot`,
 *                    `scrollTarget` — see `UseFormOptions`.
 */
export const useForm = <T extends string = string>(
    httpService: FormHttpService,
    options: UseFormOptions<T> = {},
): UseForm<T> => {
    const {onlyWhileSubmitting = false, scrollToError = false, scrollRoot, scrollTarget} = options;
    const validation = useValidationErrors<T>(httpService, {
        ...options,
        acceptWhen: onlyWhileSubmitting ? () => submit.submitting.value : undefined,
    });
    const submit = useFormSubmit(validation);

    const client = ref({}) as Ref<ValidationErrors<T>>;
    const fieldErrors = computed(() => ({...validation.errors.value, ...client.value}));
    provideFieldErrors(fieldErrors);

    if (scrollToError) useScrollToFirstError(fieldErrors, scrollRoot, scrollTarget);

    const refuse = (field: T, message: string): void => {
        client.value = {...client.value, [field]: message};
    };

    const setRefusals = (bag: ValidationErrors<T>): boolean => {
        const kept = Object.entries(bag).filter((entry): entry is [string, string] => Boolean(entry[1]));
        client.value = Object.fromEntries(kept) as ValidationErrors<T>;

        return kept.length > 0;
    };

    const withdraw = (...fields: T[]): void => {
        const next = {...client.value};
        for (const field of fields) delete next[field];
        client.value = next;
    };

    const clearClient = (): void => {
        client.value = {};
    };

    return {
        ...validation,
        ...submit,
        clientErrors: readonly(client) as Readonly<Ref<ValidationErrors<T>>>,
        fieldErrors,
        refuse,
        setRefusals,
        withdraw,
        clearClient,
    };
};
