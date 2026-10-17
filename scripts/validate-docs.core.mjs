/**
 * Docs-enumeration decision logic — every branch, no I/O.
 *
 * The docs site lists the packages in four places a reader actually uses: a page under
 * `docs/packages/`, the VitePress sidebar, the package tables on the home page, and the
 * install list in Getting Started. Nothing tied those four lists to `packages/`, so a
 * package could ship to npm and stay invisible on the site — three did.
 *
 * "Publishable" is the rule `detect-publishable.core.mjs` applies: a manifest without
 * `"private": true` is one npm will receive, so it owes the site an entry.
 */

/** The four surfaces, in the order a finding is reported. */
export const SURFACES = Object.freeze({
    page: 'docs/packages/<dir>.md',
    sidebar: 'docs/.vitepress/config.mts sidebar',
    index: 'docs/index.md package tables',
    gettingStarted: 'docs/getting-started.md install list',
});

export const isPublishable = (manifest) => manifest.private !== true;

const escapeRegExp = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * Whether each surface names the package. Every match is anchored on `/packages/<dir>`
 * plus a closing delimiter, so `adapter-store` can never be satisfied by
 * `cached-adapter-store` and the reverse.
 */
const surfaceHas = {
    page: ({pages}, {dir}) => pages.includes(`${dir}.md`),
    sidebar: ({sidebar}, {dir}) => new RegExp(String.raw`link:\s*(['"])/packages/${escapeRegExp(dir)}\1`).test(sidebar),
    index: ({index}, {dir}) =>
        index.split('\n').some((line) => line.trimStart().startsWith('|') && line.includes(`](/packages/${dir})`)),
    gettingStarted: ({gettingStarted}, {name}) =>
        gettingStarted.split('\n').some((line) => line.trim() === `npm install ${name}`),
};

/**
 * `packages` is `null` when the packages directory could not be read; each entry is
 * `{dir, manifest}` where `manifest` may be `{__unreadable}`. A docs surface that could
 * not be read arrives as `null`.
 *
 * A guard must assert a non-empty denominator: zero packages scanned reads as "every
 * package is documented" both when the tree is clean and when the scan is broken.
 */
export const checkDocsEnumeration = ({packages, scanError, pages, sidebar, index, gettingStarted}) => {
    const errors = [];
    const missing = [];

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
        for (const pkg of documented) {
            for (const surface of Object.keys(SURFACES)) {
                if (!surfaceHas[surface](surfaces, pkg)) missing.push({...pkg, surface});
            }
        }
    }

    return {passed: errors.length === 0 && missing.length === 0, scanned: documented.length, errors, missing};
};

/** One line per missing entry, naming the file to edit. */
export const describeMissing = ({name, dir, surface}) =>
    surface === 'page'
        ? `${name} — no page at ${SURFACES.page.replace('<dir>', dir)}`
        : `${name} — no entry in ${SURFACES[surface]}`;
