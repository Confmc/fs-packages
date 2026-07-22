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

| Component                 | Purpose                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FormField`               | Label + error + required-marker composition wrapper (error-as-prop)                                                                                        |
| `FormLabel` / `FormError` | The atoms `FormField` composes                                                                                                                             |
| `TextInput`               | Native `text` / `email` / `password` / `search` / `tel` / `url` input                                                                                      |
| `NumberInput`             | Native `number` input; owns the `NaN`→`null` empty-value guard                                                                                             |
| `DateInput`               | Native `date` input                                                                                                                                        |
| `Textarea`                | Native `textarea` with `rows`                                                                                                                              |
| `Checkbox`                | Native checkbox, visually restyled; non-nullable `boolean` model, `indeterminate` as a visual prop                                                         |
| `CheckboxGroup`           | Fieldset/legend group of checkboxes — models an array of option ids in **options order**                                                                   |
| `Switch`                  | The checkbox chassis with `role="switch"` — an on/off toggle with a themeable track + thumb                                                                |
| `RadioGroup`              | Fieldset/legend radio group (`role="radiogroup"`) — models `T['id'] \| null`; **native** roving focus and arrow-key selection                              |
| `SingleSelect`            | Accessible button-triggered listbox over `@floating-ui/vue`, generic over your option type                                                                 |
| `Combobox`                | Accessible **searchable/filtering** single-select — a text input that filters the listbox as you type; exposes an imperative `focus()` handle              |
| `MultiSelect`             | Accessible **multi-value** select — models an array of option ids; toggle-in-place listbox that stays open on commit, inline chip bar with per-chip remove |

```vue
<FormField id="fruit" label="Fruit" :error="errors.fruit" #default="{controlId, describedby, invalid}">
    <SingleSelect :id="controlId" v-model="fruit" :options="fruits" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

### The select family's shared extras

**Per-option content — the `#option` scoped slot.** All three selects render each option's
plain display string by default; the `option` slot replaces that content with your own
(colour swatches, icons, rich labels). The payload is `{option, index, selected, active}` —
typed against your option type `T`. Highlight and selection chrome (`.is-active`,
`aria-selected`) stay on the option row, **outside the slot**, so custom content never
re-creates them:

```vue
<SingleSelect id="label" v-model="labelId" :options="labels" label="name">
    <template #option="{option}">
        <span class="swatch" :style="{background: option.color}" /> {{ option.name }}
    </template>
</SingleSelect>
```

**Muted options.** `mutedOptions` (an array of option ids) renders the matching options
visually muted (`.is-muted`, themed by `--ui-option-text-muted`). Muted is **not** disabled:
muted options stay committable and stay in the keyboard path — use it for de-emphasis
("already assigned", "archived"), never for gating.

**The committing clear entry (`SingleSelect` / `Combobox`).** `clearLabel` renders a
committing entry **above** the options — choosing it commits `null` and closes, exactly like
choosing an option. It lives outside the option index space: its own keyboard slot between
"nothing highlighted" and the first option, its own `${id}-clear` id for
`aria-activedescendant`, and `aria-selected="true"` while the model is null. Pair it with
`emptyDisplayValue` — the string the trigger (or the Combobox input) renders as a **value**
when the model is null ("No sprint (backlog)") instead of the muted placeholder / blank
input. The entry is danger-toned by default (`--ui-clear-text`, chains to
`--ui-danger-text`).

```vue
<SingleSelect
    id="sprint"
    v-model="sprintId"
    :options="sprints"
    label="name"
    clear-label="No sprint"
    empty-display-value="No sprint (backlog)"
/>
```

### Combobox

`Combobox` shares `SingleSelect`'s generic contract (`:options`, `label`, `v-model`, `alphabeticalSort`,
`optionsLabel`, `emptyText`, `invalid`, `describedby`, `required`) but the trigger is a text `<input>`.
As the user types, the listbox filters to options whose label contains the query
(`labelOf(o).toLowerCase().includes(query)`), then the same optional alphabetical sort applies; an empty
query shows everything. Arrow keys and Enter navigate/commit the **filtered** list. On commit the input
shows the chosen label; on Escape, Tab, or a click outside the control the input snaps back to the
committed label so a half-typed non-match never lingers.

```vue
<FormField id="city" label="City" :error="errors.city" #default="{controlId, describedby, invalid}">
    <Combobox ref="cityBox" :id="controlId" v-model="city" :options="cities" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

**Imperative focus handle.** `Combobox` exposes `focus()` via `defineExpose`, so a parent can move DOM
focus onto the input programmatically (`cityBox.value?.focus()`) — the piece a focus-trap / command-palette
integration needs.

### MultiSelect

`MultiSelect` shares the family's generic contract (`:options`, `label`, `alphabeticalSort`,
`optionsLabel`, `emptyText`, `invalid`, `describedby`, `required`) but models **an array of option
ids** (`v-model="tagIds"`). Committing an option — Enter or click — **toggles its membership and the
listbox stays open**, so picking several values is one open/close cycle, not five. The committed
values render as an inline chip bar inside the control; every chip carries its own remove button
(`aria-label="${removeLabel} <label>"` — `removeLabel` defaults to `'Remove'` and is a prop so Dutch
territories can localise it, like `optionsLabel`), and **Backspace on the focused trigger pops the
last committed value**. There is no text input and no filtering — that stays `Combobox`'s job.

```vue
<FormField id="tags" label="Tags" :error="errors.tags" #default="{controlId, describedby, invalid}">
    <MultiSelect :id="controlId" v-model="tagIds" :options="tags" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

The listbox is marked `aria-multiselectable="true"`; `aria-selected` marks committed **membership**
(selected options remain listed, toggled in place), while the keyboard pointer stays conveyed by
`aria-activedescendant` — the same position-keyed `${id}-opt-${index}` option-id scheme as
`SingleSelect` (see below), so an unusual `option.id` can never break the IDREF linkage. An id whose
option has not loaded yet (async options) stays in the model but renders no chip until it resolves.

Chips theme through `--ui-chip-bg` / `--ui-chip-text` / `--ui-chip-radius` / `--ui-chip-pad`, each
defaulting to an existing resting token (`--ui-option-bg-active`, `--ui-control-text`,
`--ui-option-radius`) — neutral out of the box, remap to opt in.

### Checkbox family

`Checkbox`, `CheckboxGroup`, `Switch`, and `RadioGroup` all sit on a **native input chassis** —
a real `<input type="checkbox">` / `<input type="radio">` restyled with `appearance: none`, never
a div-with-role — so keyboard and assistive-tech semantics come from the platform.

**`Checkbox`** models a non-nullable `boolean` (`v-model="accepted"`) — a checkbox is never
"empty", unchecked IS `false`. The label renders inline via the `label` prop (the default slot
overrides it for rich content); the whole row is the hit target. `indeterminate` is a **prop**
mirrored onto the element's DOM property (drawn as a dash) — purely visual, it never touches the
model. Native `required` is never set; `aria-required` is the conveyance, like the whole family.
Undeclared attrs (`name`, `data-*`, …) fall through to the **input**, not the label root.

**`Switch`** is the same chassis with `role="switch"` on the native checkbox — the native checked
state maps to `aria-checked` (HTML-AAM), so the component never sets it by hand. Same
non-nullable `boolean` model; distinct track + thumb surface on `--ui-switch-*` vars.

**`CheckboxGroup`** renders a chrome-less `<fieldset>` with a `<legend>` (the `label` prop) and
one checkbox per option (`optionLabel` is the family's property-name-or-getter display resolver —
renamed from the selects' `label` because `label` is the legend here). It models
**`T['id'][]` kept in options order**, not click order; an id whose option has not arrived yet
(async options) is preserved at the tail. Error wiring is **one story**: `aria-describedby` (and
`aria-invalid`) live on the fieldset only — members mirror the invalid _styling_ but never repeat
the IDREF. Because ARIA forbids `aria-required` on `role=group`, the required state is conveyed
group-level through the legend: the visual `*` marker plus screen-reader-only text
(`requiredLabel`, default `'(required)'`, localisable).

**`RadioGroup`** is the same fieldset shape with native radios sharing one generated `name` (the
group id) — the **browser** provides the roving tabindex and arrow-key selection, the component
hand-rolls neither and only mirrors the model from `change`. It models `T['id'] | null` (`null` =
nothing selected, the SingleSelect shape). The fieldset carries `role="radiogroup"`, which —
unlike plain `group` — legitimately carries `aria-required`, so here the attribute is the
group-level conveyance.

```vue
<Checkbox id="terms" v-model="accepted" label="Accept the terms" />
<Switch id="notify" v-model="notifications" label="Email notifications" />
<CheckboxGroup id="toppings" v-model="toppingIds" :options="toppings" option-label="name" label="Toppings" />
<RadioGroup id="size" v-model="size" :options="sizes" option-label="name" label="Size" />
```

The family themes through `--ui-check-*` (box size, border — shorthand-valued like
`--ui-control-border-width` — checked fill, mark colour, radius, control↔label gap, group item
spacing) and `--ui-switch-*` (track width/height/radius, checked/unchecked track colours, thumb
size/colour). Every colour default derives from an existing resting token
(`--ui-control-bg`, `--ui-control-border-color`, `--ui-control-border-open`), so an existing
`--ui-*` token map themes the checkbox family with no new mappings — remap to opt in.

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

The listbox options carry the same discipline: `--ui-option-text-muted` (fires on `.is-muted`, defaults to the resting option text) and the MultiSelect membership pair `--ui-option-bg-selected` / `--ui-option-text-selected` (fire on `[aria-selected="true"]` in the MultiSelect popup, default `transparent` / resting text — the pointer highlight keeps winning its background). All no-ops until you opt in.

### Typography escape hatch

`--ui-control-font-size` (default `inherit`) sizes control text, and `--ui-control-line-height` (default `inherit`) completes the decomposition. The control's `font` is decomposed into longhands (`font-family`/`font-size`/`font-style`/`font-variant`/`font-weight`/`font-stretch`/`line-height`, all inheriting except the two var-keyed ones), so both read from their var rather than from a consumer utility class — which would otherwise lose the source-order tie against the package stylesheet. The defaults are byte-identical to the historical `font: inherit`. The listbox popup has its own hook: `--ui-menu-font-size` (default `inherit` — the popup sizes by inheritance from the component root).

### Menu width clamps

`--ui-menu-min-width` (default `100%` — of the positioned ancestor, i.e. at least the trigger) and `--ui-menu-max-width` (default `none`) clamp the listbox popup. A territory caps them without fighting specificity:

```css
:root {
    --ui-menu-min-width: max(100%, 240px);
    --ui-menu-max-width: calc(100vw - 16px);
}
```

### Touch targets

`--ui-control-min-height` and `--ui-option-min-height` (both default `auto` — the measured status quo) put a floor under the control and the listbox options. WCAG 2.5.5's 44px target is the **consumer's** call: assign them under your own coarse-pointer media query rather than expecting the package to decide for every territory:

```css
@media (hover: none) and (pointer: coarse) {
    :root {
        --ui-control-min-height: 2.75rem;
        --ui-option-min-height: 2.75rem;
    }
}
```

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
