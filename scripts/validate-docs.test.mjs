/**
 * Each surface is asserted in both directions: a check that only ever sees the
 * documented case cannot tell a working match from one that returns `true` every time.
 */
import {describe, expect, it} from 'vitest';

import {checkDocsEnumeration, describeMissing, isPublishable} from './validate-docs.core.mjs';

const pkg = (dir, extra = {}) => ({dir, manifest: {name: `@script-development/${dir}`, ...extra}});

const docsFor = (...dirs) => ({
    pages: dirs.map((dir) => `${dir}.md`),
    sidebar: dirs.map((dir) => `{text: '${dir}', link: '/packages/${dir}'},`).join('\n'),
    index: ['| Package | Description |', ...dirs.map((dir) => `| [${dir}](/packages/${dir}) | ${dir} |`)].join('\n'),
    gettingStarted: ['```bash', ...dirs.map((dir) => `npm install @script-development/${dir}`), '```'].join('\n'),
});

describe('isPublishable', () => {
    it('treats only an explicit private flag as unpublished', () => {
        expect(isPublishable({name: 'x'})).toBe(true);
        expect(isPublishable({name: 'x', private: false})).toBe(true);
        expect(isPublishable({name: 'x', private: true})).toBe(false);
    });
});

describe('checkDocsEnumeration', () => {
    it('passes when every surface names every publishable package', () => {
        const verdict = checkDocsEnumeration({packages: [pkg('fs-a'), pkg('fs-b')], ...docsFor('fs-a', 'fs-b')});
        expect(verdict).toEqual({passed: true, scanned: 2, errors: [], missing: []});
    });

    it.each([
        ['page', (docs) => ({...docs, pages: ['fs-a.md']})],
        ['sidebar', (docs) => ({...docs, sidebar: docs.sidebar.replace("link: '/packages/fs-b'", '')})],
        ['index', (docs) => ({...docs, index: docs.index.replace('](/packages/fs-b)', '](/elsewhere)')})],
        [
            'gettingStarted',
            (docs) => ({
                ...docs,
                gettingStarted: docs.gettingStarted.replace('npm install @script-development/fs-b', ''),
            }),
        ],
    ])('reports a package missing from the %s surface, and only there', (surface, strip) => {
        const verdict = checkDocsEnumeration({packages: [pkg('fs-a'), pkg('fs-b')], ...strip(docsFor('fs-a', 'fs-b'))});
        expect(verdict.passed).toBe(false);
        expect(verdict.missing).toEqual([{dir: 'fs-b', name: '@script-development/fs-b', surface}]);
    });

    it('never lets one package name satisfy another that contains it', () => {
        // `cached-adapter-store` contains `adapter-store`; each must be found on its own.
        const verdict = checkDocsEnumeration({
            packages: [pkg('adapter-store'), pkg('cached-adapter-store')],
            ...docsFor('cached-adapter-store'),
        });
        expect(verdict.missing.map((entry) => `${entry.dir}:${entry.surface}`)).toEqual([
            'adapter-store:page',
            'adapter-store:sidebar',
            'adapter-store:index',
            'adapter-store:gettingStarted',
        ]);

        const reverse = checkDocsEnumeration({
            packages: [pkg('adapter-store'), pkg('cached-adapter-store')],
            ...docsFor('adapter-store'),
        });
        expect(reverse.missing.map((entry) => entry.dir)).toEqual(Array(4).fill('cached-adapter-store'));
    });

    it('counts an index link only inside a table row', () => {
        const docs = docsFor('fs-a');
        const verdict = checkDocsEnumeration({
            packages: [pkg('fs-a')],
            ...docs,
            index: 'See [fs-a](/packages/fs-a) for details.',
        });
        expect(verdict.missing).toEqual([{dir: 'fs-a', name: '@script-development/fs-a', surface: 'index'}]);
    });

    it('accepts a double-quoted sidebar link and rejects a near-miss path', () => {
        const docs = docsFor('fs-a');
        expect(checkDocsEnumeration({packages: [pkg('fs-a')], ...docs, sidebar: `link: "/packages/fs-a"`}).passed).toBe(
            true,
        );
        expect(
            checkDocsEnumeration({packages: [pkg('fs-a')], ...docs, sidebar: `link: '/packages/fs-a-old'`}).missing,
        ).toEqual([{dir: 'fs-a', name: '@script-development/fs-a', surface: 'sidebar'}]);
    });

    it('asks nothing of a private package', () => {
        const verdict = checkDocsEnumeration({
            packages: [pkg('fs-a'), pkg('internal', {private: true})],
            ...docsFor('fs-a'),
        });
        expect(verdict).toEqual({passed: true, scanned: 1, errors: [], missing: []});
    });

    it.each([
        ['an unreadable packages directory', {packages: null, scanError: 'EACCES'}, 'could not be read (EACCES)'],
        ['an empty packages directory', {packages: []}, 'holds no package'],
    ])('fails on %s instead of passing over nothing', (_label, input, message) => {
        const verdict = checkDocsEnumeration({...docsFor('fs-a'), ...input});
        expect(verdict.passed).toBe(false);
        expect(verdict.errors).toEqual([expect.stringContaining(message)]);
    });

    it.each(['pages', 'sidebar', 'index', 'gettingStarted'])('fails when the %s surface could not be read', (key) => {
        const verdict = checkDocsEnumeration({packages: [pkg('fs-a')], ...docsFor('fs-a'), [key]: null});
        expect(verdict.passed).toBe(false);
        expect(verdict.errors).toHaveLength(1);
        expect(verdict.missing).toEqual([]);
    });

    it('fails on an unreadable or nameless manifest rather than skipping it', () => {
        const verdict = checkDocsEnumeration({
            packages: [
                pkg('fs-a'),
                {dir: 'broken', manifest: {__unreadable: 'Unexpected token'}},
                {dir: 'nameless', manifest: {}},
            ],
            ...docsFor('fs-a'),
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.errors).toEqual([
            'packages/broken/package.json could not be read (Unexpected token)',
            'packages/nameless/package.json has no name',
        ]);
    });
});

describe('describeMissing', () => {
    it('names the file to edit', () => {
        expect(describeMissing({name: '@script-development/fs-a', dir: 'fs-a', surface: 'page'})).toBe(
            '@script-development/fs-a — no page at docs/packages/fs-a.md',
        );
        expect(describeMissing({name: '@script-development/fs-a', dir: 'fs-a', surface: 'gettingStarted'})).toBe(
            '@script-development/fs-a — no entry in docs/getting-started.md install list',
        );
    });
});
