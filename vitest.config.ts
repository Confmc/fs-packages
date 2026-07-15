import Vue from '@vitejs/plugin-vue';
import {defineConfig} from 'vitest/config';

// Root-level Vue plugin so the workspace run (vitest.workspace.ts) transforms the
// `.vue` SFCs in @script-development/ui-inputs. A plugin declared in a workspace
// *project* config is not applied to `.vue` import analysis in the aggregated root
// `vitest run` (the path CI exercises), so the transform is hoisted here. No-op for
// the `.vue`-free service packages.
export default defineConfig({plugins: [Vue()]});
