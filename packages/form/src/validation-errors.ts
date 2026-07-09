import type {HttpService} from '@script-development/fs-http';
import type {Ref} from 'vue';

import {guarded} from '@script-development/fs-http';
import {onUnmounted, ref} from 'vue';

import type {UseValidationErrors, UseValidationErrorsOptions, ValidationErrors} from './types';

const HTTP_UNPROCESSABLE_ENTITY = 422;

const toFieldErrorMap = (data: unknown): Record<string, string[]> => {
    const errors = (data as {errors?: unknown} | null | undefined)?.errors;
    if (typeof errors !== 'object' || errors === null) return {};

    return errors as Record<string, string[]>;
};

const mapFieldErrors = <T extends string>(
    fieldErrors: Record<string, string[]>,
    keyMapper: (key: string) => string,
): ValidationErrors<T> =>
    Object.fromEntries(
        Object.entries(fieldErrors).map(([key, messages]) => [keyMapper(key), messages[0]]),
    ) as ValidationErrors<T>;

const identity = (key: string): string => key;

/**
 * Register a 422-only response-error middleware on `httpService` that binds
 * backend validation errors into a reactive field-error bag, keyed to the first
 * message per field. Automatically unregisters on component unmount.
 *
 * The middleware body is wrapped with fs-http's `guarded()` so a throwing
 * `keyMapper` (or any parse hiccup) cannot reject a resolved request nor mask
 * the real API error — fs-form is a well-behaved fs-http consumer per the
 * Middleware Sync Contract (Architectural Principle #8).
 *
 * @param httpService the fs-http service whose error responses to observe.
 * @param options     `keyMapper` remaps raw backend field keys (default identity).
 */
export const useValidationErrors = <T extends string = string>(
    httpService: HttpService,
    options: UseValidationErrorsOptions = {},
): UseValidationErrors<T> => {
    const {keyMapper = identity} = options;
    const errors = ref<ValidationErrors<T>>({}) as Ref<ValidationErrors<T>>;

    const clearErrors = (): void => {
        errors.value = {};
    };

    const unregister = httpService.registerResponseErrorMiddleware(
        guarded((error) => {
            const response = error.response;
            if (response?.status !== HTTP_UNPROCESSABLE_ENTITY) return;

            errors.value = mapFieldErrors<T>(toFieldErrorMap(response.data), keyMapper);
        }),
    );

    onUnmounted(unregister);

    return {errors, clearErrors};
};
