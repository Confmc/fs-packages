# @script-development/ui-inputs

Headless, themeable Vue 3 form input components, styled entirely through `--ui-*` CSS custom properties.

Part of the Armory `ui-*` family. The components ship **no token vocabulary and no colour literal** — you map your design tokens onto the `--ui-*` contract once, and every component follows. Kendo-soft or brutalist, light or dark, from one component set.

## Install

```sh
npm install @script-development/ui-inputs
```

Peer dependency: `vue@^3.5`. Import the stylesheet once (e.g. in your entry):

```ts
import '@script-development/ui-inputs/style.css';
```

## Components

| Component                 | Purpose                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `FormField`               | Label + error + required-marker composition wrapper (error-as-prop)                |
| `FormLabel` / `FormError` | The atoms `FormField` composes                                                     |
| `TextInput`               | Native `text` / `email` / `password` / `search` / `tel` / `url` input              |
| `NumberInput`             | Native `number` input; owns the `NaN`→`null` empty-value guard                     |
| `DateInput`               | Native `date` input                                                                |
| `Textarea`                | Native `textarea` with `rows`                                                      |
| `SingleSelect`            | Accessible listbox/combobox over `@floating-ui/vue`, generic over your option type |

```vue
<FormField id="fruit" label="Fruit" :error="errors.fruit" #default="{controlId, describedby, invalid}">
    <SingleSelect :id="controlId" v-model="fruit" :options="fruits" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

## Theming

Every visual rule keys on a `--ui-*` custom property — colours **and** structure (`--ui-control-border-width`, `--ui-control-radius`, `--ui-control-shadow`, `--ui-label-transform`, …). Remap them under any selector to theme the whole set; the shipped defaults render out of the box. Dark/light is orthogonal — pair with `@script-development/fs-theme`'s `data-theme` switching.

## Nullable values

Every text-like input (`TextInput`, `DateInput`, `Textarea`) models `string | null`, and `NumberInput` models `number | null`. A `null` from a nullable backend column binds directly — the control renders empty, no `?? ''` at the call site. When the user clears the field, the string inputs emit `''` (the raw native value); a Laravel backend's `ConvertEmptyStringsToNull` middleware maps that back to `null` on submit. `NumberInput` is the one exception: an empty number input emits `null` (not `NaN`, not `''`), since a `number` model can never hold `''` honestly — so it round-trips to `null` without relying on the middleware.

## Errors are a prop, never a service

The components never import an error service. Resolve the message in your app and pass `error` (to `FormField`) or `invalid` + `describedby` (to the inputs). That keeps the package agnostic to how your territory produces validation errors.
