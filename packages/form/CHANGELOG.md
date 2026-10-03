# @script-development/fs-form

## 0.3.0 — 2026-10-03

### Minor Changes

- **Field allow-list, refusal signal and an opt-in submit window (WR-1643).** All additive; nothing changes unless you pass the new options or read the new refs.
    - `fields` (on `useValidationErrors` and `useForm`) keeps only the listed fields in `errors`, matched by their `keyMapper` name. Omitted, every key binds as before.
    - `refused`, `unmapped` and `refusedUnnamed` are new readonly refs. `refused` is raised by the 422 middleware itself on every accepted 422, so it reaches a consumer whose action catches and classifies the 422 and never lets it reach `handleSubmit`. `unmapped` lists the mapped keys `errors` does not hold, each name once. `refusedUnnamed` is `refused` with an empty bag. `clearErrors` (and so every `handleSubmit`) resets all three.
    - `onlyWhileSubmitting` on `useForm` takes a 422 only while this form's `handleSubmit` is in flight, so a late refusal from an abandoned screen no longer lands in an idle form's bag. Off by default. It is a time window, not request identity: any 422 on the same `HttpService` during the submit still lands (WR-1992, DECISIONS D1).
    - `acceptWhen` on `useValidationErrors` is the predicate `onlyWhileSubmitting` is built on, for forms wired from the two primitives by hand.

### Patch Changes

- **Behaviour change: a field whose value is not a list with a string first entry is no longer bound.** Before, `{errors: {email: 'fout'}}` bound `email` to `'f'` (the first character), and `{errors: {email: []}}` bound it to `undefined`. Such a key is now left out of `errors` and listed in `unmapped`. Laravel always sends `string[]`, so a Laravel backend sees no difference.
- **Behaviour change: an `errors` container that is not a plain object is treated as no field map.** Before, an array bound its indexes as field names (`{errors: [['Required']]}` bound `'0'`). Now `errors` stays empty and nothing is unmapped, so such a 422 reads as `refusedUnnamed`.
- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.
