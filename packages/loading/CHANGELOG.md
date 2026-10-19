# @script-development/fs-loading

## 0.1.7 — 2026-10-16

### Patch Changes

- **Accepts `@script-development/fs-http` 0.7.** The peer and dev ranges now include `^0.7.0`.
- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.
