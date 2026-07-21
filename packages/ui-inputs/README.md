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

### State-variant hooks

The control has a background/text/border hook for each interactive state, so a strong focus or invalid treatment stays a one-line remap instead of a hand-written `:focus-visible` override block. Every hook **defaults to its resting counterpart**, so the contract is a no-op until you opt in:

| Var                               | Fires on         | Default                          |
| --------------------------------- | ---------------- | -------------------------------- |
| `--ui-control-bg-focus`           | `:focus-visible` | `var(--ui-control-bg)`           |
| `--ui-control-text-focus`         | `:focus-visible` | `var(--ui-control-text)`         |
| `--ui-control-border-color-focus` | `:focus-visible` | `var(--ui-control-border-color)` |
| `--ui-control-border-width-focus` | `:focus-visible` | `var(--ui-control-border-width)` |
| `--ui-control-bg-invalid`         | `.is-invalid`    | `var(--ui-control-bg)`           |
| `--ui-control-text-invalid`       | `.is-invalid`    | `var(--ui-control-text)`         |

The `.is-open` and `.is-invalid` state classes follow `:focus-visible` in source order, so they keep winning their border/background where they did before — the focus hooks only take effect on a plain focused control.

### Typography escape hatch

`--ui-control-font-size` (default `inherit`) sizes control text. The control's `font` is decomposed into longhands (`font-family`/`font-size`/`font-style`/`font-variant`/`font-weight`/`font-stretch`/`line-height`, all inheriting except size), so `font-size` reads from this var rather than from a consumer utility class — which would otherwise lose the source-order tie against the package stylesheet. The default `inherit` is byte-identical to the historical `font: inherit`.

## Nullable values

Every text-like input (`TextInput`, `DateInput`, `Textarea`) models `string | null`, and `NumberInput` models `number | null`. A `null` from a nullable backend column binds directly — the control renders empty, no `?? ''` at the call site. When the user clears the field, the string inputs emit `''` (the raw native value); a Laravel backend's `ConvertEmptyStringsToNull` middleware maps that back to `null` on submit. `NumberInput` is the one exception: an empty number input emits `null` (not `NaN`, not `''`), since a `number` model can never hold `''` honestly — so it round-trips to `null` without relying on the middleware.

## SingleSelect and assistive tech

The listbox keeps DOM focus on the trigger and conveys the keyboard-focused option with
`aria-activedescendant`, so arrow-key navigation is announced rather than silent. The trigger
carries `aria-controls` while open (the IDREF only resolves inside the listbox it owns), and each
option gets a stable `${id}-opt-${index}` keyed on its **position** in the rendered list, not on
`option.id`.

`aria-selected` marks the **committed** value — not the option under the keyboard pointer or the
mouse. Keyboard/hover focus is visual (`.is-active`) plus `aria-activedescendant`; selection only
moves on Enter or click. Because the IDREF is position-derived, a non-unique or
whitespace-containing `option.id` never breaks the `aria-activedescendant` linkage.

## Errors are a prop, never a service

The components never import an error service. Resolve the message in your app and pass `error` (to `FormField`) or `invalid` + `describedby` (to the inputs). That keeps the package agnostic to how your territory produces validation errors.
