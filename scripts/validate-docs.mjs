#!/usr/bin/env node
/**
 * I/O shell for `validate:docs`: every publishable package under `packages/` has a docs
 * page, a sidebar entry, a row in the home page's package tables and an install line in
 * Getting Started. The decision lives in `validate-docs.core.mjs`, exercised by
 * `validate-docs.test.mjs`; keep logic out of this file.
 */
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

import {checkDocsEnumeration, describeMissing} from './validate-docs.core.mjs';

const readText = (file) => {
    try {
        return readFileSync(file, 'utf8');
    } catch {
        return null;
    }
};

const readManifest = (dir) => {
    try {
        return JSON.parse(readFileSync(path.join('packages', dir, 'package.json'), 'utf8'));
    } catch (error) {
        return {__unreadable: error.message};
    }
};

let packages = null;
let scanError;
try {
    packages = readdirSync('packages', {withFileTypes: true})
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({dir: entry.name, manifest: readManifest(entry.name)}));
} catch (error) {
    scanError = error.message;
}

let pages = null;
try {
    pages = readdirSync(path.join('docs', 'packages'));
} catch {
    pages = null;
}

const verdict = checkDocsEnumeration({
    packages,
    scanError,
    pages,
    sidebar: readText(path.join('docs', '.vitepress', 'config.mts')),
    index: readText(path.join('docs', 'index.md')),
    gettingStarted: readText(path.join('docs', 'getting-started.md')),
});

if (!verdict.passed) {
    console.error(`validate:docs gate FAIL — ${verdict.scanned} publishable package(s) scanned:\n`);
    for (const error of verdict.errors) console.error(`  - ${error}`);
    for (const entry of verdict.missing) console.error(`  - ${describeMissing(entry)}`);
    process.exit(1);
}

console.log(
    `validate:docs gate PASS — ${verdict.scanned} publishable package(s), each with a page, a sidebar entry, a home-page row and an install line.`,
);
