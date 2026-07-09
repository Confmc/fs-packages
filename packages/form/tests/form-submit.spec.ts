// @vitest-environment happy-dom
import type {AxiosError} from 'axios';

import {describe, expect, it, vi} from 'vitest';

import {useFormSubmit} from '../src';

const makeAxiosError = (status: number): AxiosError => ({isAxiosError: true, response: {status}}) as AxiosError;

const deferred = () => {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
};

describe('useFormSubmit', () => {
    it('clears prior errors before running the action', async () => {
        const clearErrors = vi.fn();
        const {handleSubmit} = useFormSubmit({clearErrors});

        await handleSubmit(async () => {});

        expect(clearErrors).toHaveBeenCalledOnce();
    });

    it('toggles submitting true during the action and false after', async () => {
        const {handleSubmit, submitting} = useFormSubmit({clearErrors: vi.fn()});
        const gate = deferred();

        expect(submitting.value).toBe(false);

        const inFlight = handleSubmit(() => gate.promise);
        expect(submitting.value).toBe(true);

        gate.resolve();
        await inFlight;
        expect(submitting.value).toBe(false);
    });

    it('ignores a re-entrant submit while one is already in flight', async () => {
        const {handleSubmit, submitting} = useFormSubmit({clearErrors: vi.fn()});
        const gate = deferred();
        const action = vi.fn(() => gate.promise);

        const first = handleSubmit(action);
        expect(submitting.value).toBe(true);

        // second call must early-return without invoking the action again
        await handleSubmit(action);
        expect(action).toHaveBeenCalledOnce();

        gate.resolve();
        await first;
    });

    it('swallows a 422 rejection so the form is preserved', async () => {
        const {handleSubmit, submitting} = useFormSubmit({clearErrors: vi.fn()});

        await expect(
            handleSubmit(async () => {
                throw makeAxiosError(422);
            }),
        ).resolves.toBeUndefined();
        expect(submitting.value).toBe(false);
    });

    it('re-throws a non-422 axios rejection', async () => {
        const {handleSubmit, submitting} = useFormSubmit({clearErrors: vi.fn()});
        const error = makeAxiosError(500);

        await expect(
            handleSubmit(async () => {
                throw error;
            }),
        ).rejects.toBe(error);
        expect(submitting.value).toBe(false);
    });

    it('re-throws an axios error that carries no response object', async () => {
        const {handleSubmit} = useFormSubmit({clearErrors: vi.fn()});
        const error = {isAxiosError: true} as AxiosError;

        await expect(
            handleSubmit(async () => {
                throw error;
            }),
        ).rejects.toBe(error);
    });

    it('re-throws a non-axios rejection', async () => {
        const {handleSubmit} = useFormSubmit({clearErrors: vi.fn()});
        const error = new Error('network down');

        await expect(
            handleSubmit(async () => {
                throw error;
            }),
        ).rejects.toBe(error);
    });

    it('resets submitting to false even when the action re-throws', async () => {
        const {handleSubmit, submitting} = useFormSubmit({clearErrors: vi.fn()});

        await handleSubmit(async () => {
            throw makeAxiosError(500);
        }).catch(() => null);

        expect(submitting.value).toBe(false);
    });
});
