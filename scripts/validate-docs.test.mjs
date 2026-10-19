/**
 * Each surface is asserted in both directions: a check that only ever sees the
 * documented case cannot tell a working match from one that returns `true` every time.
 */
import {describe, expect, it} from 'vitest';

import {isPrivateManifest} from './detect-publishable.core.mjs';
import {checkDocsEnumeration, describeMissing, describeOrphan, isPublishable} from './validate-docs.core.mjs';

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

    it('is the negation of the rule detect-publishable applies', () => {
        for (const manifest of [{name: 'x'}, {name: 'x', private: false}, {name: 'x', private: true}]) {
            expect(isPublishable(manifest)).toBe(!isPrivateManifest(manifest));
        }
    });
});

describe('checkDocsEnumeration', () => {
    it('passes when every surface names every publishable package', () => {
        const verdict = checkDocsEnumeration({packages: [pkg('fs-a'), pkg('fs-b')], ...docsFor('fs-a', 'fs-b')});
        expect(verdict).toEqual({passed: true, scanned: 2, errors: [], missing: [], orphans: []});
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
        expect(verdict).toEqual({passed: true, scanned: 1, errors: [], missing: [], orphans: []});
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

describe('checkDocsEnumeration — entries naming no package', () => {
    const withExtra = (docs, dir) => ({
        pages: [...docs.pages, `${dir}.md`],
        sidebar: `${docs.sidebar}\n{text: '${dir}', link: '/packages/${dir}'},`,
        index: `${docs.index}\n| [${dir}](/packages/${dir}) | ${dir} |`,
        gettingStarted: `${docs.gettingStarted}\nnpm install @script-development/${dir}`,
    });

    it.each([
        ['page', 'fs-gone'],
        ['sidebar', 'fs-gone'],
        ['index', 'fs-gone'],
        ['gettingStarted', '@script-development/fs-gone'],
    ])('reports an orphan on the %s surface, and only there', (surface, key) => {
        const docs = docsFor('fs-a');
        const field = surface === 'page' ? 'pages' : surface;
        const planted = {...docs, [field]: withExtra(docs, 'fs-gone')[field]};
        const verdict = checkDocsEnumeration({packages: [pkg('fs-a')], ...planted});
        expect(verdict.passed).toBe(false);
        expect(verdict.missing).toEqual([]);
        expect(verdict.orphans).toEqual([{surface, key}]);
    });

    it('treats a page or link for a private package as naming no publishable package', () => {
        const verdict = checkDocsEnumeration({
            packages: [pkg('fs-a'), pkg('internal', {private: true})],
            ...withExtra(docsFor('fs-a'), 'internal'),
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.orphans.map((entry) => entry.surface)).toEqual(['page', 'sidebar', 'index', 'gettingStarted']);
    });

    it('reports a package dropped from packages/ on every surface that still names it', () => {
        const verdict = checkDocsEnumeration({packages: [pkg('fs-a')], ...docsFor('fs-a', 'fs-b')});
        expect(verdict.orphans).toEqual([
            {surface: 'page', key: 'fs-b'},
            {surface: 'sidebar', key: 'fs-b'},
            {surface: 'index', key: 'fs-b'},
            {surface: 'gettingStarted', key: '@script-development/fs-b'},
        ]);
    });

    it('ignores what is not a package entry: non-markdown files, prose links, third-party installs, anchors', () => {
        const docs = docsFor('fs-a');
        const verdict = checkDocsEnumeration({
            packages: [pkg('fs-a')],
            pages: [...docs.pages, '.gitkeep'],
            sidebar: `${docs.sidebar}\n{text: 'Guide', link: '/getting-started'},\n{text: 'a', link: '/packages/fs-a#usage'},`,
            index: `${docs.index}\nSee [the gone one](/packages/fs-gone) in prose.\n| [a](/packages/fs-a#usage) | a |`,
            gettingStarted: `${docs.gettingStarted}\nnpm install vue`,
        });
        expect(verdict).toEqual({passed: true, scanned: 1, errors: [], missing: [], orphans: []});
    });
});

describe('describeOrphan', () => {
    it('names the file to edit', () => {
        expect(describeOrphan({surface: 'page', key: 'fs-gone'})).toBe(
            'docs/packages/fs-gone.md — a page for no publishable package under packages/',
        );
        expect(describeOrphan({surface: 'sidebar', key: 'fs-gone'})).toBe(
            'fs-gone — named in docs/.vitepress/config.mts sidebar, but no publishable package under packages/ has that directory',
        );
        expect(describeOrphan({surface: 'gettingStarted', key: '@script-development/fs-gone'})).toBe(
            '@script-development/fs-gone — named in docs/getting-started.md install list, but no publishable package under packages/ has that name',
        );
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
