#!/usr/bin/env node
/**
 * I/O shell for the `ci-passed` job. Reads `${{ toJSON(needs) }}` from the `NEEDS`
 * environment variable, prints every lane, and exits non-zero unless the verdict passed.
 * The decision lives in `ci-rollup.core.mjs`, where `ci-rollup.test.mjs` exercises it.
 */
import {decideRollup, parseNeeds} from './ci-rollup.core.mjs';

const verdict = decideRollup(parseNeeds(process.env.NEEDS));

for (const lane of verdict.lanes)
    console.log(`  ${lane.result === 'success' ? 'ok  ' : 'FAIL'} ${lane.name}: ${lane.result}`);

if (!verdict.passed) {
    console.error(`::error title=ci-passed::${verdict.reason}`);
    process.exit(1);
}

console.log(`ci-passed: ${verdict.reason}`);
