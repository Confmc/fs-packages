# ui-form experiment: package-side report

For: Gerard (lead). From: the fs-packages side of the fs-form + ui-inputs experiment.
Branch: `experiment/ui-form-control` on the fork (`Confmc/fs-packages`), last pack `0.1.0-control.12`.
The emmie side (how the 119 files that call `useForm` move, what broke, the migration list) is in emmie-2's report:
`docs/plans/fs-packages-experiment/REPORT.md` on emmie `experiment/fs-packages-control`. This one covers the package: its shape, how it is built, and what is
still missing.

Status: **prototype.** It is working and tested, but not release-polished. The README still shows the
removed `Field` API, Stryker was not run, and no CHANGELOG entry or version plan exists.

## Decided (2026-10-09)

- **No provide/inject** (Gerard). The shape stays as described here: `v-bind="field(name)"` on controls,
  `FieldLabel` / `Message` by name, and the form passed as a prop to child components that render fields.
- **emmie first** (Gerard). Make it better for emmie and don't worry much about other projects; staying
  framework-agnostic is nice to have, no longer required. emmie's features go straight into the controls,
  and emmie's look can be the default theme. (This moves away from ADR-0043's "headless, themeable for
  every territory" premise, one more reason that ADR needs amending.)
- **`error` with an `invalid` override** (Marcel). Controls take `error`; `invalid` defaults to
  `Boolean(error)`, and `invalid: false` shows the message without the red mark. Red stays the default.
- **One set of names goes, and the old names are preferred** (Marcel). Which old name maps to which
  component is still open.
- **No shims** (Marcel). The `fs-form` and `ui-inputs` re-export shims go; emmie renames its imports in one
  pass.
- **One kind of message element** (Marcel). `FieldMessage` is dropped, and every message element (including
  `FormField`'s) behaves like `Message`: always present, empty without a message. Consequence to check when
  building: `FormField`'s horizontal grid then always has its message row.
- **Default `keyMapper` = camelCase per dotted segment** (Marcel): `learning_goals.0.title` →
  `learningGoals.0.title`. This is emmie's casing, and it was identity before. The package implements the
  segment mapping itself rather than depending on fs-helpers.
- **`refusedUnnamed` means "no field the form holds"** (Marcel), not "nothing rendered".
- **Keep `'ignored'`** (Marcel): a submit while one is in flight is dropped, not queued.
- **Keep the one overload cast** (Marcel), no separate `useDraftForm()`.
- **Hyper-specific controls stay in emmie** (Marcel): `RichTextEditor` (tiptap) and file upload are not
  moved in. They should still be able to use the package's `FormField` / `field()` wiring.

## Next steps, in this order

Each step lands as its own commits, so the work can stop or be reverted cheaply after any of them.

1. **emmie adopts ui-form's controls**, control by control: emmie's look becomes the package default, and
   emmie's features go into the controls as they are (§5b).
2. **The field-controls move into the package**: the self-wrapping versions of the controls (§5a), so emmie's
   `shared/components/form/fields/` folder goes.
3. **Only then decide on the kit.** `useForm` would hand out form-bound versions of the package's own
   controls, like `FieldLabel` / `Message` today: `<TextField name="title" label="Titel" />`, typed per
   control because the package owns them.

No package code changes until step 1 starts.

---

## 1. The shape in one example

```vue
<script setup lang="ts">
const draft = ref<CarePlanDraft>(initial);
const {field, FieldLabel, Message, handleSubmit, refusedUnnamed} = useForm({draft, keyMapper});

const save = async () => {
    const outcome = await handleSubmit(() => carePlanService.update(draft.value), {validate: () => check(draft.value)});
    if (outcome === 'sent') close();
    else if (outcome === 'refused' && refusedUnnamed.value) toast('Opslaan geweigerd');
};
</script>

<template>
    <FieldLabel name="learningGoals.0.title" label="Titel" required />
    <TextInput v-bind="field('learningGoals.0.title')" />
    <Message name="learningGoals.0.title" />
</template>
```

Each field has one name, and the name ties together the label, the control's id and ARIA wiring, its
value and its message. There's no `v-model`, no wrapper and no slot props. `field('learningGoals.0.titel')` (a typo) is a type
error, and so is binding a `number` path to `TextInput`. vue-tsc checks the value against the control's
`modelValue`.

## 2. What changed against `main` (fs-form 0.x + ui-inputs 0.18)

### Packaging

- `@script-development/ui-form` = fs-form + ui-inputs in one package. `ui-inputs` and `fs-form` stay as
  deprecated re-export shims (no code of their own), so existing imports keep working.
- **No runtime dependency on fs-http.** fs-http is only a devDependency, because one end-to-end spec drives a real
  `createHttpService`.

### `useForm`

| main (fs-form)                                                                                                                | now                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useForm(httpService, options)`                                                                                               | `useForm(options?)`: **no service**                                                                                                                                                                                   |
| registered a 422 response-error middleware on the shared service; every form on that service took every 422 (the "bleed", D1) | `handleSubmit` takes the 422 **its own action rejected with**. `take(error): boolean` takes a 422 caught outside a submit (a lookup). Nothing is registered, so nothing needs unregistering.                          |
| `onlyWhileSubmitting` (a time window)                                                                                         | removed. Matching each error to its own request makes the window unnecessary. `FORM-DECISIONS.md` D1 is marked superseded.                                                                                            |
| `handleSubmit(action): Promise<void>`                                                                                         | `handleSubmit(action, {validate?}): Promise<'sent' \| 'refused' \| 'ignored'>`. `validate` returns a bag; a refusal skips the action. `'ignored'` = a call while one is already in flight.                            |
| `scrollToError` + `scrollRoot` + `scrollTarget` (watcher, CSS selector)                                                       | `scrollToError` (default **on**) is a step of a `'refused'` submit: it finds the first refused field by the form's **own ids**, in document order. `scrollRoot`/`scrollTarget` are removed, and typing never scrolls. |
| server errors only                                                                                                            | plus **client refusals**: `refuse`, `setRefusals` (replaces), `withdraw` (drops server message _and_ client refusal for those names), `clearClient`, `clientErrors`, `fieldErrors` (server + client, client wins)     |
| —                                                                                                                             | `field(name)`, `FieldLabel`, `Message` (below)                                                                                                                                                                        |
| —                                                                                                                             | `idPrefix` option (optional; default prefix comes from `useId()`)                                                                                                                                                     |
| —                                                                                                                             | `draft: Ref<D>` option: names become `Path<D>`, `field()` carries the typed value                                                                                                                                     |
| `refusedUnnamed` computed from the current bag                                                                                | decided **when the 422 is taken**, so dropping messages later never flips it                                                                                                                                          |

Messages stay until the next submit, as they always did. An earlier round cleared them on edit; Marcel
reverted that because the package should not guess. `withdraw` is the explicit tool for clearing them
sooner.

### Field wiring

- `field(name)` → `{id, invalid, describedby, error}`, plus `modelValue` / `onUpdate:modelValue` on a
  draft form.
    - **id** = `${prefix}-${name with non [A-Za-z0-9_-] → '-'}`: `v-3-learningGoals-0-title`, deterministic per render.
    - **describedby** = `${id}-error`, set only while there's a message.
- `FieldLabel` (`name`, `label`, `required`, default slot after the required mark) renders `FormLabel`
  pointing at that id.
    - It's called `FieldLabel`, not `Label`, because emmie's a11y lint treats any `<Label>` tag as a native label.
- `Message` (`name`): an always-rendered `<p class="ui-error" role="alert">`, filled when there's a
  message. It holds a column in a row layout without a wrapper.
- `FieldMessage`: the same as `Message`, but takes the `field()` object. It's unused and should be folded into `Message`
  (agreed, not yet done).
- `FormField` stays: label + control slot + message, and its slot still passes `{field}` for compound
  fields.

### Removed

`Field` / `createField` / `FieldComponent` (the slot-bound wrapper), `FormHttpService`, `loudlySwallowed`,
`acceptWhen`, `onlyWhileSubmitting`, `scrollRoot`, `scrollTarget`.

### Controls

- All 14 controls: `id` is optional (falls back to `useId()`), so a control works without a field.
- No other control changes: no `error` prop and no built-in label (see §5).

## 3. How it is built (conventions held)

- **No Vue internals.**
    - No `provide`/`inject`. The first experiment used it and dropped it, because it fell back silently to
      the nearest form and broke shallow-mount specs.
    - No vnode cloning. `FieldLabel` and `Message` are plain `defineComponent` closures over their form.
- **One cast in the whole form layer.**
    - `useForm` has two call shapes, plain names and draft paths with typed values. The repo's arrow-only lint
      rules out function overloads, so the overloads are an interface (`UseFormCall`) and the single
      implementation is cast to it.
    - The plain alternative is a separate `useDraftForm()`; that's the lead's call.
- **Types.**
    - `Path<D>` is depth-limited to 6, so recursive drafts stop.
    - `Date`, `File`, `Blob` and functions are leaves (`born.getTime` is not a path).
    - Nullable branches are walked with `NonNullable`.
    - `PathValue<D, P>` types `modelValue` and `onUpdate:modelValue`, so vue-tsc checks both directions.
      Example: a `firstName: string` draft rejects `TextInput`'s `string | null`, the same rule `v-model`
      already enforces.
- **Writes are explicit.**
    - `writePath` throws on a missing parent (`[ui-form] cannot write "a.0.b": "a.0" is undefined`). It never
      invents objects or arrays.
    - Messages are touched only by explicit calls (`withdraw`, `setRefusals`, a submit), never by a watch on the draft.
- **Side-effect free.** Module top levels pass `lint:pkg`'s side-effect gate; no top-level `Symbol()`.
- **Repo gates green at every pack:** typecheck, oxlint `--deny-warnings`, oxfmt, `lint:pkg` (publint +
  attw), 100% coverage.

## 4. What is tested

- **The ui-form unit suite:** 702 tests, 100% line/branch/function coverage.
    - `form.spec`: `take`, the submit outcome, `validate`, scroll order, scroll isolation between two forms,
      `refusedUnnamed`, ids, `FieldLabel`/`Message`.
    - `draft.spec`: path read/write, writes keep messages, `v-model` next to `field()`.
    - `validation-errors.spec`: parsing, `keyMapper`, `fields`, `__proto__`, malformed bodies.
- **End-to-end:**
    - a real fs-http service answering 422 with emmie's care-plan body (nested and indexed keys,
      snake → camel per segment);
    - two forms on one service, where only the sender sees its 422;
    - the address-lookup case through `take`.
- **Browser (real Chromium + axe):** 166 tests. The form-wired case covers both the bare layer (`FormLabel` +
  control + `FieldMessage`) and the `FormField` layer with zero violations.
- **Typing:** checked once with vue-tsc on a throwaway SFC (wrong path, wrong value type, `Message` with an
  unknown name, no `modelValue` without a draft). **Not committed.** A permanent type-test file is open work.
- **Not run:** Stryker (the package's mutation gate is a stub on `main`, WR-0897).
- **Flaky:** select-family specs failed three times under coverage this session, in code this experiment
  didn't touch. They passed on reruns, but are worth a look before release.

## 5. What it takes for ui-form's own controls to cover emmie

Today emmie uses **only** `FormField`, `FormLabel` and `FormError` from the package (128 imports). Every
control is emmie's own. If emmie adopts the package's controls, two things are needed.

### 5a. Field versions of the controls

emmie's templates want one element per field that draws its own label and message: today's `TextField` /
`SelectField` and the `label`-on-control experiment. The package's controls are bare: they accept
`id`/`invalid`/`describedby` and nothing else.

Proposal: every control accepts the whole `field()` object plus `label` / `required` / `orientation`.
When `label` is set, the control wraps itself in `FormField`. Concretely:

1. **Add `error?: string`** to all 14 controls; `invalid` defaults to `Boolean(error)` and stays as an
   override (`invalid: false` = message without red, decided). Today `v-bind="field(x)"` on a package
   control leaks `error="…"` as an HTML attribute on the `<input>`.
2. **`label`/`required`/`orientation` props** plus a self-wrap in `FormField`, shared through one internal piece
   so the 14 controls don't each repeat it.
    - The props: `label?`, `orientation?` (`required` exists). With `label`, the control renders
      `FormField` around itself, and without it nothing changes.
    - The select family already uses `select`'s `label` prop for the option-text key. It must become
      `optionLabel` (emmie made the same rename) so `label` always means the field label.
3. **Attribute split:** `class`/`style` go to the field wrapper, everything else to the native element. The
   select family already does this (`internal/split-attrs.ts`). Without it, layout classes land on the
   input instead of the field.
4. **No empty wrapper:** a control without `label` and without a message renders no `.ui-field`, so a bare
   search box costs nothing.

### 5b. Missing controls and features

Counts are from `frontend/apps` on emmie's `experiment/fs-packages-control`: **files** that use the
control, and **uses** (each `<Control` tag).

| emmie control                                                                 | files   | uses    | package today                   | gap                                                                                                  |
| ----------------------------------------------------------------------------- | ------- | ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `TextInput`                                                                   | 86      | 163     | `TextInput`                     | none (native attrs fall through to the `<input>`)                                                    |
| `CheckBoxInput`                                                               | 40      | 52      | `Checkbox`                      | none                                                                                                 |
| `SingleSelect`                                                                | 40      | 54      | `SingleSelect`                  | `label` → `optionLabel` rename                                                                       |
| `SwitchBoxInput`                                                              | 39      | 54      | `Switch`                        | none                                                                                                 |
| `DatePickerField` (+ Period 3, Range 4, Week 1, Registration 2, Attendance 1) | 33 + 11 | 45 + 11 | `DateInput` (native)            | **largest gap**: emmie's pickers are custom calendars; the package has none                          |
| `NumberInput`                                                                 | 24      | 36      | `NumberInput`                   | none                                                                                                 |
| `VerticallyGrowingTextarea`                                                   | 16      | 22      | `Textarea`                      | **auto-grow** (`maxRows`), `maxlength` passes through                                                |
| `MultiSelect`                                                                 | 15      | 23      | `MultiSelect` / `MultiCombobox` | rename only                                                                                          |
| `SearchInput`                                                                 | 15      | 16      | `TextInput type="search"`       | search icon + clear button                                                                           |
| `RichTextEditor` (tiptap)                                                     | 15      | 21      | none                            | keep in emmie; tiptap is too heavy for the package. It wires through `field()` or `FormField`'s slot |
| `TimeInput`                                                                   | 14      | 24      | none                            | **missing**: needs `notNullable` and a step                                                          |
| `AdditiveInput`                                                               | 12      | 17      | none                            | needs a look at what it does before deciding                                                         |
| `RadioButtonGroup`                                                            | 10      | 10      | `RadioGroup`                    | none                                                                                                 |
| `SearchableSelect`                                                            | 9       | 10      | `Combobox`                      | rename only                                                                                          |
| `FileDropArea` / `FileInput`                                                  | 7 + 1   | 7 + 1   | none                            | missing; probably stays in emmie (upload flow)                                                       |
| `PasswordInput`                                                               | 6       | 13      | `TextInput type="password"`     | show/hide toggle, `autocomplete`                                                                     |
| `BooleanRadioGroup`                                                           | 5       | 7       | `RadioGroup`                    | check that boolean option ids work, or add a thin wrapper                                            |
| `GroupSelect`                                                                 | 2       | 2       | `GroupSelect`                   | none                                                                                                 |
| `SwitchButtons` (segmented)                                                   | 2       | 2       | none                            | missing                                                                                              |
| `GroupMultiSelect` / `RangeInput`                                             | 1 / 1   | 1 / 1   | none                            | missing; low priority                                                                                |

**Theme:** with emmie first, emmie's look becomes the default values of the 96 `--ui-*` custom
properties, rather than a theme emmie maps onto them. Per emmie-2's report, an earlier experiment matched
`TextInput` to emmie with about ten tokens; its two raw CSS rules (a hover border, a danger ring only on
focus) simply become the default styles. Tokens stay as the override seam; they no longer have to anticipate
other territories.

**Order within the next steps**, by uses × effort:

- Step 1 (bare controls). emmie-first means porting emmie's behaviour, not designing a generic one:
    1. `error` (with the `invalid` override) on every control, and `label` → `optionLabel` on the select family;
    2. emmie's look as the default theme;
    3. emmie's features into the existing controls: auto-grow `Textarea` (`maxRows`), the searchable select's
       search box, password show/hide, search clear, the in-input error icon;
    4. emmie-only controls that become package controls as they are: `TimeInput` (with `notNullable`),
       `BooleanRadioGroup`, `SwitchButtons`, `AdditiveInput`, `GroupMultiSelect`;
    5. the date pickers last: emmie's own calendars move in as they are instead of a generic picker.
       They're the biggest piece (45 + 11 uses).
- `RichTextEditor` (tiptap) and the file upload stay in emmie (decided), wired through `field()` /
  `FormField`.
- Step 2 (field-controls): §5a.2–4 together (self-wrap in `FormField`, the `class`/`style` split, no empty
  wrapper), shared once across the controls.

## 6. Deliberately left open

- **Naming mapping.** One set goes and the old names are preferred (decided); which old name maps to which
  component is open. `idPrefix` stays as the fixed-id fallback.
- **Partial 422s.** Server keys that aren't draft paths can't be named on a draft form without a cast.
- **An action that catches its own 422 hides it from the form.**
    - It must rethrow or call `take(e)`. In emmie, the 2 such actions already rethrow.
    - The real migration cost is the **16 forms that never call `handleSubmit`**: they relied on the old
      service listener. emmie-2 proposes an emmie lint (`useForm` without `handleSubmit`/`take`) to catch
      a missed one.
- **`v-model` next to `field()` on a draft form** writes to both (Vue merges the two update handlers).
  It's harmless if unintended, but worth a sentence in the docs.
- **`useId()` is unique per app**, not per page. A second Vue app on the same page, or specs that mount two forms
  separately, can produce the same ids. Pass `idPrefix` there.
- **Release work not done:** README rewrite, CHANGELOG, Stryker, a committed type-test file, and the
  first publish of `ui-form` (a new npm package: hand bootstrap + Trusted Publisher before any CI publish).
