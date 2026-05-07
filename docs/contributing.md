# Contributing

## Prerequisites

- **Node.js** 24+ (matches root `engines.node: ">=24.0.0"`)
- **npm** 11+ (no enforced constraint, but matches the version bundled with Node 24)

Clone the repository and install dependencies:

```bash
git clone https://github.com/script-development/fs-packages.git
cd fs-packages
npm install
```

## Development Workflow

### Building

All packages build with [tsdown](https://tsdown.dev/) (Rolldown/oxc), producing dual ESM + CJS output with TypeScript declarations:

```bash
npm run build
```

::: warning Build before typecheck
Cross-package type resolution requires built `.d.mts` files. Always run `npm run build` before `npm run typecheck`. The CI pipeline enforces this order.
:::

### Testing

Tests use [vitest](https://vitest.dev/) with the workspace configuration. Every package must maintain **100% code coverage**:

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run mutation testing (90% threshold per package)
npm run test:mutation
```

Browser-dependent tests use [happy-dom](https://github.com/nicedaycode/happy-dom) as the test environment. Annotate test files with:

```typescript
// @vitest-environment happy-dom
```

### Linting and Formatting

```bash
# Lint with oxlint
npm run lint

# Format with oxfmt
npm run format

# Check formatting without writing
npm run format:check
```

### Package Quality

Every package is checked by [publint](https://publint.dev/) (correct exports) and [attw](https://arethetypeswrong.github.io/) (correct types):

```bash
npm run lint:pkg
```

## The 8-Gate CI Pipeline

Every pull request must pass all 8 gates in order:

| Gate            | Command                 | What it checks                               |
| --------------- | ----------------------- | -------------------------------------------- |
| 1. Audit        | `npm audit`             | No known vulnerabilities in dependencies     |
| 2. Format       | `npm run format:check`  | Code follows oxfmt formatting rules          |
| 3. Lint         | `npm run lint`          | No oxlint violations                         |
| 4. Build        | `npm run build`         | All packages compile successfully            |
| 5. Typecheck    | `npm run typecheck`     | No TypeScript errors in strict mode          |
| 6. Package lint | `npm run lint:pkg`      | Package exports are correct (publint + attw) |
| 7. Coverage     | `npm run test:coverage` | 100% code coverage per package               |
| 8. Mutation     | `npm run test:mutation` | 90% mutation score per package               |

::: tip Why mutation testing?
100% code coverage means every line of code was executed during tests. It does not mean every line was actually **verified**. Mutation testing changes your code (introduces "mutants") and checks whether your tests catch the change. A 90% mutation score means your tests detect 90% of possible bugs — not just that they run the code.
:::

## Adding a New Package

### 1. Create the package directory

```bash
mkdir -p packages/{name}/src packages/{name}/tests
```

### 2. Set up package.json

```json
{
    "name": "@script-development/fs-{name}",
    "version": "0.0.0",
    "type": "module",
    "exports": {
        ".": {
            "import": {"types": "./dist/index.d.mts", "default": "./dist/index.mjs"},
            "require": {"types": "./dist/index.d.cts", "default": "./dist/index.cjs"}
        }
    },
    "main": "./dist/index.cjs",
    "module": "./dist/index.mjs",
    "types": "./dist/index.d.mts",
    "files": ["dist"],
    "scripts": {
        "build": "tsdown",
        "typecheck": "tsc --noEmit",
        "lint:pkg": "publint && attw --pack .",
        "test:mutation": "stryker run"
    },
    "publishConfig": {"access": "public"}
}
```

If your package uses Vue, add it as a peer dependency:

```json
{"peerDependencies": {"vue": "^3.5.0"}}
```

### 3. Set up configuration files

Every package needs these configuration files. Copy them from an existing package and adjust:

- `tsconfig.json` — extends the root `tsconfig.base.json`
- `tsdown.config.ts` — identical across packages
- `vitest.config.ts` — uses `defineProject` with 100% coverage thresholds
- `stryker.config.mjs` — 90% mutation threshold

### 4. Write the code

Follow the conventions:

- **Single entry point:** `src/index.ts` is the sole barrel export. Named exports only.
- **Factory pattern:** Export a `createXxxService()` function that returns a plain object.
- **No default exports.**

### 5. Bump the package version

Set `version` in your new package's `package.json` to `0.1.0` (the conventional starting version for new packages). When making subsequent changes to existing packages, bump the `version` field manually following semver:

- **patch** (`0.1.0` → `0.1.1`) — bug fixes, doc-only changes, or peer-range widenings.
- **minor** (`0.1.0` → `0.2.0`) — new features, new exports, or any pre-1.0 breaking change (caret semver treats minor bumps as breaking pre-1.0; expect a peer-range cascade — see the territory's `CLAUDE.md` § "Versioning Discipline (Pre-1.0)").
- **major** (`0.1.0` → `1.0.0`) — package crosses the stability boundary; document the contract guarantees that ship at 1.0.

Push to `main` triggers an automatic publish (see [Publishing](#publishing) below).

## Conventions

### Factory Functions

Every service package exports a `createXxxService()` factory:

```typescript
export function createExampleService(config: ExampleConfig): ExampleService {
    // private state here
    const state = ref(initialValue);

    // return public API as plain object
    return {
        value: computed(() => state.value),
        doSomething() {
            /* ... */
        },
    };
}
```

### Types

Export all types that consumers need. Use named exports, never default:

```typescript
// src/index.ts
export {createExampleService} from './example-service';
export type {ExampleService, ExampleConfig} from './types';
```

### Peer Dependencies

If your package depends on another `@script-development/fs-*` package, declare it as a **peer dependency**, not a regular dependency. This prevents duplicate installations:

```json
{"peerDependencies": {"@script-development/fs-http": "^0.3.0"}}
```

::: warning Pre-1.0 caret semantics
Under npm caret semantics, `^0.3.0` matches only `0.3.x` — the next minor (`0.4.0`) is treated as breaking. Cross-minor consumers must widen the range (e.g. `"^0.3.0 || ^0.4.0"`) and patch-bump the affected sibling. See the territory's `CLAUDE.md` § "Versioning Discipline (Pre-1.0)" for the full mechanical checklist.
:::

### Testing

Write tests alongside your source code in the `tests/` directory. Use `describe` + `it` blocks:

```typescript
import {describe, expect, it} from 'vitest';
import {createExampleService} from '../src';

describe('createExampleService', () => {
    it('returns the initial value', () => {
        const service = createExampleService({initial: 42});
        expect(service.value.value).toBe(42);
    });
});
```

## Publishing

Packages are published to npm via **OIDC Trusted Publishing** — no stored tokens. The publish workflow (`.github/workflows/publish.yml`) triggers automatically on push to `main` when any `**/package.json` file changes.

The flow:

1. Create your changes on a branch (including a `version` bump in the affected package's `package.json` per the rules in [Adding a New Package § 5](#_5-bump-the-package-version)).
2. Open a PR — CI runs all 8 gates (audit → format → lint → build → typecheck → lint:pkg → coverage → mutation).
3. On merge to `main`, the publish workflow detects the `package.json` change and:
    - Builds all packages and uploads `dist/` artifacts.
    - For each package whose published version differs from the local `package.json#version`, publishes the new version via OIDC Trusted Publishing.
    - Provenance attestation is enabled (`NPM_CONFIG_PROVENANCE=true`).

There is no changeset bot and no "Version Packages" intermediate PR. Version bumps are author-managed in the source PR; the publish step reacts to whatever shipped on `main`.
