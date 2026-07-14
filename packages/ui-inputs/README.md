# @script-development/ui-inputs

Headless, themeable Vue 3 form input components, styled entirely through `--fs-*` CSS custom properties.

Part of the Armory `ui-*` family. The components ship **no token vocabulary and no colour literal** — you map your design tokens onto the `--fs-*` contract once, and every component follows. Kendo-soft or brutalist, light or dark, from one component set.

## Install

```sh
npm install @script-development/ui-inputs
```

Peer dependency: `vue@^3.5`. Import the stylesheet once (e.g. in your entry):

```ts
import '@script-development/ui-inputs/style.css';
```

## Components

| Component             | Purpose                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| `FsField`             | Label + error + required-marker composition wrapper (error-as-prop)                |
| `FsLabel` / `FsError` | The atoms `FsField` composes                                                       |
| `FsTextInput`         | Native `text` / `email` / `password` / `search` / `tel` / `url` input              |
| `FsSelect`            | Accessible listbox/combobox over `@floating-ui/vue`, generic over your option type |

```vue
<FsField label="Fruit" :error="errors.fruit" #default="{controlId, describedby, invalid}">
    <FsSelect :id="controlId" v-model="fruit" :options="fruits" label="name" :invalid="invalid" :describedby="describedby" />
</FsField>
```

## Theming

Every visual rule keys on a `--fs-*` custom property — colours **and** structure (`--fs-control-border-width`, `--fs-control-radius`, `--fs-control-shadow`, `--fs-label-transform`, …). Remap them under any selector to theme the whole set; the shipped defaults render out of the box. Dark/light is orthogonal — pair with `@script-development/fs-theme`'s `data-theme` switching.

## Errors are a prop, never a service

The components never import an error service. Resolve the message in your app and pass `error` (to `FsField`) or `invalid` + `describedby` (to the inputs). That keeps the package agnostic to how your territory produces validation errors.
