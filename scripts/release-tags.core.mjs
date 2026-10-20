/**
 * Which release tags a commit owes the remote — the whole decision, with no I/O.
 *
 * `changeset publish` tags what it publishes, but only in the publish job's clone, and
 * its own result cannot say what was released: it ignores a failed `git tag`, and a
 * re-run publishes nothing, so it tags nothing, although the versions it published on
 * the first attempt may still have no tag on the remote (crit, PR #313). The registry
 * is the record that survives both. A version whose npm `gitHead` is this commit was
 * published from this commit, on this run or an earlier attempt of it, and owes the
 * remote its `<name>@<version>` tag. Everything else is not this commit's to tag.
 *
 * Pure, like `detect-publishable.core.mjs`: manifests and registry answers arrive as
 * values, and the caller owns every syscall, so every branch runs on every PR.
 */

/**
 * How long to wait for npm to show what `publish` just published. npm answers E404 for
 * minutes after `changeset publish` reports success, 4.5 min at the slowest measured, so
 * six minutes covers it with room. One deadline is shared by every package, so several
 * lagging ones cost no more than one.
 */
export const REGISTRY_WAIT_MS = 6 * 60_000;
export const REGISTRY_POLL_MS = 30_000;
/** The bound on each `npm view` (and every other command) the shell runs. */
export const COMMAND_TIMEOUT_MS = 60_000;
/** Checkout, setup-node, `git ls-remote` and the tag push, on top of the lookups. */
export const TAGS_JOB_OVERHEAD_MINUTES = 3;

/**
 * The least `timeout-minutes` the `tags` job needs to reach its own verdict: the wait,
 * plus one more pass over `lookups` packages at the command bound each (a pass started
 * just before the deadline runs to its end), plus the overhead.
 */
export const minimumTagsJobMinutes = (lookups) =>
    Math.ceil((REGISTRY_WAIT_MS + lookups * COMMAND_TIMEOUT_MS) / 60_000) + TAGS_JOB_OVERHEAD_MINUTES;

/**
 * Look up every spec once, then, only when `publish` succeeded, re-look-up the ones the
 * registry does not show yet until all are visible or the deadline has passed. Returns
 * the last answer per spec as a `Map`; judging it is `decidePackage`'s job.
 *
 * `lookupOnce`, `sleep` and `now` are the caller's, so a test drives the clock. `log`
 * hears each wait as `{pending, leftMs}`.
 */
export const awaitRegistry = ({
    specs,
    lookupOnce,
    publishResult,
    sleep,
    now,
    log = () => {},
    deadlineMs = REGISTRY_WAIT_MS,
    intervalMs = REGISTRY_POLL_MS,
}) => {
    const deadline = now() + deadlineMs;
    const results = new Map(specs.map((spec) => [spec, lookupOnce(spec)]));
    if (publishResult !== 'success') return results;
    for (;;) {
        const pending = [...results].filter(([, result]) => result.published === false).map(([spec]) => spec);
        const leftMs = deadline - now();
        if (pending.length === 0 || leftMs <= 0) return results;
        log({pending, leftMs});
        sleep(Math.min(intervalMs, leftMs));
        for (const spec of pending) results.set(spec, lookupOnce(spec));
    }
};

/** The name used for the scan-level error, so callers can tell it from a package. */
export const SCAN_NAME = '(scan)';

/** Changesets' tag name for a package release in a workspace (`buildGitTag`, non-root tool). */
export const releaseTag = ({name, version}) => `${name}@${version}`;

/**
 * Read one `npm view <name>@<version> --json` outcome.
 *
 * Callers pass `{stdout}` on success and `{stderr, message}` on a throw. Never throws.
 * The full version document is asked for because `npm view <spec> version gitHead`
 * prints a bare string instead of an object when `gitHead` is absent.
 */
export const interpretVersionDoc = ({stdout, stderr, message} = {}) => {
    if (stdout !== undefined) {
        let doc;
        try {
            doc = JSON.parse(stdout);
        } catch {
            return {error: 'npm view returned output that is not JSON'};
        }
        if (doc === null || typeof doc !== 'object' || Array.isArray(doc) || typeof doc.version !== 'string') {
            return {error: 'npm view returned no single version document'};
        }
        return {published: true, gitHead: typeof doc.gitHead === 'string' ? doc.gitHead : undefined};
    }
    const text = stderr ?? '';
    if (/E404/.test(text)) return {published: false};
    return {error: `registry lookup failed: ${(text.split('\n')[0] || message || 'unknown error').trim()}`};
};

/**
 * One package's verdict: `owed` (a tag name), `skip` (a reason) or `error` (a reason).
 *
 * `publishResult` is `needs.publish.result`. A version missing from the registry is an
 * error only when `publish` reported success, because then it should be there.
 */
export const decidePackage = ({dir, manifest, lookupVersion, head, publishResult}) => {
    if (manifest.__unreadable) return {name: dir, error: `manifest unreadable (${manifest.__unreadable})`};
    if (manifest.private === true) return {name: manifest.name ?? dir, skip: 'private, never published'};
    if (!manifest.name || !manifest.version) return {name: dir, error: 'manifest has no name or no version'};

    const tag = releaseTag(manifest);
    const registry = lookupVersion(tag);
    if (registry.error) return {name: manifest.name, error: `${manifest.version} — ${registry.error}`};
    if (!registry.published) {
        return publishResult === 'success'
            ? {
                  name: manifest.name,
                  error: `${manifest.version} is not on the registry although 'publish' succeeded. Re-run this job once npm shows it.`,
              }
            : {
                  name: manifest.name,
                  skip: `${manifest.version} not on the registry ('publish' ended '${publishResult}'), so not released`,
              };
    }
    return registry.gitHead === head
        ? {name: manifest.name, owed: tag}
        : {
              name: manifest.name,
              skip: `${manifest.version} published from ${registry.gitHead ?? 'an unrecorded commit'}`,
          };
};

/** Whether `decidePackage` asks the registry about this manifest. */
const asksRegistry = (manifest) =>
    !manifest.__unreadable && manifest.private !== true && Boolean(manifest.name && manifest.version);

/**
 * Every verdict for a scan. An empty or unreadable package directory is an error, not
 * "nothing owed": a broken scan and a commit that released nothing look the same here.
 *
 * `lookupAll` gets every spec to ask about in one call and returns a `Map` of answers,
 * so one wait covers all of them (`awaitRegistry`).
 */
export const decideAll = ({dirs, scanError, readManifest, lookupAll, head, publishResult}) => {
    if (dirs === null || dirs === undefined || dirs.length === 0) {
        const why =
            dirs === null || dirs === undefined
                ? `the packages directory could not be read${scanError ? ` (${scanError})` : ''}`
                : 'it contains no package directories';
        return [{name: SCAN_NAME, error: `${why}, so this scan proves nothing about which tags are owed`}];
    }
    const manifests = dirs.map((dir) => ({dir, manifest: readManifest(dir)}));
    const answers = lookupAll(
        manifests.filter(({manifest}) => asksRegistry(manifest)).map(({manifest}) => releaseTag(manifest)),
    );
    const lookupVersion = (spec) => answers.get(spec) ?? {error: 'the registry lookup returned no answer'};
    return manifests.map(({dir, manifest}) => decidePackage({dir, manifest, lookupVersion, head, publishResult}));
};

/**
 * `git ls-remote --tags` output as tag name → the commit it points at. An annotated tag
 * is listed twice, as the tag object and peeled (`^{}`), and the peeled line wins.
 */
export const parseRemoteTags = (stdout) => {
    const direct = new Map();
    const peeled = new Map();
    for (const line of stdout.split('\n')) {
        const match = /^([0-9a-f]{40,64})\trefs\/tags\/(.+?)(\^\{\})?$/.exec(line);
        if (!match) continue;
        (match[3] ? peeled : direct).set(match[2], match[1]);
    }
    return new Map([...direct].map(([tag, sha]) => [tag, peeled.get(tag) ?? sha]));
};

/**
 * What to do with the owed tags. A tag already on the remote at `head` is done, which
 * is what makes a re-run safe. A tag on the remote at another commit is a conflict.
 */
export const planTags = ({owed, remoteTags, head}) => {
    const plan = {push: [], present: [], conflicts: []};
    for (const tag of owed) {
        const remote = remoteTags.get(tag);
        if (remote === undefined) plan.push.push(tag);
        else if (remote === head) plan.present.push(tag);
        else plan.conflicts.push(`${tag} is on the remote at ${remote}, not at ${head}`);
    }
    return plan;
};
