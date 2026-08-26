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
 * ── FAIL CLOSED ──────────────────────────────────────────────────────────────────
 * Every uncertain answer resolves to PUBLISHABLE. A registry lookup that fails for any
 * reason — network, outage, rate limit, a package that has never been published — is
 * treated as "this might be a release", so the gate is requested and a human decides.
 * The two error directions are not symmetric and must never be balanced against each
 * other: a false PUBLISHABLE costs one unnecessary approval prompt, while a false
 * NOT-PUBLISHABLE silently drops a real release and reports success doing it. This
 * script may only ever suppress a run it has POSITIVELY established has nothing to do.
 *
 * Zero dependencies, matching `validate-workflows.mjs` — this repo mints the fleet's
 * npm credentials via OIDC and a release-convenience guard does not justify adding to
 * that tree.
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const PACKAGES_DIR = 'packages';

/** One package's verdict, plus the reason — the reason is the whole audit trail. */
const verdicts = [];

const readManifest = (dir) => {
    try {
        return JSON.parse(readFileSync(join(PACKAGES_DIR, dir, 'package.json'), 'utf8'));
    } catch (error) {
        return {__unreadable: error.message};
    }
};

/**
 * The published version, or a sentinel. Never throws: every failure path returns a
 * sentinel that compares unequal to any local version, so the caller publishes.
 */
const registryVersion = (name) => {
    try {
        const out = execFileSync('npm', ['view', name, 'version'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 60_000,
        });
        const version = out.trim();
        // An empty stdout with a zero exit is not a version. Treating it as one would
        // compare '' against the local version, which is the correct outcome by luck
        // rather than by decision — say so explicitly instead.
        return version === '' ? {error: 'npm view returned an empty version'} : {version};
    } catch (error) {
        const stderr = (error.stderr ?? '').toString();
        // E404 means genuinely never published — a real release, not an instrument
        // failure. Reported separately from a lookup failure so the log distinguishes
        // "first publish" from "could not tell", even though both publish.
        if (/E404/.test(stderr)) return {error: 'not published yet (E404)', firstPublish: true};
        return {error: `registry lookup failed: ${(stderr.split('\n')[0] || error.message).trim()}`};
    }
};

let dirs;
try {
    dirs = readdirSync(PACKAGES_DIR, {withFileTypes: true})
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
} catch (error) {
    // Cannot even enumerate: fail closed, loudly.
    console.error(
        `detect:publishable — cannot read ${PACKAGES_DIR}/ (${error.message}). Failing closed: requesting the approval anyway.`,
    );
    dirs = null;
}

// § The Null-Result Gate corollary 1 — a guard must assert a non-empty denominator.
// Zero packages scanned yields "nothing to publish" both when the tree is clean and
// when the scan is broken, and only one of those may suppress a release.
if (dirs === null || dirs.length === 0) {
    const why = dirs === null ? 'the packages directory could not be read' : 'it contains no package directories';
    console.error(`detect:publishable — FAIL CLOSED: ${why}, so this scan proves nothing about what needs publishing.`);
    verdicts.push({name: '(scan)', publishable: true, reason: why});
} else {
    for (const dir of dirs) {
        const manifest = readManifest(dir);

        if (manifest.__unreadable) {
            verdicts.push({name: dir, publishable: true, reason: `manifest unreadable (${manifest.__unreadable})`});
            continue;
        }
        if (manifest.private === true) {
            verdicts.push({name: manifest.name ?? dir, publishable: false, reason: 'private, never published'});
            continue;
        }
        if (!manifest.name || !manifest.version) {
            verdicts.push({name: dir, publishable: true, reason: 'manifest has no name or no version'});
            continue;
        }

        const registry = registryVersion(manifest.name);
        if (registry.error) {
            verdicts.push({name: manifest.name, publishable: true, reason: `${manifest.version} — ${registry.error}`});
            continue;
        }
        verdicts.push(
            registry.version === manifest.version
                ? {name: manifest.name, publishable: false, reason: `${manifest.version} already on the registry`}
                : {name: manifest.name, publishable: true, reason: `${registry.version} -> ${manifest.version}`},
        );
    }
}

const publishable = verdicts.filter((verdict) => verdict.publishable);
const scanned = verdicts.filter((verdict) => verdict.name !== '(scan)').length;

console.log(`detect:publishable — ${scanned} package(s) scanned, ${publishable.length} to publish:\n`);
for (const verdict of verdicts) {
    console.log(`  ${verdict.publishable ? 'PUBLISH ' : '   skip '} ${verdict.name.padEnd(44)} ${verdict.reason}`);
}
console.log('');

const answer = publishable.length > 0;
console.log(
    answer
        ? `detect:publishable — requesting the npm-publish approval for ${publishable.length} package(s).`
        : 'detect:publishable — every package matches the registry; NOT requesting an approval that would publish nothing.',
);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publishable=${answer}\n`);
