import type {Ref} from 'vue';

import {computed, onUnmounted, readonly, ref} from 'vue';

import type {FailedRequest, FormHttpService} from './http-contract';
import type {UseValidationErrors, UseValidationErrorsOptions, ValidationErrors} from './types';

import {loudlySwallowed} from './http-contract';

const HTTP_UNPROCESSABLE_ENTITY = 422;

const toFieldErrorMap = (data: unknown): Record<string, unknown> => {
    const errors = (data as {errors?: unknown} | null | undefined)?.errors;
    if (typeof errors !== 'object' || errors === null) return {};

    const prototype: unknown = Object.getPrototypeOf(errors);
    if (prototype !== Object.prototype && prototype !== null) return {};

    return errors as Record<string, unknown>;
};

const firstMessage = (messages: unknown): string | undefined =>
    Array.isArray(messages) && typeof messages[0] === 'string' ? messages[0] : undefined;

const identity = (key: string): string => key;

/**
 * Register a 422-only response-error middleware on `httpService` that binds
 * backend validation errors into a reactive field-error bag, keyed to the first
 * message per field. Automatically unregisters on component unmount, so call it
 * in a page or component `setup()` — never in a module-level store, where the
 * middleware is never unregistered and outlives every screen.
 *
 * Every accepted 422 raises `refused`, before the body is parsed, so a refusal
 * the bag cannot hold still reads as one (`refusedUnnamed`). A key is left out
 * of `errors` and listed in `unmapped` when `fields` does not name it or when
 * its value is not a list whose first entry is a string.
 *
 * The middleware body is loudly swallowed (the same contract as fs-http's
 * `guarded()`) so a throwing `keyMapper` (or any parse hiccup) cannot reject a
 * resolved request nor mask the real API error — a well-behaved fs-http consumer
 * per the Middleware Sync Contract (Architectural Principle #8). A throw leaves
 * `refused` true and `errors` / `unmapped` as they were.
 *
 * @param httpService the service whose error responses to observe (fs-http's `HttpService` fits).
 * @param options     `keyMapper` remaps raw backend field keys (default identity);
 *                    `fields` allow-lists the bag by mapped name (default every key);
 *                    `acceptWhen` gates which 422s are taken at all (default every one).
 */
export const useValidationErrors = <T extends string = string>(
    httpService: FormHttpService,
    options: UseValidationErrorsOptions<T> = {},
): UseValidationErrors<T> => {
    const {keyMapper = identity, fields, acceptWhen} = options;
    const allowed = fields === undefined ? undefined : new Set<string>(fields);
    const errors = ref<ValidationErrors<T>>({}) as Ref<ValidationErrors<T>>;
    const refused = ref(false);
    const unmapped = ref<readonly string[]>([]);

    const clearErrors = (): void => {
        errors.value = {};
        refused.value = false;
        unmapped.value = [];
    };

    const unregister = httpService.registerResponseErrorMiddleware(
        loudlySwallowed((error: FailedRequest) => {
            const response = error.response;
            if (response?.status !== HTTP_UNPROCESSABLE_ENTITY) return;
            if (acceptWhen && !acceptWhen()) return;

            refused.value = true;

            const kept: [string, string][] = [];
            const dropped: string[] = [];

            for (const [key, messages] of Object.entries(toFieldErrorMap(response.data))) {
                const field = keyMapper(key);
                const message = firstMessage(messages);

                if (message === undefined || (allowed && !allowed.has(field))) dropped.push(field);
                else kept.push([field, message]);
            }

            // fromEntries defines own properties; an assignment would hit the `__proto__` setter.
            const bag = Object.fromEntries(kept);

            errors.value = bag as ValidationErrors<T>;
            unmapped.value = [...new Set(dropped)].filter((field) => !Object.hasOwn(bag, field));
        }),
    );

    onUnmounted(unregister);

    return {
        errors,
        clearErrors,
        refused: readonly(refused),
        unmapped: readonly(unmapped),
        refusedUnnamed: computed(() => refused.value && Object.keys(errors.value).length === 0),
    };
};
