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
```

The returned module has the **same shape** as `createAdapterStoreModule`'s `StoreModuleForAdapter<T, E, N>` — a drop-in replacement at every call site.

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
2. Updates an in-memory `currentServerHash` for each `cacheKey` matching a registered wrapper instance.
3. At `retrieveAll()` time, compares the **local hash** (hydrated from `storageService` at construction) against `currentServerHash`. If both are non-null and equal, the inner `retrieveAll()` is skipped entirely.
4. After every successful inner `retrieveAll()`, the current server hash is snapshotted into both the in-memory local hash and `storageService` — never before.

The strict `v1.` version prefix is non-negotiable. A header value not starting with `v1.` is treated as no-signal (fallthrough to fetch). This is intentional: every response stamped with this header is contractually opting into the v1 wire format.

The wrapper does NOT wrap `retrieveById` in v1 — that method is passed through unchanged. The 429 incident that motivated this package is driven by `retrieveAll`; per-id caching is future work.

## Operational notes

### 1. Tenancy is the consumer's responsibility

The wrapper does not model tenants. Tenant-scoping of the persisted hash is achieved entirely through the `storageService` prefix the consumer territory supplies. For Kendo, this means the tenant-scoped `storageService` factory naturally prefixes the hash storage key. For Emmie's DB-per-tenant subdomain model, each subdomain is its own browser origin and localStorage is naturally origin-scoped. Either way: the wrapper inherits whatever isolation the consumer's `storageService` provides.

### 2. Cancellation is fs-http's responsibility

The wrapper does not own `AbortSignal` threading. If `fs-http` exposes a `signal` surface and `fs-adapter-store` passes it through to `retrieveAll`, the wrapper inherits cancellation for free. As of v0.1.0, fs-http does not document `signal` on its request methods; the wrapper acknowledges that a rapid re-mount may complete a now-irrelevant fetch. This is no worse than the unwrapped adapter-store, and the in-flight deduplication mitigates the worst case (two overlapping fetches). The fs-http gap is tracked at war-room enforcement queue #62.

### 3. Backend bump semantics live in Actions

Per war-room ADR-0011 (Action Class Architecture, cross-project), the backend must bump the hash inside the same database transaction as the write that motivates it. Observer-driven bumps fired after the writing transaction commits are forbidden by this protocol — they introduce a race window where a client refetches and sees pre-write state.

## Wrapper invariants

The wrapper is designed against `fs-http`'s response-middleware contract as documented in the 2026-05-13 Surveyor middleware-invariants report:

- **Throw isolation.** fs-http does not isolate middleware throws — a synchronous throw inside a middleware aborts response delivery to the caller. The wrapper's response middleware body is wrapped in `try/catch` so a malformed header (un-decodable URI, malformed JSON) cannot poison the caller's request.
- **In-flight deduplication.** Two `retrieveAll()` calls in rapid succession invoke the inner `retrieveAll` exactly once and resolve from the same underlying promise.
- **Idempotent middleware registration.** Multiple wrapper instances sharing one `httpService` register exactly one response middleware between them. Header parsing happens once per response, regardless of how many wrappers are listening.

## Compatibility

Pre-1.0; peer ranges are explicit. See the territory's "Versioning Discipline (Pre-1.0)" section for the caret-cascade discipline.

## License

MIT
