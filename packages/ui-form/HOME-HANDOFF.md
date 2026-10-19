# Home handoff: ui-form (fs-packages side)

For a fresh session on a machine without the work machine's local state (no Claude memories, no
`.experiment-packs/`, no emmie-2 peer session). Read this, then the last section of `HANDOFF.md`
("State at 2026-10-19"). Like `HANDOFF.md`, this file stays behind when the package PR is made.

## Get going

```sh
git fetch fork && git switch experiment/ui-form-control   # fork = Confmc/fs-packages
npm ci --ignore-scripts && npm run build
```

- Packs (only when emmie needs a new one): bump `packages/ui-form/package.json` to the next
  `0.1.0-control.N` (last: `control.21`), `npm install --ignore-scripts`, build, then
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
  New styling goes on new class names. All component rules sit in `@layer ui-form`, tokens unlayered.
- Gates before a pack: the package's unit tests, `typecheck`, `lint`. Before the PR: everything in the
  repo's CI (`check` + `browser-tests`), Stryker included.

## The emmie side

emmie's branch `error-keys-raw` (on emmie's origin) carries `docs/plans/fs-packages-ui-form/PLAN.md`, the plan
for the whole line. The emmie side decides that line; this side builds the package and reports what it did and
what emmie must change. Without the peer session at home, leave notes for it in the commit messages and
`HANDOFF.md`, or update `PLAN.md` on that branch directly if asked to.

Not yet sent to the emmie side: four corrections to `PLAN.md`.

1. `private` comes out in the package PR itself (npm refuses to publish a private package); the plan keeps it.
2. Phase 2 steps 1–3 are done and step 4 is folded into the kit; the MultiSelect sorted-model item is closed.
3. The control contract for controls emmie keeps must include `error`: `field()` passes it, so a control that
   doesn't declare it gets a stray attribute.
4. Lead with `<TextField name>` in the wording; `field()` stays for compound fields.

## Where the package is

At `control.21` (all pushed; later commits are docs only):

- `useForm(options)` takes no http service; `handleSubmit(action, {validate})` → `'sent' | 'refused' |
'ignored'`; `take(error)` for a 422 outside a submit; messages stay until the next submit.
- It hands out the bound controls (`TextField` … `GroupComboboxField`, `TimeField`, `PasswordField`), typed
  by `PathsOf` on `FormDraft<T>` drafts; `field()` stays public. `createUiForm({texts})` sets an app's texts.
- New controls since the kit: `TimeInput`, `SearchInput`, `PasswordInput`, `InputGroup` (`prepend`/`append`).

## Next, in order

1. GroupSelect/GroupCombobox `alphabeticalSort` (the last parity item before the date picker).
2. The date picker (emmie wires its own through `field()` meanwhile).
3. Reject `prepend`/`append` in the types of the non-text bound fields (they are wrapped in `InputGroup` at
   runtime today).
4. Stryker over `src/form`, `src/composables`, `src/internal`: `kit.ts`, `draft.ts`, `path.ts` never ran.
   Move `.stryker-incremental.json` aside for a full run.
5. README for the new controls and the kit; fill the API sections of `DOCS-PAGE.draft.md`.
6. The package PR from a fresh branch off `main` (`HANDOFF.md` § Release sequence, step 1). Publishing is not
   part of this work.

## Gotchas

- Stryker does not mutate inside a type assertion: keep casts at the export.
- A generic select's `T` is not inferred through `Omit<props>`: the bound select types declare `Carries<T>`.
- `vitest-browser-vue`'s `render()` is async here. One render per axe test (two give two `<main>`), and a test
  that throws mid-render leaks its `<main>` into later ones: fix the first failure first.
- happy-dom has no layout and no `showPicker`: size logic is pinned in the browser suite.
- The select-family unit flake is local and load-only; CI has never shown it.
- `useId()` is unique per Vue app: specs mounting two forms separately share ids; mount them under one parent.
