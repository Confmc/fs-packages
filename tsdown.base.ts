import type {UserConfig} from 'tsdown';

// Every package's tarball is public. A source map would publish the source text, and a kept
// comment publishes whatever the source comment says, so the JS keeps only what a bundler or
// a consumer's machine reads (legal + annotation comments); the type files keep their JSDoc.
// validate:dist fails a dist that ships a map or any other comment.
export const baseConfig = {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    // The dts build defaults its maps to the tsconfig's `declarationMap`, and they switch the
    // ESM build's maps back on with them.
    dts: {sourcemap: false},
    clean: true,
    sourcemap: false,
    outputOptions: {comments: {legal: true, annotation: true, jsdoc: false}},
} satisfies UserConfig;
