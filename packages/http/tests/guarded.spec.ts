import type {AxiosError, AxiosResponse, InternalAxiosRequestConfig} from 'axios';

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {
    RequestMiddlewareFunc,
    ResponseErrorMiddlewareFunc,
    ResponseMiddlewareFunc,
    AxiosResponseError,
} from '../src/types';

import {createHttpService, guarded, isAxiosError} from '../src/index';

const BASE_URL = 'https://api.example.com';

describe('guarded', () => {
    describe('unit behaviour', () => {
        it('invokes the wrapped body with the passed argument on the happy path', () => {
            // Arrange
            const body = vi.fn<(arg: string) => void>();
            const wrapped = guarded(body);

            // Act
            wrapped('payload');

            // Assert — argument passes through untouched
            expect(body).toHaveBeenCalledTimes(1);
            expect(body).toHaveBeenCalledWith('payload');
        });

        it('returns undefined (void) on the happy path', () => {
            // Arrange
            const wrapped = guarded<number>(() => {});

            // Act & Assert
            expect(wrapped(1)).toBeUndefined();
        });

        it('swallows a throw from the body and does not re-throw', () => {
            // Arrange
            const boom = new Error('side-effect exploded');
            const wrapped = guarded<string>(() => {
                throw boom;
            });

            // Act & Assert — the whole point: a throwing body cannot escape
            expect(() => wrapped('x')).not.toThrow();
        });

        it('routes the thrown value to a custom onError handler', () => {
            // Arrange
            const boom = new Error('side-effect exploded');
            const onError = vi.fn<(error: unknown) => void>();
            const wrapped = guarded<string>(() => {
                throw boom;
            }, onError);

            // Act
            wrapped('x');

            // Assert — the exact thrown value is handed to the handler
            expect(onError).toHaveBeenCalledTimes(1);
            expect(onError).toHaveBeenCalledWith(boom);
        });

        it('does not call onError when the body does not throw', () => {
            // Arrange
            const onError = vi.fn<(error: unknown) => void>();
            const wrapped = guarded<string>(() => {}, onError);

            // Act
            wrapped('x');

            // Assert
            expect(onError).not.toHaveBeenCalled();
        });

        it('surfaces a non-Error throw verbatim to the handler', () => {
            // Arrange — a throw can be anything; guarded must not assume Error
            const onError = vi.fn<(error: unknown) => void>();
            const wrapped = guarded<string>(() => {
                throw 'string failure';
            }, onError);

            // Act
            wrapped('x');

            // Assert
            expect(onError).toHaveBeenCalledWith('string failure');
        });

        it('is synchronous-only — a body returning a rejected promise is NOT caught (no onError)', () => {
            // Arrange — guarded()'s try/catch is synchronous. A body that returns a
            // rejected promise (i.e. an `async () => { throw }` body from the loop's
            // perspective) does NOT throw synchronously, so the catch never fires.
            // The promise is pre-handled so it never floats as an unhandled rejection
            // in the runner — this is a leak-safe stand-in for the async body, not a
            // suppression of the behavior under test.
            const onError = vi.fn<(error: unknown) => void>();
            const rejected = Promise.reject(new Error('async body'));
            rejected.catch(() => {});
            const wrapped = guarded<string>(() => rejected, onError);

            // Act
            wrapped('x');

            // Assert — the async rejection is invisible to guarded's sync try/catch.
            expect(onError).not.toHaveBeenCalled();
        });

        describe('default onError', () => {
            let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

            beforeEach(() => {
                consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            });

            afterEach(() => {
                consoleErrorSpy.mockRestore();
            });

            it('logs the swallowed failure loudly via console.error (message + error)', () => {
                // Arrange — no custom handler → default fires
                const boom = new Error('boom');
                const wrapped = guarded<string>(() => {
                    throw boom;
                });

                // Act
                wrapped('x');

                // Assert — message names guarded() and the original error is passed through
                expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
                expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('guarded()'), boom);
                expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[fs-http]'), boom);
            });

            it('does not log when the body succeeds', () => {
                // Arrange
                const wrapped = guarded<string>(() => {});

                // Act
                wrapped('x');

                // Assert
                expect(consoleErrorSpy).not.toHaveBeenCalled();
            });
        });
    });

    describe('type assignability (zero-cast into all three register* APIs)', () => {
        // These assignments are the compile-time contract: guarded(body) infers T
        // from the middleware body's typed argument and stays assignable to the
        // corresponding *MiddlewareFunc with no cast. A regression here is a
        // type error at author time (and under an explicit tsc over tests/).

        it('wraps a RequestMiddlewareFunc body and stays assignable', () => {
            // Arrange
            const reqBody: RequestMiddlewareFunc = (request) => {
                request.headers.set('X-Guarded', '1');
            };

            // Act — assignment target proves the shape is preserved
            const wrapped: RequestMiddlewareFunc = guarded(reqBody);

            // Assert
            expect(typeof wrapped).toBe('function');
        });

        it('wraps a ResponseMiddlewareFunc body and stays assignable', () => {
            // Arrange
            const resBody: ResponseMiddlewareFunc = (response) => {
                void response.status;
            };

            // Act
            const wrapped: ResponseMiddlewareFunc = guarded(resBody);

            // Assert
            expect(typeof wrapped).toBe('function');
        });

        it('wraps a ResponseErrorMiddlewareFunc body and stays assignable', () => {
            // Arrange
            const errBody: ResponseErrorMiddlewareFunc = (error) => {
                void error.response?.status;
            };

            // Act
            const wrapped: ResponseErrorMiddlewareFunc = guarded(errBody);

            // Assert
            expect(typeof wrapped).toBe('function');
        });

        it('registers inline into all three register* APIs with an annotated param, zero casts', () => {
            // Arrange
            const service = createHttpService(BASE_URL);

            // Act & Assert — if any of these needed a cast, this file would not compile
            expect(() =>
                service.registerRequestMiddleware(
                    guarded((request: InternalAxiosRequestConfig) => {
                        request.headers.set('X-Guarded', '1');
                    }),
                ),
            ).not.toThrow();
            expect(() =>
                service.registerResponseMiddleware(
                    guarded((response: AxiosResponse) => {
                        void response.status;
                    }),
                ),
            ).not.toThrow();
            expect(() =>
                service.registerResponseErrorMiddleware(
                    guarded((error: AxiosError<AxiosResponseError>) => {
                        void error.response?.status;
                    }),
                ),
            ).not.toThrow();
        });
    });

    // The load-bearing test: prove guarded() closes the exposure end-to-end against
    // the real createHttpService interceptor loop (not a stubbed one). fs-http runs
    // middleware synchronously and un-caught, so a throwing body would otherwise
    // reject a resolved 200 / mask the original AxiosError.
    describe('end-to-end against the real interceptor loop', () => {
        let mock: MockAdapter;

        beforeEach(() => {
            mock = new MockAdapter(axios);
        });

        afterEach(() => {
            mock.restore();
        });

        it('CONTRAST: an UN-guarded ({guard: false}) throwing response body rejects the resolved 200', async () => {
            // Arrange — demonstrates the exposure guarded() closes. Since ADR-0037
            // (fs-http 0.6.0) register* auto-guards by default, so the exposure is now
            // only reachable via the deliberate {guard: false} opt-out — which is
            // exactly what this CONTRAST must exercise to stay meaningful.
            mock.onGet(/.*/).reply(200, {ok: true});
            const service = createHttpService(BASE_URL);
            service.registerResponseMiddleware(
                () => {
                    throw new Error('toast blew up');
                },
                {guard: false},
            );

            // Act & Assert — the successful 200 is turned into a rejection
            await expect(service.getRequest('/ok')).rejects.toThrow('toast blew up');
        });

        it('a guarded throwing response body lets the resolved 200 still resolve', async () => {
            // Arrange
            mock.onGet(/.*/).reply(200, {ok: true});
            const service = createHttpService(BASE_URL);
            const onError = vi.fn<(error: unknown) => void>();
            const boom = new Error('toast blew up');
            service.registerResponseMiddleware(
                guarded<AxiosResponse>(() => {
                    throw boom;
                }, onError),
            );

            // Act
            const response = await service.getRequest('/ok');

            // Assert — 200 survives; the swallowed throw went to onError, not the caller
            expect(response.status).toBe(200);
            expect(response.data).toEqual({ok: true});
            expect(onError).toHaveBeenCalledWith(boom);
        });

        it('a guarded throwing error body still rejects with the ORIGINAL AxiosError', async () => {
            // Arrange
            mock.onGet(/.*/).reply(500, {error: 'server'});
            const service = createHttpService(BASE_URL);
            const onError = vi.fn<(error: unknown) => void>();
            const boom = new Error('error-dialog blew up');
            service.registerResponseErrorMiddleware(
                guarded<AxiosError<AxiosResponseError>>(() => {
                    throw boom;
                }, onError),
            );

            // Act
            let caught: unknown;
            try {
                await service.getRequest('/fail');
            } catch (error) {
                caught = error;
            }

            // Assert — the caller sees the real 500 AxiosError, NOT the middleware's throw
            expect(caught).not.toBe(boom);
            expect(isAxiosError<AxiosResponseError>(caught)).toBe(true);
            expect((caught as AxiosError).response?.status).toBe(500);
            expect(onError).toHaveBeenCalledWith(boom);
        });

        it('a guarded throwing request body lets the request still go through', async () => {
            // Arrange
            mock.onGet(/.*/).reply(200, {ok: true});
            const service = createHttpService(BASE_URL);
            const onError = vi.fn<(error: unknown) => void>();
            const boom = new Error('auth-header build blew up');
            service.registerRequestMiddleware(
                guarded<InternalAxiosRequestConfig>(() => {
                    throw boom;
                }, onError),
            );

            // Act
            const response = await service.getRequest('/ok');

            // Assert
            expect(response.status).toBe(200);
            expect(onError).toHaveBeenCalledWith(boom);
        });
    });
});
