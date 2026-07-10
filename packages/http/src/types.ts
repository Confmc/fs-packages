import type {AxiosError, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig} from 'axios';

import type {GuardedMiddlewareErrorHandler} from './guarded';

export type AxiosResponseError = Record<string, unknown>;

export type RequestMiddlewareFunc = (request: InternalAxiosRequestConfig) => void;
export type ResponseMiddlewareFunc = (response: AxiosResponse) => void;
export type ResponseErrorMiddlewareFunc = (error: AxiosError<AxiosResponseError>) => void;

export type UnregisterMiddleware = () => void;

/**
 * Options for a `register*Middleware` call (ADR-0037).
 *
 * `guard` (default `true`): wrap the middleware body in `guarded()` so a
 * side-effect throw cannot corrupt the interceptor chain. Pass `{guard: false}`
 * to register the raw body unguarded — the deliberate escape hatch for a case
 * that genuinely wants a throw to propagate. No such case exists today.
 */
export type RegisterMiddlewareOptions = {guard?: boolean};

export type HttpServiceOptions = {
    headers?: Record<string, string>;
    withCredentials?: boolean;
    withXSRFToken?: boolean;
    smartCredentials?: boolean;
    /**
     * Request timeout in milliseconds. Defaults to 30_000 (30s).
     * Set 0 to disable (caller takes responsibility per Doctrine #8).
     * Per-request override available via the `AxiosRequestConfig.timeout`
     * parameter on each method.
     */
    timeout?: number;
    /**
     * Handler invoked when an auto-guarded middleware body throws (ADR-0037).
     * Becomes the `onError` passed to `guarded()` for every middleware
     * registered on this service (unless the middleware opts out with
     * `{guard: false}`). Unset ⇒ `guarded()`'s default loud `console.error`.
     * Route it to an error tracker (Sentry, kendo-error-tracker) to surface the
     * swallowed failure elsewhere. Must not re-throw.
     */
    onMiddlewareError?: GuardedMiddlewareErrorHandler;
};

export type HttpService = {
    getRequest: <T = unknown>(endpoint: string, options?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    postRequest: <T = unknown>(
        endpoint: string,
        data: unknown,
        options?: AxiosRequestConfig,
    ) => Promise<AxiosResponse<T>>;
    putRequest: <T = unknown>(
        endpoint: string,
        data: unknown,
        options?: AxiosRequestConfig,
    ) => Promise<AxiosResponse<T>>;
    patchRequest: <T = unknown>(
        endpoint: string,
        data: unknown,
        options?: AxiosRequestConfig,
    ) => Promise<AxiosResponse<T>>;
    deleteRequest: <T = unknown>(endpoint: string, options?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
    /**
     * GET an endpoint as a Blob, intended for save-to-disk flows. Returns the
     * full AxiosResponse so callers can read headers (e.g. content-type) before
     * handing off to a download utility such as `fs-helpers`' `triggerDownload`.
     *
     * No DOM side effects — fs-http is transport-only (fs-packages issue #59).
     */
    downloadRequest: (endpoint: string, options?: AxiosRequestConfig) => Promise<AxiosResponse<Blob>>;
    /**
     * GET an endpoint as a Blob, intended for inline-display flows. Identical
     * transport to `downloadRequest`; the separate name communicates intent.
     *
     * Callers manage object-URL lifecycle: `URL.createObjectURL(response.data)`
     * to render and `URL.revokeObjectURL(...)` on cleanup.
     */
    previewRequest: (endpoint: string, options?: AxiosRequestConfig) => Promise<AxiosResponse<Blob>>;
    registerRequestMiddleware: (fn: RequestMiddlewareFunc, opts?: RegisterMiddlewareOptions) => UnregisterMiddleware;
    registerResponseMiddleware: (fn: ResponseMiddlewareFunc, opts?: RegisterMiddlewareOptions) => UnregisterMiddleware;
    registerResponseErrorMiddleware: (
        fn: ResponseErrorMiddlewareFunc,
        opts?: RegisterMiddlewareOptions,
    ) => UnregisterMiddleware;
};
