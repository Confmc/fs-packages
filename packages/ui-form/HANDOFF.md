# Handoff: ui-form experiment (fs-packages side)

> **Read the last section first** ("State at 2026-10-19"): it supersedes "Open" and "Next steps" below,
> which are from 2026-10-09. `EXPERIMENT-REPORT.md` is the 10-09 report for the lead and is not kept current.

Written 2026-10-09, end of day, for a fresh session on another machine. Read this first, then
`EXPERIMENT-REPORT.md` next to it (the full shape, decisions and gaps, written for Gerard).

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

## How we work (Marcel's rules)

- Prototype mode: shape over polish. A quick test + typecheck before packing is enough; skip
  mutation/README polish.
- **One commit per point**, so anything can be reverted cheaply. Bump all three package versions together
  per pack (`0.1.0-control.N`, `0.18.0-control.N`, `0.4.0-control.N`), `npm install --ignore-scripts` to
  refresh the lock, pack, push to `fork`, and tell the emmie session the file names.
- Clean package code first, then the consumer's goals, then migration cost (a cost, never a veto). Don't
  invent constraints nobody set. Since 2026-10-09: **emmie first** (Gerard); being agnostic is nice to have.
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

## Decisions (with source)

Partly superseded: the two rows marked † were replaced by K2 (the bound controls are the field-controls,
and the kit was decided before them). See the last section.

| Decision                                                                                                     | Source                           |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Merge fs-form + ui-inputs into `ui-form`                                                                     | Marcel; Gerard's "combine them"  |
| No provide/inject; shape = `v-bind="field(name)"`, FormLabel/FormError by name, form as prop †               | Gerard                           |
| Order: (1) emmie adopts ui-form's controls → (2) field-controls into the package → (3) then decide the kit † | Marcel/Gerard                    |
| emmie first; agnostic is nice to have                                                                        | Gerard                           |
| Generated ids, fixed prefix only when needed                                                                 | Gerard ("geweldig")              |
| Form-bound pieces take the old names                                                                         | Gerard; Marcel prefers old names |
| ADR-0043 amendment                                                                                           | Gerard writes it                 |
| Messages stay until the next save; `withdraw` is explicit (clear-on-edit reverted, control.12)               | Marcel                           |
| `error` + `invalid` override ("message without red")                                                         | Marcel                           |
| No shims; emmie renames its imports in one pass                                                              | Marcel                           |
| `Message`/`FormError` always present; `FormField`'s own message only when there is one                       | Marcel                           |
| `keyMapper` default stays identity (casing lives in emmie's http middleware)                                 | Marcel                           |
| `refusedUnnamed` = "no field the form holds"; keep `'ignored'`; keep the one overload cast                   | Marcel                           |
| RichTextEditor (tiptap) / file upload stay in emmie, wired through `field()` / `FormField`                   | Marcel                           |
| Package CSS = defaults that consumer CSS always overrides → `@layer ui-form`                                 | Marcel                           |

## Open (2026-10-09, superseded: see the last section)

- **Pending with Gerard:** the 422-per-form model (he asked for an example); `string | null` vs `string`
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
- The hook here blocks `git branch -D` in script-development repos; branch cleanup waits for Marcel.
- Branch cleanup is deferred until after the lead conversation: `experiment/ui-form-spread`,
  `-field`, `-no-http`, `-glue`, `-merge`, `form-merge`, `form-wiring`, the stray `experiment/ui-form`, plus
  the old feature branches `feat/dialog-before-close-guard` and `feat/ui-inputs-formfield-orientation`.

## Release sequence (decided 2026-10-19, package side)

The package PR comes from a FRESH branch off `main`, not from this experiment branch: the experiment history
(41+ commits, some naming the consumer) must not land in main's log. Carry the package over in a few clean
commits; leave `HANDOFF.md` and `EXPERIMENT-REPORT.md` behind.

1. Fresh branch off `main`, the package in clean commits, version `0.1.0`, CHANGELOG `## Unreleased` renamed
   `## 0.1.0 — <date>`, `"private"` DROPPED (npm refuses to publish a private package, so the hand bootstrap
   below needs it gone), and `DOCS-PAGE.draft.md` moved to `docs/packages/ui-form.md` with the three listings
   in its header (validate:docs requires them once the package is publishable). PR, review, merge.
2. The merge raises a `publish.yml` approval (`detect` sees 0.1.0 missing on npm). DO NOT approve it: without a
   Trusted Publisher it 404s.
3. Hand-bootstrap `0.1.0` from a clean `main` checkout (repo CLAUDE.md § Adding a Package, step 7: short-lived
   token, never written to a tracked file, revoked after), then attach the Trusted Publisher on npmjs.org.
4. Cancel the waiting run from step 2 (it would now report nothing to publish and spend an approval).
5. Second PR: bump `0.1.1`. Approve that run and read its log for `Successfully published`, which proves the
   grant.

## State at 2026-10-19 (control.21 @ 3ccd75b)

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
- Then the release sequence above (fresh branch off `main`; these notes and EXPERIMENT-REPORT.md stay behind).

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
- Scope: fix what this work owns; don't chase issues merely noticed elsewhere (Marcel, 2026-10-19).
