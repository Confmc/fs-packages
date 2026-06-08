# @script-development/fs-cached-adapter-store

Higher-order factory wrapping `@script-development/fs-adapter-store` with a hash-bumping cache-check that suppresses redundant `retrieveAll` GETs at source.

The wrapper is a sibling to `fs-adapter-store`; it does not modify it. Adapter-store consumers who do not opt in are unaffected.

## Install

```bash
npm install @script-development/fs-cached-adapter-store
```

Peer dependencies: `@script-development/fs-adapter-store`, `@script-development/fs-http`, `@script-development/fs-storage`, `vue`.

## Usage

```ts
import {createCachedAdapterStoreModule} from '@script-development/fs-cached-adapter-store';

const lanesStore = createCachedAdapterStoreModule<LaneBase, Lane, NewLane>(
    {
        domainName: `projects/${projectId}/lanes`,
        adapter: makeLaneAdapterForProject(projectId),
        httpService,
        storageService,
        loadingService,
        broadcast: makeLaneBroadcastForProject(projectId),
    },
    {cacheKey: `projects/${projectId}/lanes`},
);

// Public surface:
lanesStore.getAll; // ComputedRef<Lane[]>
lanesStore.getById(id); // ComputedRef<Lane | undefined>
lanesStore.getOrFailById(id); // Promise<Lane>
lanesStore.generateNew(); // NewLane
await lanesStore.prime(); // bootstrap (idempotent)
```

The returned module is **intentionally narrower** than `createAdapterStoreModule`'s `StoreModuleForAdapter<T, E, N>`. It exposes `getAll`, `getById`, `getOrFailById`, `generateNew`, and a single bootstrap entry point `prime()`. The two retrieval methods that `createAdapterStoreModule` returns — `retrieveAll` and `retrieveById` — are **deliberately absent** from the public surface:

- **`retrieveAll` is gone** because every ad-hoc consumer-driven `retrieveAll()` call is a potential 429 — the response middleware that observes the cache-hash header is the sole steady-state trigger of the inner fetch. Consumers no longer get to decide "when do we fetch"; the wrapper owns it.
- **`retrieveById` is gone** because the hash-bumping protocol invalidates a collection wholesale. A store that lets you top up with single-item fetches breaks the invariant that `localHash` describes the contents of `state`. If you need per-id retrieval semantics, the cached wrapper is the wrong tool — use `createAdapterStoreModule` directly.

**Rule of thumb:** call `prime()` once at the consumer's preferred initialization point (app boot, route enter, root component setup) to guarantee the data is loaded even before the first response stamps a cache-hash header on this tab. Trust the middleware for everything else.

The returned type is `CachedStoreModuleForAdapter<T, E, N>`; it is **not** structurally assignable to `StoreModuleForAdapter<T, E, N>`. This is enforced at the type level — attempting that assignment is a compile-time error.

## Options

```ts
type CachedAdapterStoreOptions = {cacheKey: string};
```

Intentionally minimal for v1. There is no `staleAfterMs`, no `onMissingServerHash`, no `hashExtractor`, no `hashStorageKey`, no `legacyHeaderName`. If you find yourself wanting one of these, the protocol probably isn't right for your situation — open a discussion before adding a knob.

## Protocol

The wrapper listens for an `x-fs-cache-hashes` HTTP response header. The expected value shape is:

```
x-fs-cache-hashes: v1.<urlencoded JSON>
```

where the JSON is a flat `{cacheKey: hashString}` map. The wrapper:

1. Parses the header on every response that carries it.
2. On every response carrying the header, the middleware updates the in-memory `currentServerHash` for each matching cacheKey, AND triggers an internal `inner.retrieveAll()` if `localHash !== currentServerHash` (fire-and-forget; in-flight-deduped; skip-if-equal).
3. `prime()` covers the cold-start path where no header has yet been observed on this tab. It is idempotent: two rapid calls dedupe to a single inner fetch, and once a successful retrieve has completed with `localHash !== null`, subsequent `prime()` calls return immediately without invoking inner.
4. After every successful inner `retrieveAll()`, the current server hash is snapshotted into both the in-memory local hash and `storageService` — never before.

The strict `v1.` version prefix is non-negotiable. A header value not starting with `v1.` is treated as no-signal (no trigger, no state change). This is intentional: every response stamped with this header is contractually opting into the v1 wire format.

The wrapper does NOT expose `retrieveById`. The hash-bumping protocol is all-or-nothing — single-item retrieval would break the invariant that `localHash` describes the data currently in `state`. If you need per-id retrieval semantics, the cached wrapper is the wrong tool — use `createAdapterStoreModule` directly.

### Outbound subscribe header (ADR-0032 Option A)

As of v0.2.0 the wrapper also emits an outbound request header declaring the set of cache keys it caches locally, so an Option-A backend can authorize and stamp only the entitled subset:

```
x-fs-cache-hashes-subscribe: v1.<urlencoded JSON array>
```

- The payload is a flat **array** of cacheKey strings (e.g. `["lanes","labels"]`) — asymmetric to the response header's `{cacheKey: hash}` **object**. Same `v1.` version prefix.
- The subscription set is exactly the per-`HttpService` registry keys — every cached store constructed against the same `httpService` contributes its key (ADR-0032 D1). The keys are read **live** at request-fire time, so a store added later is reflected on subsequent requests.
- One request middleware is installed per `HttpService` (alongside the response middleware), not one per store.
- **Old-backend-safe and additive-by-default.** There is no opt-out flag. A backend that does not speak Option A simply ignores an unknown request header; the response-side parse is unchanged. So the wrapper release does not have to be sequenced with the backend.
- The multi-`HttpService` case (a consumer with separate central + tenant services) is an accepted limitation — a request on one service carries only that service's keys (ADR-0032 D2).

## Operational notes

### 1. Tenancy is the consumer's responsibility

The wrapper does not model tenants. Tenant-scoping of the persisted hash is achieved entirely through the `storageService` prefix the consumer territory supplies. For Kendo, this means the tenant-scoped `storageService` factory naturally prefixes the hash storage key. For Emmie's DB-per-tenant subdomain model, each subdomain is its own browser origin and localStorage is naturally origin-scoped. Either way: the wrapper inherits whatever isolation the consumer's `storageService` provides.

### 2. Cancellation is fs-http's responsibility

The wrapper does not own `AbortSignal` threading. If `fs-http` exposes a `signal` surface and `fs-adapter-store` passes it through to `retrieveAll`, the wrapper inherits cancellation for free. As of v0.1.0, fs-http does not document `signal` on its request methods; the wrapper acknowledges that a rapid re-mount may complete a now-irrelevant fetch. This is no worse than the unwrapped adapter-store, and the in-flight deduplication mitigates the worst case (two overlapping fetches). The fs-http gap is tracked at war-room enforcement queue #62.

### 3. Backend bump semantics live in Actions

Per war-room ADR-0011 (Action Class Architecture, cross-project), the backend must bump the hash inside the same database transaction as the write that motivates it. Observer-driven bumps fired after the writing transaction commits are forbidden by this protocol — they introduce a race window where a client refetches and sees pre-write state.

## Wrapper invariants

The wrapper is designed against `fs-http`'s response-middleware contract as documented in the 2026-05-13 Surveyor middleware-invariants report:

- **Throw isolation.** fs-http does not isolate middleware throws — a synchronous throw inside a middleware aborts response delivery to the caller. The wrapper's response middleware body is wrapped in `try/catch` so a malformed header (un-decodable URI, malformed JSON) cannot poison the caller's request. The middleware-triggered `inner.retrieveAll()` is fire-and-forget; an async rejection is contained inside the in-flight closure's try/finally and a top-level `.catch(() => {})` ensures no unhandled rejection escapes.
- **In-flight deduplication.** A `prime()` call and a middleware-triggered fetch in flight at the same time share one underlying promise. Two rapid `prime()` calls likewise resolve to one inner fetch.
- **Idempotent middleware registration.** Multiple wrapper instances sharing one `httpService` register exactly one response middleware between them. Header parsing happens once per response, regardless of how many wrappers are listening.

## Compatibility

Pre-1.0; peer ranges are explicit. See the territory's "Versioning Discipline (Pre-1.0)" section for the caret-cascade discipline.

## License

MIT
