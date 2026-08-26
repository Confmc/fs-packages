// `process` is not a browser global, and this package declares no node types. The reference below
// exists purely as the token a consumer bundler replaces statically, which is what folds the
// package's dev-only guards out of a production build. Vite and webpack substitute it by default;
// ROLLUP DOES NOT — it needs `@rollup/plugin-replace` — so an unreplaced token reaching a browser
// is a real shipping state, and there it is a crash at mount rather than a missed optimisation.
//
// `env` is declared OPTIONAL because a host may supply a partial shim: `globalThis.process = {}`
// is a real browser polyfill shape, and reading `.NODE_ENV` off its missing `env` throws exactly
// like an absent `process` does (measured, both). The type says what the host may actually hand us,
// not what node would.
//
// `import.meta.env` is NOT usable here: ui-inputs emits a CJS artifact too, where `import.meta` is
// a syntax error — the same reason `.oxlintrc.json` disables `unicorn/prefer-import-meta-properties`.
declare const process: {env?: {NODE_ENV?: string}};

/**
 * Whether this package's dev-only diagnostics must stay quiet.
 *
 * Both guards fail SILENT: an environment this package cannot read is treated as production,
 * because a library must not warn into a host it cannot identify — and must not crash there
 * either. The absent-`process` and partial-shim legs are what deliver that.
 *
 * The final comparison keeps the `process.env.NODE_ENV` token VERBATIM so a bundler's static
 * replacement still folds it away — writing it as `process.env?.NODE_ENV` would destroy the token
 * and the guard would stop folding out of production builds. Verified against the built
 * `dist/index.cjs` and `dist/index.mjs`, where the token survives in both.
 */
export const devWarningsSuppressed = (): boolean => {
    if (typeof process === 'undefined') return true;
    if (process.env === undefined) return true;

    return process.env.NODE_ENV === 'production';
};
