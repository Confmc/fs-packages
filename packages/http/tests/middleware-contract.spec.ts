import type {AxiosResponse} from 'axios';

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {ResponseMiddlewareFunc} from '../src/types';

import {createHttpService} from '../src/index';

// Contract pins for the fs-http middleware mechanism. Each test locks one
// documented invariant (README §Middleware contract / the register* JSDoc) so a
// future regression fails CI rather than silently drifting. Written against
// fs-http 0.6.0 (guard-by-default, ADR-0037): throw-isolation itself is pinned
// in http.spec.ts §"middleware guarding by default"; this file pins the
// invariants that survive UNCHANGED across ADR-0037 — ordering, per-instance
// scoping, non-idempotency, mutation visibility, response-object freshness, and
// the sync-only / fire-and-forget execution shape (including the one gap
// guard-by-default does NOT close: async rejections).

const BASE_URL = 'https://api.example.com';

let mock: MockAdapter;

beforeEach(() => {
    mock = new MockAdapter(axios);
    mock.onGet(/.*/).reply(200, {ok: true});
});

afterEach(() => {
    mock.restore();
});

describe('fs-http middleware contract', () => {
    describe('ordering', () => {
        it('runs response middleware in FIFO registration order', async () => {
            // Arrange
            const service = createHttpService(BASE_URL);
            const order: number[] = [];
            service.registerResponseMiddleware(() => order.push(1));
            service.registerResponseMiddleware(() => order.push(2));
            service.registerResponseMiddleware(() => order.push(3));

            // Act
            await service.getRequest('/test');

            // Assert — insertion order preserved on the response path (request path
            // is pinned in http.spec.ts; both share the same iteration shape).
            expect(order).toEqual([1, 2, 3]);
        });
    });

    describe('per-instance scoping', () => {
        it('scopes middleware to the service instance it was registered on', async () => {
            // Arrange — two independent services; middleware only on A.
            const serviceA = createHttpService(BASE_URL);
            const serviceB = createHttpService(BASE_URL);
            const onA = vi.fn();
            serviceA.registerResponseMiddleware(onA);

            // Act — a request through B must not touch A's stack.
            await serviceB.getRequest('/test');

            // Assert
            expect(onA).not.toHaveBeenCalled();

            // Act — a request through A does fire A's middleware.
            await serviceA.getRequest('/test');

            // Assert
            expect(onA).toHaveBeenCalledTimes(1);
        });
    });

    describe('non-idempotent registration', () => {
        it('fires a body once per registration — the same reference registered twice fires twice', async () => {
            // Arrange — each register* call wraps fn in a fresh guarded() wrapper,
            // so both registrations are live and both invoke fn.
            const service = createHttpService(BASE_URL);
            const fn = vi.fn();
            const unregisterFirst = service.registerResponseMiddleware(fn);
            service.registerResponseMiddleware(fn);

            // Act
            await service.getRequest('/first');

            // Assert — not deduped: two registrations => two calls.
            expect(fn).toHaveBeenCalledTimes(2);

            // Act — one unregister removes only its own copy; the other stays live.
            unregisterFirst();
            fn.mockClear();
            await service.getRequest('/second');

            // Assert
            expect(fn).toHaveBeenCalledTimes(1);
        });
    });

    describe('mutation semantics', () => {
        it('makes a mutation from one middleware visible to a later middleware on the same response', async () => {
            // Arrange — same response object is threaded through the whole chain.
            const service = createHttpService(BASE_URL);
            let sawInjected: string | undefined;
            service.registerResponseMiddleware((response) => {
                (response as AxiosResponse & {injected?: string}).injected = 'from-A';
            });
            service.registerResponseMiddleware((response) => {
                sawInjected = (response as AxiosResponse & {injected?: string}).injected;
            });

            // Act
            await service.getRequest('/test');

            // Assert
            expect(sawInjected).toBe('from-A');
        });

        it('does not reuse the response object across responses — a mutation does not bleed into the next request', async () => {
            // Arrange
            const service = createHttpService(BASE_URL);
            const seen: AxiosResponse[] = [];
            service.registerResponseMiddleware((response) => {
                (response as AxiosResponse & {marked?: boolean}).marked = true;
                seen.push(response);
            });

            // Act
            await service.getRequest('/first');
            await service.getRequest('/second');

            // Assert — axios hands back a fresh response object per request.
            expect(seen).toHaveLength(2);
            expect(seen[0]).not.toBe(seen[1]);
        });
    });

    describe('execution timing (sync-only, fire-and-forget)', () => {
        it('completes the synchronous middleware loop before the caller await resumes', async () => {
            // Arrange
            const service = createHttpService(BASE_URL);
            let ranDuringLoop = false;
            service.registerResponseMiddleware(() => {
                ranDuringLoop = true;
            });

            // Act
            const response = await service.getRequest('/test');

            // Assert — by the time the caller resumes, the loop has run to completion.
            expect(ranDuringLoop).toBe(true);
            expect(response.status).toBe(200);
        });

        it('does not await an async middleware body — a never-resolving body does not block response delivery', async () => {
            // Arrange — a body that returns a forever-pending promise. If the
            // interceptor awaited middleware, getRequest would hang; it resolves
            // because the loop is fire-and-forget. The promise never rejects, so
            // there is no unhandled rejection.
            const service = createHttpService(BASE_URL);
            const neverResolves: ResponseMiddlewareFunc = () => new Promise<void>(() => {});
            service.registerResponseMiddleware(neverResolves);

            // Act
            const response = await service.getRequest('/test');

            // Assert
            expect(response.status).toBe(200);
        });

        it('does NOT catch an async rejection — guard-by-default is sync-only; the request still resolves', async () => {
            // Arrange — models an `async () => { throw }` body's rejected RETURN.
            // guarded()'s try/catch is synchronous, so it never observes this
            // rejection: onMiddlewareError does not fire and the request resolves.
            // The rejection is pre-handled so the test runner never sees a floating
            // unhandled rejection — this is a leak-safe stand-in for the real
            // async body, not a suppression of the behavior under test.
            const onMiddlewareError = vi.fn();
            const service = createHttpService(BASE_URL, {onMiddlewareError});
            const rejected = Promise.reject(new Error('async middleware boom'));
            rejected.catch(() => {});
            const asyncRejecting: ResponseMiddlewareFunc = () => rejected;
            service.registerResponseMiddleware(asyncRejecting);

            // Act
            const response = await service.getRequest('/test');

            // Assert — the async rejection is invisible to guard-by-default.
            expect(response.status).toBe(200);
            expect(onMiddlewareError).not.toHaveBeenCalled();
        });
    });
});
