/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
    testRunner: 'vitest',
    vitest: {configFile: 'vitest.config.ts'},
    // The former fs-form gate, carried over: the form code plus the new field context. The rest of
    // the package (useListbox, internal/*) stays unmutated until WR-0897 widens this.
    mutate: ['src/form/**/*.ts', '!src/form/types.ts'],
    thresholds: {high: 95, low: 90, break: 90},
    reporters: ['clear-text', 'progress', 'json', 'html'],
    jsonReporter: {fileName: 'reports/mutation/mutation.json'},
    htmlReporter: {fileName: 'reports/mutation/mutation.html'},
    incremental: true,
    incrementalFile: '.stryker-incremental.json',
    cleanTempDir: 'always',
};
