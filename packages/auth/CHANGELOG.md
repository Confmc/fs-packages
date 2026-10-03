# @script-development/fs-auth

## 0.3.0 — 2026-10-03

### Minor Changes

- **Breaking (behaviour):** `state` and `user` are one snapshot, written in one assignment. Consumer code that runs synchronously inside the store's own writes (`watch(…, {flush: 'sync'})`, `parseUser`, `onSessionEnd` listeners) can no longer see or act on a half-written session. See `DECISIONS.md` D24 (WR-1610). Observable differences:
    1. **Sync watchers fire once per transition, not twice.** A `watch([state, user], …, {flush: 'sync'})` drops from 2 invocations to 1 on login, on every sign-out from a session that has a user, and on authentication from `loading` or `signed_out`.
    2. **No observer ever sees a torn pair.** A `state` watcher on sign-out no longer sees the previous user. A `user` watcher on sign-in no longer sees `loading` or `signed_out`.
    3. **A consumer acting from a `user` watcher acts on the decided state.** There, `handleSessionExpired()` now ends the session (it was silently ignored), and `setUser()` now succeeds (it threw `TypeError`).
    4. **`loadSession()` answers what it wrote when a watcher on `user` ends the session or starts a newer read inside the write.** It now answers `{state: 'authenticated', …}`, where it answered `undefined`. The machine and the events are unchanged.
    5. **`login()` answers `authenticated` when its confirm decided `authenticated`,** even if a consumer's sync effect then signed out or started a logout. It answered `unconfirmed` with the confirm's 200.
    6. **`store.state` and `store.user` are `computed` refs instead of `readonly(ref)`.** Reads, reactivity and compile-time write refusal are unchanged, and a runtime write still does nothing beyond a dev warning. `user.value` is still a readonly proxy, but it is no longer also `reactive`: `isReactive(store.user.value)` goes from `true` to `false`.

## 0.2.0

### Minor Changes

- **Breaking:** `loadSession()` returns `SessionRead | undefined` instead of `void`. It answers the state THIS read wrote — captured where the write happens, never `state.value` after the await — together with the `me` answer's `status` and `body`. `undefined` means a newer read overtook this one: it wrote nothing, so it has nothing to report. A consumer assigning the call somewhere typed `void` stops compiling. See `DECISIONS.md` D23.
- **Breaking:** `LoginOutcome` gains a fourth arm, `{kind: 'unconfirmed', status, body}`. A login POST the server **accepted** whose confirming `me` did not establish a session is no longer reported as `refused` — the credentials are not what went wrong, and a consumer must not be able to reach for the credential-refusal sentence. `refused` now means the POST itself was refused or never answered, and its `status` is always the POST's; `unconfirmed` carries the `me` answer's, with `state.value` distinguishing `outage` from `signed_out`. An exhaustive `switch` on `kind` stops compiling, which is the point. See `DECISIONS.md` D22.
- No new session state: the machine stays at four. A consumer derives `rate_limited`, `network` or `blocked` from what these two shapes carry — documented as the consumer's classification, not the package's.

## 0.1.1

### Patch Changes

- First version published through the CI lane (OIDC Trusted Publishing, provenance attestation). No source change: `0.1.0` was bootstrapped out-of-band with a token because Trusted Publishing cannot create a package name, so it carries no provenance. This release is the positive control that the Trusted Publisher grant works.

## 0.1.0

### Minor Changes

- 248b5a2: Add fs-auth package (ADR-0050) — Sanctum SPA-cookie session store, safe-redirect guard and auth registrars for fs-http + fs-router. Hand-published 2026-09-17 with a temporary token (bootstrap, no provenance).
