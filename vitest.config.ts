import Vue from '@vitejs/plugin-vue';
import {configDefaults, defineConfig} from 'vitest/config';

// Root-level Vue plugin so the workspace run (vitest.workspace.ts) transforms the
// `.vue` SFCs in @script-development/ui-inputs. A plugin declared in a workspace
// *project* config is not applied to `.vue` import analysis in the aggregated root
// `vitest run` (the path CI exercises), so the transform is hoisted here. No-op for
// the `.vue`-free service packages.
export default defineConfig({
    plugins: [Vue()],
    test: {
        exclude: [
            ...configDefaults.exclude,
            // Browser-mode layer (real Chromium; packages/ui-inputs/vitest.browser.config.ts,
            // run via `npm run test:browser`) — its specs import `vitest/browser`, which only
            // resolves inside Browser Mode, so the default happy-dom/node run must skip them.
            '**/tests/browser/**',
            // Agent worktrees (war-room concurrency): a checked-out worktree under .claude/
            // is a full second copy of the repo, and the default include glob would sweep
            // its specs into this run twice — with broken workspace links.
            '**/.claude/**',
            // Leftover Stryker sandboxes are a third full-copy source of duplicate specs.
            '**/.stryker-tmp/**',
        ],
    },
});
