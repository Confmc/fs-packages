# cached-adapter-store — decisions

Why this package is shaped the way it is. Every entry names a cost it accepts or
a limitation it lives with, so the argument sits here rather than in a comment
nobody dates.

## D1 — A header-triggered refresh that fails is swallowed at the wrapper

_2026-10-17, #303. Crit finding on head `d8cfa29` ("A failed header-triggered
refresh leaves stale cached data without a failure signal"); follow-up row
WR-2325._

When a response stamps a cache hash that differs from the stored one,
`handleObservedHash` starts one background `retrieveAll()` on the inner store
and discards its rejection. A failed refresh leaves the previous collection in
state and does not persist the new hash, so the next response that still
carries a mismatched hash tries again.

**Why this is accepted.**

- **The response middleware must stay fail-soft.** The refresh is started from
  inside fs-http's response middleware. A rejection that escaped would surface
  as an unhandled rejection on a request that itself succeeded.
- **The failure is not invisible.** The failed GET goes through the same
  `HttpService` as every other request, so its response-error middleware sees
  it. On the cold-start path the same failure surfaces through `prime()`.
- **Nothing wrong is persisted.** The new hash is written only after a
  successful fetch, so the store never claims to hold data it does not have.

**What it costs.** The wrapper itself carries no "refresh failed" state, so a
consumer that wants to tell the user the data may be stale has to read it from
its HTTP error middleware. WR-2325 tracks a wrapper-level signal for that case.
