// @vitest-environment happy-dom
import type {AxiosResponseError, HttpService, ResponseErrorMiddlewareFunc} from '@script-development/fs-http';
import type {AxiosError} from 'axios';

import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent} from 'vue';

import type {UseForm, UseFormOptions} from '../src';

import {useForm} from '../src';

const createMockHttpService = () => {
    const errorMiddlewares: ResponseErrorMiddlewareFunc[] = [];

    const triggerError = (status: number, data: unknown): void => {
        const error = {isAxiosError: true, response: {status, data}} as AxiosError<AxiosResponseError>;
        for (const middleware of errorMiddlewares) middleware(error);
    };

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
        registerResponseErrorMiddleware: vi.fn((fn: ResponseErrorMiddlewareFunc) => {
            errorMiddlewares.push(fn);
            return () => {
                const index = errorMiddlewares.indexOf(fn);
                if (index > -1) errorMiddlewares.splice(index, 1);
            };
        }),
    } as unknown as HttpService;

    return {httpService, triggerError, errorMiddlewares};
};

const mountForm = <T extends string = string>(httpService: HttpService, options?: UseFormOptions) => {
    let result!: UseForm<T>;
    const wrapper = mount(
        defineComponent({
            setup() {
                result = useForm<T>(httpService, options);
                return () => null;
            },
        }),
    );
    return {wrapper, result: () => result};
};

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return {promise, resolve};
};

const makeAxiosError = (status: number): AxiosError => ({isAxiosError: true, response: {status}}) as AxiosError;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useForm', () => {
    it('exposes the validation bag, clearErrors, handleSubmit and submitting from one call', () => {
        const {httpService} = createMockHttpService();
        const {result} = mountForm(httpService);

        expect(result().errors.value).toEqual({});
        expect(result().submitting.value).toBe(false);
        expect(typeof result().clearErrors).toBe('function');
        expect(typeof result().handleSubmit).toBe('function');
    });

    it('binds a 422 into the error bag via the internal middleware', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm<'email'>(httpService);

        triggerError(422, {errors: {email: ['Taken']}});

        expect(result().errors.value).toEqual({email: 'Taken'});
    });

    it('passes keyMapper through to the internal validation layer', () => {
        const {httpService, triggerError} = createMockHttpService();
        const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
        const {result} = mountForm(httpService, {keyMapper: camel});

        triggerError(422, {errors: {street_name: ['Required']}});

        expect(result().errors.value).toEqual({streetName: 'Required'});
    });

    it('toggles submitting around handleSubmit and swallows a 422', async () => {
        const {httpService} = createMockHttpService();
        const {result} = mountForm(httpService);
        const gate = deferred();

        const inFlight = result().handleSubmit(() => gate.promise);
        expect(result().submitting.value).toBe(true);

        gate.resolve();
        await inFlight;
        expect(result().submitting.value).toBe(false);

        await expect(
            result().handleSubmit(async () => {
                throw makeAxiosError(422);
            }),
        ).resolves.toBeUndefined();
    });

    it('re-throws a non-422 rejection through handleSubmit', async () => {
        const {httpService} = createMockHttpService();
        const {result} = mountForm(httpService);
        const error = makeAxiosError(500);

        await expect(
            result().handleSubmit(async () => {
                throw error;
            }),
        ).rejects.toBe(error);
    });

    it('clearErrors empties a populated bag', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm<'email'>(httpService);

        triggerError(422, {errors: {email: ['Taken']}});
        expect(result().errors.value).toEqual({email: 'Taken'});

        result().clearErrors();
        expect(result().errors.value).toEqual({});
    });

    it('unregisters the internal middleware on unmount', () => {
        const {httpService, errorMiddlewares} = createMockHttpService();
        const {wrapper} = mountForm(httpService);

        expect(errorMiddlewares).toHaveLength(1);

        wrapper.unmount();

        expect(errorMiddlewares).toHaveLength(0);
    });
});
