import path from 'node:path';

const ENTRY_FIELDS = ['main', 'module', 'types', 'typings'];

/**
 * Every file a package's manifest promises to consumers: each `exports` target (string
 * shorthand, condition objects, subpath maps and fallback arrays, at any depth) plus the
 * legacy entry fields. Tarball-relative (`dist/index.mjs`, not `./dist/index.mjs`).
 *
 * A `null` target deliberately exports nothing, so it requires nothing. A shape this
 * cannot resolve to one concrete file — a `*` subpath pattern, a folder target, a target
 * outside `./`, a non-string leaf — is an error, never a skip: an unreadable promise is not a kept one.
 */
export const requiredPaths = (manifest) => {
    const paths = new Set();
    const errors = [];

    const addTarget = (target, where) => {
        if (typeof target !== 'string') {
            errors.push(`${where}: target is ${JSON.stringify(target)}, expected a "./" path`);
            return;
        }
        if (!target.startsWith('./')) {
            errors.push(`${where}: target "${target}" does not start with "./"`);
            return;
        }
        if (target.includes('*')) {
            errors.push(`${where}: pattern target "${target}" cannot be resolved to one file`);
            return;
        }
        const normalized = path.posix.normalize(target);
        if (normalized === '.' || normalized.endsWith('/') || normalized.startsWith('..')) {
            errors.push(`${where}: target "${target}" does not name a file inside the package`);
            return;
        }
        paths.add(normalized);
    };

    const walkExports = (value, where) => {
        if (value === null) {
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item, index) => walkExports(item, `${where}[${index}]`));
            return;
        }
        if (typeof value === 'object') {
            for (const [key, inner] of Object.entries(value)) {
                if (key.includes('*')) {
                    errors.push(`${where}["${key}"]: subpath pattern cannot be resolved to one file`);
                    continue;
                }
                walkExports(inner, `${where}["${key}"]`);
            }
            return;
        }
        addTarget(value, where);
    };

    if (manifest.exports !== undefined) {
        walkExports(manifest.exports, 'exports');
    }
    for (const field of ENTRY_FIELDS) {
        const value = manifest[field];
        if (value !== undefined) {
            // npm resolves a bare `main: "dist/index.cjs"` relative to the package root.
            addTarget(typeof value === 'string' && !value.startsWith('./') ? `./${value}` : value, field);
        }
    }

    return {paths: [...paths].sort(), errors};
};

/** A stylesheet whose bytes are only comments and whitespace styles nothing. */
export const cssHasNoRules = (text) => text.replaceAll(/\/\*[\s\S]*?\*\//g, '').trim() === '';

/**
 * The verdict for one package: every required path present in the `npm pack --dry-run`
 * file list with a non-zero size, and every required `.css` carrying at least one rule.
 * Zero required paths fails too — a package that promises nothing has not been checked.
 */
export const checkPackage = ({name, required, files, readText}) => {
    const failures = [];
    const passes = [];

    if (required.length === 0) {
        failures.push(`${name}: manifest names 0 required files — nothing to validate`);
    }

    for (const requiredPath of required) {
        const entry = files.find((file) => file.path === requiredPath);
        if (entry === undefined) {
            failures.push(`${name} is missing ${requiredPath} in published tarball`);
        } else if (entry.size === 0) {
            failures.push(`${name} ${requiredPath} is 0 bytes`);
        } else if (requiredPath.endsWith('.css') && cssHasNoRules(readText(requiredPath))) {
            failures.push(`${name} ${requiredPath} holds only comments and whitespace`);
        } else {
            passes.push(`${requiredPath}: ${entry.size} bytes OK`);
        }
    }

    return {failures, passes};
};
