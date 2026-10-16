import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {checkPackage, cssHasNoRules, requiredPaths} from './validate-dist.core.mjs';

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

    it('is false once a rule survives the comments', () => {
        expect(cssHasNoRules('/* header */\n.a{color:red}')).toBe(false);
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
        expect(verdict.failures).toEqual(['p styles.css holds only comments and whitespace']);
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
