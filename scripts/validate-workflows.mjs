#!/usr/bin/env node
/**
 * Release-pipeline invariant gate.
 *
 * Guards ONE class of defect: coupling the publish pipeline's *artifact* clock to
 * its *human-approval* clock. `publish` sits behind the `npm-publish` deployment
 * environment, whose approval is wall-clock unbounded; build artifacts expire on a
 * fixed timer. When the second is shorter than the first, a release that waits too
 * long for approval becomes unpublishable on that run — and the error it produces
 * ("Artifact not found for name: build-output") blames the upload, not the delay.
 *
 * Fired live 2026-07-27 (WR-0615): retention-days was 1, ui-inputs 0.10.1 merged
 * 07-24 and was approved 07-27, and publish died on arrival. Three days of a Major
 * WCAG fix sat undelivered, and the obvious recovery ("Re-run failed jobs") re-runs
 * `publish` alone against the same absent artifact and fails identically.
 *
 * Deliberately narrow. This is NOT a general workflow linter — it asserts the three
 * properties that make the coupling impossible, and nothing else.
 *
 * Zero dependencies by design: this repo mints the fleet's npm publish credentials
 * via OIDC, so a guard on release convenience does not justify a new dependency in
 * its tree. The step splitter below is indentation-based, which is sufficient for a
 * file this small and fails loudly (not silently) if the shape ever changes.
 */
import {readFileSync} from 'node:fs';

const WORKFLOW = '.github/workflows/publish.yml';

/**
 * Minimum artifact retention, in days. Sized against the *approval* clock — how long
 * a release may plausibly wait on a human — not against pipeline runtime.
 *
 * Pinned to 90 (the GitHub maximum) because CLAUDE.md certifies exactly that number
 * as enforced here. An earlier 30-day floor left a 30-89 band that the doc claimed
 * was machine-guarded and this gate would have waved through — a guarantee asserted
 * by an artifact but checked by nothing, which is the failure mode that terminates
 * the search: a reader sees the claim, believes the property is guarded, stops
 * looking. Raised rather than re-wording the doc down, because retention costs
 * nothing within GitHub's limits and the whole point of WR-0615 is that the
 * approval clock is unbounded — any lower ceiling is a smaller version of the bug.
 *
 * Changing this is a deliberate act: update CLAUDE.md § Release Pipeline in the
 * same commit, or the divergence simply reappears pointing the other way.
 */
const MIN_RETENTION_DAYS = 90;

const source = readFileSync(WORKFLOW, 'utf8');
const lines = source.split('\n');
const failures = [];

/**
 * Split the file into step blocks. A step starts at a line matching `- ` and runs
 * until the next line at the same or lower indentation that also starts a list item
 * or a new mapping key.
 */
function stepBlocks() {
    const blocks = [];
    let current = null;
    for (const [index, line] of lines.entries()) {
        const start = /^(\s*)- /.exec(line);
        if (start) {
            if (current) blocks.push(current);
            current = {indent: start[1].length, lines: [line], startLine: index + 1};
            continue;
        }
        if (!current) continue;
        const indent = /^(\s*)\S/.exec(line);
        if (indent && indent[1].length <= current.indent) {
            blocks.push(current);
            current = null;
            continue;
        }
        current.lines.push(line);
    }
    if (current) blocks.push(current);
    return blocks.map((block) => ({...block, text: block.lines.join('\n')}));
}

const steps = stepBlocks();

// 1. Retention must outlive a plausible approval wait.
const retentions = [...source.matchAll(/^\s*retention-days:\s*(\d+)/gm)];
if (retentions.length === 0) {
    failures.push(
        `no 'retention-days' found in ${WORKFLOW}. The build artifact would inherit the repository default, ` +
            `which is not a deliberate choice against the approval window. Set it explicitly (>= ${MIN_RETENTION_DAYS}).`,
    );
}
for (const match of retentions) {
    const days = Number(match[1]);
    if (days < MIN_RETENTION_DAYS) {
        failures.push(
            `retention-days is ${days}, below the ${MIN_RETENTION_DAYS}-day minimum. The 'publish' job waits on the ` +
                `'npm-publish' environment approval, which has NO time limit — sizing retention against pipeline ` +
                `runtime instead of the approval window makes any release approved more than ${days} day(s) after ` +
                `merge unpublishable on its own run (WR-0615).`,
        );
    }
}

// 2. The artifact download must be soft — never a hard dependency of publishing.
const download = steps.find((step) => step.text.includes('actions/download-artifact'));
if (!download) {
    failures.push(`no 'actions/download-artifact' step found in ${WORKFLOW}; this gate's assumptions no longer hold.`);
} else if (!/^\s*continue-on-error:\s*true\s*$/m.test(download.text)) {
    failures.push(
        `the 'actions/download-artifact' step (line ${download.startLine}) is missing 'continue-on-error: true'. ` +
            `A hard download makes the release fail outright when the artifact has expired, with an error that ` +
            `blames the upload rather than the approval delay (WR-0615).`,
    );
}

// 3. A rebuild fallback must exist, conditioned on the download's outcome.
const fallback = steps.find(
    (step) => /if:.*\.outcome\s*!=\s*'success'/.test(step.text) && /npm run build/.test(step.text),
);
if (!fallback) {
    failures.push(
        `no rebuild fallback found in ${WORKFLOW}. Expected a step guarded by ` +
            `"if: steps.<download-id>.outcome != 'success'" that runs 'npm run build', so an expired or deleted ` +
            `artifact is rebuilt from the same pinned commit instead of blocking the release (WR-0615).`,
    );
} else if (!/::warning/.test(fallback.text)) {
    failures.push(
        `the rebuild fallback (line ${fallback.startLine}) recovers silently. It must emit a '::warning' naming the ` +
            `approval delay as the cause — a silent recovery is how this defect stayed invisible for three days.`,
    );
}

if (failures.length > 0) {
    console.error(`validate:workflows gate FAIL — ${WORKFLOW}:\n`);
    for (const failure of failures) console.error(`  - ${failure}\n`);
    process.exit(1);
}

console.log(
    `validate:workflows gate PASS — ${WORKFLOW}: artifact retention >= ${MIN_RETENTION_DAYS}d, ` +
        `download is soft, rebuild fallback present and loud.`,
);
