import {afterEach, describe, expect, it, vi} from 'vitest';

import {isValidationRefusal, loudlySwallowed} from '../../src/form/http-contract';

// The two pieces ui-form used to import from fs-http at runtime, inlined so an inputs-only consumer
// needs no fs-http at build or CJS load. They must keep fs-http's behaviour exactly.

afterEach(() => {
    vi.restoreAllMocks();
});

describe('isValidationRefusal', () => {
    it('is true only for an axios error whose response is a 422', () => {
        expect(isValidationRefusal({isAxiosError: true, response: {status: 422, data: {}}})).toBe(true);
    });

    it.each([
        ['an axios error with another status', {isAxiosError: true, response: {status: 500, data: {}}}],
        ['an axios error without a response (network failure)', {isAxiosError: true}],
        ['a 422-shaped object that is not an axios error', {response: {status: 422, data: {}}}],
        ['an isAxiosError flag that is truthy but not true', {isAxiosError: 'yes', response: {status: 422}}],
        ['null', null],
        ['undefined', undefined],
        ['a string', '422'],
        ['a plain Error', new Error('boom')],
    ])('is false for %s', (_, error) => {
        expect(isValidationRefusal(error)).toBe(false);
    });
});

describe('loudlySwallowed', () => {
    it('runs the body with its argument and returns nothing when it does not throw', () => {
        const body = vi.fn();

        expect(loudlySwallowed(body)('argument')).toBeUndefined();
        expect(body).toHaveBeenCalledWith('argument');
    });

    it('swallows a throw and reports it loudly, naming the package', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const thrown = new Error('keyMapper broke');

        expect(() =>
            loudlySwallowed(() => {
                throw thrown;
            })(undefined),
        ).not.toThrow();
        expect(error).toHaveBeenCalledOnce();
        expect(error.mock.calls[0]![0]).toContain('[ui-form]');
        expect(error.mock.calls[0]![1]).toBe(thrown);
    });
});
