# @script-development/ui-inputs

## 0.16.0 — 2026-10-03

### Minor Changes

- **Behaviour change: a disabled `Checkbox`, `Switch`, `CheckboxGroup` or `RadioGroup` now runs none of the `click`, `input` or `change` listeners you bind on it, in either phase (WR-0918).** Before, a dispatched event on a disabled control still ran a fall-through handler, and a dispatched click also flipped the native input while the model stayed put. A real pointer on an option's label text in a disabled group still reached a `@click` bound on the group. If your code relied on hearing those events from a disabled control, it no longer will. Enabled controls are unchanged, including the order in which your listeners and `update:modelValue` run. Props and emits are unchanged.

### Patch Changes

- **A declined or deferred change no longer leaves the native control flipped (WR-1922).** `Checkbox`, `Switch`, `CheckboxGroup` and `RadioGroup` now set the input back to the bound value once the host has rendered, so a host that asks first or awaits a save shows the model, not the browser's click. A change taken at once is unchanged. Wrappers that re-assert `checked` themselves (lokalekeuze's `Switch`) can drop that code on this version.

## 0.15.0 — 2026-09-29

### Patch Changes

- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.
