// `process` is not a browser global, and this package declares no node types. The reference below
// exists purely as the token a consumer bundler replaces statically, which is what folds the
// package's dev-only guards out of a production build. Vite and webpack substitute it by default;
// ROLLUP DOES NOT — it needs `@rollup/plugin-replace` — so an unreplaced token reaching a browser
// is a real shipping state, and there it is a `ReferenceError` at mount rather than a missed
// optimisation. The `typeof` check is what closes that: an environment this package cannot read is
// treated as production and every dev warning stays SILENT, because a library must not warn into a
// host it cannot identify.
//
// `import.meta.env` is NOT usable here: ui-inputs emits a CJS artifact too, where `import.meta` is
// a syntax error — the same reason `.oxlintrc.json` disables `unicorn/prefer-import-meta-properties`.
declare const process: {env: {NODE_ENV?: string}};

/**
 * Whether this package's dev-only diagnostics must stay quiet. The `process.env.NODE_ENV` token is
 * left verbatim so a bundler's static replacement still folds the comparison away (verified against
 * the built `dist/index.cjs` and `dist/index.mjs`, where the token survives and nothing guards it
 * out of existence).
 */
export const devWarningsSuppressed = (): boolean =>
    typeof process === 'undefined' || process.env.NODE_ENV === 'production';
