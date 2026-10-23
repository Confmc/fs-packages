# Home handoff: ui-form (fs-packages side)

For a fresh session on a machine without the work machine's local state (no Claude memories, no
`.experiment-packs/`, no emmie-2 peer session). Read this, then the last section of `HANDOFF.md`
("State at 2026-10-23"). Like `HANDOFF.md`, this file stays behind when the package PR is made.

## Get going

```sh
git fetch fork && git switch experiment/ui-form-control   # fork = Confmc/fs-packages
npm ci --ignore-scripts && npm run build
```

- Packs (only when emmie needs a new one): bump `packages/ui-form/package.json` to the next
  `0.1.0-control.N` (see `package.json`), `npm install --ignore-scripts`, build, then
  `cd packages/ui-form && npm pack --pack-destination ../../.experiment-packs`. Commit the bump, push to `fork`.
  `.experiment-packs/` is git-excluded; create it.
- Browser tests and Playwright: never download Chromium. A launch error naming a missing
  `chromium_headless_shell-NNNN` is a revision mismatch. Read the wanted revision from
  `node_modules/playwright-core/browsers.json`, then in `~/.cache/ms-playwright` run
  `ln -s chromium_headless_shell-<have> chromium_headless_shell-<want>`.
- Scratch type checks: `node_modules/.bin/vue-tsc -p "$PWD/tsconfig.json"` with an absolute path;
  `npx vue-tsc -p` from a subfolder silently uses the package tsconfig.

## Working rules

- **One commit per point**, so anything reverts cheaply. Never rebase. Push only to `fork`. No PR until asked.
- **Order of concerns:** clean package code, then the consumer's goals, then migration cost. Migration cost
  is a cost to weigh, never a veto. Pre-1.0 consumers pin their minor, so one that doesn't want a change
  doesn't upgrade. Don't invent constraints: if no ADR or stated rule sets one, it is a cost, not a limit.
  emmie's current form code shows what was done, not what's right; it is not precedent.
- **Stay in scope:** fix what this work touches. Leave issues merely noticed elsewhere (other packages, main)
  out of the plan and the report, at most one line, once. Stop raising a small item once it's handled.
- **Write what holds, not who said it.** In docs, comments, commits, plans and messages, state the rule
  and, where it matters, its reason. Never "X decided" or "the lead's ruling": a name makes a decision read as
  fixed. Short sentences, active voice, one term per concept.
- Pushing back is expected, on the emmie side's proposals too.
- **CSS:** ui-form runs next to npm ui-inputs 0.17 in emmie and its stylesheet must keep 0.17 markup working.
  New styling goes on new class names. All component rules sit in `@layer ui-form`, tokens unlayered. The token
  defaults are ui-inputs' own, neutral; a new token defaults to a no-op or a neutral value. emmie's look is a
  `--ui-*` token map in emmie, never a package default.
- **The package absorbs awkwardness:** when the consumer needs a workaround (an extra prop, logic moved out of
  where it belongs), fix the package's shape instead of documenting the workaround.
- **Messages for the reviewer** go to Mattermost: clickable `[#NNN](url)` links, short lines with blank lines
  between them, not one block.
- Gates before a pack: the package's unit tests, `typecheck`, `lint`. Before the PR: everything in the
  repo's CI (`check` + `browser-tests`), Stryker included.

## The emmie side

emmie's branch `error-keys-raw` (on emmie's origin) carries `docs/plans/fs-packages-ui-form/PLAN.md`, the plan
for the whole line. The emmie side decides that line; this side builds the package and reports what it did and
what emmie must change. Without the peer session at home, leave notes for it in the commit messages and
`HANDOFF.md`, or update `PLAN.md` on that branch directly if asked to.

Sent to the emmie side on 2026-10-23 (see `HANDOFF.md` § "State at 2026-10-23" § emmie): the new rules (style
from emmie as a token map, controls take only `invalid`, `id` required, TextInput's `placeholder` required and no
`password`, `v-model` on the inner input) and the package-side view on its phase 3 plan. The 2026-10-19 note that
the control contract must include `error` is superseded: controls take no `error`.

## Where the package is, and what is next

See `HANDOFF.md` § "State at 2026-10-23": the package lands as one small PR per component, each against `main`
(no push rights upstream, so no stacking). #328 is open; the next branches are on `fork` (`ui-form/p02-…`,
`ui-form/n-…`); `reference/ui-form-*` and `review/ui-form-vs-sources` are sources only. `feat/ui-form` (#323, closed)
is the old one-package branch, reference only.

## Gotchas

- Stryker does not mutate inside a type assertion: keep casts at the export.
- A generic select's `T` is not inferred through `Omit<props>`: the bound select types declare `Carries<T>`.
- `vitest-browser-vue`'s `render()` is async here. One render per axe test (two give two `<main>`), and a test
  that throws mid-render leaks its `<main>` into later ones: fix the first failure first.
- happy-dom has no layout and no `showPicker`: size logic is pinned in the browser suite.
- The select-family unit flake is local and load-only; CI has never shown it.
- `useId()` is unique per Vue app: specs mounting two forms separately share ids; mount them under one parent.
- The account has no admin or write rights on script-development/fs-packages: it cannot add labels or re-run CI.
  A CI run that fails on infrastructure (the runner's Chromium deps install timing out) is re-run with an empty
  commit whose message says so.
- `validate:workflows` sizes the publish `tags` job's timeout by the number of folders under `packages/`
  (2 × packages × 1 min + 6 + 3), private packages included: ui-form makes 16, so 41.
