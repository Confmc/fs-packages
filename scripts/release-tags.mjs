#!/usr/bin/env node
/**
 * Push the release tag of every package version this commit published.
 *
 * Runs as `publish.yml`'s `tags` job, after `publish` whatever its result, including
 * when `publish` was skipped. That is the recovery path: a re-run of either kind
 * reaches this job, works out from the registry which tags the commit owes, and pushes
 * only the ones the remote lacks, so running it twice is safe.
 *
 * ── THIS FILE IS THE I/O SHELL ────────────────────────────────────────────────────
 * Every decision lives in `release-tags.core.mjs`, which `release-tags.test.mjs`
 * exercises on every PR. What remains here is syscalls and printing.
 *
 * Zero dependencies, matching `detect-publishable.mjs`.
 */
import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

import {decideAll, interpretVersionDoc, parseRemoteTags, planTags, SCAN_NAME} from './release-tags.core.mjs';

const PACKAGES_DIR = 'packages';
const PUBLISH_RESULT = process.env.PUBLISH_RESULT ?? 'unknown';
// npm can take a moment to show a version it has just accepted.
const LOOKUP_ATTEMPTS = 4;
const RETRY_MS = 15_000;

const run = (command, args) =>
    execFileSync(command, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000});

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const readManifest = (dir) => {
    try {
        return JSON.parse(readFileSync(path.join(PACKAGES_DIR, dir, 'package.json'), 'utf8'));
    } catch (error) {
        return {__unreadable: error.message};
    }
};

const lookupOnce = (spec) => {
    try {
        return interpretVersionDoc({stdout: run('npm', ['view', spec, '--json'])});
    } catch (error) {
        return interpretVersionDoc({stderr: (error.stderr ?? '').toString(), message: error.message});
    }
};

const lookupVersion = (spec) => {
    for (let attempt = 1; ; attempt += 1) {
        const result = lookupOnce(spec);
        if (result.published !== false || PUBLISH_RESULT !== 'success' || attempt === LOOKUP_ATTEMPTS) return result;
        console.log(`  ${spec} is not on the registry yet (attempt ${attempt}/${LOOKUP_ATTEMPTS}), retrying`);
        sleep(RETRY_MS);
    }
};

let dirs = null;
let scanError;
try {
    dirs = readdirSync(PACKAGES_DIR, {withFileTypes: true})
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
} catch (error) {
    scanError = error.message;
}

const head = run('git', ['rev-parse', 'HEAD']).trim();
const verdicts = decideAll({dirs, scanError, readManifest, lookupVersion, head, publishResult: PUBLISH_RESULT});
const owed = verdicts.filter((verdict) => verdict.owed).map((verdict) => verdict.owed);
const errors = verdicts.filter((verdict) => verdict.error);
const scanned = verdicts.filter((verdict) => verdict.name !== SCAN_NAME).length;

console.log(`release-tags — ${scanned} package(s) scanned at ${head}, ${owed.length} published from it:\n`);
for (const verdict of verdicts) {
    const [label, detail] = verdict.owed
        ? ['   OWED', verdict.owed]
        : verdict.error
          ? ['  ERROR', verdict.error]
          : ['   skip', verdict.skip];
    console.log(`  ${label} ${verdict.name.padEnd(44)} ${detail}`);
}
console.log('');

const plan =
    owed.length === 0
        ? {push: [], present: [], conflicts: []}
        : planTags({owed, remoteTags: parseRemoteTags(run('git', ['ls-remote', '--tags', 'origin'])), head});

for (const tag of plan.present) console.log(`release-tags — ${tag} is already on the remote at ${head}.`);
if (plan.push.length > 0) {
    // Annotated, with the tag name as its message, as `changeset publish` makes them.
    // The tagger is the step's GIT_COMMITTER_* identity.
    for (const tag of plan.push) run('git', ['tag', '--annotate', tag, '--message', tag, head]);
    run('git', ['push', 'origin', ...plan.push.map((tag) => `refs/tags/${tag}`)]);
    for (const tag of plan.push) console.log(`release-tags — pushed ${tag} at ${head}.`);
}

const failures = [...errors.map((verdict) => `${verdict.name} — ${verdict.error}`), ...plan.conflicts];
for (const failure of failures) console.log(`::error title=release-tags::${failure}`);
if (failures.length > 0) process.exit(1);

if (owed.length === 0) {
    console.log(
        `::notice title=No release tags owed::${scanned} package(s) scanned; the registry records none of their current versions as published from ${head}.`,
    );
}
