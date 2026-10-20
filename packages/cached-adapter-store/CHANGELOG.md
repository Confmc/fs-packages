# @script-development/fs-cached-adapter-store

## 0.2.8 — 2026-10-20

### Patch Changes

- **`dist` no longer ships source maps or source comments.** The tarball carried a `.map` beside every bundle, each holding the full source text in `sourcesContent`, and the bundled JavaScript kept the source comments. Both are gone: the JavaScript keeps only the comments a bundler or coverage tool reads (region markers, `@__PURE__` annotations, coverage-ignore directives, legal comments), and the type files keep their JSDoc. Runtime and types are unchanged. A debugger stepping into this package now shows the bundled JavaScript instead of the TypeScript source.

## 0.2.7 — 2026-10-16

### Patch Changes

- **Accepts `@script-development/fs-http` 0.7.** The peer and dev ranges now include `^0.7.0`.
- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.

## 0.2.6 — 2026-09-02

### Patch Changes

- **Peer-range widening for `@script-development/fs-adapter-store` `^0.4.0`.** `fs-adapter-store` published a minor (0.4.0, the additive `onPatch` broadcast handler). Pre-1.0 caret semantics require every `fs-adapter-store` consumer to widen its accepted range; no behavioural change. Mechanical cascade per fs-packages `CLAUDE.md` § Versioning Discipline.

## 0.2.4 — 2026-07-02

### Patch Changes

- **Peer-range widening for `@script-development/fs-http` `^0.5.0`.** `fs-http` published a minor (0.5.0, the additive `guarded()` middleware guard). Pre-1.0 caret semantics require every `fs-http` consumer to widen its accepted range; no behavioural change. Mechanical cascade per fs-packages `CLAUDE.md` § Versioning Discipline.

## 0.2.3 — 2026-06-29

### Patch Changes

- **Fix: all-numeric persisted cache hash coerced to Number under non-string storage default → spurious cold-load refetch.** The persisted-hash read used a non-string default (`storageService.get(hashStorageKey, null)`), which sends fs-storage down its `JSON.parse` branch — fs-storage only returns the raw stored string verbatim for a _string_ default. An all-numeric, no-leading-zero hash (exactly the `crc32b(uuid())` shape a consumer backend emits, e.g. `'55776784'`) round-tripped back as a Number, so `localHash` never strict-equaled the string server hash, the skip-when-equal guard never matched, and a redundant `retrieveAll()` fired on every affected cold page-load. The read now uses a string default (raw value returned verbatim) and normalizes the empty-string sentinel back to `null` so the `localHash !== null` cold-start guard is preserved. Consumers pick this up on the version bump; one consumer is live-exposed. Closes enforcement queue #130; mirrors [private-org]/[allied-app]#REDACTED.
