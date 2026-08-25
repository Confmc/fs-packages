// @vitest-environment happy-dom
import {flushPromises} from '@vue/test-utils';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {createLoadingService} from '../src';

const watchProbe = vi.hoisted(() => ({callbackCalls: 0}));

// `ensureLoadingFinished` stops its own watcher from inside the callback. A leaked
// watcher is invisible from the public surface — its only remaining act is to
// re-resolve an already-settled promise, which is a no-op — so counting callback
// invocations through vue's `watch` export is the only way to observe it at all.
vi.mock('vue', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue')>();

    const watch = ((source: unknown, callback: unknown, options: unknown) => {
        const wrapped = (...args: unknown[]) => {
            watchProbe.callbackCalls++;

            return (callback as (...callbackArgs: unknown[]) => unknown)(...args);
        };

        return (actual.watch as unknown as (...args: unknown[]) => unknown)(source, wrapped, options);
    }) as unknown as typeof actual.watch;

    return {...actual, watch};
});

describe('ensureLoadingFinished watcher cleanup', () => {
    beforeEach(() => {
        watchProbe.callbackCalls = 0;
    });

    it('should stop watching once the promise settles', async () => {
        const service = createLoadingService();
        service.startLoading();

        const promise = service.ensureLoadingFinished();
        service.stopLoading();
        await promise;

        expect(watchProbe.callbackCalls).toBe(1);

        service.startLoading();
        await flushPromises();
        service.stopLoading();
        await flushPromises();

        expect(watchProbe.callbackCalls).toBe(1);
    });
});
