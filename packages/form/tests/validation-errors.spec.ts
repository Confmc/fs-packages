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
        const {result} = mountComposable(httpService);

        triggerError(422, {errors: null});

        expect(result().errors.value).toEqual({});
    });

    it('yields an empty bag when errors is not an object', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, {errors: 'not-an-object'});

        expect(result().errors.value).toEqual({});
    });

    it('yields an empty bag when the 422 body is a non-object', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, 'plain string body');

        expect(result().errors.value).toEqual({});
    });

    it('yields an empty bag when the 422 body is null', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerError(422, null);

        expect(result().errors.value).toEqual({});
    });

    it('handles an error with no response at all', () => {
        const {httpService, triggerBare} = createMockHttpService();
        const {result} = mountComposable(httpService);

        triggerBare();

        expect(result().errors.value).toEqual({});
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
});
