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

/**
 * Every verdict for a scan. An empty or unreadable package directory is an error, not
 * "nothing owed": a broken scan and a commit that released nothing look the same here.
 */
export const decideAll = ({dirs, scanError, readManifest, lookupVersion, head, publishResult}) => {
    if (dirs === null || dirs === undefined || dirs.length === 0) {
        const why =
            dirs === null || dirs === undefined
                ? `the packages directory could not be read${scanError ? ` (${scanError})` : ''}`
                : 'it contains no package directories';
        return [{name: SCAN_NAME, error: `${why}, so this scan proves nothing about which tags are owed`}];
    }
    return dirs.map((dir) => decidePackage({dir, manifest: readManifest(dir), lookupVersion, head, publishResult}));
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
