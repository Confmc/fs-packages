/**
 * Docs-enumeration decision logic — every branch, no I/O.
 *
 * The docs site lists the packages in four places a reader actually uses: a page under
 * `docs/packages/`, the VitePress sidebar, the package tables on the home page, and the
 * install list in Getting Started. Nothing tied those four lists to `packages/`, so a
 * package could ship to npm and stay invisible on the site — three did.
 *
 * The check runs both ways from one reading of each surface: every publishable package
 * must appear on every surface, and every package a surface names must exist. A
 * publishable package is one whose manifest is not private — the rule
 * `detect-publishable.core.mjs` applies, imported rather than restated.
 */
import {isPrivateManifest} from './detect-publishable.core.mjs';

/** The four surfaces, in the order a finding is reported. */
export const SURFACES = Object.freeze({
    page: 'docs/packages/<dir>.md',
    sidebar: 'docs/.vitepress/config.mts sidebar',
    index: 'docs/index.md package tables',
    gettingStarted: 'docs/getting-started.md install list',
});

export const isPublishable = (manifest) => !isPrivateManifest(manifest);

const SIDEBAR_LINK = /link:\s*(['"])\/packages\/([^'"#]+)(?:#[^'"]*)?\1/g;
const INDEX_LINK = /\]\(\/packages\/([^)#\s]+)(?:#[^)\s]*)?\)/g;
const INSTALL_LINE = /^npm install (@script-development\/\S+)$/;

/**
 * What each surface names, as exact keys: a package directory for the first three, the
 * npm name for the install list. Both directions compare against these sets, so a match
 * is exact by construction — `adapter-store` can never be satisfied by
 * `cached-adapter-store`, and the reverse.
 */
const surfaceNames = {
    page: ({pages}) => new Set(pages.filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3))),
    sidebar: ({sidebar}) => new Set([...sidebar.matchAll(SIDEBAR_LINK)].map((match) => match[2])),
    index: ({index}) =>
        new Set(
            index
                .split('\n')
                .filter((line) => line.trimStart().startsWith('|'))
                .flatMap((line) => [...line.matchAll(INDEX_LINK)].map((match) => match[1])),
        ),
    gettingStarted: ({gettingStarted}) =>
        new Set(
            gettingStarted
                .split('\n')
                .map((line) => INSTALL_LINE.exec(line.trim()))
                .filter((match) => match !== null)
                .map((match) => match[1]),
        ),
};

const keyFor = (surface, {dir, name}) => (surface === 'gettingStarted' ? name : dir);

/**
 * `packages` is `null` when the packages directory could not be read; each entry is
 * `{dir, manifest}` where `manifest` may be `{__unreadable}`. A docs surface that could
 * not be read arrives as `null`.
 *
 * A guard must assert a non-empty denominator: zero packages scanned reads as "every
 * package is documented" both when the tree is clean and when the scan is broken. The
 * reverse direction needs no denominator of its own — it reads the same sets the forward
 * direction does, so a surface that yields nothing reds the forward check for every
 * package.
 */
export const checkDocsEnumeration = ({packages, scanError, pages, sidebar, index, gettingStarted}) => {
    const errors = [];
    const missing = [];
    const orphans = [];

    if (packages === null || packages === undefined) {
        errors.push(`the packages directory could not be read${scanError ? ` (${scanError})` : ''}`);
    } else if (packages.length === 0) {
        errors.push('the packages directory holds no package, so this check proves nothing');
    }

    const surfaces = {pages, sidebar, index, gettingStarted};
    for (const [key, value] of Object.entries(surfaces)) {
        if (value === null || value === undefined) {
            errors.push(`${key === 'pages' ? 'docs/packages/' : key} could not be read`);
        }
    }

    const documented = [];
    for (const {dir, manifest} of packages ?? []) {
        if (manifest.__unreadable) {
            errors.push(`packages/${dir}/package.json could not be read (${manifest.__unreadable})`);
            continue;
        }
        if (!isPublishable(manifest)) continue;
        if (!manifest.name) {
            errors.push(`packages/${dir}/package.json has no name`);
            continue;
        }
        documented.push({dir, name: manifest.name});
    }

    if (errors.length === 0) {
        for (const surface of Object.keys(SURFACES)) {
            const named = surfaceNames[surface](surfaces);
            const known = new Set(documented.map((pkg) => keyFor(surface, pkg)));
            for (const pkg of documented) {
                if (!named.has(keyFor(surface, pkg))) missing.push({...pkg, surface});
            }
            for (const key of named) {
                if (!known.has(key)) orphans.push({surface, key});
            }
        }
    }

    return {
        passed: errors.length === 0 && missing.length === 0 && orphans.length === 0,
        scanned: documented.length,
        errors,
        missing,
        orphans,
    };
};

/** One line per missing entry, naming the file to edit. */
export const describeMissing = ({name, dir, surface}) =>
    surface === 'page'
        ? `${name} — no page at ${SURFACES.page.replace('<dir>', dir)}`
        : `${name} — no entry in ${SURFACES[surface]}`;

/** One line per entry that names no publishable package, naming the file to edit. */
export const describeOrphan = ({surface, key}) =>
    surface === 'page'
        ? `${SURFACES.page.replace('<dir>', key)} — a page for no publishable package under packages/`
        : `${key} — named in ${SURFACES[surface]}, but no publishable package under packages/ has that ${
              surface === 'gettingStarted' ? 'name' : 'directory'
          }`;
