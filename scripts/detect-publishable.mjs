#!/usr/bin/env node
/**
 * Release-signal gate: does this commit actually have something to publish?
 *
 * `publish.yml` triggers on any push to main touching `packages/<pkg>/package.json`, then
 * parks `publish` behind the `npm-publish` deployment environment — a human approval
 * that mints an OIDC token. The trigger is a proxy for "a release happened"; it is not
 * the same thing. A dependency bump inside a package manifest matches the path filter,
 * changes no version, and still raises a full approval request for a run that would
 * publish nothing.
 *
 * Measured 2026-08-26: SEVEN such runs. Six on 08-24 (dependabot merges #207, #214,
 * #216, #217 — none carrying a version change in any package manifest) were cancelled
 * by hand; the seventh came from PR #220, which edited one echo string. The path filter
 * had already been narrowed once for this exact reason, and its own comment promises
 * that "root/devDep manifest churn (dependabot, tooling) must NOT start the
 * OIDC-minting publish job" — a property the filter cannot deliver, because dependabot
 * edits PACKAGE manifests too, not only the root. That promise is now this script's
 * job, where it can be checked.
 *
 * The cost of the noise is not the wasted minutes. It is that a standing queue of
 * pending approvals trains the approver to wave them through, on the one repository
 * that mints publish credentials for the whole fleet.
 *
 * ── THIS FILE IS THE I/O SHELL ────────────────────────────────────────────────────
 * Every decision lives in `detect-publishable.core.mjs`, which is pure and is exercised
 * by `detect-publishable.test.mjs` on every PR. What remains here is syscalls and
 * printing: read the directory, read a manifest, ask the registry, write the output.
 * Keep it that way — logic that lands in this file is logic no PR ever executes.
 *
 * ── FAIL CLOSED ──────────────────────────────────────────────────────────────────
 * Every uncertain answer resolves to PUBLISHABLE. A registry lookup that fails for any
 * reason — network, outage, rate limit, a package that has never been published — is
 * treated as "this might be a release", so the gate is requested and a human decides.
 * The two error directions are not symmetric and must never be balanced against each
 * other: a false PUBLISHABLE costs one unnecessary approval prompt, while a false
 * NOT-PUBLISHABLE silently drops a real release and reports success doing it. This
 * script may only ever suppress a run it has POSITIVELY established has nothing to do.
 *
 * That guarantee does not survive on this side of the boundary alone: if writing the
 * step output throws, the answer never reaches the workflow. `publish` is therefore
 * conditioned on `!= 'false'` rather than `== 'true'`, so an absent answer publishes
 * and only a POSITIVE "nothing to do" suppresses. See publish.yml.
 *
 * Zero dependencies, matching `validate-workflows.mjs` — this repo mints the fleet's
 * npm credentials via OIDC and a release-convenience guard does not justify adding to
 * that tree.
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import {decideAll, interpretRegistry, summarize} from './detect-publishable.core.mjs';

const PACKAGES_DIR = 'packages';

const readManifest = (dir) => {
    try {
        return JSON.parse(readFileSync(join(PACKAGES_DIR, dir, 'package.json'), 'utf8'));
    } catch (error) {
        return {__unreadable: error.message};
    }
};

/** The published version, or a sentinel. Never throws — every failure path is a value. */
const lookupRegistry = (name) => {
    try {
        const stdout = execFileSync('npm', ['view', name, 'version'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 60_000,
        });
        return interpretRegistry({stdout});
    } catch (error) {
        return interpretRegistry({stderr: (error.stderr ?? '').toString(), message: error.message});
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

const verdicts = decideAll({dirs, scanError, readManifest, lookupRegistry});
const {answer, publishable, scanned, failClosed} = summarize(verdicts);

console.log(`detect:publishable — ${scanned} package(s) scanned, ${publishable.length} to publish:\n`);
for (const verdict of verdicts) {
    console.log(`  ${verdict.publishable ? 'PUBLISH ' : '   skip '} ${verdict.name.padEnd(44)} ${verdict.reason}`);
}
console.log('');

// A fail-closed branch produced an approval nobody asked for. Say so where the approver
// actually looks — the run summary and the checks UI — not only in the raw job log, the
// same reason publish.yml's rebuild fallback emits a '::warning' instead of recovering
// silently. Without this, the extra prompt is indistinguishable from a real release.
for (const verdict of failClosed) {
    console.log(
        `::warning title=detect:publishable failed closed::${verdict.name} — ${verdict.reason}. Requesting the npm-publish approval anyway, because a suppressed release is the expensive direction.`,
    );
}

console.log(
    answer
        ? `detect:publishable — requesting the npm-publish approval for ${publishable.length} package(s).`
        : 'detect:publishable — every package matches the registry; NOT requesting an approval that would publish nothing.',
);

if (process.env.GITHUB_OUTPUT) {
    try {
        appendFileSync(process.env.GITHUB_OUTPUT, `publishable=${answer}\n`);
    } catch (error) {
        // The one place this script can lose an answer it already computed. Fail LOUD
        // and fail CLOSED: the job goes red so the cause is visible, and because
        // `publish` branches on `!= 'false'` rather than `== 'true'`, an answer that
        // never arrived still raises the approval instead of dropping the release.
        console.log(
            `::error title=detect:publishable could not write its output::${error.message}. The computed answer was publishable=${answer}. The npm-publish approval will be requested regardless — verify the release by hand.`,
        );
        process.exit(1);
    }
}
