#!/usr/bin/env node
// Gate 6 (lint:pkg) enforcer — per-manifest publish-readiness assertions.
//
// 1. publint + attw — treats publint suggestions/warnings/errors as fatal.
//    publint 0.3.18 CLI does not expose a flag to fail on suggestions
//    (--strict only promotes warnings → errors). This wrapper fills that gap:
//    it runs publint per workspace, captures stdout, and fails the gate if any
//    package emits a "Suggestions:", "Warnings:", or "Errors:" block.
//    attw --pack runs after publint per package and preserves its own exit code.
//    Motivated by enforcement queue #33 and the PR #35 regression: publint
//    suggestions about the "git+" URL prefix silently re-drifted across 10
//    packages because the gate tolerated them.
//
// 2. engines.node presence — closes enforcement queue #31 (drift-prevention
//    gate, deployed 2026-05-12). Every workspace package.json AND the root
//    package.json must declare a non-empty `engines.node` string. Value is NOT
//    validated (presence-only — the queue-31 target is "any new package added
//    to the Armory ships with the declaration"; value alignment across the
//    corpus is a separate doctrine question). The declarations themselves
//    landed 2026-04-22 via commit 0605d99 — this gate prevents regression on
//    new packages and on edits that strip the field.

import {spawnSync} from 'node:child_process';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

const PACKAGES_DIR = 'packages';
const ROOT_MANIFEST = 'package.json';
const PUBLINT_BLOCK_RE = /^(Suggestions|Warnings|Errors):$/m;

function listPackageDirs() {
    return readdirSync(PACKAGES_DIR)
        .map((name) => join(PACKAGES_DIR, name))
        .filter((dir) => {
            try {
                return statSync(dir).isDirectory() && statSync(join(dir, 'package.json')).isFile();
            } catch {
                return false;
            }
        })
        .sort();
}

function readManifest(manifestPath) {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function packageName(dir) {
    return readManifest(join(dir, 'package.json')).name ?? dir;
}

function checkEnginesNode(manifestPath, label) {
    const pkg = readManifest(manifestPath);
    if (pkg.engines === undefined || pkg.engines === null) {
        return `${label}: engines field missing (queue #31 — engines.node presence required)`;
    }
    const node = pkg.engines.node;
    if (typeof node !== 'string' || node.trim() === '') {
        return `${label}: engines.node missing or not a non-empty string (queue #31)`;
    }
    return null;
}

function runCaptured(cmd, args, cwd) {
    const result = spawnSync(cmd, args, {cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', shell: false});
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    return {stdout, stderr, status: result.status ?? 1};
}

function main() {
    const dirs = listPackageDirs();
    const failures = [];

    // Root manifest engines.node presence check (queue #31). Root is not in
    // packages/*, so it gets a dedicated assertion before the per-package loop.
    process.stdout.write(`\n--- lint:pkg engines.node (root ${ROOT_MANIFEST}) ---\n`);
    const rootFailure = checkEnginesNode(ROOT_MANIFEST, 'workspace-root');
    if (rootFailure) {
        failures.push(rootFailure);
        process.stderr.write(`  ${rootFailure}\n`);
    } else {
        process.stdout.write(`  workspace-root: engines.node OK\n`);
    }

    for (const dir of dirs) {
        const name = packageName(dir);
        process.stdout.write(`\n--- lint:pkg ${name} (${dir}) ---\n`);

        const enginesFailure = checkEnginesNode(join(dir, 'package.json'), name);
        if (enginesFailure) {
            failures.push(enginesFailure);
            process.stderr.write(`  ${enginesFailure}\n`);
        }

        const publint = runCaptured('npx', ['publint', 'run'], dir);
        const publintBlock = PUBLINT_BLOCK_RE.exec(publint.stdout);
        if (publint.status !== 0) {
            failures.push(`${name}: publint exited ${publint.status}`);
        } else if (publintBlock) {
            failures.push(`${name}: publint emitted "${publintBlock[1]}:" block (fail-on-suggestion gate)`);
        }

        const attw = runCaptured('npx', ['attw', '--pack'], dir);
        if (attw.status !== 0) {
            failures.push(`${name}: attw exited ${attw.status}`);
        }
    }

    if (failures.length > 0) {
        process.stderr.write(`\n\nlint:pkg gate FAILED (${failures.length}):\n`);
        for (const f of failures) {
            process.stderr.write(`  - ${f}\n`);
        }
        process.exit(1);
    }

    process.stdout.write(
        `\nlint:pkg gate PASS — ${dirs.length} packages + root clean (engines.node present; publint suggestions/warnings/errors all treated as fatal).\n`,
    );
}

main();
