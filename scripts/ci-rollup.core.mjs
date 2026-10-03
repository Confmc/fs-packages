/**
 * The `ci-passed` verdict: green only when every lane it fans in reported `success`.
 *
 * Enumerates the GOOD state, never the bad ones. A rollup that fails on `failure` or
 * `cancelled` passes on `skipped`, which is neither, so a lane that never ran reads as a
 * lane that passed. An empty or unreadable `needs` is a failure too: zero lanes checked
 * is what a broken wiring produces, not a clean run.
 */
export const decideRollup = (needs) => {
    if (needs === null || typeof needs !== 'object' || Array.isArray(needs)) {
        return {passed: false, lanes: [], reason: 'needs is not an object — the rollup cannot read its lanes'};
    }
    const lanes = Object.entries(needs).map(([name, lane]) => ({name, result: lane?.result ?? '(no result)'}));
    if (lanes.length === 0) {
        return {passed: false, lanes, reason: 'no lanes to check — an empty needs set proves nothing ran'};
    }
    const notPassed = lanes.filter((lane) => lane.result !== 'success');
    if (notPassed.length > 0) {
        return {
            passed: false,
            lanes,
            reason: `${notPassed.length} of ${lanes.length} lane(s) did not report success: ${notPassed.map((lane) => `${lane.name}=${lane.result}`).join(', ')}`,
        };
    }
    return {passed: true, lanes, reason: `all ${lanes.length} lane(s) reported success`};
};

/** Parse the `toJSON(needs)` text; malformed input yields a non-object so the decision fails it. */
export const parseNeeds = (text) => {
    try {
        return JSON.parse(text ?? '');
    } catch {
        return null;
    }
};
