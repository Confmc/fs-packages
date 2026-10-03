# @script-development/ui-inputs

## 0.17.0 — 2026-10-03

### Added

- **Typeahead on `SingleSelect`, `MultiSelect` and `GroupSelect` (WR-1991).** A typed character moves the highlight to the next option starting with it, a quickly typed string matches by prefix, and the string resets after 500 ms. On a closed control a match opens the list on that option; nothing commits until Enter. The comboboxes are unchanged: their typed characters are the query.

### Changed

- **The select family's attrs now reach the combobox element (WR-1991).** On `SingleSelect`, `MultiSelect`, `GroupSelect`, `Combobox`, `MultiCombobox` and `GroupCombobox`, every attr except `class` and `style` now lands on the element carrying `role="combobox"` (the trigger button or the text input) instead of the root `<div>`, so `aria-label`/`aria-labelledby` finally name the control. `class` and `style` stay on the root. A `data-*` selector or a listener you bound on one of these components now finds the control rather than the wrapper: `@focus`/`@blur` start firing (they never bubbled to the wrapper), and an `@keydown` runs on the control before the component's own handler. Fleet census at release: of 33 direct uses in 8 repos, 4 pass a fall-through attr, all of them `class` (ublgenie `editorial/Select.vue` ×2, `editorial/Multiselect.vue` ×2), which stays put.

## 0.15.0 — 2026-09-29

### Patch Changes

- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.
