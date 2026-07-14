/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
    testRunner: 'vitest',
    vitest: {configFile: 'vitest.config.ts'},
    // Mutation is scoped to the pure `.ts` internals — the behavioural core lives
    // there by design so it is mutation-scored; `.vue` SFCs are covered by the
    // component specs but not mutated (matches the sibling packages' posture).
    mutate: ['src/**/*.ts', '!src/**/types.ts'],
    thresholds: {high: 95, low: 90, break: 90},
    reporters: ['clear-text', 'progress', 'json', 'html'],
    jsonReporter: {fileName: 'reports/mutation/mutation.json'},
    htmlReporter: {fileName: 'reports/mutation/mutation.html'},
    incremental: true,
    incrementalFile: '.stryker-incremental.json',
    cleanTempDir: 'always',
};
