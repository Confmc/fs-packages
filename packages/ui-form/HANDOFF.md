# Handoff: ui-form experiment (fs-packages side)

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

- **emmie side:** branch `experiment/fs-packages-control` on emmie's origin (worktree `emmie-2` on the work
  machine). Its report is `docs/plans/fs-packages-experiment/REPORT.md`. The emmie-side session
  ("emmie-0924-fs-form-collector…") drives the experiment and relays Marcel's / Gerard's decisions; this side
  builds the package and pushes back where something smells.

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

| Decision                                                                                                   | Source                           |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Merge fs-form + ui-inputs into `ui-form`                                                                   | Marcel; Gerard's "combine them"  |
| No provide/inject; shape = `v-bind="field(name)"`, FormLabel/FormError by name, form as prop               | Gerard                           |
| Order: (1) emmie adopts ui-form's controls → (2) field-controls into the package → (3) then decide the kit | Marcel/Gerard                    |
| emmie first; agnostic is nice to have                                                                      | Gerard                           |
| Generated ids, fixed prefix only when needed                                                               | Gerard ("geweldig")              |
| Form-bound pieces take the old names                                                                       | Gerard; Marcel prefers old names |
| ADR-0043 amendment                                                                                         | Gerard writes it                 |
| Messages stay until the next save; `withdraw` is explicit (clear-on-edit reverted, control.12)             | Marcel                           |
| `error` + `invalid` override ("message without red")                                                       | Marcel                           |
| No shims; emmie renames its imports in one pass                                                            | Marcel                           |
| `Message`/`FormError` always present; `FormField`'s own message only when there is one                     | Marcel                           |
| `keyMapper` default stays identity (casing lives in emmie's http middleware)                               | Marcel                           |
| `refusedUnnamed` = "no field the form holds"; keep `'ignored'`; keep the one overload cast                 | Marcel                           |
| RichTextEditor (tiptap) / file upload stay in emmie, wired through `field()` / `FormField`                 | Marcel                           |
| Package CSS = defaults that consumer CSS always overrides → `@layer ui-form`                               | Marcel                           |

## Open

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

## Next steps (agreed order)

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
