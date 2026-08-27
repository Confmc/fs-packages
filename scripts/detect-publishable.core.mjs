/**
 * Release-signal decision logic — the whole of it, with no I/O.
 *
 * Split out of `detect-publishable.mjs` 2026-08-27 (crit blocker, PR #221). The
 * decision this file makes gates the OIDC mint on `main`; before the split it ran for
 * the first time *on main*, inside the very approval gate it exists to make
 * trustworthy. `publish.yml`'s `detect` job fires only on `push` to `main`, never on
 * `pull_request`, and `validate:workflows` only regex-parses the workflow as text — so
 * nothing anywhere executed a single branch of this logic before it decided a release.
 *
 * Everything below is pure: manifests and registry answers arrive as values, verdicts
 * leave as values, and the caller owns every syscall. That is what makes the branches
 * — private short-circuit, missing name/version, E404 vs lookup failure, version
 * match/mismatch, empty scan — reachable from a test that runs on every PR.
 *
 * ── FAIL CLOSED ──────────────────────────────────────────────────────────────────
 * Every uncertain answer resolves to PUBLISHABLE. The two error directions are not
 * symmetric and must never be balanced against each other: a false PUBLISHABLE costs
 * one unnecessary approval prompt, while a false NOT-PUBLISHABLE silently drops a real
 * release and reports success doing it. This logic may only ever suppress a run it has
 * POSITIVELY established has nothing to do.
 */

/** The name used for the scan-level verdict, so callers can subtract it from the denominator. */
export const SCAN_VERDICT_NAME = '(scan)';

/**
 * Read one `npm view <name> version` outcome into a verdict input.
 *
 * Callers pass `{stdout}` on success and `{stderr, message}` on a throw. Never throws
 * and never returns a bare version it did not positively read: an empty stdout with a
 * zero exit is not a version, and treating it as one would compare '' against the local
 * version — the right outcome by luck rather than by decision.
 */
export const interpretRegistry = ({stdout, stderr, message} = {}) => {
    if (stdout !== undefined) {
        const version = stdout.trim();
        return version === '' ? {error: 'npm view returned an empty version'} : {version};
    }
    const text = stderr ?? '';
    // E404 means genuinely never published — a real release, not an instrument failure.
    // Reported separately from a lookup failure so the log distinguishes "first publish"
    // from "could not tell", even though both publish.
    if (/E404/.test(text)) return {error: 'not published yet (E404)', firstPublish: true};
    return {error: `registry lookup failed: ${(text.split('\n')[0] || message || 'unknown error').trim()}`};
};

/**
 * One package's verdict. `manifest` is either a parsed manifest or `{__unreadable}`;
 * `lookupRegistry` is called ONLY when a lookup can actually decide something, so a
 * private package costs no registry round-trip.
 */
export const decidePackage = ({dir, manifest, lookupRegistry}) => {
    if (manifest.__unreadable) {
        return {
            name: dir,
            publishable: true,
            failClosed: true,
            reason: `manifest unreadable (${manifest.__unreadable})`,
        };
    }
    if (manifest.private === true) {
        return {name: manifest.name ?? dir, publishable: false, reason: 'private, never published'};
    }
    if (!manifest.name || !manifest.version) {
        return {name: dir, publishable: true, failClosed: true, reason: 'manifest has no name or no version'};
    }

    const registry = lookupRegistry(manifest.name);
    if (registry.error) {
        return {
            name: manifest.name,
            publishable: true,
            // A first publish is a real release, not an instrument failure — only the
            // "could not tell" branch is a fail-closed guess.
            failClosed: registry.firstPublish !== true,
            reason: `${manifest.version} — ${registry.error}`,
        };
    }
    return registry.version === manifest.version
        ? {name: manifest.name, publishable: false, reason: `${manifest.version} already on the registry`}
        : {name: manifest.name, publishable: true, reason: `${registry.version} -> ${manifest.version}`};
};

/**
 * Every verdict for a scan. `dirs === null` means the packages directory could not even
 * be enumerated; `scanError` carries why, for the log.
 *
 * § The Null-Result Gate corollary 1 — a guard must assert a non-empty denominator.
 * Zero packages scanned yields "nothing to publish" both when the tree is clean and
 * when the scan is broken, and only one of those may suppress a release.
 */
export const decideAll = ({dirs, scanError, readManifest, lookupRegistry}) => {
    if (dirs === null || dirs === undefined || dirs.length === 0) {
        const why =
            dirs === null || dirs === undefined
                ? `the packages directory could not be read${scanError ? ` (${scanError})` : ''}`
                : 'it contains no package directories';
        return [
            {
                name: SCAN_VERDICT_NAME,
                publishable: true,
                failClosed: true,
                reason: `${why}, so this scan proves nothing about what needs publishing`,
            },
        ];
    }
    return dirs.map((dir) => decidePackage({dir, manifest: readManifest(dir), lookupRegistry}));
};

/** The answer, plus the denominator that makes it readable. */
export const summarize = (verdicts) => {
    const publishable = verdicts.filter((verdict) => verdict.publishable);
    return {
        answer: publishable.length > 0,
        publishable,
        scanned: verdicts.filter((verdict) => verdict.name !== SCAN_VERDICT_NAME).length,
        failClosed: verdicts.filter((verdict) => verdict.failClosed === true),
    };
};
