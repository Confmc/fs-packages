import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {
    allowedCommentKind,
    checkContents,
    checkPackage,
    cssHasNoRules,
    listComments,
    requiredPaths,
} from './validate-dist.core.mjs';

const DUAL = {
    main: './dist/index.cjs',
    module: './dist/index.mjs',
    types: './dist/index.d.mts',
    exports: {
        '.': {
            import: {types: './dist/index.d.mts', default: './dist/index.mjs'},
            require: {types: './dist/index.d.cts', default: './dist/index.cjs'},
        },
    },
};

const DUAL_PATHS = ['dist/index.cjs', 'dist/index.d.cts', 'dist/index.d.mts', 'dist/index.mjs'];

describe('requiredPaths', () => {
    it('reads every condition of a nested exports map, deduplicated against the entry fields', () => {
        expect(requiredPaths(DUAL)).toEqual({paths: DUAL_PATHS, errors: []});
    });

    it('reads a second subpath export', () => {
        const {paths, errors} = requiredPaths({...DUAL, exports: {...DUAL.exports, './style.css': './styles.css'}});
        expect(errors).toEqual([]);
        expect(paths).toEqual([...DUAL_PATHS, 'styles.css']);
    });

    it('reads string shorthand exports', () => {
        expect(requiredPaths({exports: './dist/index.mjs'})).toEqual({paths: ['dist/index.mjs'], errors: []});
    });

    it('reads every member of a fallback array', () => {
        expect(requiredPaths({exports: {'.': ['./a.mjs', {default: './b.cjs'}]}}).paths).toEqual(['a.mjs', 'b.cjs']);
    });

    it('requires nothing for a null target', () => {
        expect(requiredPaths({exports: {'.': './a.mjs', './internal': null}})).toEqual({paths: ['a.mjs'], errors: []});
    });

    it('resolves a bare entry field relative to the package root', () => {
        expect(requiredPaths({main: 'dist/index.cjs'}).paths).toEqual(['dist/index.cjs']);
    });

    it('reads typings', () => {
        expect(requiredPaths({typings: './dist/index.d.ts'}).paths).toEqual(['dist/index.d.ts']);
    });

    it('errors on a subpath pattern key', () => {
        const {paths, errors} = requiredPaths({exports: {'./*': './dist/*.mjs'}});
        expect(paths).toEqual([]);
        expect(errors).toEqual(['exports["./*"]: subpath pattern cannot be resolved to one file']);
    });

    it('errors on a pattern target', () => {
        expect(requiredPaths({exports: {'.': './dist/*.mjs'}}).errors).toEqual([
            'exports["."]: pattern target "./dist/*.mjs" cannot be resolved to one file',
        ]);
    });

    it('errors on a target outside "./"', () => {
        expect(requiredPaths({exports: {'.': 'dist/index.mjs'}}).errors).toEqual([
            'exports["."]: target "dist/index.mjs" does not start with "./"',
        ]);
    });

    it('errors on a target escaping the package', () => {
        expect(requiredPaths({exports: './../other/index.mjs'}).errors).toEqual([
            'exports: target "./../other/index.mjs" does not name a file inside the package',
        ]);
    });

    it('errors on a target naming the package root', () => {
        expect(requiredPaths({exports: './'}).errors).toEqual([
            'exports: target "./" does not name a file inside the package',
        ]);
    });

    it('errors on a folder target', () => {
        expect(requiredPaths({exports: {'./features/': './dist/features/'}}).errors).toEqual([
            'exports["./features/"]: target "./dist/features/" does not name a file inside the package',
        ]);
    });

    it('errors on a non-string leaf', () => {
        expect(requiredPaths({exports: {'.': 42}}).errors).toEqual([
            'exports["."]: target is 42, expected a "./" path',
        ]);
        expect(requiredPaths({main: {path: 'x'}}).errors).toEqual([
            'main: target is {"path":"x"}, expected a "./" path',
        ]);
    });

    it('requires nothing from a manifest without entry fields', () => {
        expect(requiredPaths({name: 'x'})).toEqual({paths: [], errors: []});
    });
});

describe('cssHasNoRules', () => {
    it('is true for comments and whitespace only', () => {
        expect(cssHasNoRules('/* header */\n\n  /* another\n line */\n')).toBe(true);
        expect(cssHasNoRules('   \n')).toBe(true);
    });

    it('is true for text that is not a rule block', () => {
        expect(cssHasNoRules('not CSS')).toBe(true);
        expect(cssHasNoRules('/* header */\nnot CSS\n')).toBe(true);
    });

    it('is true for a block with no selector or at-rule before it', () => {
        expect(cssHasNoRules('{color:red}')).toBe(true);
    });

    it('is true for a rule hidden inside a comment', () => {
        expect(cssHasNoRules('/* .a{color:red} */')).toBe(true);
    });

    it('is false for an empty rule block', () => {
        expect(cssHasNoRules('.a{}')).toBe(false);
    });

    it('is false once a rule survives the comments', () => {
        expect(cssHasNoRules('/* header */\n.a{color:red}')).toBe(false);
    });

    it('is false for a rule nested in an at-rule', () => {
        expect(cssHasNoRules('@media (x){.a{color:red}}')).toBe(false);
    });

    it('is false for the shipped ui-inputs stylesheet', () => {
        expect(cssHasNoRules(readFileSync('packages/ui-inputs/styles.css', 'utf8'))).toBe(false);
    });
});

describe('checkPackage', () => {
    const files = [
        {path: 'dist/index.mjs', size: 10},
        {path: 'styles.css', size: 20},
    ];
    const readText = () => '.a{color:red}';

    it('passes when every required file ships non-empty', () => {
        const verdict = checkPackage({name: 'p', required: ['dist/index.mjs', 'styles.css'], files, readText});
        expect(verdict).toEqual({failures: [], passes: ['dist/index.mjs: 10 bytes OK', 'styles.css: 20 bytes OK']});
    });

    it('fails a required file the tarball does not carry', () => {
        expect(checkPackage({name: 'p', required: ['dist/index.cjs'], files, readText}).failures).toEqual([
            'p is missing dist/index.cjs in published tarball',
        ]);
    });

    it('fails a 0-byte required file', () => {
        const empty = [{path: 'styles.css', size: 0}];
        expect(checkPackage({name: 'p', required: ['styles.css'], files: empty, readText}).failures).toEqual([
            'p styles.css is 0 bytes',
        ]);
    });

    it('fails a stylesheet holding only comments', () => {
        const verdict = checkPackage({name: 'p', required: ['styles.css'], files, readText: () => '/* gone */\n'});
        expect(verdict.failures).toEqual(['p styles.css holds no rule block']);
    });

    it('fails a stylesheet holding text that is not CSS', () => {
        const verdict = checkPackage({name: 'p', required: ['styles.css'], files, readText: () => 'not CSS'});
        expect(verdict.failures).toEqual(['p styles.css holds no rule block']);
    });

    it('does not read non-css files for rules', () => {
        const verdict = checkPackage({
            name: 'p',
            required: ['dist/index.mjs'],
            files,
            readText: () => {
                throw new Error('read');
            },
        });
        expect(verdict.failures).toEqual([]);
    });

    it('fails a package with nothing required', () => {
        expect(checkPackage({name: 'p', required: [], files, readText}).failures).toEqual([
            'p: manifest names 0 required files — nothing to validate',
        ]);
    });
});

describe('the workspace manifests', () => {
    const manifests = readdirSync('packages')
        .map((name) => path.join('packages', name, 'package.json'))
        .flatMap((file) => {
            try {
                return [JSON.parse(readFileSync(file, 'utf8'))];
            } catch {
                return [];
            }
        });

    it('finds the packages', () => {
        expect(manifests.length).toBeGreaterThan(0);
    });

    it('derive at least the four dual-format entries from every manifest, without errors', () => {
        for (const manifest of manifests) {
            const {paths, errors} = requiredPaths(manifest);
            expect(errors, manifest.name).toEqual([]);
            expect(paths, manifest.name).toEqual(expect.arrayContaining(DUAL_PATHS));
        }
    });

    it('derive the ui-inputs stylesheet', () => {
        const uiInputs = manifests.find((manifest) => manifest.name === '@script-development/ui-inputs');
        expect(requiredPaths(uiInputs).paths).toContain('styles.css');
    });
});

describe('allowedCommentKind', () => {
    it('allows region markers', () => {
        expect(allowedCommentKind('//#region src/http.ts')).toBe('region');
        expect(allowedCommentKind('//#endregion')).toBe('region');
    });

    it('allows exact annotations, with or without padding', () => {
        expect(allowedCommentKind('/* @__PURE__ */')).toBe('annotation');
        expect(allowedCommentKind('/*@__PURE__*/')).toBe('annotation');
        expect(allowedCommentKind('/*#__PURE__*/')).toBe('annotation');
        expect(allowedCommentKind('/* @__NO_SIDE_EFFECTS__ */')).toBe('annotation');
        expect(allowedCommentKind('/* #__NO_SIDE_EFFECTS__ */')).toBe('annotation');
    });

    it('allows exact coverage directives', () => {
        expect(allowedCommentKind('// v8 ignore next')).toBe('coverage');
        expect(allowedCommentKind('// c8 ignore start')).toBe('coverage');
        expect(allowedCommentKind('// istanbul ignore else')).toBe('coverage');
    });

    it('allows legal comments', () => {
        expect(allowedCommentKind('/*! MIT */')).toBe('legal');
        expect(allowedCommentKind('//! MIT')).toBe('legal');
        expect(allowedCommentKind('/** @license MIT */')).toBe('legal');
        expect(allowedCommentKind('/* @preserve keep */')).toBe('legal');
    });

    it('rejects plain line, block and JSDoc comments', () => {
        expect(allowedCommentKind('// the consumer needs this')).toBeNull();
        expect(allowedCommentKind('/* the consumer needs this */')).toBeNull();
        expect(allowedCommentKind('/** the consumer needs this */')).toBeNull();
    });

    it('rejects an allowed kind carrying prose', () => {
        expect(allowedCommentKind('/* @__PURE__ the consumer needs this */')).toBeNull();
        expect(allowedCommentKind('// v8 ignore next -- the consumer needs this')).toBeNull();
        expect(allowedCommentKind('//#regional note')).toBeNull();
        expect(allowedCommentKind('// #region')).toBeNull();
    });
});

describe('listComments', () => {
    it('finds line, block and JSDoc comments with their line', () => {
        const text = 'const a = 1; // one\n/* two */\n/** three */\nconst b = 2;\n// four';
        expect(listComments(text, 'x.mjs')).toEqual([
            {line: 1, text: '// one'},
            {line: 2, text: '/* two */'},
            {line: 3, text: '/** three */'},
            {line: 5, text: '// four'},
        ]);
    });

    it('finds a comment at the start of the file and inside a template expression', () => {
        const text = '// first\nconst t = `a${/* inner */ 1}b`;';
        expect(listComments(text, 'x.mjs').map((comment) => comment.text)).toEqual(['// first', '/* inner */']);
    });

    it('does not read a comment out of a string, a template or a regex', () => {
        const text = [
            'const url = "https://example.test/* not */";',
            "const single = '// not';",
            'const t = `// not ${url} /* not */`;',
            'const re = /\\/\\/ not/;',
        ].join('\n');
        expect(listComments(text, 'x.mjs')).toEqual([]);
    });

    it('throws on a file that does not parse', () => {
        expect(() => listComments('const = ;', 'x.mjs')).toThrow('x.mjs does not parse');
    });
});

describe('checkContents', () => {
    const tarball = (texts) => ({
        files: Object.keys(texts).map((file) => ({path: file, size: 1})),
        readText: (file) => texts[file],
    });

    it('passes allowed comments and counts the JavaScript files it read', () => {
        const {files, readText} = tarball({
            'dist/index.mjs':
                '//#region src/a.ts\nconst a = /* @__PURE__ */ f();\n//#endregion\nconst u = "https://x";',
            'dist/index.cjs': '/*! MIT */\nmodule.exports = 1;',
            'dist/index.d.mts': '/** API documentation */\nexport declare const a: number;',
            'package.json': '{}',
        });
        expect(checkContents({name: 'p', files, readText})).toEqual({failures: [], jsFilesRead: 2});
    });

    it('fails a plain comment, naming the file, line and comment', () => {
        const {files, readText} = tarball({'dist/index.mjs': 'const a = 1;\n// planted\n/* second */'});
        expect(checkContents({name: 'p', files, readText}).failures).toEqual([
            'p dist/index.mjs:2 ships 2 source comment(s), first: // planted',
        ]);
    });

    it('fails a JSDoc block in JavaScript', () => {
        const {files, readText} = tarball({'dist/index.cjs': '/** private note */\nmodule.exports = 1;'});
        expect(checkContents({name: 'p', files, readText}).failures).toEqual([
            'p dist/index.cjs:1 ships 1 source comment(s), first: /** private note */',
        ]);
    });

    it('shortens a long comment in the message', () => {
        const {files, readText} = tarball({'dist/index.mjs': `// ${'x'.repeat(100)}`});
        const [failure] = checkContents({name: 'p', files, readText}).failures;
        expect(failure).toBe(`p dist/index.mjs:1 ships 1 source comment(s), first: // ${'x'.repeat(74)}...`);
    });

    it('fails a source map file without reading it', () => {
        const {files, readText} = tarball({'dist/index.mjs': 'export {};', 'dist/index.mjs.map': undefined});
        expect(checkContents({name: 'p', files, readText}).failures).toEqual(['p ships source map dist/index.mjs.map']);
    });

    it('fails a sourceMappingURL in JavaScript, type files and stylesheets', () => {
        const {files, readText} = tarball({
            'dist/index.mjs': 'export {};\n//# sourceMappingURL=index.mjs.map',
            'dist/index.d.mts': 'export {};\n//# sourceMappingURL=index.d.mts.map',
            'styles.css': '.a{}\n/*# sourceMappingURL=styles.css.map */',
        });
        expect(checkContents({name: 'p', files, readText}).failures).toEqual([
            'p dist/index.mjs references a source map (sourceMappingURL)',
            'p dist/index.mjs:2 ships 1 source comment(s), first: //# sourceMappingURL=index.mjs.map',
            'p dist/index.d.mts references a source map (sourceMappingURL)',
            'p styles.css references a source map (sourceMappingURL)',
        ]);
    });

    it('fails a JavaScript file that does not parse', () => {
        const {files, readText} = tarball({'dist/index.mjs': 'const = ;'});
        expect(checkContents({name: 'p', files, readText}).failures[0]).toMatch(/^p dist\/index\.mjs does not parse/);
    });

    it('fails a tarball with no JavaScript file', () => {
        const {files, readText} = tarball({'dist/index.d.mts': 'export {};', 'package.json': '{}'});
        expect(checkContents({name: 'p', files, readText})).toEqual({
            failures: ['p: tarball holds 0 JavaScript files — no comment was checked'],
            jsFilesRead: 0,
        });
    });

    it('fails an empty tarball', () => {
        expect(checkContents({name: 'p', files: [], readText: () => ''}).failures).toEqual([
            'p: tarball holds 0 JavaScript files — no comment was checked',
        ]);
    });
});
