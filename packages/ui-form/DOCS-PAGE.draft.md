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
headless, themeable Vue 3 controls it wires. It brings [fs-form](/packages/form) and
[ui-inputs](/packages/ui-inputs) together; both stay published, so a consumer can run old and new
side by side and migrate one form at a time.

```bash
npm install @script-development/ui-form
```

**Peer dependency:** `vue ^3.5.43`

Import the stylesheet once (e.g. in your app entry):

```typescript
import '@script-development/ui-form/style.css';
```

::: warning Not yet released
This page is a scaffold for the first release. Sections marked TODO wait for the last design
decision (the form-bound controls `useForm` hands out, and their default texts).
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

TODO (kit decision): the form-bound controls, e.g. `<TextField name="title" label="Title" />`.

## useForm

TODO: options (`draft`, `keyMapper`, `fields`, `scrollToError`, `idPrefix`) and everything it returns.

## Submitting

TODO: `handleSubmit(action, {validate})` and its outcome (`'sent'`, `'refused'`, `'ignored'`), `take(error)`
for a 422 caught outside a submit, and the client refusals (`refuse`, `setRefusals`, `withdraw`,
`clearClient`).

## Controls

TODO: the controls, their `error` / `invalid` contract, and `optionLabel` on the select family.

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

TODO: the token additions and changed defaults.

## Migrating from fs-form and ui-inputs

TODO: the migration table.
