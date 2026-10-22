// @vitest-environment happy-dom
import type {AxiosResponseError, HttpService, ResponseErrorMiddlewareFunc} from '@script-development/fs-http';
import type {AxiosError} from 'axios';

import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent} from 'vue';

import type {UseValidationErrors, UseValidationErrorsOptions} from '../src';

import {useValidationErrors} from '../src';

type ErrorMiddleware = ResponseErrorMiddlewareFunc;

const createMockHttpService = () => {
    const errorMiddlewares: ErrorMiddleware[] = [];

    const triggerError = (status: number, data: unknown): void => {
        const error = {isAxiosError: true, response: {status, data}} as AxiosError<AxiosResponseError>;
        for (const middleware of errorMiddlewares) middleware(error);
    };

    const triggerBare = (): void => {
        const error = {isAxiosError: true, message: 'boom'} as AxiosError<AxiosResponseError>;
        for (const middleware of errorMiddlewares) middleware(error);
    };

    const registerResponseErrorMiddleware = vi.fn((fn: ErrorMiddleware) => {
        errorMiddlewares.push(fn);
        return () => {
            const index = errorMiddlewares.indexOf(fn);
            if (index > -1) errorMiddlewares.splice(index, 1);
        };
    });

    const httpService = {
        getRequest: vi.fn(),
        postRequest: vi.fn(),
        putRequest: vi.fn(),
        patchRequest: vi.fn(),
        deleteRequest: vi.fn(),
        downloadRequest: vi.fn(),
        previewRequest: vi.fn(),
        registerRequestMiddleware: vi.fn(() => () => {}),
        registerResponseMiddleware: vi.fn(() => () => {}),
        registerResponseErrorMiddleware,
    } as unknown as HttpService;

    return {httpService, triggerError, triggerBare, registerResponseErrorMiddleware, errorMiddlewares};
};

// Mount useValidationErrors inside a real component so onUnmounted fires.
const mountComposable = <T extends string = string>(httpService: HttpService, options?: UseValidationErrorsOptions) => {
    let result!: UseValidationErrors<T>;
    const wrapper = mount(
        defineComponent({
            setup() {
                result = useValidationErrors<T>(httpService, options);
                return () => null;
            },
        }),
    );
    return {wrapper, result: () => result};
};

const VALIDATION_BODY = {message: 'The given data was invalid.', errors: {first_name: ['Required', 'Too short']}};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useValidationErrors', () => {
    it('registers exactly one response-error middleware', () => {
        const {httpService, registerResponseErrorMiddleware} = createMockHttpService();
        mountComposable(httpService);

        expect(registerResponseErrorMiddleware).toHaveBeenCalledOnce();
    });

    it('binds the first message per field on a 422', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, VALIDATION_BODY);

        expect(result().errors.value).toEqual({first_name: 'Required'});
    });

    it('ignores non-422 responses', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(500, VALIDATION_BODY);

        expect(result().errors.value).toEqual({});
    });

    it('yields an empty bag when the 422 body has no errors object', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, {message: 'nope'});

        expect(result().errors.value).toEqual({});
    });

    it('yields an empty bag when errors is null', () => {
        const {httpService, triggerError} = createMockHttpService();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const {result} = mountComposable(httpService);

        triggerError(422, {errors: null});

        expect(result().errors.value).toEqual({});
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('yields an empty bag when errors is not an object', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, {errors: 'not-an-object'});

        expect(result().errors.value).toEqual({});
        expect(result().unmapped.value).toEqual([]);
    });

    it('treats an array errors container as no field map', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, {errors: [['Required'], ['Taken']]});

        expect(result().errors.value).toEqual({});
        expect(result().unmapped.value).toEqual([]);
        expect(result().refusedUnnamed.value).toBe(true);
    });

    it('binds from a null-prototype errors container', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);
        const errors = Object.assign(Object.create(null) as object, {email: ['Taken']});

        triggerError(422, {errors});

        expect(result().errors.value).toEqual({email: 'Taken'});
    });

    it('yields an empty bag when the 422 body is a non-object', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, 'plain string body');

        expect(result().errors.value).toEqual({});
    });

    it('yields an empty bag when the 422 body is null', () => {
        const {httpService, triggerError} = createMockHttpService();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const {result} = mountComposable(httpService);

        triggerError(422, null);

        expect(result().errors.value).toEqual({});
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('handles an error with no response at all', () => {
        const {httpService, triggerBare} = createMockHttpService();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const {result} = mountComposable(httpService);

        triggerBare();

        expect(result().errors.value).toEqual({});
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('applies a custom keyMapper to field keys', () => {
        const {httpService, triggerError} = createMockHttpService();
        const keyMapper = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
        const {result} = mountComposable(httpService, {keyMapper});

        triggerError(422, VALIDATION_BODY);

        expect(result().errors.value).toEqual({firstName: 'Required'});
    });

    it('uses raw keys by default (identity keyMapper)', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, {errors: {street_name: ['Required']}});

        expect(result().errors.value).toEqual({street_name: 'Required'});
    });

    it('clearErrors empties a populated bag', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, VALIDATION_BODY);
        expect(result().errors.value).toEqual({first_name: 'Required'});

        result().clearErrors();
        expect(result().errors.value).toEqual({});
    });

    it('unregisters the middleware on unmount', () => {
        const {httpService, errorMiddlewares} = createMockHttpService();
        const {wrapper} = mountComposable(httpService);

        expect(errorMiddlewares).toHaveLength(1);

        wrapper.unmount();

        expect(errorMiddlewares).toHaveLength(0);
    });

    it('swallows a throwing keyMapper via guarded() instead of rejecting', () => {
        const {httpService, triggerError} = createMockHttpService();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const keyMapper = () => {
            throw new Error('mapper blew up');
        };
        const {result} = mountComposable(httpService, {keyMapper});

        // The middleware body throws inside guarded(); it must not propagate.
        expect(() => triggerError(422, VALIDATION_BODY)).not.toThrow();
        expect(result().errors.value).toEqual({});
        expect(consoleError).toHaveBeenCalledOnce();
    });

    // The refusal is raised before the parse, so a 422 the bag cannot hold still reads as one.
    it('leaves a throwing keyMapper refused with an empty bag and nothing unmapped', () => {
        const {httpService, triggerError} = createMockHttpService();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const keyMapper = () => {
            throw new Error('mapper blew up');
        };
        const {result} = mountComposable(httpService, {keyMapper});

        triggerError(422, VALIDATION_BODY);

        expect(result().refused.value).toBe(true);
        expect(result().errors.value).toEqual({});
        expect(result().unmapped.value).toEqual([]);
        expect(result().refusedUnnamed.value).toBe(true);
    });

    it('keeps the previous bag and unmapped keys when the keyMapper throws on a later 422', () => {
        const {httpService, triggerError} = createMockHttpService();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const keyMapper = (key: string) => {
            if (key === 'boom') throw new Error('mapper blew up');
            return key;
        };
        const {result} = mountComposable(httpService, {keyMapper, fields: ['name']});

        triggerError(422, {errors: {name: ['Required'], token: ['Expired']}});
        triggerError(422, {errors: {boom: ['x']}});

        expect(result().refused.value).toBe(true);
        expect(result().errors.value).toEqual({name: 'Required'});
        expect(result().unmapped.value).toEqual(['token']);
    });

    describe('fields allow-list', () => {
        it('keeps every key when no allow-list is given', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerError(422, {errors: {email: ['Taken'], token: ['Expired']}});

            expect(result().errors.value).toEqual({email: 'Taken', token: 'Expired'});
            expect(result().unmapped.value).toEqual([]);
        });

        it('drops a key the allow-list does not name and keeps the ones it does', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService, {fields: ['email', 'name']});

            triggerError(422, {errors: {email: ['Taken'], name: ['Required'], token: ['Expired']}});

            expect(result().errors.value).toEqual({email: 'Taken', name: 'Required'});
            expect(result().unmapped.value).toEqual(['token']);
        });

        it('matches the allow-list against keyMapper output, not the raw key', () => {
            const {httpService, triggerError} = createMockHttpService();
            const keyMapper = (key: string) => (key === 'email_address' ? 'email' : key);
            const {result} = mountComposable(httpService, {keyMapper, fields: ['email']});

            triggerError(422, {errors: {email_address: ['Taken']}});

            expect(result().errors.value).toEqual({email: 'Taken'});
            expect(result().unmapped.value).toEqual([]);
        });

        it('reports a refusal that names no allowed field as refused with an empty bag', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService, {fields: ['password']});

            triggerError(422, {errors: {token: ['Expired']}});

            expect(result().refused.value).toBe(true);
            expect(result().errors.value).toEqual({});
            expect(result().unmapped.value).toEqual(['token']);
            expect(result().refusedUnnamed.value).toBe(true);
        });

        it('keeps the allowed fields of a mixed bag and lists the one it dropped', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService, {fields: ['email']});

            triggerError(422, {errors: {email: ['Taken'], token: ['Expired']}});

            expect(result().errors.value).toEqual({email: 'Taken'});
            expect(result().unmapped.value).toEqual(['token']);
            expect(result().refusedUnnamed.value).toBe(false);
        });
    });

    describe('refusal signal', () => {
        it('starts neither refused nor unmapped', () => {
            const {httpService} = createMockHttpService();
            const {result} = mountComposable(httpService);

            expect(result().refused.value).toBe(false);
            expect(result().unmapped.value).toEqual([]);
            expect(result().refusedUnnamed.value).toBe(false);
        });

        it('is raised by a 422 whose body carries no errors object at all', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerError(422, {message: 'nope'});

            expect(result().refused.value).toBe(true);
            expect(result().refusedUnnamed.value).toBe(true);
        });

        it('is not raised by a non-422 response', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerError(500, VALIDATION_BODY);

            expect(result().refused.value).toBe(false);
        });

        it('is not raised by an error with no response', () => {
            const {httpService, triggerBare} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerBare();

            expect(result().refused.value).toBe(false);
        });

        it('is not unnamed when the bag holds a field', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerError(422, VALIDATION_BODY);

            expect(result().refused.value).toBe(true);
            expect(result().refusedUnnamed.value).toBe(false);
        });

        it('clearErrors drops the bag, the refusal and the unmapped keys together', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService, {fields: ['email']});

            triggerError(422, {errors: {email: ['Taken'], token: ['Expired']}});
            result().clearErrors();

            expect(result().errors.value).toEqual({});
            expect(result().refused.value).toBe(false);
            expect(result().unmapped.value).toEqual([]);
        });

        it('replaces the unmapped keys of the previous refusal instead of appending', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService, {fields: ['email']});

            triggerError(422, {errors: {token: ['Expired']}});
            triggerError(422, {errors: {code: ['Wrong']}});

            expect(result().unmapped.value).toEqual(['code']);
        });
    });

    describe('message list guard', () => {
        it('skips a bare-string message instead of binding its first character', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerError(422, {errors: {email: 'fout', name: ['Required']}});

            expect(result().errors.value).toEqual({name: 'Required'});
            expect(result().unmapped.value).toEqual(['email']);
        });

        it('skips an empty message list', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerError(422, {errors: {email: []}});

            expect(result().errors.value).toEqual({});
            expect(result().unmapped.value).toEqual(['email']);
        });

        it('skips a list whose first entry is not a string', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerError(422, {errors: {email: [{text: 'Taken'}]}});

            expect(result().errors.value).toEqual({});
            expect(result().unmapped.value).toEqual(['email']);
        });

        // Parsed from text: an object literal's `__proto__` sets the prototype instead of creating the key.
        it('binds a field named __proto__ as an own key', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService);

            triggerError(422, JSON.parse('{"errors":{"__proto__":["x"]}}'));

            expect(Object.hasOwn(result().errors.value, '__proto__')).toBe(true);
            expect(Object.getOwnPropertyDescriptor(result().errors.value, '__proto__')?.value).toBe('x');
            expect(Object.getPrototypeOf(result().errors.value)).toBe(Object.prototype);
            expect(result().unmapped.value).toEqual([]);
        });

        it('reports a skipped key under its keyMapper name', () => {
            const {httpService, triggerError} = createMockHttpService();
            const keyMapper = (key: string) => key.toUpperCase();
            const {result} = mountComposable(httpService, {keyMapper});

            triggerError(422, {errors: {email: 'fout'}});

            expect(result().unmapped.value).toEqual(['EMAIL']);
        });

        it('does not report a name as unmapped when another key bound it', () => {
            const {httpService, triggerError} = createMockHttpService();
            const keyMapper = (key: string) => (key === 'email_address' ? 'email' : key);
            const {result} = mountComposable(httpService, {keyMapper});

            triggerError(422, JSON.parse('{"errors":{"email":["Taken"],"email_address":"bad"}}'));
            expect(result().errors.value).toEqual({email: 'Taken'});
            expect(result().unmapped.value).toEqual([]);

            triggerError(422, JSON.parse('{"errors":{"email_address":"bad","email":["Taken"]}}'));
            expect(result().errors.value).toEqual({email: 'Taken'});
            expect(result().unmapped.value).toEqual([]);
        });

        it('lists a name once when several dropped keys map to it', () => {
            const {httpService, triggerError} = createMockHttpService();
            const keyMapper = (key: string) => (key.endsWith('_token') ? 'token' : key);
            const {result} = mountComposable(httpService, {keyMapper, fields: ['name']});

            triggerError(422, {errors: {reset_token: ['Expired'], invite_token: ['Expired'], code: ['Wrong']}});

            expect(result().unmapped.value).toEqual(['token', 'code']);
        });
    });

    describe('acceptWhen', () => {
        it('leaves the bag and the refusal untouched while the predicate is false', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService, {acceptWhen: () => false});

            triggerError(422, VALIDATION_BODY);

            expect(result().errors.value).toEqual({});
            expect(result().refused.value).toBe(false);
        });

        it('binds while the predicate is true', () => {
            const {httpService, triggerError} = createMockHttpService();
            const {result} = mountComposable(httpService, {acceptWhen: () => true});

            triggerError(422, VALIDATION_BODY);

            expect(result().errors.value).toEqual({first_name: 'Required'});
            expect(result().refused.value).toBe(true);
        });

        it('is not consulted for a non-422', () => {
            const {httpService, triggerError} = createMockHttpService();
            const acceptWhen = vi.fn(() => true);
            mountComposable(httpService, {acceptWhen});

            triggerError(500, VALIDATION_BODY);

            expect(acceptWhen).not.toHaveBeenCalled();
        });
    });
});
