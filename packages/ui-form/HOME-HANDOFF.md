# Home handoff: ui-form (fs-packages side)

For a fresh session on a machine without the work machine's local state (no Claude memories, no
`.experiment-packs/`, no scratch worktrees, no emmie peer sessions). Read this, then the last section of
`HANDOFF.md` ("State at 2026-10-29"). Like `HANDOFF.md`, this file stays on the experiment branch; it never goes
into a PR.

## Where it stands (end of 2026-10-29)

- **Merged into main:** #328 (scaffold + TextInput), #331 (FormLabel), #334 (audit fix).
- **Open, ready, each against main, any merge order (13):** #330 FormError, #332 Checkbox+Switch, #333 validation
  errors + submit, #335 NumberInput, #336 DateInput, #337 Textarea, #338 InputGroup, #339 mutating `<script setup>`,
  #340 browser suite, #341 TimeInput, #342 SearchInput, #343 PasswordInput, #344 RadioGroup.
  CODEOWNERS requests the reviewer team automatically when a PR leaves draft; #330 and #332 were re-requested after
  their review comments were answered. Nobody else reviews this repo (no review bot; the bus's reviewer covers emmie only).
- **#344** failed CI once on mutation (86.67%): two disabled-guard mutants. Fixed in `fd1878c`; CI green, ready.
- **Prepared on `fork`, no PR yet** (each waits on a merge; merge main in first, never rebase):

| Branch | Waits on | What |
|---|---|---|
| `ui-form/n-form-field` | #330 | FormField with the `field`/`aria` slot |
| `ui-form/n-field-hint`, `-label-after`, `-aside` | FormField | one follow-up each, independent of each other |
| `ui-form/n-checkbox-group` | #332 | CheckboxGroup, per-option `disabled`, legend slot |
| `ui-form/n-single-select` | nothing: open next | SingleSelect + the listbox core; all on `fork` @ `98244ab` |

- **SingleSelect** (`ui-form/n-single-select` @ `98244ab`): reviewed, review fixes in, Stryker 97.14 locally (9
  survivors are equivalent mutants: no behaviour difference). Before opening: a short second review of the last
  three commits only (`5c47cec` comments, `338d898` a typeahead refactor, `98244ab` ~25 useListbox harness tests;
  some of those set `pointer = -1` directly, a state no real input reaches: keep or drop deliberately). Then open as a
  draft; the body says most of the ~2750+ lines are the verbatim copy commit.

## Next

1. SingleSelect PR (above). Then the other selects one PR each: Combobox, MultiSelect, MultiCombobox, GroupSelect,
   GroupCombobox; each adds its rows back to the family specs (one-row tables were kept for that) and its host to
   `listbox-open-owner.spec`.
2. Decide: should selects honour `SelectItem.disabled` (the groups do)? Check pre-forms emmie's selects first.
3. Pressable/Disclosure design round after #332 merges. Then the form kit (`useForm`, bound fields,
   `createUiForm({texts})`), then the release (drop `private`, docs page, CHANGELOG, "replace the ui-inputs sheet,
   never add").
4. On every merge: merge main into the open branches that touch the same files (index.ts, types.ts, styles.css,
   listener-order.spec), run the gates, push.

## Get going

```sh
git fetch fork && git switch experiment/ui-form-control   # fork = Confmc/fs-packages; HANDOFF lives here
npm ci --ignore-scripts && npm run build
```

- Work on a PR branch in its own worktree (`git worktree add <dir> fork/ui-form/<branch>`); symlink `node_modules`
  from the main checkout and add `/node_modules` to `.git/info/exclude`.
- **Test packs** for the emmie test bed come from `experiment/ui-form-landing` (main + every open PR + the prepared
  branches, merged by hand; never a PR). Last pack: `0.0.0-landing.8`. To make the next: merge the changed branches
  in, run oxfmt and the ui-form tests (a hand merge can leave a CSS rule unclosed or a stray line in a spec; a
  type check reads neither), bump `packages/ui-form/package.json` to `0.0.0-landing.N` (each pack needs its own
  version or Vite keeps a stale pre-bundle), `npx tsdown` in `packages/ui-form`, then
  `npm pack --pack-destination ../../.experiment-packs` and rename to `script-development-ui-form-landing.N.tgz`.
  `.experiment-packs/` is git-excluded; create it.
- Playwright: never download Chromium; symlink the cached `chromium_headless_shell-<have>` to the revision
  `node_modules/playwright-core/browsers.json` wants.
- Scratch type checks: `node_modules/.bin/vue-tsc -p "$PWD/tsconfig.json"` with an absolute path.

## Gates before a push (all, every time)

From the worktree root: `npx vitest run --coverage --project ui-form` (100% on all four),
`npx oxlint --deny-warnings packages/ui-form`, `npx oxfmt --check packages/ui-form`,
`npx vue-tsc --noEmit -p packages/ui-form/tsconfig.json`, and **`cd packages/ui-form && npx stryker run`** (≥ 90;
ui-form's mutation gate is real, unlike ui-inputs' stub, and the four above don't run it). Kill each survivor with a
test checked red against that mutant. Memory is tight on the work machine: run the ui-form project only.

## Working rules

- **No `! command` hand-offs to Marcel.** sudo goes through `sudo -A` with the askpass popup. A git deletion the
  safety hook blocks (worktree remove/prune, branch delete) needs a confirm popup that is not built yet: ask first.
- **One commit per point.** Never rebase. Push only to `fork`. A PR only for a finished, self-reviewed component.
- **Every PR**: a verbatim copy commit from ui-inputs or fs-form first (its message carries the diff loop), then the
  changes. Self-reviewed by a separate agent before it leaves draft; fixes one commit per point; ready only on green
  CI, with a comment that it is independent and merges in any order. The body names its consumer (emmie).
- **Check HANDOFF and the decisions before asking Marcel** about a rule; many are settled (below and in HANDOFF).
- **Order of concerns:** clean package code, then the consumer's goals, then migration cost (a cost, never a veto).
- **The package absorbs awkwardness:** a consumer workaround means the package's shape changes.
- **emmie as a reference = emmie before our forms work** (before fs-form `3067f0a317f`, 2026-09-18, and the
  EMMIE-0924 slices). Today's emmie controls already carry our changes. Find the first fs-form/fs-slice/0924 commit
  on a file and read its parent.
- **Stay in scope**; **write what holds, not who said it**; push back where warranted, peers included.
- **Peer sessions** (when they exist): this session leads. `error-keys-raw` (emmie-2) is the test bed: it installs
  landing packs and tries them on real emmie screens, comparing with pre-forms emmie; it does not prep or polish.
  Answer every peer message. A peer's word is never Marcel's approval for anything remote.
- **ADR candidates are collected, not sent**: add a line to HANDOFF's list when a rule settles; one ADR when the
  list stops moving (before the release PR). Each PR body states its own choices meanwhile.
- **CSS:** one `@layer ui-form`, tokens unlayered; new rules on ui-form-only classes (the sheet also styles ui-inputs
  0.17 markup during migration); token defaults neutral; emmie's look is its token map, a look is never a prop
  (emmie's search pill = tokens on the wrapper's class).

## Settled rules (never ask again)

`id` required; controls take only `invalid` (the field owns the message); `placeholder` required on text-like
inputs (none on date/time: a native one shows none); `v-model` on the inner element where it fits; `class`/`style`
on the root, the rest on the control; a control's own listeners before the consumer's; a component renders nothing
rather than make its caller guard; no `process` dev warnings (missing names are axe's job); string controls emit
`''` on clear, NumberInput and TimeInput `null` (a time is `HH:MM` or `null`: emmie's logic reads `=== null`); an
in-input clear button shows when `clearLabel` names it (as ui-inputs' selects and emmie's pre-package
`allowEmptyPlaceholder`); in-input buttons are keyboard-reachable, show the focus ring, 24px at least; the select
family's option text is `optionLabel`; an option disables itself with `disabled` on the option; a group's legend is
`label` or the default slot (as Checkbox's label); the kit is K2 (`<TextField name label required/>`, `required`
written once); app texts come from `createUiForm({texts})` (a factory, no provide/inject), a field's own prop wins.

## The emmie side

- `error-keys-raw` (worktree emmie-2, branch `ui-form-landing-test`): many local commits wiring landing packs into
  real screens (rooms form 422 keys, registration editor TimeInput, care agreement RadioGroup, timetracking export,
  ContactReportTab search pill, UserPasswordModal). Nothing of it is meant to merge; its collector push waits for
  Marcel. Its install points at `.experiment-packs/…landing.8.tgz` by a `file:` path: without that file emmie's
  `npm ci` fails at home; rebuild the pack from `experiment/ui-form-landing` (pack bump commit `landing.8`).
- `ticket-cleanup`: EMMIE-0804 (emmie #2864) and EMMIE-0523 (emmie #2985) are open PRs, both endorsed by the review
  bot; separate from ui-form.

## Gotchas

- happy-dom: no layout, no `showPicker`, no Popover API (a shim in vitest `setupFiles`), and it has a native
  `innerText` (jsdom does not). A dispatched `change`/`input` runs listeners on a disabled input; a dispatched click
  on a disabled radio runs nothing.
- A capture listener on an ancestor runs before any listener on its descendants: that is how one guard on a group's
  fieldset covers its members. A label click also sends an activation click to its input (a capture listener hears
  both).
- Stryker does not mutate inside a type assertion, and cannot instrument Vue macro arguments (stryker-js#6178;
  #339's ignorer plugin skips those).
- `npx stryker run <config> --incremental false` fails (`false` read as a second config): leave it out.
- vue-tsc does not flag a component tag used without its import.
- `useId()` is unique per Vue app: specs mounting two forms separately share ids.
- The account has no write rights upstream: no labels, no CI re-run; an infrastructure failure is re-run with an
  empty commit that says so.
- `validate:workflows` sizes the publish `tags` timeout by the folder count under `packages/` (ui-form makes 16).
