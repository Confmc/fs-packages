# Handoff: ui-form experiment (fs-packages side)

> At home or on another machine, start with `HOME-HANDOFF.md`. **Read the last section first** ("State at 2026-10-22"): it supersedes "Open" and "Next steps" below,
> which are from 2026-10-09. `EXPERIMENT-REPORT.md` is the 10-09 report and is not kept current.

Written 2026-10-09, end of day, for a fresh session on another machine. Read this first, then
`EXPERIMENT-REPORT.md` next to it (the full shape, decisions and gaps as of 10-09).

## Where things are

- **Repo:** `script-development/fs-packages`. Remotes: `origin` = script-development/fs-packages,
  `fork` = Confmc/fs-packages. Experiment branches live on the **fork**.
- **Branch:** `experiment/ui-form-control`, head `8bf22a4` plus the commit carrying this file (all pushed
  to `fork`). It was branched off `experiment/ui-form-lead` (`8d7303c`, the earlier slot-spread shape).
- **Pack version:** `0.1.0-control.14` (`ui-form`), with the shims `ui-inputs 0.18.0-control.14` and
  `fs-form 0.4.0-control.14` (deprecated re-exports, still in the repo; decided to drop them).
- **Packs are NOT in git.** `.experiment-packs/` is git-excluded and exists only on the work machine. To
  rebuild at home:

    ```sh
    git fetch fork && git switch experiment/ui-form-control
    npm ci --ignore-scripts && npm run build
    mkdir -p .experiment-packs
    for p in ui-form ui-inputs form; do (cd packages/$p && npm pack --pack-destination ../../.experiment-packs); done
    ```

- **emmie side:** branch `error-keys-raw` on emmie's origin (pushed, no PR; worktree `emmie-2` on the work
  machine). Its plan is `docs/plans/fs-packages-ui-form/PLAN.md` there. `experiment/fs-packages-control` is
  reference only (it has local unpushed merges, including a dropped approach), and its `REPORT.md` is outdated
  against PLAN.md. The emmie-side session ("emmie-0924-fs-form-collector…") leads the emmie + package line and
  decides it; this side builds the package and pushes back where something smells.
- **Why keyMapper is identity:** emmie's phase 1 removed both backend casing traits
  (`ResponseErrorAttributesToCamelTrait` everywhere; `InputAndFilesToSnakeCaseTrait` everywhere but the three
  external day-update requests), so a 422's keys arrive as dotted camelCase paths (`learningGoals.0.title`).
  That is what makes the identity default and `field('a.0.b')` right.

## How we work

- Prototype mode: shape over polish. A quick test + typecheck before packing is enough; skip
  mutation/README polish.
- **One commit per point**, so anything can be reverted cheaply. Bump all three package versions together
  per pack (`0.1.0-control.N`, `0.18.0-control.N`, `0.4.0-control.N`), `npm install --ignore-scripts` to
  refresh the lock, pack, push to `fork`, and tell the emmie session the file names.
- Clean package code first, then the consumer's goals, then migration cost (a cost, never a veto). Don't
  invent constraints nobody set. **emmie first**: being agnostic is nice to have.
- Relay findings to the emmie session; push back when something smells (it worked: layers instead of
  `:where()`, keeping messages until the next save).

## Done (control.1 → control.14, all on the branch)

The package shape, in one line: `useForm({draft?, keyMapper?, fields?, scrollToError?, idPrefix?})` (no
http service) → `field(name)`, form-bound `FormLabel` / `FormError`, `handleSubmit(action, {validate})` →
`'sent' | 'refused' | 'ignored'`, `take(error)`, client refusals (`refuse`, `setRefusals`, `withdraw`,
`clearClient`), typed `draft` paths. Details per control.N are in `EXPERIMENT-REPORT.md` §2.

control.13 / control.14 (today's last packs, one commit each):

1. `62f4dae`: form-bound pieces renamed to the old names `FormLabel` / `FormError`; the unbound ones
   are internal.
2. `f686ed2`: ids are name first: `firstName-v-3`; `idPrefix` → `invoice-firstName`.
3. `679b0d8`: every control takes `error`; mark = `invalid ?? Boolean(error)`; `invalid = undefined` default
   (pinned by `tests/control-error.spec.ts`).
4. `426f7e2`: `FieldMessage` dropped.
5. `8ef33b3`: select family `label` → `optionLabel`.
6. `fa6ad40`: emmie's look as the shared `--ui-control-*` defaults + `TextInput`'s in-input error icon
   (`TextInput` root is now `span.ui-input-wrap`).
7. `cc8a9b9`: all component CSS in `@layer ui-form` (tokens unlayered). emmie declares
   `@layer base, ui-form;` first in `sass/app.scss` and has its `_base.scss` in `@layer base`; checked by
   the emmie session in the browser (`w-70` on a TextField now works).

## Decisions

Partly superseded: the two items marked † were replaced by K2 (the bound controls are the field-controls,
and the kit was decided before them). See the last section.

- Merge fs-form + ui-inputs into `ui-form`
- No provide/inject; shape = `v-bind="field(name)"`, FormLabel/FormError by name, form as prop †
- Order: (1) emmie adopts ui-form's controls → (2) field-controls into the package → (3) then decide the kit †
- emmie first; agnostic is nice to have
- Generated ids, fixed prefix only when needed
- Form-bound pieces take the old names
- Messages stay until the next save; `withdraw` is explicit (clear-on-edit was reverted in control.12)
- `error` + `invalid` override ("message without red")
- No shims; emmie renames its imports in one pass
- `Message`/`FormError` always present; `FormField`'s own message only when there is one
- `keyMapper` default stays identity (casing lives in emmie's http middleware)
- `refusedUnnamed` = "no field the form holds"; keep `'ignored'`; keep the one overload cast
- RichTextEditor (tiptap) / file upload stay in emmie, wired through `field()` / `FormField`
- Package CSS = defaults that consumer CSS always overrides → `@layer ui-form`
- ADR-0043 gets an amendment for the merge.

## Open (2026-10-09, superseded: see the last section)

- **Pending:** the 422-per-form model (an example was asked for); `string | null` vs `string`
  for the text controls' model.
- The emmie red (`#D45F52`) is not yet the package's danger default (asked, no answer yet).
- emmie's look currently reaches every `.ui-control` (shared tokens), not just `TextInput`. That's
  intended under emmie-first, but confirm it.
- Release work (not started): README (still documents removed APIs), CHANGELOG, Stryker gate (WR-0897), a
  committed vue-tsc type test, removing the `fs-form` / `ui-inputs` shims, the **first npm publish of
  `ui-form`** (new package: hand bootstrap + Trusted Publisher before any CI publish, see the repo
  CLAUDE.md).
- Flaky: select-family unit specs (`Combobox`, `GroupCombobox`, `MultiSelect`, `SingleSelect`) fail
  intermittently, mostly under coverage, in code the experiment didn't touch. They pass on rerun. Look at
  them before release.

## Next steps (2026-10-09, superseded: see the last section)

Step 1, **emmie adopts ui-form's controls**, control by control, emmie's behaviour ported as is:

1. ~~error + override, optionLabel~~ (done) · ~~emmie look pilot + TextInput error icon~~ (done)
2. emmie's features into existing controls: auto-grow `Textarea` (`maxRows`), the searchable select's
   search box, password show/hide, search clear (and the error icon on the other text-like controls).
3. emmie-only controls into the package as they are: `TimeInput` (`notNullable`), `BooleanRadioGroup`,
   `SwitchButtons`, `AdditiveInput`, `GroupMultiSelect`.
4. The date pickers last (emmie's own calendars, 45 + 11 uses).

Step 2, **field-controls into the package**: self-wrap in `FormField` when `label` is set, the
`class`/`style` split, no empty wrapper (report §5a). Step 3: only then decide the kit
(`<TextField name label />` from `useForm`).

## Gotchas on the work machine (may differ at home)

- Playwright: never download Chromium; alias the cached `chromium_headless_shell` revision to the one the
  repo wants (symlink in `~/.cache/ms-playwright`).
- `npx vue-tsc -p <dir>` from a subfolder silently runs the package tsconfig. Use
  `node_modules/.bin/vue-tsc -p "$PWD/tsconfig.json"` for a scratch type check.
- `useId()` is unique per Vue **app**: specs that mount two forms separately get the same ids; mount
  them under one parent.
- The hook here blocks `git branch -D` in script-development repos; branch cleanup is done by hand.
- Branch cleanup is deferred: `experiment/ui-form-spread`,
  `-field`, `-no-http`, `-glue`, `-merge`, `form-merge`, `form-wiring`, the stray `experiment/ui-form`, plus
  the old feature branches `feat/dialog-before-close-guard` and `feat/ui-inputs-formfield-orientation`.

## Release sequence (decided 2026-10-19, package side)

The package PR comes from a FRESH branch off `main`, not from this experiment branch: the experiment history
(41+ commits, some naming the consumer) must not land in main's log. Carry the package over in a few clean
commits; leave `HANDOFF.md` and `EXPERIMENT-REPORT.md` behind.

1. Fresh branch off `main`, the package in clean commits, version `0.1.0`, CHANGELOG `## Unreleased` renamed
   `## 0.1.0 — <date>`, `"private"` DROPPED (npm refuses to publish a private package), and `DOCS-PAGE.draft.md` moved to `docs/packages/ui-form.md` with the three listings
   in its header (validate:docs requires them once the package is publishable). PR, review, merge.
2. Publishing is not part of this work: the approval, the hand bootstrap, the Trusted Publisher and any proving
   bump happen elsewhere. This work ends at the merged PR.

## State at 2026-10-19 morning (control.21 @ 3ccd75b, superseded: see the last section)

Decided since the 10-09 notes (emmie-2 now leads the emmie + package line; my side = the package):

- Kit = K2: `useForm` hands out bound controls (`TextField` … `GroupComboboxField`, `TimeField`, `PasswordField`)
  typed by `PathsOf` on `FormDraft<T>` drafts; `createUiForm({texts})` for an app's texts; `field()` stays public.
- Drafts are nullable (`FormDraft<T>`; booleans/lists/nested keep shape). Messages stay until the next submit.
- No shims; ui-form runs next to npm ui-inputs 0.17 + fs-form, and its CSS (one `@layer ui-form`) must keep 0.17
  markup working: new styling only on new class names.
- Parity done: TextInput/NumberInput autofocus, NumberInput hidden spin (`.ui-number`), Textarea autogrow +
  maxRows, MultiSelect/MultiCombobox model in display order (+ placement), TimeInput, SearchInput, InputGroup
  (prepend/append), PasswordInput. Combobox and RadioGroup needed nothing.
- Remaining: GroupSelect/GroupCombobox `alphabeticalSort`; the date picker last (emmie's DatePickerField works via
  `field()` meanwhile); then the release sequence above.

### Before the package PR (package side)

- Run Stryker once over the scope (`src/form`, `src/composables`, `src/internal`): `src/form/kit.ts`,
  `draft.ts` and `path.ts` changed or landed after the last run (form.ts was 100%, the scope 92%).
- README: document the new controls (TimeInput, SearchInput, PasswordInput, InputGroup), `prepend`/`append`,
  autogrow, autofocus and the kit list; the docs draft's API sections are still TODO.
- Then the package PR (release sequence step 1; these notes and EXPERIMENT-REPORT.md stay behind).

### Open (small, package side)

- A bound field's `prepend` on a non-text control (CheckboxField …) is not rejected by its type; harmless,
  the props pass to `InputGroup` only where `bind()` sees them.
- emmie-side, noted by emmie-2: `.ui-error:not(:empty)` on the first branch that loads ui-form; drafts as
  `FormDraft<T>`; `createUiForm` texts incl. clearButtonLabel / showPasswordLabel / hidePasswordLabel /
  capsLockText.

### Learned today (gotchas)

- Stryker does not mutate inside a type assertion: `useForm`'s body sat in `(...) as UseFormCall` with 0
  mutants. Keep casts at the export (`const body = …; export const x = body as T`).
- Kit typing: a generic select's `T` is not inferred through `Omit<props>`; the bound select types declare
  `options`/`groups` + `optionLabel` explicitly (`Carries<T>`).
- `vitest-browser-vue`'s `render()` returns a promise here (`await render(…)`). Two `renderInField` calls in one
  axe test give two `<main>` (landmark violations); a test that throws mid-render leaks its `<main>` into every
  later axe test, so fix the first failure first.
- happy-dom has no layout (`scrollHeight` 0) and no `showPicker`: size logic is pinned in the browser suite,
  happy-dom specs stub measurements.
- `.stryker-incremental.json` can go stale and skip work: move it aside for a full run.
- The select-family unit flake is local and load-only (0 test failures in 200 CI runs).
- Packs now: ui-form only (the shims are gone). Bump `packages/ui-form/package.json`, `npm install
--ignore-scripts`, build, `npm pack --pack-destination ../../.experiment-packs`, commit, push to `fork`.
- Scope: fix what this work owns; don't chase issues merely noticed elsewhere.

## State at 2026-10-19 evening (control.29, home machine; superseded: see the last section)

This side leads the package until the package PR; the emmie side is the test bed and tests what it is asked.
Packs bump `0.1.0-control.N` (a pre-release counter, never published); commits stay local and go to `fork`
only when asked. The published version is 0.1.0 (docs/contributing.md § 5). Mutation runs are parked until
asked: the API comes first.

Done today, each tested on emmie (ContractFormDrawer, FinancingFormDrawer + PersonRouteBudgetFields: pass):

- Non-text bound fields refuse `prepend`/`append` in their types; GroupSelect/GroupCombobox `alphabeticalSort`
  (options within each group, groups keep the caller's order).
- FormField slots `#label-after` (a tooltip), `#aside` (the end of the label row, `.ui-field__head`), `#hint`
  (under the control, named in describedby after the message); the bound controls forward all three.
  `--ui-label-required-color`, `--ui-hint-text`, `--ui-hint-size`.
- `useForm` hands out a `FormField` bound by name: the form's ids, its slot gets the wiring without the value.
  The slot also gives `aria` (`FieldAria`) for a native element, with `aria-labelledby` (labels take
  `${id}-label`); attributes that do not apply are left out, so a consumer's own one holds in any order.
- One wiring type: `FieldBinding` takes `error` (optional); `FieldProps` is gone.
- `UseFormCall` is exported (an app's `export const {useForm} = createUiForm(...)` failed TS4023); typecheck
  runs a declaration check on that re-export.
- A bound control binds a path by what it reads and writes (`PathsFor`): text/date/password fields and a select
  without `clearLabel` bind never-empty paths. Type the draft as the honest model; `FormDraft` is the escape hatch.
- CHANGELOG names the source packages instead of copying ui-inputs history.

Decided against: an optional-field note (`markOptional`; `required` is the one signal, reverted), a
format/parse pair on bound fields (euros over cents stays hand-built), a RadioGroup option slot (rare; the
bound FormField with `aria` covers card groups), a named `asDraft` helper.

fs-form and ui-inputs: deprecate in favour of ui-form, then remove from the repo in a separate PR once ui-form is
published. Consumers pin their versions, so they are no reason to keep either. The ADR-0043 amendment does not
exist yet; this work writes it (the merge, the deprecation, a default look instead of purely headless).

Running on the emmie side: Test 3 (a modal through the dialog host: where does useForm live, since it needs
setup for useId) and Test 4 (lists: a 422 on row 1, then remove row 0 — do messages keyed by index land on the
wrong row?). Test 5 tomorrow: both drawers visually, plus a horizontal field with a hint and a message.

Gates: unit 851, browser 196 + 3 new axe audits, typecheck, lint, coverage 100% green. On this Windows machine
format:check, validate:dist and lint:pkg fail for every package (CRLF checkout artefacts; spawnSync('npm')
without a shell); publint and attw pass for ui-form run directly. Playwright wanted headless shell 1243: a
junction to the installed 1234 in %LOCALAPPDATA%\ms-playwright.

## State at 2026-10-21 (control.34; superseded by the last section, its working rules still hold)

### Two branches, both on `fork` (Confmc/fs-packages)

- `experiment/ui-form-control`: where the work happens. All history, these notes, the packs. Tip carries
  this handoff.
- `feat/ui-form`: the PR branch, made 2026-10-20 off `main` (`e3588d4`). ONE commit (`b11246f`): the package
  at control.34 with version `0.1.0`, `"private"` removed, CHANGELOG `## 0.1.0 — 2026-10-20`, plus the three
  root files (`package.json` test:browser, `vitest.config.ts` PACKAGE_THRESHOLDS, the lockfile entry). It
  leaves behind HANDOFF.md, HOME-HANDOFF.md, EXPERIMENT-REPORT.md, ADR-0043-AMENDMENT.draft.md and
  DOCS-PAGE.draft.md. fs-form and ui-inputs are untouched. NO PR exists. Files to review:
  https://github.com/script-development/fs-packages/compare/main...Confmc:fs-packages:feat/ui-form
- Until the open items below are done, keep working on the experiment branch (packs need the
  `control.N` counter). To refresh `feat/ui-form`: `git checkout experiment/ui-form-control --
packages/ui-form`, `git rm --cached` the five notes above, version `0.1.0`, no `"private"`, then commit.

### Checked at work, 2026-10-22

Linux run of the experiment branch at control.34: unit 855, typecheck (incl. the declaration check),
`format:check`, `lint:pkg`, `validate:dist` all pass. That closes item 5 below for the package's own files;
`feat/ui-form` still gets its first full run in CI. The pack is rebuilt in `.experiment-packs/` here, and
`~/script-development` links to `~/github/script-development`, so emmie's committed pack path resolves on both
machines.

### Not ready to merge: what is open

1. Two shapes never run on a real emmie form (running on the emmie side since 2026-10-22, at work): `withdraw('list')` on a real list form
   (the misattribution itself was confirmed on a probe), and one form whose 422 is indexed by the sent list
   (rooms: a draft-less `useForm` with free names).
2. Still to do on `feat/ui-form` before a PR: move DOCS-PAGE.draft.md to `docs/packages/ui-form.md` (drop its
   header comment and the "not yet released" box) plus the three listings its header names; `validate:docs`
   fails until then, now that `"private"` is gone. Add a ui-form row to CLAUDE.md's Packages table. Fix the
   CHANGELOG date at merge.
3. CI mutation gate: CI runs Stryker at 90% and ui-form is in it. The last full run (2026-10-19, 91.27%) was
   before kit.ts, FormField and withdraw changed. Mutation is parked, but run it once before a PR
   or CI may go red.
4. Publishing (not this work, but it bites): a new package cannot be published by CI. Hand-publish 0.1.0
   and wire the Trusted Publisher first (CLAUDE.md, Adding a Package, step 7). If ui-form merges first, the
   publish workflow raises an approval that 404s and turns the publish step red for every package.
5. Never verified here: `format:check`, `validate:dist`, `lint:pkg` fail on the Windows home machine for
   EVERY package (CRLF checkout artefacts; `spawnSync('npm')` without a shell). publint and attw (with
   `--exclude-entrypoints style.css`) pass for ui-form run directly. CI will be their first real run.
6. ADR-0043 amendment: a reviewed draft in ADR-0043-AMENDMENT.draft.md; not submitted.
7. fs-form and ui-inputs: deprecate after ui-form's first publish, remove from the repo in a separate PR.
   Not started; not part of the ui-form PR.
8. The fork is public, and the experiment branch's commit messages and these notes name people and emmie.

### Done since the 10-19 evening section (all tested on emmie, browser pass included)

- A bound control's `name` follows what the control reads and writes (`PathsFor`): text/date/password
  fields and a select without `clearLabel` bind never-empty paths. Type the draft as the honest model;
  `FormDraft<T>` is the escape hatch.
- `UseForm` / `UseDraftForm` include the bound controls (a child's `form` prop is `UseDraftForm<D>`). The
  draft-less overload refuses `draft`; in a helper generic over its draft, `useForm<D>({draft})`.
- `UseFormCall` exported (TS4023 on `export const {useForm} = createUiForm(...)`); typecheck runs a
  declaration check on that re-export.
- FormField `#hint` (between control and message, `${id}-hint`, in describedby after the message), a
  `FormField` bound by name from `useForm`, `aria` in its slot for a native element (`aria-labelledby` to the
  label's `${id}-label`; attributes that do not apply are left out). One type, `FieldBinding` with `error`.
- `#aside` gets no wiring (the field's id is the control's); `#label-after` is spaced from the label text.
- `withdraw(path)` also drops every message under the path (a list whose rows moved).
- NumberInput: a `span.ui-input-wrap` root and the in-input error icon, like TextInput.
- The hint is muted by default (`--ui-control-text-muted`). Load ui-form's stylesheet INSTEAD of
  ui-inputs', never both: an unlayered ui-inputs rule beats ui-form's layered ones.
- Specs: `useForm({draft: ref(...), idPrefix: 'test'})` builds a real form in plain test code.
- Migration is per page tree (a page and every dialog it opens), not per form: fs-form's middleware fills
  every mounted fs-form bag on any 422. README, docs page, CHANGELOG and the ADR draft say so.
- Decided against: an optional-field note (`required` is the one signal; emmie drops its "optioneel"
  notes), format/parse on bound fields, a RadioGroup option slot, `asDraft`, a package test fake, a
  visual "selected" mark on SingleSelect, the icon on selects, props on bound selects for stubs.

### The emmie side

Branch `error-keys-raw` on emmie, ALL UNCOMMITTED: ContractFormDrawer, FinancingFormDrawer (in part),
PersonRouteBudgetFields, the dialog host `createDraftFormModal` + WaitlistClientFormModal, specs (892 green on
control.34), `@layer base, ui-form;` in app.scss, ui-form's stylesheet only. Packs live in
`.experiment-packs/` on the HOME machine only (git-excluded): at work, rebuild the pack before emmie needs it.

### Working rules (at home they sat in an uncommitted CLAUDE.local.md)

- Decide package questions on the package's merits. Consumers pin their version; migration cost is a cost
  to weigh, never a veto.
- We own all of fs-packages here, fs-form, ui-inputs and ADR amendments included. The existing code on main is a
  strong style hint, not a ruling.
- Readable over clever, every time: the plainest code that does the job (plain `if`s, a predicate and two
  filters), never complicated to match other code.
- Get the API right first; no mutation runs until asked. Add only what the emmie test bed needs; template
  exceptions get refactored away, not supported by a new feature.
- Packs: bump `0.1.0-control.N` per pack (a fake pre-release; the published version is 0.1.0). Commit
  locally; push to `fork` only when asked or before stopping for the day.
- Say what is NOT done before acting on a request that implies it is (a PR, "ready"). Ask before outward
  steps (push, PR); a draft PR is not a review vehicle when a compare link does the job.
- Switching a branch is just `git switch`; never reinstall unasked (`npm ci` dies on locked language-server
  binaries on Windows).
- The emmie session leads nothing now: this side leads the package until the PR; emmie tests on request
  (pack, what to check, what counts as a pass) and pushes back.

## State at 2026-10-22 (control.36; superseded by the last section for how the package lands)

### Branches, both pushed to `fork`

- `experiment/ui-form-control`: work, packs, these notes. Last pack `0.1.0-control.36`.
- `feat/ui-form`: the PR branch, kept in step by copying each change over (one commit per point). It now
  carries the docs page in `docs/packages/ui-form.md` with its three listings (`validate:docs` passes), the
  ui-form row in CLAUDE.md's Packages table, and every package change below. NO PR exists. Review:
  https://github.com/script-development/fs-packages/compare/main...Confmc:fs-packages:feat/ui-form

### Done 2026-10-22 (each tested on emmie: rooms, care plan create/edit, contract drawer)

- emmie's two open shapes pass: `withdraw('list')` where rows are removed or reordered (appending needs
  nothing), and a form whose 422 is indexed by the sent list (draft-less form, one `keyMapper`).
- A control's own listeners run before a consumer's (own `@…` before `v-bind` of `$attrs` in 13 controls), so a
  consumer's `@input` reads the new value. Pinned by `tests/listener-order.spec.ts`.
- `handleSubmit`: messages stand until the submit settles. Resolved: cleared (`'sent'`); 422: replaced
  (`'refused'`); resolved `false`: nothing sent, messages stay (`'cancelled'`, new); other rejection: rethrown,
  messages stay. The action type is `() => Promise<unknown>`; only a literal `false` cancels.
- The bound `FormField` declares only `name` (the rest falls through). Kit specs build `createUiForm` per test:
  a factory that throws at collection fails the file with no test run, which Stryker counts as survived.
- Docs (README, docs page, CHANGELOG): lists, a form over loaded data (the page loads, renders the form
  component `v-if` with the record; a shared create/edit form types its draft as the state both edit), testing
  notes (un-stub bound controls, find by `form.field(name).id`, `form.take` for a child, assert on the draft),
  an action that goes on after the save returns its answer on every path (`noImplicitReturns`), decide on the
  outcome and not on whether messages show.
- Decided against: `Ref<D | undefined>` drafts, a subtree form type, distinct names for the bound
  frame/message, a test-friendly bound-control shape, `cancel()` or a `sent` callback on `handleSubmit`.
- Checked: unit 868, browser 199, typecheck, lint, `format:check`, `lint:pkg`, `validate:dist`,
  `validate:docs`. Full Stryker run 94.24%, then 95.05% (`kit.ts` 98.5%, `form.ts`/`form-submit.ts` 100%;
  `useListbox.ts` 89.5%, carried over from ui-inputs). The one survivor left in `kit.ts` is false (a
  module-level mutant the vitest runner cannot activate; applied by hand, 8 specs fail).
- Two one-off local unit failures today, not reproduced in 10 reruns: the known load-only select flake.

### Draft PR #323 (opened 2026-10-22)

https://github.com/script-development/fs-packages/pull/323, from `feat/ui-form`, no labels or reviewers: for the
lead to look at the shape and critique it, not for merge. Its body carries the ADR-0043 amendment (ADR-0015 accepts
a PR description as the proposal). `main` was merged in first; that needed ui-form on the shared `tsdown.base.ts`
(no source maps or comments in the bundle), happy-dom/vue/vue-tsc on main's ranges, and the `tags` job's timeout
at 41 minutes for 16 packages. The experiment branch does not have those yet: carry them over before the next pack.

CI: `browser-tests` green. `check` stops at `npm audit`: vite 8.3.0 has new high advisories, a problem of `main`
(dependabot #321 is red on it too) and left to main. The rest of `check` runs in CI once main is past it; locally
every step passes on the merge.

Before merge: the CHANGELOG date, and the hand-publish + Trusted Publisher order.

Not part of the PR: publishing (hand-publish 0.1.0 and attach the Trusted Publisher before CI publishes), the
ADR-0043 amendment (draft written, goes through the war room), retiring fs-form and ui-inputs (separate PR
after the publish), and the public fork's experiment history naming people and emmie.

### The emmie side

`error-keys-raw`: local commits on top of 8a3e30f810 (rooms, care plan as one `CarePlanForm` with two loaders,
the contract drawer toast deciding on the outcome, specs), not pushed. The test-bed list is closed on both sides.

## State at 2026-10-22 evening: landing ui-form in small PRs (superseded by the last section)

### What changed

The one-package PR (#323, a draft, CLOSED 2026-10-23; its branch `feat/ui-form` stays as reference) is too large to
review. Two attempts were closed: #325 (a full verbatim copy) and #326 (the layer wrap stacked on it from
the fork, which drags #325's diff along). The package now lands per component, each PR a verbatim copy
commit from ui-inputs or fs-form followed by the change commits, so every change reads as a diff.

### Open: #328, waiting on review

https://github.com/script-development/fs-packages/pull/328, branch `ui-form/01-scaffold` (pushed to `fork`):
the scaffold plus TextInput, four commits (copy, wiring, `@layer ui-form`, TextInput's changes), about 290
lines to read. ui-form is `private` at 0.0.0, so nothing publishes and the docs gate skips it. Two
questions are with the reviewer: is this size acceptable, and stacked PRs or not.

**Stacking needs push rights upstream.** The account has `push: false` on script-development/fs-packages.
A PR's base must be a branch in that repo, so from the fork every PR targets `main`, and a PR built on
another unmerged one shows both diffs. Without push rights: one PR at a time, and independent components
side by side, each opened once its base has merged. With push rights: push the branches upstream and
point each PR at the branch it is built on.

### Local branches, NOT pushed (only on the work machine)

Each is built on its real dependency, which fits either answer above. Every gate passes on each
(coverage 100%, browser suite green, Stryker 100% where `.ts` under `src/form`/`src/internal` changes).

| Branch | Built on | Lines to read (excl. copy) |
|---|---|---|
| `ui-form/02-form-field` | 01 | ~600: FormField/FormLabel/FormError, the id helpers in `src/form/field.ts`, the browser suite (layer tests, axe harness with TextInput and field-frame cases) |
| `ui-form/03-number-input` | 02 | +141/−22 |
| `ui-form/03-date-input` | 02 | +31/−9 |
| `ui-form/03-textarea` | 02 | +194/−12 (autogrow; puts Textarea's rows back in composition.spec) |

The 03 branches change the same lines of `index.ts` and the shared spec tables: once one merges, merge
main into the others (never rebase).

### The plan from here (reviewed against the code)

1. #328 scaffold + TextInput. 2. FormField family + browser suite (`02`).
3. 3a side by side: NumberInput, DateInput, Textarea (done locally), InputGroup, Checkbox+Switch (brings
   the internals accessible-name, dev-warning, reactivity, disabled-guard with their specs, renames
   `[ui-inputs]` to `[ui-form]` in them, and forced-colors-paint.browser.spec). 3b after Checkbox+Switch:
   CheckboxGroup+RadioGroup (CheckboxGroup imports Checkbox), Pressable, Disclosure.
4. PasswordInput, SearchInput, TimeInput (need TextInput's chrome); the listbox core (useListbox,
   OptionList, ListboxOption, group-rows) with a NEW direct `OptionList.spec` (nothing else covers
   OptionList's grouped branch before GroupSelect), and without `listbox-open-owner.spec` (it asserts the
   exact six-host list).
5. The six selects, one PR each.
6. Form, one at a time: validation errors, submit, useForm, typed paths and draft, `field()` with the
   bound FormLabel/FormError, the kit last (it imports every control).
7. The look (token values), then the release (docs page, CLAUDE.md row, README, `private` off).

Sizes to watch: Pressable (~2,100 with its browser parts) and the Multi/Group selects (~2,000 each): put
their browser specs in a follow-up PR. Reference for each component's changes: the old full-copy-based
branches `split/03-text-input` … `split/15-input-group` (their spec-table hunks don't apply to the new
base; take the rows, drop rows for components not yet on the branch, and take `field-slot` rows and axe
cases from `review/ui-form-vs-sources`).

### Next steps

1. Read the reviewer's answer on #328 (size, stacking).
2. If push rights: push 01/02/03 upstream and open stacked PRs. If not: wait for #328 to merge, then open
   02, then the 03 branches side by side.
3. Continue preparing locally: `03-input-group` (reference `de022a7`, plus its axe case), then
   `03-checkbox-switch` (reference `f56c1eb`).

## State at 2026-10-23: first review round, new rules (superseded by the last section)

### Decided in review and by the reviewer, 2026-10-23

- **PRs as small as possible**: one tiny component per PR where it can be; pairs only where the code forces it
  (CheckboxGroup imports Checkbox). Each PR: a verbatim copy commit from ui-inputs or fs-form, then the change commits.
- **No push rights upstream, and none coming**: no stacking. Every PR targets `main` and may contain only what is
  already in main plus its own change. A PR that needs another unmerged one waits until that one merges.
- **Style comes from emmie (option A).** The package keeps ui-inputs' own neutral token defaults (the stylesheet is
  ui-inputs', verbatim). New hooks get defaults that change nothing or stay neutral. emmie's look becomes a `--ui-*`
  token map in emmie. The "look" PR at the end of the old plan is gone.
- **Control API**, matching ui-inputs' documented contracts (docs/packages/ui-inputs.md § Contracts, README § Errors are
  a prop, never a service): `id` required (no `useId()` fallback); controls take only `invalid`, no `error` (FormField
  decides the message); `FieldBinding` = `{id, invalid, describedby}`. TextInput: `placeholder` required, `type` without
  `password`. Other inputs' placeholder: ask per component PR.
- **`v-model` on the inner input** (TextInput, later Textarea): Vue's own IME handling, so ui-inputs' `composition.ts`
  goes; `composition.spec` stays and pins the behaviour. (`composition.ts` came from the reviewer's own #285.)
- Check every component PR against ui-inputs' documented contracts before opening. #328 deviates in one documented
  place, on purpose and disclosed: TextInput puts `class`/`style` on its wrapper `span.ui-input-wrap`.
- The FormField slot change (`{field, aria}` instead of `{controlId, errorId, required, invalid, describedby}`) is an
  API change for its own PR to state explicitly.

### #328 (scaffold + TextInput), open, waiting on re-review

https://github.com/script-development/fs-packages/pull/328, branch `ui-form/01-scaffold` @ c2e98ba on `fork`. Review round
handled one commit per comment (67262d2 id, a0e0934 placeholder, a0ce2c7 password, 780e976 invalid only, 1437ce4
v-model), each answered in its thread; our own test review added 5467105 (parent-to-field model test), bfd7987 and
e05c09b (comments). c2e98ba is an empty commit to re-run CI after `browser-tests` hung on the runner's Chromium system
deps install (infra, not code; re-running needs admin rights we don't have). CI green. Review status still "changes
requested" until the reviewer reviews again.

The publish `tags` timeout 40 → 41 in #328 is REQUIRED: `validate:workflows` sizes it by the number of folders under
`packages/` (2 × packages × 1 min + 6 + 3; 16 folders → 41). Setting it back fails `check`.

### Prepared, pushed to `fork`, no PRs (all built on #328's earlier head 1437ce4)

After #328 merges, merge main into each before opening (never rebase).

| Branch | Stands on | To read (excl. copy) |
|---|---|---|
| `ui-form/p02-form-error` | #328 | +1: FormError copied unchanged + export |
| `ui-form/n-form-label` | #328 | +1: FormLabel copied unchanged + export |
| `ui-form/n-checkbox-switch` | #328 | +29/−158: Checkbox+Switch (ui-inputs already had id required and invalid only), the internals accessible-name, dev-warning, reactivity, disabled-guard with their specs (trimmed; cases return with their components); Stryker 94.7% |
| `ui-form/n-form-submit` | #328 | +288/−356: first form step, useValidationErrors + useFormSubmit without HTTP (`take()`, settle-time outcomes, structural 422 contract in http-contract.ts); Stryker 100% |
| `ui-form/p03-form-label` → `p04-form-field` → `p05-browser-suite` → `p06-field-hint` → `p07-field-label-after` → `p08-field-aside` | a chain on p02 | p04 +231/−25 (the `{field, aria}` slot, id required, field without error), p05 +179/−10 (browser suite, layer tests, axe with TextInput + FormField), p06 +88, p07 +39, p08 +58 |

`p03-form-label` is superseded by `n-form-label` (same content, on #328 directly); when FormField's chain goes up,
build it on main after FormError and FormLabel have merged.

**Reference only, OLD rules (`error` prop, optional id), never open:** `ui-form/02-…`, `03-…`, `04-…` (2026-10-23
morning; on `fork` as `reference/ui-form-*`) and `split/*` (2026-10-22, local only). They hold no code that is not in
`review/ui-form-vs-sources`, only the assembly per component (which hunks, which spec cases cut out and restored, e.g.
the checkbox family's interaction tests in `reference/ui-form-04-checkbox-radio-group`). Take from them, never merge.

### The order from here

1. #328 merges.
2. Up together, each against main: FormError (`p02`), FormLabel (`n-form-label`), Checkbox+Switch
   (`n-checkbox-switch`), the first form step (`n-form-submit`). Picked so two of the five carry real design risk
   (non-text controls + internals; the no-HTTP submit) and feedback comes early. Then WAIT for review: it may affect
   the rest.
3. Then FormField and its chain (p04…p08 rebuilt on main), the browser suite, the remaining components one per PR
   (NumberInput, DateInput, Textarea with v-model, InputGroup, CheckboxGroup+RadioGroup, Pressable, Disclosure,
   Password/Search/TimeInput, the listbox core with a new direct OptionList.spec, the six selects), the form chain
   (useForm, typed paths/draft, field() with bound FormLabel/FormError, the kit last), the release (docs page from
   ui-inputs' page, CLAUDE.md row, README, `private` off).

### emmie

The test bed is session `error-keys-raw` in `~/worktrees/emmie-2` (branch `error-keys-raw`). Briefed 2026-10-23 on the
new rules (style from emmie, invalid only, id required, TextInput placeholder/password, v-model). Its phase 3 plan
(docs/plans/fs-packages-ui-form/PLAN.md § 3, d8cc8dba3e) got the package-side view: its token-map table is the full
set (12 changed defaults + the new tokens), names stay as control.36's; required id stays (emmie writes ids, `useId()`
at the call site; the fallback is the lead's call); the package lands as ~30 PRs with `private` off only in the last,
the kit lands last, so the pilot waits for nearly all of it; FormField slot, field(), useForm and the kit are not yet
reviewed in small-PR form. Development's EMMIE-2255 sends room workplaces keyed by id, so the old "Test B" (422 indexed
by the sent list) is moot for emmie.

### Next steps

1. Watch #328 (a `gh` poll every 10 min was running at work). On review comments: one commit per comment, reply in
   the thread, push. On merge: merge main into the four step-2 branches, run every gate, open them.
2. While waiting, nothing else is to be built: the rest waits for the reviewer's feedback on the first five.

## State at 2026-10-26: the component PRs are open (read this section first)

### Merged

- #328 scaffold + TextInput (approved at 10c5463 after a second round: the layer header states the cascade rule as it
  holds, with the order per stack and the import order; TextInput's `type` has no `search`).
- #331 FormLabel. #334 the audit fix (zod, fast-uri, happy-dom lockfile bumps; main's `npm audit` was red for every PR).

### Open, ready for review, each against main, independent of each other (any merge order)

| PR | Branch | State |
|---|---|---|
| #330 FormError | `ui-form/p02-form-error` | review fix in (`v-if="error"` in the component, spec pins `error: ''` renders nothing); waiting re-review |
| #332 Checkbox + Switch | `ui-form/n-checkbox-switch` | review fix in: the four internals are gone (missing-label dev warning never fires in a browser; disabled guard only blocked dispatched events); waiting re-review |
| #333 validation errors + submit | `ui-form/n-form-submit` | self-review fixes in (refusedUnnamed while the bag holds a field; why the check keys on `isAxiosError`) |
| #335 NumberInput | `ui-form/n-number-input` | spin buttons stay (hiding them is a look); parent-model test |
| #336 DateInput | `ui-form/n-date-input` | now `v-model`; attrs and parent-model tests |
| #337 Textarea | `ui-form/n-textarea` | autogrow refits on a width change (ResizeObserver) |
| #338 InputGroup | `ui-form/n-input-group` | new component; keeps `id` (addon ids for the control's `describedby`, as FormError's id); ring and selector fixes |
| #339 mutate `<script setup>` | `ui-form/n-mutate-vue` | Stryker ignorer plugin `stryker-vue-macros.mjs` (stryker-js#6178); TextInput 100% |

After each merge: merge main into every other open branch (each adds an export line to `index.ts`; git usually
places them itself) and push. With #339 merged, NumberInput (92.9 %) and Textarea (92.2 %) have survivors to tighten.

Every PR went through a self-review by a separate agent before opening (copy verbatim? one commit per point? the
rules below? spec promises pinned?). Keep doing that: it found real bugs each time.

### Rules settled in this round (on top of the 2026-10-23 list)

- `placeholder` is required on every text-like control (TextInput, NumberInput, Textarea). Settled; do not ask again.
  DateInput has none (a native date input shows none).
- `class`/`style` on the root, the rest on the control element, for every control (`split-attrs.ts`). A control whose
  root is the element itself (DateInput, Textarea) needs no split; say so in the script, not in a template comment:
  a comment beside the root makes the component a fragment and attrs stop falling through.
- `v-model` on the inner element where Vue's v-model fits; where it doesn't (NumberInput's NaN → null, Checkbox/Switch
  re-sync after a declined change), the component says why.
- A component renders nothing rather than asking its caller to guard (FormError `v-if`).
- No dev-only warnings that rely on `process` (they never fire in a consumer's browser). Missing names are axe's job.
- Internals come with the component that needs them, not before: `disabled-guard` returns with CheckboxGroup/RadioGroup
  (and Pressable's `as` escape hatch, where no native `disabled` exists); `reactivity` with `useListbox`.
- A new control's PR names its consumer (emmie for TimeInput, SearchInput, PasswordInput, InputGroup).
- Bootstrap recipes are moot (the fleet leaves Bootstrap); only UnoCSS and Tailwind v4 matter. The Bootstrap recipe can
  leave the layer header in a small follow-up.

### ADR-0043 Amendment 1

On adrs.script.nl as Proposed. The site is read-only for us. Marcel sent the package side's answer to the reviewer on
Mattermost (2026-10-26); the reviewer agrees in principle, so work as if agreed until a ruling says otherwise:
§ 1 merge, agreed. § 2 `invalid` only, ruled. § 3 no default look, ruled; `@layer` stays, gated on browser fixtures
for the recipes before first publish (WR-2715). § 4 agreed. § 5 interim: ui-inputs frozen now, fixes only as 0.17.x
patches, each fix PR carries its ui-form port; the end point (when that lane stops, "removed" = no releases or deleted)
is decided at ui-form's first publish, by the reviewer. § 6 a control comes in because a consumer needs it. § 7 typing
checks land with the form chain. Mutation of `.vue` logic: #339.

### Not opened yet

- `ui-form/n-pressable`, `ui-form/n-disclosure` (pushed to fork for reference, on #332's OLD head): they need a small
  design round after #332's ruling, not a port: drop the dev warning; the disabled guard is not needed on the real
  `<button>`, but is on the `as` escape hatch. Wait for #332 to merge.
- FormField chain: rebuild on main from `p04`…`p08` (on fork) once #330 merges; FormLabel is already in. Its Lists
  docs paragraph gets one line: a message is read by the path the error layer hands over, so an object-keyed row's key
  must survive any key conversion the consumer runs.
- Then TimeInput, SearchInput, PasswordInput; the groups; the listbox core and selects; the form chain; the release.

### emmie (`error-keys-raw`, worktree emmie-2)

Slices 8–10 done locally (raw 422 keys, camelCase per segment in the error middleware, request trait off our own
requests, kept only on the 3 external day-update requests). Checked with it on 2026-10-26 and found sound: one place
for the conversion (frontend), backend converts nothing; slices 8 and 9 meet ADR-0048 rule 6 (slice 8 alone changes no
key a form reads); the error middleware writes the camel body back onto `error.response.data`, which ui-form's `take()`
reads. Noted as follow-ups for Marcel, not built: a shared `toFormData(object)` helper plus a test:arch rule against
`new FormData` elsewhere; field names put an underscore before a digit (string-ts snake_cases `addressLine1` to
`address_line_1`). Pushed at the end of the day: the collector `error-keys-raw` through 07e9ce2e7f (with its own
handoff), and slice 1 on a new branch `error-keys-1-mechanism` @ acfa63f58c off development, no PR yet (Marcel's call).
Nothing in it changes what ui-form reads or sends.

### Next steps

1. Read reviews on the open PRs; one commit per finding, reply in each thread, push; merge main into the others after
   each merge. Mark a PR ready only after its self-review and green CI.
2. Build the FormField chain on main (ready to open when #330 merges).
3. Pressable/Disclosure after #332's merge, as above.

## State at 2026-10-29: prep while the open PRs wait (read this section first)

Nothing merged or reviewed since 10-26; every comment on #330 and #332 is answered. Prep built since, each through
a separate self-review agent with its fixes in:

| Branch (on `fork`) | Base | What | Opens |
|---|---|---|---|
| `ui-form/n-browser-styles` | main | ui-form's browser suite: stylesheet + every rule of the layer header pinned | #340 (draft until CI green) |
| `ui-form/n-form-field` | #330's branch | FormField: slot hands `field` {id, invalid, describedby} and `aria`; leaves the empty-message check to FormError | after #330 merges (merge main in first) |
| `ui-form/n-field-hint` | n-form-field | hint slot, `<id>-hint`, read after the message | after FormField |
| `ui-form/n-field-label-after` | n-form-field | FormLabel `after` slot + FormField `label-after` | after FormField |
| `ui-form/n-field-aside` | n-form-field | aside slot, `.ui-field__head` row | after FormField |

The three FormField follow-ups are independent of each other (each off n-form-field). A fix on n-form-field is
merged into all three. The axe harness (renders every control inside FormField) goes into FormField's PR once
#340 has merged; each follow-up then adds its axe case.

`required` stays out of FormField's `field` (decided in the experiment: a consumer's own control would take it
as a native attribute). Written once only through the kit: `<TextField name label required/>` passes it to both
FormField and the control. Don't reopen it on the FormField PR.

### The test bed

The emmie session (`error-keys-raw`) is a test bed: it installs temporary packs and uses them on real forms, it
does not prep or polish slices. Current pack: `.experiment-packs/script-development-ui-form-landing.1.tgz` from
`experiment/ui-form-landing` @ 03e5d60 on fork (main + every open PR + FormField; index.ts and the listener-order
table merged by hand). It wires the rooms form (422 on `workplaces.new_139.name`) and one simple form on a scratch
branch off its collector, and reports what breaks. Its collector push waits for Marcel.

### Later, when prep runs out

- Compare our test code with the repo's existing tests for conventions (naming, helpers, structure). A mismatch
  is not wrong, but always worth a look.
