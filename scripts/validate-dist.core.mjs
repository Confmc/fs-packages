import path from 'node:path';
import ts from 'typescript';

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

/**
 * True when, comments stripped, no rule block remains: a prelude (selector or at-rule)
 * followed by `{` and its innermost `}`. A rule nested in `@media … { … }` counts. This is
 * a structural test, not a parser — `nonsense {}` passes it; text with no block does not.
 */
export const cssHasNoRules = (text) => !/[^\s{};][^{};]*\{[^{}]*\}/.test(text.replaceAll(/\/\*[\s\S]*?\*\//g, ''));

/**
 * The verdict for one package: every required path present in the `npm pack --dry-run`
 * file list with a non-zero size, and every required `.css` holding at least one rule block.
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
            failures.push(`${name} ${requiredPath} holds no rule block`);
        } else {
            passes.push(`${requiredPath}: ${entry.size} bytes OK`);
        }
    }

    return {failures, passes};
};

const JS_FILE = /\.(?:mjs|cjs|js)$/;
const TEXT_FILE = /\.(?:mjs|cjs|js|d\.mts|d\.cts|d\.ts|css)$/;
const ANNOTATIONS = new Set(['@__PURE__', '#__PURE__', '@__NO_SIDE_EFFECTS__', '#__NO_SIDE_EFFECTS__']);
const REGION_MARKER = /^\/\/#(?:region|endregion)(?: \S.*)?$/;
const COVERAGE_DIRECTIVE = /^\/\/ (?:v8|c8|istanbul) ignore (?:next|start|stop|if|else|file)$/;
const LEGAL = /^(?:\/\*!|\/\/!)|@license|@preserve/;

/**
 * The kind of an emitted comment a published bundle may carry, or null when it is source
 * prose. A legal comment passes whatever else it says; every other kind must be the whole
 * comment, so `/* @__PURE__ note *\/` is prose.
 */
export const allowedCommentKind = (text) => {
    if (LEGAL.test(text)) {
        return 'legal';
    }
    if (REGION_MARKER.test(text)) {
        return 'region';
    }
    if (COVERAGE_DIRECTIVE.test(text)) {
        return 'coverage';
    }
    if (text.startsWith('/*') && ANNOTATIONS.has(text.slice(2, -2).trim())) {
        return 'annotation';
    }
    return null;
};

const isJsDocNode = (node) => node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;

/**
 * Every comment in a JavaScript file, read from the parsed token stream: a `//` inside a
 * string, template or regex is not a comment. Throws when the file does not parse, because a
 * misparsed file would hide its comments.
 */
export const listComments = (text, fileName) => {
    const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (source.parseDiagnostics.length > 0) {
        throw new Error(`${fileName} does not parse: ${source.parseDiagnostics[0].messageText}`);
    }
    const found = new Map();
    const collect = (position) => {
        const ranges = [
            ...(ts.getTrailingCommentRanges(text, position) ?? []),
            ...(ts.getLeadingCommentRanges(text, position) ?? []),
        ];
        for (const range of ranges) {
            found.set(range.pos, text.slice(range.pos, range.end));
        }
    };
    const visit = (node) => {
        if (isJsDocNode(node)) {
            return;
        }
        collect(node.getFullStart());
        for (const child of node.getChildren(source)) {
            visit(child);
        }
    };
    visit(source);
    return [...found.entries()]
        .sort(([a], [b]) => a - b)
        .map(([position, comment]) => ({line: source.getLineAndCharacterOfPosition(position).line + 1, text: comment}));
};

const excerpt = (comment) => {
    const flat = comment.replaceAll(/\s+/g, ' ');
    return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat;
};

/**
 * The verdict on what a package's tarball would publish beyond its promised files: no
 * source map, no `sourceMappingURL` pointing at one, and no comment in a JavaScript file
 * other than the kinds `allowedCommentKind` names. A tarball with no JavaScript file fails,
 * because nothing was read.
 */
export const checkContents = ({name, files, readText}) => {
    const failures = [];
    let jsFilesRead = 0;

    for (const {path: file} of files) {
        if (file.endsWith('.map')) {
            failures.push(`${name} ships source map ${file}`);
            continue;
        }
        if (!TEXT_FILE.test(file)) {
            continue;
        }
        const text = readText(file);
        if (text.includes('sourceMappingURL')) {
            failures.push(`${name} ${file} references a source map (sourceMappingURL)`);
        }
        if (!JS_FILE.test(file)) {
            continue;
        }
        jsFilesRead += 1;
        let comments;
        try {
            comments = listComments(text, file);
        } catch (error) {
            failures.push(`${name} ${error.message}`);
            continue;
        }
        const prose = comments.filter((comment) => allowedCommentKind(comment.text) === null);
        if (prose.length > 0) {
            failures.push(
                `${name} ${file}:${prose[0].line} ships ${prose.length} source comment(s), first: ${excerpt(prose[0].text)}`,
            );
        }
    }

    if (jsFilesRead === 0) {
        failures.push(`${name}: tarball holds 0 JavaScript files — no comment was checked`);
    }

    return {failures, jsFilesRead};
};
