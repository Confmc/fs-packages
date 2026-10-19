# @script-development/ui-form

## Unreleased

First release of `@script-development/ui-form`: `@script-development/fs-form` and `@script-development/ui-inputs` as one package. Both stay published and unchanged, so a consumer can run old and new side by side and migrate form by form. The version, the date and the final wording are set when the package is cut.

### Added

- **One package for form state and form controls.** Every ui-inputs control, `FormField` and the form composables, under one name and one stylesheet (`@script-development/ui-form/style.css`).
- **`field(name)`: one name per field.** Returns the field's whole wiring, `{id, invalid, describedby, error}`, so `<TextInput v-bind="field('email')" />` links the control to its label and message.
- **Form-bound `FormLabel` and `FormError`.** `useForm()` hands them out bound to that form: `<FormLabel name="email" label="E-mail" required />` points at the control `field('email')` wires, `<FormError name="email" />` renders that field's message. `FormError` is always present (empty without a message) so it can hold its place in a row layout.
- **A typed draft.** `useForm({draft})` with the component's own `Ref` types every name as a path into the draft (`learningGoals.0.title`), and `field(name)` also carries the value at that path and writes changes back, typed so a control only accepts a path of its own value type.
- **Client refusals next to the server's.** `refuse`, `setRefusals`, `withdraw` and `clearClient`, with `clientErrors` and `fieldErrors` (server and client, the client winning per field).
- **`handleSubmit` reports how it ended:** `'sent'`, `'refused'` or `'ignored'` (a call while one is in flight). Its `validate` option runs a client check first; a refusal skips the action.
- **`take(error)`** binds a 422 caught outside a submit and returns whether it was one.
- **Every control takes `error`.** The mark is `invalid ?? Boolean(error)`: an error marks the control, and `invalid: false` shows a message without the mark.
- **An in-input error icon on `TextInput`,** shown while it is marked.
- **Form-bound controls.** `useForm` hands out a bound version of each control (`TextField`, `TextareaField`, `NumberField`, `DateField`, `CheckboxField`, `SwitchField`, `RadioGroupField`, `CheckboxGroupField`, `SingleSelectField`, `ComboboxField`, `MultiSelectField`, `MultiComboboxField`, `GroupSelectField`, `GroupComboboxField`): `<TextField name="title" label="Title" />` draws the label, the control and the message, wired by `field(name)`. On a draft form `name` takes only a path holding that control's value type (a select's id type comes from its `options`). Every other prop passes through to the control and wins over the wiring. Each has a stable component name, so a spec finds it with `findAllComponents({name: 'TextField'})` or by the control inside.
- **`createUiForm({texts})`**: an app's texts (`placeholder`, `emptyText`, `optionsLabel`, `removeLabel`, `requiredLabel`) set once. It hands out `useForm`, whose bound controls carry them, and the bare text-carrying controls with them as defaults. The package's own `useForm` is the same with the package's texts.
- **New controls.** `TimeInput` (`HH:MM` or `null`, a clock glyph, a clear button unless `clearable` is false, `step` in minutes, the picker on a click), `SearchInput` (a `type="search"` box with a magnifier and a clear button), `PasswordInput` (a show/hide toggle with `aria-pressed`, a Caps Lock notice read with the field, `autocomplete`) and `InputGroup` (addon texts joined to a control, `prepend` / `append`). The kit adds `TimeField` and `PasswordField`; `TextField`, `NumberField`, `DateField` and `TimeField` take `prepend` / `append` and name the addons in `aria-describedby`.
- **`autofocus`** on `TextInput`, `NumberInput`, `TimeInput`, `SearchInput` and `PasswordInput`, done on mount so it also works in a dialog that opens later.
- **`Textarea` `autogrow` and `maxRows`**: the height follows the text, on mount and on every change, up to `maxRows` lines.
- **`MultiSelect` `placement`**: where the list opens (it still flips when there is no room).
- **`FormField` slots `label-after` and `aside`**: content inside the label after its text and required mark (a tooltip), and content at the far end of the label row (a switch). The bound controls hand both to their field. Without an aside the markup is as before.
- **`FormField` `#hint`**: what the field expects, under the control and above the message, named in `aria-describedby` after the message. The bound controls forward it.
- **A `FormField` bound by name from `useForm`**, for a control the kit has no bound version of: the form's ids, label, hint and message, and in its slot the field's wiring without the value. `FormField`'s slot scope now includes `error`, and `aria` (the same wiring as attributes, `FieldAria`) for a native element; the label takes the id `${id}-label` for its `aria-labelledby`.
- **`withdraw(path)` also drops the messages under it**: after rows of a list are added or removed, `withdraw('goals')` clears every `goals.*` message, so none sits on the wrong row.
- **`UseForm<T>` and `UseDraftForm<D>` are everything `useForm` returns**, the bound controls included: type a child's `form` prop with them.
- **`FieldBinding` takes `error`** (optional); `FieldProps`, the same with `error`, is gone: one type for a field's wiring.
- **`GroupSelect` and `GroupCombobox` `alphabeticalSort`**: sorts the options within each group by display string; the groups keep your order. Off by default, as on the rest of the select family.
- **More `createUiForm` texts:** `clearButtonLabel`, `showPasswordLabel`, `hidePasswordLabel`, `capsLockText`.
- **A bound control binds a path by what it reads and writes**: a field that is never empty fits a control that never empties it (`DateField` on `string`, a select without `clearLabel` on an id), so a draft typed as the honest model needs no cast.
- **`FormDraft<T>`**, an escape hatch for a model you cannot make honest yet: every value a control can clear is nullable; booleans, lists and nested objects keep their shape; `readonly` goes.

### Changed (from fs-form)

- **`useForm` takes no HTTP service.** `handleSubmit` takes the 422 its own action rejected with, so a form holds exactly its own requests' refusals; another form's request never lands in it. An action that catches its own 422 must rethrow it or pass it to `take`. `onlyWhileSubmitting` and `acceptWhen` are gone; nothing is registered on a service.
- **Scroll to the first error is on by default** and is a step of a refused submit, found by the form's own ids in document order. `scrollRoot` and `scrollTarget` are gone.
- **Ids are generated per form:** the name first, then a part from Vue's `useId()` (`firstName-v-3`); `idPrefix` sets a fixed prefix instead (`invoice-firstName`).
- **The `keyMapper` default stays identity.** The field keys of a 422 bind as the server sent them.

### Changed (from ui-inputs)

- **The select family's option-text prop is `optionLabel`,** so `label` is the field label everywhere, as on `RadioGroup` and `CheckboxGroup` already.
- **Every component rule sits in the `ui-form` cascade layer.** Consumer CSS outside a layer (utilities included) always overrides the package, whatever its specificity or load order. A consumer with an element base puts it in a layer declared first: `@layer base, ui-form;`. The `--ui-*` tokens stay unlayered.
- **New token defaults** for the control look (listed in the migration table below), and two new tokens: `--ui-control-border-color-hover` (the border on a resting control under the pointer) and `--ui-danger-ring-focus` (the ring an invalid control shows only while focused).
- **`TextInput`'s root is a `span.ui-input-wrap`**: `class` and `style` land on it, every other attribute on the `<input>`.
- **`MultiSelect` and `MultiCombobox` keep the model in the order the options are shown in** (alphabetical with `alphabeticalSort`, else your order), not the order picked. An id with no option yet stays at the end.
- **`NumberInput` hides the browser's spin buttons.**
- **New tokens:** `--ui-addon-bg`, `--ui-addon-text` (InputGroup), `--ui-warning-text` (PasswordInput's Caps Lock notice) `--ui-label-required-color` (the required mark, default `var(--ui-danger-text)`), and `--ui-hint-text` / `--ui-hint-size` (the hint).

### Migrating

ui-form runs next to fs-form and ui-inputs, so one form can move at a time. Load only ui-form's stylesheet once any form uses it: it styles ui-inputs' markup too.

| From                                                                                                         | To                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `import … from '@script-development/fs-form'` / `'@script-development/ui-inputs'`                            | `import … from '@script-development/ui-form'`                                                                      |
| `import '@script-development/ui-inputs/style.css'`                                                           | `import '@script-development/ui-form/style.css'`, and `@layer base, ui-form;` first if the app has an element base |
| `useForm(httpService, options)`                                                                              | `useForm(options)`                                                                                                 |
| `useValidationErrors(httpService, options)`                                                                  | `useValidationErrors(options)`, then `take(error)` with each caught error                                          |
| `useFormSubmit({clearErrors})`                                                                               | `useFormSubmit({clearErrors, take})`                                                                               |
| `onlyWhileSubmitting`, `acceptWhen`                                                                          | removed: a form takes only its own submit's 422                                                                    |
| an action that catches its own 422                                                                           | rethrow it, or `if (!form.take(error)) throw error;`                                                               |
| a 422 from a request outside a submit (a lookup)                                                             | `form.take(error)` in its catch                                                                                    |
| `await handleSubmit(action)` (`void`)                                                                        | `const outcome = await handleSubmit(action, {validate})`: `'sent'`, `'refused'` or `'ignored'`                     |
| `scrollToError` (default off), `scrollRoot`, `scrollTarget`                                                  | `scrollToError` (default on), by the form's own ids; the other two are removed                                     |
| `<FormLabel :html-for="id">`, `<FormError :id :error>`                                                       | form-bound `<FormLabel name="x" label="…" />`, `<FormError name="x" />` from `useForm`, or `FormField`             |
| `id`, `invalid`, `describedby` by hand on a control                                                          | `v-bind="field('x')"`                                                                                              |
| `label="name"` on `SingleSelect`, `Combobox`, `MultiSelect`, `MultiCombobox`, `GroupSelect`, `GroupCombobox` | `option-label="name"`                                                                                              |
| `:invalid="Boolean(error)"`                                                                                  | `:error="error"` (`invalid` stays as an override)                                                                  |
| `class` / `style` on `TextInput` styling the `<input>`                                                       | they land on its new `span.ui-input-wrap` root; every other attribute still reaches the `<input>`                  |
| code that relies on a multi-select's model being in pick order                                               | it is now in display order                                                                                         |

Token defaults that changed (set the old value in your theme to keep the old look):

| Token                             | ui-inputs                           | ui-form                              |
| --------------------------------- | ----------------------------------- | ------------------------------------ |
| `--ui-control-text`               | `#111827`                           | `#000000`                            |
| `--ui-control-font-size`          | `inherit`                           | `0.875rem`                           |
| `--ui-control-line-height`        | `inherit`                           | `1.5`                                |
| `--ui-control-pad-x`              | `0.75rem`                           | `0.875rem`                           |
| `--ui-control-pad-y`              | `0.55rem`                           | `0.5rem`                             |
| `--ui-control-radius`             | `8px`                               | `12px`                               |
| `--ui-control-border-color`       | `#d1d5db`                           | `#e1dace`                            |
| `--ui-control-border-color-focus` | `var(--ui-control-border-color)`    | `#de7356`                            |
| `--ui-control-bg-disabled`        | `#f3f4f6`                           | `#fbf8f2`                            |
| `--ui-focus-ring`                 | `0 0 0 3px rgba(37, 99, 235, 0.35)` | `0 0 0 4px rgba(222, 115, 86, 0.25)` |
| `--ui-danger-shadow`              | `0 0 0 3px rgba(220, 38, 38, 0.2)`  | `none`                               |

## Where it comes from

ui-form continues `@script-development/ui-inputs` 0.17.1 (the controls) and `@script-development/fs-form` 0.3.1 (the form state). Their history stays in their own changelogs: [ui-inputs](https://github.com/script-development/fs-packages/blob/659cec9b0a72/packages/ui-inputs/CHANGELOG.md) and [fs-form](https://github.com/script-development/fs-packages/blob/659cec9b0a72/packages/form/CHANGELOG.md).
