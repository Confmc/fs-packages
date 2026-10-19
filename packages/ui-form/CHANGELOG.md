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
- **`GroupSelect` and `GroupCombobox` `alphabeticalSort`**: sorts the options within each group by display string; the groups keep your order. Off by default, as on the rest of the select family.
- **More `createUiForm` texts:** `clearButtonLabel`, `showPasswordLabel`, `hidePasswordLabel`, `capsLockText`.
- **`FormDraft<T>`**: a record's form state. Every value a control can clear is nullable; booleans, lists and nested objects keep their shape; `readonly` goes.

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
- **New tokens:** `--ui-addon-bg`, `--ui-addon-text` (InputGroup) and `--ui-warning-text` (PasswordInput's Caps Lock notice).

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

## History carried over from @script-development/ui-inputs

The entries below are ui-inputs' own, up to the version this package was cut from. fs-form's history stays in its own changelog.

## 0.17.1 — 2026-10-17

### Patch Changes

- **A checked `Checkbox`, a selected `RadioGroup` option and an on `Switch` are visible under forced colours (WR-1339).** In a high-contrast theme the checked box, the radio dot, the switch track and its thumb were painted in author colours the theme discards, so checked and unchecked rendered pixel-identical and a switch did not render at all (measured in Chromium's emulated forced-colors palette). `styles.css` now paints them in system colours there: `Highlight` / `HighlightText` for checked and indeterminate, a `CanvasText` track outline and thumb on the switch, `GrayText` for the disabled variants. An invalid control (`invalid` on any input, select, Checkbox, RadioGroup or Switch) also painted identical to a valid one there; it now carries a dashed `CanvasText` outline, which gives way to the focus ring while focused. No `--ui-*` token changes.
- **An option of a `RadioGroup` with no selection no longer paints as selected (WR-2299).** With `modelValue: null` every radio matches `:indeterminate`, and the checkbox's mixed-state fill was applied to it, so every option looked chosen. The indeterminate fill now applies to checkboxes only, with and without forced colours.

## 0.17.0 — 2026-10-03

### Added

- **Typeahead on `SingleSelect`, `MultiSelect` and `GroupSelect` (WR-1991).** A typed character moves the highlight to the next option starting with it, a quickly typed string matches by prefix, and the string resets after 500 ms or when the list closes, however it closes. The string keeps its first 64 characters. With nothing highlighted, SingleSelect and GroupSelect search from the chosen option, as a native `<select>` does; MultiSelect searches from the top. On a closed control a match opens the list on that option; nothing commits until Enter. Case is ignored one character at a time, so typed `ΟΣ` finds both `ΟΣ` and `ΟΣΑ` (a whole-word lowercase would read the first as `ος`), and `İ` finds and cycles the labels starting with `İ`. An emoji key such as `🍎` counts as one character. The comboboxes are unchanged: their typed characters are the query.

### Changed

- **Closing `SingleSelect` or `MultiSelect` with a click on the trigger now clears the highlight (WR-1991).** Before, the highlighted option survived a trigger close and reappeared, with its `aria-activedescendant`, when the list reopened. Every other way of closing already cleared it, and `GroupSelect` cleared it on a trigger close too.
- **`TextInput` and `Textarea` no longer emit while an IME is composing (WR-1990).** Like Vue's own `v-model` on a text field, the candidate `input` events of a Japanese/Chinese/Korean input method emit nothing and the composed value is emitted once on `compositionend`, or on a `change` that ends the composition without one, as Vue does. Plain typing still emits on every keystroke. A consumer that reacted to each candidate (one sibling territory sent a request per candidate) now sees one value.
- **`alphabeticalSort` now defaults to `false` (WR-1991, Commander ruling 2026-10-03).** `SingleSelect`, `MultiSelect`, `Combobox` and `MultiCombobox` render options in the order you pass them unless you set `alphabeticalSort`. Uses that relied on the old default, found on 2026-10-03 at each repo's checked-out HEAD (direct uses with no `alphabeticalSort` binding; every other fleet use already passes `:alphabetical-sort="false"`): one shared select wrapper in one sibling territory, and five components (two pages, a modal and two showcase components) in another. Add `alphabetical-sort` to keep the sorted order.
- **The select family's attrs now reach the combobox element (WR-1991).** On `SingleSelect`, `MultiSelect`, `GroupSelect`, `Combobox`, `MultiCombobox` and `GroupCombobox`, every attr except `class` and `style` now lands on the element carrying `role="combobox"` (the trigger button or the text input) instead of the root `<div>`, so `aria-label`/`aria-labelledby` finally name the control. `class` and `style` stay on the root. A `data-*` selector or a listener you bound on one of these components now finds the control rather than the wrapper: `@focus`/`@blur` start firing (they never bubbled to the wrapper), and an `@keydown` runs on the control before the component's own handler. Fleet census on 2026-10-03: of 33 direct uses in 8 repos, 4 pass a fall-through attr, all of them `class` (two wrapper components in one sibling territory, two uses each), which stays put.

## 0.16.0 — 2026-10-03

### Minor Changes

- **Behaviour change: a disabled `Checkbox`, `Switch`, `CheckboxGroup` or `RadioGroup` now runs none of the `click`, `input` or `change` listeners you bind on it, in either phase (WR-0918).** Before, a dispatched event on a disabled control still ran a fall-through handler, and a dispatched click also flipped the native input while the model stayed put. A real pointer on an option's label text in a disabled group still reached a `@click` bound on the group. If your code relied on hearing those events from a disabled control, it no longer will. Enabled controls are unchanged, including the order in which your listeners and `update:modelValue` run. Props and emits are unchanged.

### Patch Changes

- **A declined or deferred change no longer leaves the native control flipped (WR-1922).** `Checkbox`, `Switch`, `CheckboxGroup` and `RadioGroup` now set the input back to the bound value once the host has rendered, so a host that asks first or awaits a save shows the model, not the browser's click. A change taken at once is unchanged. Wrappers that re-assert `checked` themselves (a sibling territory's `Switch`) can drop that code on this version.

## 0.15.0 — 2026-09-29

### Patch Changes

- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.
