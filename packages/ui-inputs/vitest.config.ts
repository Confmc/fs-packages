import Vue from 'unplugin-vue/vite';
import {defineProject} from 'vitest/config';

export default defineProject({
    // The SFC specs import `.vue` files, so the test runner needs the Vue plugin
    // (vitest runs on vite — unplugin-vue/vite, not the /rolldown build variant).
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
