<!--
  DRAFT of docs/packages/ui-form.md. It lives here, not in docs/, because validate:docs rejects a docs
  page or listing for a package that is still "private": true. In the commit that removes "private",
  move this file to docs/packages/ui-form.md (dropping this comment) and add the three listings:
  - docs/.vitepress/config.mts, UI Components: {text: 'ui-form', link: '/packages/ui-form'}
  - docs/index.md, UI Components table: | [ui-form](/packages/ui-form) | Form state and form controls in one package: `useForm` with a field's whole wiring by name (`field()`, `FormLabel`, `FormError`), a typed draft, and the ui-inputs controls, themed via `--ui-*` variables |
  - docs/getting-started.md, UI Components install list: npm install @script-development/ui-form
-->

# ui-form

Form state and form controls in one package: `useForm` with a field's whole wiring by name, and the
Vue 3 controls it wires, themeable through `--ui-*` tokens and with a default look. It brings [fs-form](/packages/form) and
[ui-inputs](/packages/ui-inputs) together; both stay published, so a consumer can run old and new
side by side and migrate one page at a time.

```bash
npm install @script-development/ui-form
```

**Peer dependency:** `vue ^3.5.43`

Import the stylesheet once (e.g. in your app entry):

```typescript
import '@script-development/ui-form/style.css';
```

::: warning Not yet released
This page describes the first release, which is not on npm yet.
:::

## One name per field

A field is named once, by its path, and that name links the control, its label and its message:

```vue
<script setup lang="ts">
const draft = ref<CarePlanDraft>(initial);
const {field, FormLabel, FormError, handleSubmit} = useForm({draft});
</script>

<template>
    <FormLabel name="learningGoals.0.title" label="Title" required />
    <TextInput v-bind="field('learningGoals.0.title')" />
    <FormError name="learningGoals.0.title" />
</template>
```

`field(name)` is the field's whole wiring, `{id, invalid, describedby, error}`, and with a draft also the value at
that path and the write back into it, so the control needs no `v-model`. On a draft form every name is a path
into the draft, checked by vue-tsc.

### Form-bound controls

Most fields need no more than a label, a control and a message, so `useForm` hands out a bound version of each
value control that draws all three:

```vue
<script setup lang="ts">
const draft = ref<Contract>(initial);
const {TextField, NumberField, SingleSelectField, handleSubmit} = useForm({draft});
</script>

<template>
    <TextField name="name" label="Name" required />
    <NumberField name="hours" label="Hours" append="per week" />
    <SingleSelectField name="debtorId" label="Debtor" :options="debtors" option-label="name" />
</template>
```

On a draft form `name` takes only a path the control fits: it can read the value there, and the path's type holds
what the control writes. A `NumberField` refuses a string path, a `DateField` binds `string` as well as
`string | null`, and a select's id type comes from its `options`. `class` and `style` land on the field frame;
every other prop and attribute passes through to the control and wins over the wiring, so `:invalid="false"` at
the call site overrides the form's.

| Bound control                                                                  | Control                                                    | Notes                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| `TextField`, `NumberField`, `DateField`, `TimeField`                           | `TextInput`, `NumberInput`, `DateInput`, `TimeInput`       | Take `prepend` / `append` (an `InputGroup`)   |
| `TextareaField`, `PasswordField`                                               | `Textarea`, `PasswordInput`                                |                                               |
| `CheckboxField`, `SwitchField`                                                 | `Checkbox`, `Switch`                                       | `label` is the box's own label                |
| `RadioGroupField`, `CheckboxGroupField`                                        | `RadioGroup`, `CheckboxGroup`                              | `label` is required: it is the group's legend |
| `SingleSelectField`, `ComboboxField`, `MultiSelectField`, `MultiComboboxField` | `SingleSelect`, `Combobox`, `MultiSelect`, `MultiCombobox` |                                               |
| `GroupSelectField`, `GroupComboboxField`                                       | `GroupSelect`, `GroupCombobox`                             |                                               |

A bound control hands two slots to its field frame and every other slot to the control: `#label-after` renders
inside the label after its text and required mark (a tooltip), `#aside` at the far end of the label row
(a switch that belongs to the field).

Each bound control has a stable component name, so a spec finds it with `findAllComponents({name: 'TextField'})`
or by the control inside.

For a control the kit has no bound version of, `useForm` hands out a `FormField` bound by name:
`<FormField name="municipalityId" label="Municipality" v-slot="{field: wiring}">` draws the label, hint and message with
the form's ids, and its slot gets the wiring without the value, so the control keeps its own `v-model`; a native
element of your own (a `<div role="group">`) takes the slot's `aria` instead, the same wiring as attributes. The
frame's `#hint` slot renders under the control, above the message, and is read with the field. The slot prop
`field` shadows `useForm`'s `field()` inside the slot, so rename it (`{field: wiring}`) where the template also
calls `field('x')`. Bound to your own control, `v-bind="field('x')"` types the written value exactly: a control
that writes `string | null` does not fit a `string` path, so give it a handler or type the path `| null`.

### Your app's texts

`createUiForm({texts})` sets an app's texts once. It hands out `useForm`, whose bound controls carry them, and
the bare controls that take texts, with them as defaults; a prop at the call site still wins. Call it once in a
module of your app and import its `useForm` where a form is built.

```typescript
export const {useForm, SingleSelect, MultiSelect} = createUiForm({
    texts: {placeholder: 'Kies…', emptyText: 'Geen opties'},
});
```

| Text                                                     | Used by                                        |
| -------------------------------------------------------- | ---------------------------------------------- |
| `placeholder`, `emptyText`, `optionsLabel`               | the select family                              |
| `removeLabel`                                            | `MultiSelect`, `MultiCombobox` (chip remove)   |
| `requiredLabel`                                          | `CheckboxGroup` (required, for screen readers) |
| `clearButtonLabel`                                       | `TimeInput`, `SearchInput`                     |
| `showPasswordLabel`, `hidePasswordLabel`, `capsLockText` | `PasswordInput`                                |

## useForm

### `useForm(options?)`

| Option          | Type                      | Description                                                                                                                                                                              |
| --------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`         | `Ref<D>`                  | The component's own draft. Names become its paths, and `field(name)` carries and writes the value (default: none, names are free)                                                        |
| `keyMapper`     | `(key: string) => string` | Maps each field key of a 422 to the name in the bag (default: identity, the keys bind as the server sent them)                                                                           |
| `fields`        | `readonly T[]`            | Keep only these names in `errors`; the rest go to `unmapped` (default: every key)                                                                                                        |
| `scrollToError` | `boolean`                 | On a refused submit, scroll the first refused field into view, found by this form's own ids (default: `true`)                                                                            |
| `idPrefix`      | `string`                  | A fixed prefix for the ids `field()` derives (`invoice-firstName`), for an id something outside the form must know (default: the name plus a part from Vue's `useId()`, `firstName-v-3`) |

**Returns:**

| Property         | Type                                              | Description                                                                                               |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `field(name)`    | `(name) => FieldBinding`                          | The field's wiring `{id, invalid, describedby, error}`; with a draft also `modelValue` and its write-back |
| `FormLabel`      | component                                         | `<FormLabel name="email" label="E-mail" required />`                                                      |
| `FormError`      | component                                         | `<FormError name="email" />`, always rendered, empty without a message                                    |
| `FormField`      | component                                         | The field frame by name; its slot gets the wiring without the value                                       |
| `TextField` …    | components                                        | The bound controls (see [Form-bound controls](#form-bound-controls))                                      |
| `handleSubmit`   | `(action, {validate}?) => Promise<SubmitOutcome>` | See [Submitting](#submitting)                                                                             |
| `submitting`     | `Ref<boolean>`                                    | `true` while a submit is in flight                                                                        |
| `take(error)`    | `(error: unknown) => boolean`                     | Binds a caught 422 and returns `true`; anything else returns `false`                                      |
| `errors`         | `Ref<ValidationErrors<T>>`                        | The server's messages, one per field                                                                      |
| `fieldErrors`    | `ComputedRef<ValidationErrors<T>>`                | What the fields show: the server's messages with the client refusals on top                               |
| `clientErrors`   | `Readonly<Ref<ValidationErrors<T>>>`              | The refusals the form made itself                                                                         |
| `refuse`         | `(field, message) => void`                        | Refuse one field from the client                                                                          |
| `setRefusals`    | `(bag) => boolean`                                | Replace every client refusal at once; `true` when it refused anything                                     |
| `withdraw`       | `(...fields) => void`                             | Drop these fields' messages now, and every message under them (`withdraw('goals')` drops `goals.*`)       |
| `clearErrors`    | `() => void`                                      | Empty the bag and reset the refusal                                                                       |
| `refused`        | `Readonly<Ref<boolean>>`                          | A 422 was taken since the last clear                                                                      |
| `refusedUnnamed` | `Readonly<Ref<boolean>>`                          | The last 422 named no field this form holds                                                               |
| `unmapped`       | `Readonly<Ref<readonly string[]>>`                | Names of the last 422 that `errors` does not hold                                                         |

`useValidationErrors` and `useFormSubmit`, the two halves `useForm` combines, stay exported for a form that
composes them itself.

## Submitting

`handleSubmit(action, {validate})` guards against a double submit and ends in one of four outcomes:

| Outcome       | When                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------- |
| `'sent'`      | The action ran to the end                                                                 |
| `'refused'`   | The action rejected with a 422, or `validate` returned a message (the action did not run) |
| `'cancelled'` | The action resolved `false`: it sent nothing, such as a save the user declined            |
| `'ignored'`   | A submit of this form was already in flight; the action did not run                       |

It takes the 422 **its own action** rejected with, so a form holds exactly its own requests' refusals; another
form's request never lands in it, and the form needs no HTTP service. Any other rejection is thrown on. On
`'refused'` the first refused field scrolls into view unless `scrollToError` is off. Messages stay until the next
submit settles: a sent save clears them, a 422 replaces them, and a cancelled one leaves them standing, so a
question inside the save needs nothing else:

```typescript
const outcome = await handleSubmit(() => save(draft.value), {validate: () => checkDates(draft.value)});
if (outcome === 'sent') close();

const save = async () => {
    if (!(await confirmOverwrite())) return false; // 'cancelled': the messages stay
    await store.update(draft.value);
};

// going on after the save: return its answer on every path
await handleSubmit(async () => {
    const id = await createPlan(draft.value); // a new id, or false when the user declined
    if (id !== false) await router.push(`/plans/${id}`);
    return id;
});
```

Decide what to do next on the outcome, not on whether messages show: after a 422, a later failed request leaves
that message standing.

**A 422 outside a submit.** An action that catches its own 422 must rethrow it or pass it on, and so must a
request outside a submit, such as a lookup:

```typescript
try {
    await lookUp(postcode);
} catch (error) {
    if (!form.take(error)) throw error;
}
```

**Refusals from the client.** `validate` is the usual place for a check before sending: its bag becomes the
client refusals. Outside a submit, `refuse(field, message)` refuses one field, `setRefusals(bag)` replaces them all
(so a field fixed since the last check is no longer refused; `setRefusals({})` drops them all), and
`withdraw(...fields)` drops a field's messages. Where a field has both, the client's message shows.

**Lists.** A message is keyed by its path, index included (`goals.1.title`). When a row is removed or the list is
reordered, a refused row's message would sit on another row, so the code that changes the list withdraws what was
said about it: `withdraw('goals')` drops `goals` and every `goals.*` message. Appending needs nothing. The bound
controls write the draft by index, so sort the draft's list itself, not a copy of it.

**A form over loaded data.** The draft exists when `useForm` runs; there is no form over data still loading. Load
the record first, then render the form component with `v-if`, passing the record as a prop; the component builds
its draft from it and calls `useForm` in its `setup()`:

```vue
<!-- the page -->
<CarePlanForm v-if="plan" :plan="plan" :save="save" />
```

When create and edit share the form component, type its draft as the state both edit (the record without what
the server sets, such as its id). A loaded record is assignable to it, so neither page needs a cast.

## Controls

The controls are the ui-inputs set, plus `TimeInput`, `SearchInput`, `PasswordInput` and `InputGroup`; see the
[ui-inputs page](/packages/ui-inputs) for each control's own contract. Three things are new across all of them:

- **Every control takes `error`.** The mark is `invalid ?? Boolean(error)`: a message marks the control, and
  `:invalid="false"` shows a message without the mark. `field(name)` passes both.
- **The select family's option-text prop is `optionLabel`**, so `label` is the field label everywhere.
- **The value controls model a nullable value.** A cleared `TextInput`, `Textarea`, `DateInput`, `SearchInput`
  or `PasswordInput` emits `''`; a cleared `NumberInput` or `TimeInput` emits `null`. Type the draft as your model,
  honestly: a bound control takes a path when it can read the value there and the value's type holds what it
  writes, so a `string` field fits a `DateField` and an id that is never empty fits a select without
  `clearLabel`. `FormDraft<T>`, which makes every clearable value nullable, is an escape hatch for a model you
  cannot make honest yet.

| New control     | Model            | Props beyond the shared `id`, `disabled`, `required`, `error`, `invalid`, `describedby`                                                                  |
| --------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TimeInput`     | `string \| null` | `step` (minutes), `clearable` (default `true`), `clearButtonLabel`, `autofocus`                                                                          |
| `SearchInput`   | `string \| null` | `placeholder`, `clearable` (default `true`), `clearButtonLabel`, `autofocus`                                                                             |
| `PasswordInput` | `string \| null` | `placeholder`, `autocomplete` (`'current-password'` default, or `'new-password'`), `showPasswordLabel`, `hidePasswordLabel`, `capsLockText`, `autofocus` |
| `InputGroup`    | —                | `prepend`, `append`, `id` (the control's: the addons take `${id}-prepend` / `${id}-append`)                                                              |

Also new on existing controls: `autofocus` on `TextInput` and `NumberInput` (in script, so it works in a dialog
that opens later), `Textarea` `autogrow` with `maxRows`, `MultiSelect` `placement`, and `alphabeticalSort` on
`GroupSelect` / `GroupCombobox` (the options within each group; the groups keep your order).

## Styling

Every component rule sits in the `ui-form` cascade layer. CSS of yours outside a layer (utility classes
included) always overrides the package, whatever its specificity or load order. If your app has an
element base (`input { font-size: inherit }`, `p { margin-bottom: 1rem }`), put it in a layer declared
before the package's, at the very top of your first stylesheet:

```css
@layer base, ui-form;

@layer base {
    /* your element defaults */
}
```

The `--ui-*` custom properties stay outside the layer, as in [ui-inputs](/packages/ui-inputs#theming-the-ui-contract).

The defaults of the control look changed, and there are new tokens: `--ui-control-border-color-hover`,
`--ui-danger-ring-focus`, `--ui-addon-bg`, `--ui-addon-text`, `--ui-warning-text`, `--ui-label-required-color`,
`--ui-hint-text` and `--ui-hint-size`. To match your own field design, set the frame's tokens once on a container:
`--ui-label-size`, `--ui-label-weight`, `--ui-label-color`, `--ui-label-required-color` and `--ui-field-gap`. The
[CHANGELOG](https://github.com/script-development/fs-packages/blob/main/packages/ui-form/CHANGELOG.md#migrating)
lists every changed default with its old value, so a theme can keep the old look.

## Testing

- Build a real form in plain test code with a fixed `idPrefix` and pass it as the `form` prop:
  `useForm({draft: ref<Contract>({...}), idPrefix: 'test'})`. Without `idPrefix` its ids come from Vue's `useId()`,
  which needs a component's `setup()`.
- A form takes only its own action's 422, so a spec that checks a refusal makes the save itself reject with one.
- A shallow mount stubs the bound controls, `FormField`, `FormLabel`, `FormError` and `InputGroup`: un-stub what
  the spec reads. A stub shows the props it declares through `props()`; what it passes on, such as a select's
  `options`, is on `vm.$attrs`. A stubbed bound control is inert (the value and its write-back live inside it), so
  a spec that types into a field or reads its message un-stubs it. Stubs match by name, so while ui-inputs runs
  next to ui-form, `FormField: false` un-stubs both packages' frames.
- Find a field by the form's own ids, `#${form.field('goals.0.title').id}` (its message: that id plus `-error`),
  rather than rebuilding them.
- A child that takes the form as a prop has no submit: put a 422 in with `form.take(error)`.
- A control bound to the draft edits it in place and emits nothing: assert on the draft, not on `emitted()`.
- `.ui-field`, `.ui-hint` and `.ui-error` are stable to select on.

See the [README's testing notes](https://github.com/script-development/fs-packages/blob/main/packages/ui-form/README.md#forms-and-their-errors) for more.

## Migrating from fs-form and ui-inputs

ui-form runs next to fs-form and ui-inputs, so a consumer migrates one page at a time, together with every dialog
it opens. Not one form at a time: fs-form's middleware on the shared HTTP service fills every mounted fs-form form
on any 422, so a ui-form dialog's refusal would also light up an fs-form page under it. Load only ui-form's stylesheet, never both: it styles ui-inputs' markup too, and next to it an unlayered ui-inputs rule always beats ui-form's layered ones (a horizontal field's hint and message overlap). The
[CHANGELOG's migration table](https://github.com/script-development/fs-packages/blob/main/packages/ui-form/CHANGELOG.md#migrating)
maps every old call to its new one; the larger moves are:

- `useForm(httpService, options)` becomes `useForm(options)`; a form takes only its own submit's 422.
- `onlyWhileSubmitting`, `acceptWhen`, `scrollRoot` and `scrollTarget` are gone; `scrollToError` is on by default.
- `label="name"` on the select family becomes `option-label="name"`.
- Hand wiring (`id`, `invalid`, `describedby`) becomes `v-bind="field('x')"` or a bound control.
