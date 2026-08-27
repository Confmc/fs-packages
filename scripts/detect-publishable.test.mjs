/**
 * The gate on the gate.
 *
 * Before this file existed, `detect-publishable`'s decision logic ran for the first
 * time on `main`, inside the OIDC approval gate it exists to make trustworthy —
 * `publish.yml`'s `detect` job fires only on `push`, never on `pull_request`, and
 * `validate:workflows` only regex-parses the workflow as text. An inverted comparison
 * or a broken E404 match would have shipped fully green and surfaced as either a
 * silently dropped release or a flood of spurious approvals.
 *
 * Every assertion below is written to FAIL against the defect it names, not merely to
 * pass against today's code: each branch is asserted in BOTH directions, because a test
 * that only ever sees the publishable case cannot tell a working comparison from one
 * that returns `true` unconditionally.
 */
import {describe, expect, it, vi} from 'vitest';

import {decideAll, decidePackage, interpretRegistry, SCAN_VERDICT_NAME, summarize} from './detect-publishable.core.mjs';

const never = () => {
    throw new Error('lookupRegistry must not be called on this path');
};

describe('interpretRegistry', () => {
    it('reads a version off stdout', () => {
        expect(interpretRegistry({stdout: '0.12.0\n'})).toEqual({version: '0.12.0'});
    });

    it('refuses to treat an empty stdout as a version', () => {
        // A zero exit with no output would otherwise compare '' against the local
        // version — the right answer by luck rather than by decision.
        expect(interpretRegistry({stdout: '   \n'})).toEqual({error: 'npm view returned an empty version'});
    });

    it('separates a never-published package from an instrument failure', () => {
        const first = interpretRegistry({stderr: "npm error code E404\nnpm error 404 '@x/y' is not in this registry"});
        expect(first.firstPublish).toBe(true);
        expect(first.error).toBe('not published yet (E404)');

        const failure = interpretRegistry({stderr: 'npm error code ENOTFOUND\nnpm error network'});
        expect(failure.firstPublish).toBeUndefined();
        expect(failure.error).toBe('registry lookup failed: npm error code ENOTFOUND');
    });

    it('falls back to the thrown message when stderr is empty', () => {
        expect(interpretRegistry({stderr: '', message: 'spawn npm ETIMEDOUT'}).error).toBe(
            'registry lookup failed: spawn npm ETIMEDOUT',
        );
        expect(interpretRegistry({}).error).toBe('registry lookup failed: unknown error');
    });
});

describe('decidePackage', () => {
    it('publishes when the local version differs from the registry, and only then', () => {
        // Both directions. Asserting only the mismatch would pass against a comparison
        // that returns `true` unconditionally — the inverted-comparison defect.
        const bumped = decidePackage({
            dir: 'ui-inputs',
            manifest: {name: '@script-development/ui-inputs', version: '0.13.0'},
            lookupRegistry: () => ({version: '0.12.0'}),
        });
        expect(bumped).toMatchObject({publishable: true, reason: '0.12.0 -> 0.13.0'});

        const inSync = decidePackage({
            dir: 'ui-inputs',
            manifest: {name: '@script-development/ui-inputs', version: '0.12.0'},
            lookupRegistry: () => ({version: '0.12.0'}),
        });
        expect(inSync).toMatchObject({publishable: false, reason: '0.12.0 already on the registry'});
        expect(inSync.failClosed).toBeUndefined();
    });

    it('skips a private package without touching the registry', () => {
        // `never` is the assertion: a registry round-trip here would throw.
        expect(decidePackage({dir: 'docs', manifest: {name: 'docs', private: true}, lookupRegistry: never})).toEqual({
            name: 'docs',
            publishable: false,
            reason: 'private, never published',
        });
    });

    it('fails closed on an unreadable manifest', () => {
        const verdict = decidePackage({
            dir: 'broken',
            manifest: {__unreadable: 'Unexpected token }'},
            lookupRegistry: never,
        });
        expect(verdict).toMatchObject({name: 'broken', publishable: true, failClosed: true});
        expect(verdict.reason).toContain('Unexpected token }');
    });

    it.each([
        ['no name', {version: '1.0.0'}],
        ['no version', {name: '@script-development/fs-x'}],
    ])('fails closed on a manifest with %s', (_label, manifest) => {
        expect(decidePackage({dir: 'x', manifest, lookupRegistry: never})).toMatchObject({
            publishable: true,
            failClosed: true,
            reason: 'manifest has no name or no version',
        });
    });

    it('publishes a first release WITHOUT calling it a fail-closed guess', () => {
        // E404 is a positive answer ("never published"), not an instrument failure, so
        // it must not raise the fail-closed annotation that says "we could not tell".
        const verdict = decidePackage({
            dir: 'fs-new',
            manifest: {name: '@script-development/fs-new', version: '0.1.0'},
            lookupRegistry: () => ({error: 'not published yet (E404)', firstPublish: true}),
        });
        expect(verdict).toMatchObject({publishable: true, failClosed: false});
        expect(verdict.reason).toBe('0.1.0 — not published yet (E404)');
    });

    it('fails closed when the registry could not be reached', () => {
        expect(
            decidePackage({
                dir: 'fs-http',
                manifest: {name: '@script-development/fs-http', version: '0.6.0'},
                lookupRegistry: () => ({error: 'registry lookup failed: ENOTFOUND'}),
            }),
        ).toMatchObject({publishable: true, failClosed: true});
    });
});

describe('decideAll', () => {
    const readManifest = (dir) => ({name: `@script-development/${dir}`, version: '1.0.0'});

    it('decides every directory it is given', () => {
        const verdicts = decideAll({
            dirs: ['a', 'b'],
            readManifest,
            lookupRegistry: (name) => ({version: name.endsWith('a') ? '1.0.0' : '0.9.0'}),
        });
        expect(verdicts.map((verdict) => verdict.publishable)).toEqual([false, true]);
    });

    it.each([
        ['an unreadable packages directory', {dirs: null, scanError: 'EACCES'}],
        ['a scan that found nothing', {dirs: []}],
    ])('fails closed on %s — an empty denominator proves nothing', (_label, scan) => {
        // § The Null-Result Gate corollary 1. "Zero packages scanned" reads identically
        // to "nothing to publish", and only one of those may suppress a release.
        const [verdict, ...rest] = decideAll({...scan, readManifest, lookupRegistry: never});
        expect(rest).toEqual([]);
        expect(verdict).toMatchObject({name: SCAN_VERDICT_NAME, publishable: true, failClosed: true});
        expect(verdict.reason).toContain('proves nothing about what needs publishing');
    });

    it('names the scan error so the log says WHICH failure it was', () => {
        expect(decideAll({dirs: null, scanError: 'EACCES', readManifest, lookupRegistry: never})[0].reason).toContain(
            'EACCES',
        );
    });
});

describe('summarize', () => {
    it('answers true on any publishable package and false on none', () => {
        expect(summarize([{name: 'a', publishable: false}]).answer).toBe(false);
        expect(
            summarize([
                {name: 'a', publishable: false},
                {name: 'b', publishable: true},
            ]).answer,
        ).toBe(true);
    });

    it('excludes the scan verdict from the denominator but not from the answer', () => {
        const result = summarize([{name: SCAN_VERDICT_NAME, publishable: true, failClosed: true}]);
        expect(result.scanned).toBe(0);
        expect(result.answer).toBe(true);
    });

    it('collects the fail-closed verdicts the annotation loop reports', () => {
        const result = summarize([
            {name: 'a', publishable: true, failClosed: true},
            {name: 'b', publishable: true},
            {name: 'c', publishable: false},
        ]);
        expect(result.failClosed.map((verdict) => verdict.name)).toEqual(['a']);
    });
});

describe('the fail-closed invariant, stated once', () => {
    it('never returns not-publishable from an uncertain input', () => {
        const uncertain = [
            {dir: 'x', manifest: {__unreadable: 'boom'}},
            {dir: 'x', manifest: {}},
            {dir: 'x', manifest: {name: 'n'}},
            {dir: 'x', manifest: {version: '1.0.0'}},
            {dir: 'x', manifest: {name: 'n', version: '1.0.0'}, lookupRegistry: () => ({error: 'anything'})},
        ];
        for (const input of uncertain) {
            expect(decidePackage({lookupRegistry: never, ...input}).publishable).toBe(true);
        }
        // The control: the ONE certain not-publishable answer, so the loop above is not
        // passing against logic that returns `true` for every input it is ever shown.
        expect(
            decidePackage({
                dir: 'x',
                manifest: {name: 'n', version: '1.0.0'},
                lookupRegistry: vi.fn(() => ({version: '1.0.0'})),
            }).publishable,
        ).toBe(false);
    });
});
