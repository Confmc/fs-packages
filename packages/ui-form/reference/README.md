# ui-form: the API as it stands (2026-11-02)

A reference for reviewing emmie templates against the future `@script-development/ui-form`. Nothing here is
published. Most of it is in open PRs or prepared fork branches, so anything can still change in review: each
section says how settled it is.

- `controls-props.txt` holds every control's real `defineProps`/`defineModel`/slots, with JSDoc, pulled from the
  branch that holds its newest version. Read it for prop names and types. `extract-api.sh` regenerates it.
- Code: fork `Confmc/fs-packages` (remote `fork` in `~/github/script-development/fs-packages`). Read a file with
  `git -C ~/github/script-development/fs-packages show fork/<branch>:packages/ui-form/<path>`.
- Why it is shaped this way: ADR-0043 and its Amendment 1, https://adrs.script.nl/decisions/shared-vue-ui-input-components.html

## Controls (settled in review, or close)

| Control | Branch | Model | Notes |
|---|---|---|---|
| TextInput | main (merged) | `string \| null`, emits `''` on clear | `type`: text/email/tel/url only |
| FormLabel | main (merged) | — | `after` slot on `n-field-label-after` |
| FormError | main (merged) | — | takes the message as is; empty renders nothing |
| FormField | `n-form-field` (+ `n-field-label-after`, `n-field-hint`, `n-field-aside`) | — | owns label, message and ids; slot gives `field` (for a control) and `aria` (for a native element) |
| Checkbox, Switch | #332 | `boolean` | native input chassis |
| NumberInput | #335 | `number \| null`, emits `null` on clear | |
| DateInput | #336 | `YYYY-MM-DD \| null` | native date input; shows an ISO datetime's date |
| Textarea | #337 | `string \| null` | |
| InputGroup | #338 | — | `prepend`/`append` addons (€, units); replaces AdditiveInput |
| TimeInput | #341 | `HH:MM \| null`, emits `null` | clear button only with `clearLabel` |
| SearchInput | #342 | `string \| null` | clear button only with `clearLabel` |
| PasswordInput | #343 | `string \| null` | show/hide toggle, caps-lock notice |
| RadioGroup | #344 (+ `hold/344-boolean-id`) | `id \| null` | option ids may be boolean (Ja/Nee pairs) |
| CheckboxGroup | `n-checkbox-group` | `id[]` | |
| SingleSelect | #353 (draft) | `id \| null` | |
| MultiSelect | `n-multi-select` | `id[]` | chips in display order; model keeps the consumer's order |
| Combobox | `n-combobox` | `id \| null` | searchable single; reverts to the chosen label on dismiss |
| GroupSelect, GroupCombobox | `n-group-select`, `n-group-combobox` | `id \| null` | grouped options; arrows skip group headers |
| MultiCombobox | `n-multi-combobox` | `id[]` | |

Not built: Pressable, Disclosure (ui-inputs has them; they come over), any date picker (see below).

## Rules every control follows

- `id` is required. A control takes `invalid` and `describedby`, never a message: the field owns the message.
- Text-like inputs require `placeholder` (date/time show none).
- `v-model` binds the value. `class`/`style` land on the control's root; every other attribute on the inner
  control. An attributify `w-*` lands on the control; a select's whole width is `class="w-*"`.
- String controls emit `''` on clear (the backend's ConvertEmptyStringsToNull maps it to null); NumberInput and
  TimeInput emit `null`.
- A clear button shows only when the consumer names it with `clearLabel`. Leaving it out is how a value that must
  stay set says so (replaces `not-nullable`, `allowEmptyPlaceholder`).
- Options: any object with `id: string | number | boolean`; the shown text is `optionLabel` (a key, or a getter).
  `alphabeticalSort` is opt-in (the caller's order by default). An option disables itself with `disabled: true`
  on the option (groups honour it; selects ignore it). The legend/label of a group is its default slot over
  `label`.
- Selects take `placement`; a list that flips keeps its alignment (`bottom-start` → `top-start`).
- No default look. Every rule reads a `--ui-*` token, the consumer maps its tokens once (emmie:
  `ui-inputs-theme.css`), and every rule sits in `@layer ui-form`. A look tokens cannot express is a missing token
  the package should add; a component-scoped style block on a control in a consumer is a smell, not a fix.
- Escape on an open list only `preventDefault()`s. A consumer's window-level Escape listener must skip a
  `defaultPrevented` Escape.

## The form (fork branches only, NOT in review yet: the most likely to change)

```ts
const draft = ref<FormDraft<Contract>>(empty());            // FormDraft: every clearable value nullable
const form = useForm({draft});                              // or useForm<'email' | 'name'>() without a draft
await form.handleSubmit(() => save(draft.value), {validate: () => check(draft.value)});
```

- **`useForm(options)`** takes no HTTP service. It holds only the 422 its own `handleSubmit` action rejects with
  (axios shape: `response.status` 422, `data.errors`), or one handed to `form.take(error)`. A 422 that a store or
  composable catches itself never reaches the form: it must rethrow or `take()` it.
- **`handleSubmit(action, {validate})`** → `'sent' | 'refused' | 'cancelled' | 'ignored'`. In flight →
  `'ignored'`. `validate` runs first: a bag with a message refuses without running the action. The action
  resolving `false` → `'cancelled'`. Any other rejection is rethrown. Messages stay until the next `'sent'`.
- **Field names** are the draft's dotted camelCase paths (`learningGoals.0.title`); 422 keys must arrive in that
  shape (emmie's error middleware does the casing: error-keys-raw phase 1). `useForm({fields})` limits the names.
- **`form.field(name)`** → `{id, invalid, describedby}` plus, with a draft, `modelValue`/`onUpdate:modelValue` at
  that path. `v-bind="form.field('email')"` wires ANY control that takes those props, the package's or emmie's
  own (this is how emmie's DatePickerField binds). Call it in the template, not once in setup.
- **`form.FormLabel`** `<form.FormLabel name label required/>`, **`form.FormError`** `<form.FormError name/>`
  (always rendered, so it can hold its place in a row).
- **Client refusals:** `refuse(name, message)`, `setRefusals(bag)` (replaces), `withdraw(...names)` (a path drops
  its subtree, for rows that moved), `clientErrors`, `fieldErrors` (what fields show: server's with the client's
  on top), `clearErrors()` (both).
- **After a refused submit** the form scrolls to its first refused field by its own ids (`scrollToError`, on by
  default). Ids are per form (`useId()`), or `idPrefix`.
- **The kit (slice 5, being built):** `<form.TextField name="email" label="E-mail" placeholder="…" required/>`
  (a FormField around the control, wired by name, typed so the name must be a draft path of the right type) and
  `<form.FormField name label v-slot="{field}">` for any other control. The other bound controls
  (`form.NumberField`, `form.SingleSelectField`, …) and `createUiForm({texts})` (app-wide default texts such as a
  select's placeholder and empty text) come in a later slice.

## Decided, not to reopen

- No package DatePicker. emmie keeps its pickers and wires them with `form.field()`; its fixes for the epic: no
  `kebabCase` on the id, no own `label` inside a FormField, drop the dead `error` prop, `not-nullable` → no
  `clearLabel`.
- No BooleanRadioGroup: a RadioGroup over `{id: true}`/`{id: false}`.
- A control enters the package because a consumer needs it; a domain widget stays the consumer's.
