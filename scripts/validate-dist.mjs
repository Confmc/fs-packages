#!/usr/bin/env node
// Dist-validation gate — every file a workspace package's manifest promises consumers
// must ship in its tarball, present and non-empty.
//
// RULE: the required set is derived from each packages/*/package.json — every `exports`
//   target (all conditions, nested objects, subpath maps, string shorthand, fallback
//   arrays) plus `main` / `module` / `types` / `typings`. Each must appear in the
//   `npm pack --dry-run --json` file list with size > 0; a required `.css` must also hold
//   a rule block — a selector or at-rule followed by `{…}`, outside comments (a structural
//   test, not a CSS parser). A target the derivation cannot resolve to one file (a `*`
//   pattern, a folder, a path outside `./`) fails the gate rather than being skipped.
//   Zero packages, or zero required files in any package, fails too.
//   Derivation and verdict live in validate-dist.core.mjs, exercised by
//   validate-dist.test.mjs.
//
// One script, two callers: ci.yml runs it at PR time after `npm run build`, publish.yml
//   before `changeset publish` — so an empty or missing artifact (the fs-http 0.1.1 /
//   0.1.2 empty-tarball class) reds a PR, not a release.
//
// SCOPE: presence and non-emptiness only. Artifact contents and type correctness are
//   attw's and publint's (lint:pkg).

import {spawnSync} from 'node:child_process';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

import {checkPackage, requiredPaths} from './validate-dist.core.mjs';

const PACKAGES_DIR = 'packages';

const listPackageDirs = () =>
    readdirSync(PACKAGES_DIR)
        .map((name) => path.join(PACKAGES_DIR, name))
        .filter((dir) => {
            // A stray file in packages/ is legitimately not a package — skip it. The dir
            // statSync is intentionally uncaught: a race/EACCES on an entry readdir just
            // returned is a real I/O fault and must fail the gate loud, never vanish.
            if (!statSync(dir).isDirectory()) {
                return false;
            }
            try {
                return statSync(path.join(dir, 'package.json')).isFile();
            } catch (err) {
                // Only a genuinely-absent manifest (ENOENT) means "not a package" — skip.
                // EACCES / EIO / a transient race on a real package's manifest must NOT be
                // swallowed into a silent skip: dropping a package from validation is the
                // exact silent-pass this gate exists to prevent. Fail loud instead.
                if (err.code === 'ENOENT') {
                    return false;
                }
                throw err;
            }
        })
        .sort();

const readManifest = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));

// Returns the tarball file list from `npm pack --dry-run --json`, or null on failure.
const packFileList = (dir) => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        shell: false,
    });
    if (result.status !== 0) {
        process.stderr.write(result.stderr ?? '');
        return null;
    }
    try {
        const parsed = JSON.parse(result.stdout);
        return parsed[0]?.files ?? null;
    } catch {
        return null;
    }
};

const main = () => {
    const dirs = listPackageDirs();

    // Floor assertion: a zero-package result means packages/ is present but empty (a
    // catastrophic checkout/artifact failure), or every entry was filtered out. With no
    // dirs the loop never runs, failures stays empty, and the gate would PASS on nothing
    // validated — a silent green. Refuse it.
    if (dirs.length === 0) {
        process.stderr.write(
            '::error::validate:dist found 0 packages under packages/ — refusing to pass with nothing validated (empty checkout or missing artifact?)\n',
        );
        process.exit(1);
    }

    const failures = [];

    const counts = [];

    for (const dir of dirs) {
        const manifest = readManifest(dir);
        const name = manifest.name ?? dir;
        process.stdout.write(`\n--- validate:dist ${name} (${dir}) ---\n`);

        const {paths: required, errors} = requiredPaths(manifest);
        for (const error of errors) {
            const msg = `${name}: ${error}`;
            process.stdout.write(`::error::${msg}\n`);
            failures.push(msg);
        }
        counts.push(`${name}=${required.length}`);

        const files = packFileList(dir);
        if (files === null) {
            const msg = `${name}: \`npm pack --dry-run --json\` failed or returned no file list`;
            process.stdout.write(`::error::${msg}\n`);
            failures.push(msg);
            continue;
        }

        const verdict = checkPackage({
            name,
            required,
            files,
            readText: (file) => readFileSync(path.join(dir, file), 'utf8'),
        });
        for (const pass of verdict.passes) {
            process.stdout.write(`  ${pass}\n`);
        }
        for (const msg of verdict.failures) {
            process.stdout.write(`::error::${msg}\n`);
            failures.push(msg);
        }
    }

    process.stdout.write(`\nrequired files per package: ${counts.join(', ')}\n`);

    if (failures.length > 0) {
        process.stderr.write(`\nDist validation FAILED (${failures.length}). Refusing empty or incomplete tarballs:\n`);
        for (const f of failures) {
            process.stderr.write(`  - ${f}\n`);
        }
        process.exit(1);
    }

    process.stdout.write(
        `\nvalidate:dist gate PASS — ${dirs.length} packages: every manifest-promised file present and non-empty.\n`,
    );
};

main();
