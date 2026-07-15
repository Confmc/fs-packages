import Vue from '@vitejs/plugin-vue';
import {defineProject} from 'vitest/config';

export default defineProject({
    // The SFC specs import `.vue` files, so the test runner needs the Vue plugin.
    // Uses @vitejs/plugin-vue (the canonical vite-side transform) rather than
    // unplugin-vue/vite: the latter applies on a per-package run but is NOT applied
    // when this config is loaded as a workspace project by the root `vitest run`
    // (vitest.workspace.ts), which is the path CI exercises. tsdown still uses
    // unplugin-vue/rolldown for the build.
    plugins: [Vue()],
    test: {
        name: 'ui-inputs',
        coverage: {
            provider: 'v8',
            // Stricter than the service-package siblings (which cover `.ts` only):
            // a component package must hold its SFCs to the coverage bar too.
            include: ['src/**/*.{ts,vue}'],
            thresholds: {lines: 100, branches: 100, functions: 100, statements: 100},
        },
    },
});
