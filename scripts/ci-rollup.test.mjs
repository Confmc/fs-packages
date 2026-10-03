import {describe, expect, it} from 'vitest';

import {decideRollup, parseNeeds} from './ci-rollup.core.mjs';

const lane = (result) => ({result, outputs: {}});

describe('decideRollup', () => {
    it('passes when every lane reported success', () => {
        const verdict = decideRollup({check: lane('success'), 'browser-tests': lane('success')});
        expect(verdict.passed).toBe(true);
        expect(verdict.reason).toBe('all 2 lane(s) reported success');
    });

    it('fails a skipped lane', () => {
        const verdict = decideRollup({check: lane('success'), 'browser-tests': lane('skipped')});
        expect(verdict.passed).toBe(false);
        expect(verdict.reason).toBe('1 of 2 lane(s) did not report success: browser-tests=skipped');
    });

    it('fails a failed lane', () => {
        const verdict = decideRollup({check: lane('failure'), 'browser-tests': lane('success')});
        expect(verdict.passed).toBe(false);
        expect(verdict.reason).toBe('1 of 2 lane(s) did not report success: check=failure');
    });

    it('fails a cancelled lane', () => {
        expect(decideRollup({check: lane('cancelled'), 'browser-tests': lane('success')}).passed).toBe(false);
    });

    it('fails a lane carrying no result', () => {
        const verdict = decideRollup({check: {}, 'browser-tests': lane('success')});
        expect(verdict.passed).toBe(false);
        expect(verdict.reason).toContain('check=(no result)');
    });

    it('fails an empty needs set', () => {
        const verdict = decideRollup({});
        expect(verdict.passed).toBe(false);
        expect(verdict.lanes).toEqual([]);
        expect(verdict.reason).toContain('no lanes to check');
    });

    it.each([null, undefined, 'success', [lane('success')]])(
        'fails a needs value that is not an object: %j',
        (needs) => {
            expect(decideRollup(needs).passed).toBe(false);
        },
    );
});

describe('parseNeeds', () => {
    it('reads the toJSON(needs) text', () => {
        expect(parseNeeds('{"check":{"result":"success","outputs":{}}}')).toEqual({check: lane('success')});
    });

    it.each([undefined, '', 'not json'])('returns null for unreadable input: %j', (text) => {
        expect(parseNeeds(text)).toBeNull();
        expect(decideRollup(parseNeeds(text)).passed).toBe(false);
    });
});
