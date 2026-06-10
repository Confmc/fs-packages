import type {HttpService, RequestMiddlewareFunc} from '@script-development/fs-http';

import type {LoadingMiddlewareOptions, LoadingMiddlewareResult, LoadingService} from './types';

// Route the request-config type through fs-http's public re-export rather than
// importing `InternalAxiosRequestConfig` from axios directly. fs-http's
// `RequestMiddlewareFunc` is `(request: InternalAxiosRequestConfig) => void`, so
// this resolves to the identical type while keeping axios out of fs-loading's
// public surface (the "no direct axios imports" discipline — see CLAUDE.md).
type RequestConfig = Parameters<RequestMiddlewareFunc>[0];

export const registerLoadingMiddleware = (
    httpService: HttpService,
    loadingService: LoadingService,
    options: LoadingMiddlewareOptions = {},
): LoadingMiddlewareResult => {
    const {timeoutMs = 30000} = options;

    const requestTimeouts = new Map<RequestConfig, ReturnType<typeof setTimeout>>();
    const completedRequests = new WeakSet<RequestConfig>();

    const stopLoadingForRequest = (config: RequestConfig): void => {
        if (completedRequests.has(config)) return;
        completedRequests.add(config);

        const timeout = requestTimeouts.get(config);
        if (timeout) {
            clearTimeout(timeout);
            requestTimeouts.delete(config);
        }

        loadingService.stopLoading();
    };

    const unregisterRequest = httpService.registerRequestMiddleware((config) => {
        loadingService.startLoading();

        if (timeoutMs > 0) {
            const timeout = setTimeout(() => {
                stopLoadingForRequest(config);
            }, timeoutMs);
            requestTimeouts.set(config, timeout);
        }
    });

    const unregisterResponse = httpService.registerResponseMiddleware((response) => {
        stopLoadingForRequest(response.config);
    });

    const unregisterError = httpService.registerResponseErrorMiddleware((error) => {
        if (error.config) {
            stopLoadingForRequest(error.config);
        }
    });

    const unregister = (): void => {
        unregisterRequest();
        unregisterResponse();
        unregisterError();

        for (const timeout of requestTimeouts.values()) {
            clearTimeout(timeout);
        }
        requestTimeouts.clear();
    };

    return {unregister};
};
