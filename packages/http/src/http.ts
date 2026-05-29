import type {AxiosRequestConfig, InternalAxiosRequestConfig} from 'axios';

import axios from 'axios';

import type {
    HttpService,
    HttpServiceOptions,
    RequestMiddlewareFunc,
    ResponseErrorMiddlewareFunc,
    ResponseMiddlewareFunc,
    UnregisterMiddleware,
    AxiosResponseError,
} from './types';

import {isAxiosError} from './utils';

/**
 * Default request timeout in milliseconds (30s). Applied when
 * `HttpServiceOptions.timeout` is unset. Per Doctrine #8 (library-author
 * extension, 2026-04-22) — a shared HTTP factory must expose a compliant
 * timeout surface so consumer territories cannot silently inherit
 * indefinite hangs.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

const unregister = <T>(array: T[], item: T): UnregisterMiddleware => {
    return () => {
        const index = array.indexOf(item);
        if (index > -1) array.splice(index, 1);
    };
};

/**
 * Parse the consumer-supplied baseURL with a library-attributed error on failure.
 * The native `new URL(baseURL)` throws an opaque `TypeError: Invalid URL` that
 * points at fs-http internals rather than the consumer's call site, latent for
 * 6 days on entreezuil (PR #40 adoption → PR #96 fix) because integration tests
 * mocked @script-development/fs-http and the real factory never ran. Fail-fast
 * here (vs. silent coercion to absolute) prevents the class for every adopter.
 */
const parseBaseURL = (baseURL: string): URL => {
    try {
        return new URL(baseURL);
    } catch {
        throw new Error(
            `[@script-development/fs-http] createHttpService requires an absolute baseURL (e.g. \`\${location.origin}/api\`). Received: ${JSON.stringify(baseURL)}`,
        );
    }
};

export const createHttpService = (baseURL: string, options?: HttpServiceOptions): HttpService => {
    const apiUrl = parseBaseURL(baseURL);

    const http = axios.create({
        baseURL: apiUrl.toString(),
        withCredentials: options?.withCredentials ?? true,
        withXSRFToken: options?.withXSRFToken ?? false,
        headers: {Accept: 'application/json', ...options?.headers},
        timeout: options?.timeout ?? DEFAULT_TIMEOUT_MS,
    });

    // Middleware stacks
    const requestMiddleware: RequestMiddlewareFunc[] = [];
    const responseMiddleware: ResponseMiddlewareFunc[] = [];
    const responseErrorMiddleware: ResponseErrorMiddlewareFunc[] = [];

    // Smart credentials: toggle withCredentials based on request host matching base host
    if (options?.smartCredentials) {
        const prepareExternalRequest: RequestMiddlewareFunc = (request: InternalAxiosRequestConfig) => {
            const requestUrl = new URL(http.getUri(request));
            request.withCredentials = apiUrl.host === requestUrl.host;
        };

        requestMiddleware.push(prepareExternalRequest);
    }

    // Wire up interceptors
    http.interceptors.request.use((request) => {
        for (const middleware of requestMiddleware) middleware(request);

        return request;
    });

    http.interceptors.response.use(
        (response) => {
            for (const middleware of responseMiddleware) middleware(response);

            return response;
        },
        (error) => {
            if (!isAxiosError<AxiosResponseError>(error)) return Promise.reject(error);

            for (const middleware of responseErrorMiddleware) middleware(error);

            return Promise.reject(error);
        },
    );

    // Standard request methods
    const getRequest = <T = unknown>(endpoint: string, options?: AxiosRequestConfig) => http.get<T>(endpoint, options);

    const postRequest = <T = unknown>(endpoint: string, data: unknown, options?: AxiosRequestConfig) =>
        http.post<T>(endpoint, data, options);

    const putRequest = <T = unknown>(endpoint: string, data: unknown, options?: AxiosRequestConfig) =>
        http.put<T>(endpoint, data, options);

    const patchRequest = <T = unknown>(endpoint: string, data: unknown, options?: AxiosRequestConfig) =>
        http.patch<T>(endpoint, data, options);

    const deleteRequest = <T = unknown>(endpoint: string, options?: AxiosRequestConfig) =>
        http.delete<T>(endpoint, options);

    // Blob-returning request methods. Identical transport (responseType: 'blob');
    // separate names communicate intent to consumers (download = save-to-disk,
    // preview = inline-display). Neither touches the DOM — orchestration of the
    // download dance and object-URL lifecycle lives with the consumer (see
    // `triggerDownload` in `@script-development/fs-helpers`).

    const downloadRequest = (endpoint: string, options?: AxiosRequestConfig) =>
        http.get<Blob>(endpoint, {...options, responseType: 'blob'});

    const previewRequest = (endpoint: string, options?: AxiosRequestConfig) =>
        http.get<Blob>(endpoint, {...options, responseType: 'blob'});

    // Middleware registration
    const registerRequestMiddleware = (fn: RequestMiddlewareFunc): UnregisterMiddleware => {
        requestMiddleware.push(fn);

        return unregister(requestMiddleware, fn);
    };

    const registerResponseMiddleware = (fn: ResponseMiddlewareFunc): UnregisterMiddleware => {
        responseMiddleware.push(fn);

        return unregister(responseMiddleware, fn);
    };

    const registerResponseErrorMiddleware = (fn: ResponseErrorMiddlewareFunc): UnregisterMiddleware => {
        responseErrorMiddleware.push(fn);

        return unregister(responseErrorMiddleware, fn);
    };

    return {
        getRequest,
        postRequest,
        putRequest,
        patchRequest,
        deleteRequest,
        downloadRequest,
        previewRequest,
        registerRequestMiddleware,
        registerResponseMiddleware,
        registerResponseErrorMiddleware,
    };
};
