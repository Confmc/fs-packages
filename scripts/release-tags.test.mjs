/**
 * `release-tags` runs only on push to `main`, after a release. These tests are the only
 * time its branches run before then. Each asserts both directions, because a check
 * that only ever sees the owed case cannot tell a working comparison from `true`.
 */
import {describe, expect, it} from 'vitest';

import {
    decideAll,
    decidePackage,
    interpretVersionDoc,
    parseRemoteTags,
    planTags,
    releaseTag,
    SCAN_NAME,
} from './release-tags.core.mjs';

const HEAD = '813990ed3f08944bbf7a0e8e9fca07eec6a04d87';
const OTHER = '3935d49a00000000000000000000000000000000';
const HTTP = {name: '@script-development/fs-http', version: '0.7.0'};

const never = () => {
    throw new Error('lookupVersion must not be called on this path');
};

describe('releaseTag', () => {
    it('builds the tag changesets builds for a workspace package', () => {
        expect(releaseTag(HTTP)).toBe('@script-development/fs-http@0.7.0');
    });
});

describe('interpretVersionDoc', () => {
    it('reads gitHead off the version document', () => {
        expect(interpretVersionDoc({stdout: JSON.stringify({version: '0.7.0', gitHead: HEAD})})).toEqual({
            published: true,
            gitHead: HEAD,
        });
    });

    it('reads a published version that records no gitHead', () => {
        // The hand-published bootstrap 0.1.0s carry none.
        expect(interpretVersionDoc({stdout: JSON.stringify({version: '0.1.0'})})).toEqual({
            published: true,
            gitHead: undefined,
        });
    });

    it.each([
        ['a bare string', '"0.1.0"'],
        ['an array', '[{"version":"0.1.0"}]'],
        ['null', 'null'],
        ['not JSON', 'npm warn something'],
    ])('refuses %s as a version document', (_label, stdout) => {
        // A bare string is what `npm view <spec> version gitHead` prints when gitHead is absent.
        expect(interpretVersionDoc({stdout}).error).toBeDefined();
    });

    it('separates an unpublished version from a lookup failure', () => {
        expect(
            interpretVersionDoc({stderr: 'npm error code E404\nnpm error 404 No match found for version 9.9.9'}),
        ).toEqual({published: false});

        const failure = interpretVersionDoc({stderr: 'npm error code ENOTFOUND\nnpm error network'});
        expect(failure.published).toBeUndefined();
        expect(failure.error).toBe('registry lookup failed: npm error code ENOTFOUND');

        // Refused access is not "never published": read as one, a token fault would end green.
        expect(interpretVersionDoc({stderr: 'npm error code E403\nnpm error 403 Forbidden'}).published).toBeUndefined();
    });

    it('falls back to the thrown message when stderr is empty', () => {
        expect(interpretVersionDoc({stderr: '', message: 'spawn npm ETIMEDOUT'}).error).toBe(
            'registry lookup failed: spawn npm ETIMEDOUT',
        );
        expect(interpretVersionDoc({}).error).toBe('registry lookup failed: unknown error');
    });
});

describe('decidePackage', () => {
    const decide = (registry, publishResult = 'success') =>
        decidePackage({dir: 'http', manifest: HTTP, lookupVersion: () => registry, head: HEAD, publishResult});

    it('owes the tag of a version published from this commit, and only then', () => {
        expect(decide({published: true, gitHead: HEAD})).toEqual({
            name: HTTP.name,
            owed: '@script-development/fs-http@0.7.0',
        });

        const earlier = decide({published: true, gitHead: OTHER});
        expect(earlier.owed).toBeUndefined();
        expect(earlier.skip).toBe(`0.7.0 published from ${OTHER}`);
    });

    it('owes the tag on a re-run and after a failed git tag, when changesets made none', () => {
        // crit, PR #313: both cases end with no tag from changesets. The registry still
        // records the commit, and that alone decides.
        for (const publishResult of ['success', 'skipped']) {
            expect(decide({published: true, gitHead: HEAD}, publishResult).owed).toBe(releaseTag(HTTP));
        }
    });

    it('does not attribute a version that records no gitHead to this commit', () => {
        expect(decide({published: true, gitHead: undefined})).toEqual({
            name: HTTP.name,
            skip: '0.7.0 published from an unrecorded commit',
        });
    });

    it('fails on an unpublished version only when publish reported success', () => {
        expect(decide({published: false}, 'success').error).toContain(
            "not on the registry although 'publish' succeeded",
        );

        for (const publishResult of ['failure', 'skipped', 'cancelled']) {
            const verdict = decide({published: false}, publishResult);
            expect(verdict.error).toBeUndefined();
            expect(verdict.skip).toContain(`'publish' ended '${publishResult}'`);
        }
    });

    it('fails on a registry lookup it could not complete', () => {
        expect(decide({error: 'registry lookup failed: ENOTFOUND'}, 'skipped')).toEqual({
            name: HTTP.name,
            error: '0.7.0 — registry lookup failed: ENOTFOUND',
        });
    });

    it('skips a private package without asking the registry', () => {
        expect(
            decidePackage({dir: 'docs', manifest: {name: 'docs', private: true}, lookupVersion: never, head: HEAD}),
        ).toEqual({name: 'docs', skip: 'private, never published'});
    });

    it('fails on an unreadable or incomplete manifest', () => {
        expect(
            decidePackage({dir: 'broken', manifest: {__unreadable: 'Unexpected token }'}, lookupVersion: never}).error,
        ).toContain('Unexpected token }');
        expect(decidePackage({dir: 'x', manifest: {version: '1.0.0'}, lookupVersion: never}).error).toBe(
            'manifest has no name or no version',
        );
        expect(decidePackage({dir: 'x', manifest: {name: '@x/y'}, lookupVersion: never}).error).toBe(
            'manifest has no name or no version',
        );
    });
});

describe('decideAll', () => {
    it('decides every directory it is given', () => {
        const verdicts = decideAll({
            dirs: ['a', 'b'],
            readManifest: (dir) => ({name: `@script-development/${dir}`, version: '1.0.0'}),
            lookupVersion: (spec) => ({
                published: true,
                gitHead: spec.startsWith('@script-development/a@') ? HEAD : OTHER,
            }),
            head: HEAD,
            publishResult: 'success',
        });
        expect(verdicts.map((verdict) => verdict.owed)).toEqual(['@script-development/a@1.0.0', undefined]);
    });

    it.each([
        ['an unreadable packages directory', {dirs: null, scanError: 'EACCES'}, 'could not be read (EACCES)'],
        ['an empty packages directory', {dirs: []}, 'contains no package directories'],
    ])('fails on %s instead of reporting nothing owed', (_label, scan, why) => {
        const verdicts = decideAll({...scan, readManifest: never, lookupVersion: never, head: HEAD});
        expect(verdicts).toHaveLength(1);
        expect(verdicts[0].name).toBe(SCAN_NAME);
        expect(verdicts[0].error).toContain(why);
    });
});

describe('parseRemoteTags', () => {
    it('reads an annotated tag at the commit it peels to, whichever line comes first', () => {
        const lines = [
            `0bb96d5d56eb9989d2e2940ee6450318078b11c4\trefs/tags/@script-development/fs-http@0.7.0`,
            `${HEAD}\trefs/tags/@script-development/fs-http@0.7.0^{}`,
        ];
        for (const order of [lines, [...lines].reverse()]) {
            expect([...parseRemoteTags(order.join('\n'))]).toEqual([['@script-development/fs-http@0.7.0', HEAD]]);
        }
    });

    it('reads a lightweight tag at its own commit, and ignores other lines', () => {
        const remote = parseRemoteTags(`${OTHER}\trefs/tags/v1.0.0\nwarning: redirecting\n\n`);
        expect([...remote]).toEqual([['v1.0.0', OTHER]]);
        expect(parseRemoteTags('').size).toBe(0);
    });
});

describe('planTags', () => {
    const tag = releaseTag(HTTP);

    it('pushes an owed tag the remote lacks', () => {
        expect(planTags({owed: [tag], remoteTags: new Map(), head: HEAD})).toEqual({
            push: [tag],
            present: [],
            conflicts: [],
        });
    });

    it('leaves a tag already on the remote at this commit, so a re-run pushes nothing', () => {
        expect(planTags({owed: [tag], remoteTags: new Map([[tag, HEAD]]), head: HEAD})).toEqual({
            push: [],
            present: [tag],
            conflicts: [],
        });
    });

    it('reports a tag on the remote at another commit as a conflict, and does not push it', () => {
        const plan = planTags({owed: [tag], remoteTags: new Map([[tag, OTHER]]), head: HEAD});
        expect(plan.push).toEqual([]);
        expect(plan.conflicts).toEqual([`${tag} is on the remote at ${OTHER}, not at ${HEAD}`]);
    });
});
