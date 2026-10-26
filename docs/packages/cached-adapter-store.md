# fs-cached-adapter-store

A hash-bumping cache wrapper around `fs-adapter-store`: the store refetches only when the server says its data changed.

```bash
npm install @script-development/fs-cached-adapter-store
```

**Peer dependencies:** `vue ^3.5.43`, `@script-development/fs-adapter-store ^0.1.0 || ^0.2.0 || ^0.3.0 || ^0.4.0`, `@script-development/fs-http ^0.1.0 || ^0.2.0 || ^0.3.0 || ^0.4.0 || ^0.5.0 || ^0.6.0 || ^0.7.0`, `@script-development/fs-storage ^0.1.0`

## What It Does

An [fs-adapter-store](/packages/adapter-store) module fetches whenever a consumer calls `retrieveAll()`. For a collection that rarely changes, most of those requests return data the browser already holds, and on a rate-limited API each one is a potential 429.

`fs-cached-adapter-store` wraps the same store and takes the decision away from the consumer. The backend stamps a hash per collection on its responses; the wrapper compares that hash with the one it last loaded and fetches only when they differ. `fs-adapter-store` itself is unchanged — a store that does not opt in behaves exactly as before.

The protocol is ADR-0032, at [adrs.script.nl](https://adrs.script.nl).

## Basic Usage

```typescript
import {resourceAdapter} from '@script-development/fs-adapter-store';
import {createCachedAdapterStoreModule} from '@script-development/fs-cached-adapter-store';

import {http, storage, loading} from '@/services';

export const categoriesStore = createCachedAdapterStoreModule<Category>(
    {
        domainName: 'categories',
        adapter: resourceAdapter,
        httpService: http,
        storageService: storage,
        loadingService: loading,
    },
    {cacheKey: 'categories'},
);

// Once, at your preferred initialization point (app boot, route enter, root component setup)
await categoriesStore.prime();

categoriesStore.getAll; // ComputedRef<Adapted<Category>[]>
categoriesStore.getById(3); // ComputedRef<Adapted<Category> | undefined>
```

The first argument is the same config `createAdapterStoreModule` takes. The second carries one option, `cacheKey`.

## The Narrower Surface

The returned `CachedStoreModuleForAdapter` exposes `getAll`, `getById`, `getOrFailById`, `generateNew` and `prime()`. **`retrieveAll` and `retrieveById` are deliberately absent**, and the type is not assignable to `StoreModuleForAdapter` — the assignment is a compile-time error.

- **No `retrieveAll`** — the wrapper owns when to fetch. A consumer-driven fetch is exactly the redundant request the package exists to suppress.
- **No `retrieveById`** — the hash describes the whole collection. Topping the store up one item at a time would break the invariant that the stored hash describes what is in state.

If you need per-id retrieval, this is the wrong tool: use `createAdapterStoreModule` directly.

## The Contract

### Response header — the server's hashes

```
x-fs-cache-hashes: v1.<urlencoded JSON object>
```

The JSON is a flat `{cacheKey: hash}` map. On every response carrying the header, the wrapper records the server hash for each cache key it knows and, when that hash differs from the one it last loaded, refetches the collection in the background.

- A value that does not start with `v1.` is no signal: nothing changes and nothing is fetched.
- An undecodable value, invalid JSON, an array, or a non-string hash is also no signal. Parsing never throws into your request.

### Request header — the keys this app caches

```
x-fs-cache-hashes-subscribe: v1.<urlencoded JSON array>
```

Every request through the wrapped `httpService` carries the cache keys of every cached store built on that service, read at the moment the request fires — a store created later is included from then on. The payload is an **array** of keys, where the response header is an **object**; the `v1.` prefix is shared.

A backend that does not read the header ignores it, so the wrapper can ship ahead of the backend. There is no opt-out. Stores on a second `httpService` subscribe only through that service.

### When the wrapper fetches

1. **On a changed hash.** A response stamps a hash that differs from the stored one → one background `retrieveAll()` on the inner store. A hash equal to the stored one fetches nothing.
2. **On `prime()`.** Covers the cold start, before any response on this tab has carried a hash. `prime()` is idempotent: concurrent calls share one fetch, and once a fetch in this session has succeeded and a hash is held, it returns without fetching. A failed fetch rejects the `prime()` promise.
3. **Never twice at once.** A `prime()` and a header-triggered fetch in flight together share one request.

### When the hash is stored

Only **after** a successful fetch does the wrapper copy the server hash into its local hash and into `storageService`, under `<cacheKey>.cache-hash`. A failed fetch stores nothing, so the stored hash always describes the data in state. Because the hash persists, a header on a fresh page load that matches the stored hash triggers no fetch; `prime()` called before any header has arrived still fetches, because there is nothing yet to compare against.

### What the backend owes

- Stamp each key's hash on responses, under exactly the `cacheKey` the store was given.
- Bump the hash **inside the same database transaction as the write** that changes the data. A bump fired after commit opens a window where a client refetches and sees the old data.
- Stamp only keys the current user may read: a stamped hash tells the client the resource exists. Drop unentitled keys silently rather than erroring.

The wrapper has no expiry. A write path that forgets to bump the hash leaves clients on old data until the next bump — that is a backend bug to fix, not a knob to add here.

## Scoping

The wrapper does not model tenants. The persisted hash inherits whatever isolation the `storageService` you pass provides — give it a prefixed storage service per tenant if your app needs one.

## Middleware Safety

The wrapper installs one response middleware and one request middleware per `httpService`, however many cached stores share it. Both bodies catch their own errors, so a malformed header cannot fail the request that carried it; a background fetch that fails is swallowed on the header path and surfaces through `prime()` on the cold-start path.

## API Reference

### `createCachedAdapterStoreModule(config, options)`

| Parameter          | Type                          | Description                                                          |
| ------------------ | ----------------------------- | -------------------------------------------------------------------- |
| `config`           | `AdapterStoreConfig`          | The same config `createAdapterStoreModule` takes                     |
| `options.cacheKey` | `string`                      | Key in both headers, and the storage key prefix (`<key>.cache-hash`) |
| **Returns**        | `CachedStoreModuleForAdapter` | The narrowed store module below                                      |

### Store Module Methods

| Method              | Returns                             | Description                                             |
| ------------------- | ----------------------------------- | ------------------------------------------------------- |
| `getAll`            | `ComputedRef<Adapted[]>`            | Reactive list of all adapted resources                  |
| `getById(id)`       | `ComputedRef<Adapted \| undefined>` | Reactive lookup by ID                                   |
| `getOrFailById(id)` | `Promise<Adapted>`                  | Wait for loading, throw if not found                    |
| `generateNew()`     | `NewAdapted`                        | Create a new unsaved resource                           |
| `prime()`           | `Promise<void>`                     | Idempotent cold-start load; rejects if the fetch failed |
