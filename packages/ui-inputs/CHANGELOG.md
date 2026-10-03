# @script-development/ui-inputs

## 0.17.0 — 2026-10-03

### Added

- **Typeahead on `SingleSelect`, `MultiSelect` and `GroupSelect` (WR-1991).** A typed character moves the highlight to the next option starting with it, a quickly typed string matches by prefix, and the string resets after 500 ms. On a closed control a match opens the list on that option; nothing commits until Enter. The comboboxes are unchanged: their typed characters are the query.

## 0.15.0 — 2026-09-29

### Patch Changes

- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.
