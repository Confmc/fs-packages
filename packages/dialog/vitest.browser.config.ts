import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

// Real Chromium for the close-watcher behaviour happy-dom does not implement. Named outside the
// `packages/*/vitest.config.ts` project glob and excluded by the happy-dom config, so only the
// root `npm run test:browser` runs it. Coverage stays with the happy-dom suite.
export default defineConfig({
    root: import.meta.dirname,
    test: {
        name: 'dialog-browser',
        include: ['tests/browser/**/*.browser.spec.ts'],
        browser: {enabled: true, headless: true, provider: playwright(), instances: [{browser: 'chromium'}]},
    },
});
