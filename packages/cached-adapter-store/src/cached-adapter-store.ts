import type {
    Adapted,
    AdapterStoreConfig,
    Item,
    NewAdapted,
    StoreModuleForAdapter,
} from '@script-development/fs-adapter-store';
import type {HttpService, ResponseMiddlewareFunc} from '@script-development/fs-http';
import type {Ref} from 'vue';

import {createAdapterStoreModule} from '@script-development/fs-adapter-store';
import {ref} from 'vue';

import type {CachedAdapterStoreOptions} from './types';

/**
 * Convenience alias for the response shape passed to a response middleware.
 * Inferred via `Parameters<ResponseMiddlewareFunc>[0]` so we never import
 * `AxiosResponse` directly from `axios` — axios's CJS d.ts ships its types
 * under a nested namespace (`axios.AxiosResponse`), and a direct named
 * import fails rolldown's d.cts emission. Routing through fs-http's
 * already-published `ResponseMiddlewareFunc` sidesteps the issue.
 */
type Response = Parameters<ResponseMiddlewareFunc>[0];

/**
 * Wire-protocol response header. The backend stamps this on any response that
 * carries a freshness signal. Value shape: `v1.${urlencoded JSON}` where the
 * JSON is a flat `{cacheKey: hashString}` map. Anything not starting with
 * `v1.` is treated as no-signal (strict version-prefix policy — see
 * Architecture Lock #5 in the Engineer deployment order, 2026-05-13).
 */
const HEADER_NAME = 'x-fs-cache-hashes';
const VERSION_PREFIX = 'v1.';

/**
 * Module-local debug log prefix. Consumer territories can grep for this in
 * their browser console to observe wrapper-side decisions (no-signal
 * fallthroughs, malformed-header parses, etc.). We deliberately do not call
 * `console.error` — middleware-body errors are *swallowed* on purpose, and an
 * `error`-level log would imply the request failed when it did not.
 */
const LOG_PREFIX = '[fs-cached-adapter-store]';

/**
 * Shared registry across all wrapper instances. Tracks which
 * `HttpService` instances have already had a response middleware registered
 * for header parsing. Without this, two wrapper-factory calls sharing one
 * `httpService` would parse each response twice.
 *
 * The registry maps `HttpService` -> a map keyed by `cacheKey` -> setter
 * for the corresponding `currentServerHash` ref. When a new wrapper is
 * constructed:
 *  - If its `httpService` is already registered, append the new cacheKey
 *    setter to the existing map.
 *  - Otherwise, install a single response middleware on the `httpService`
 *    that iterates the map and routes hash updates to the right setter.
 */
type CacheKeySetter = (hash: string) => void;
const httpServiceRegistry = new WeakMap<HttpService, Map<string, CacheKeySetter>>();

/**
 * Synchronous, exception-safe parse of the `x-fs-cache-hashes` header.
 * Returns the flat `{cacheKey: hash}` map on success, or `null` on any
 * failure mode (missing header, missing prefix, decode error, JSON parse
 * error, structurally wrong shape). The function never throws.
 *
 * Per Architecture Lock #10 (Engineer deployment order 2026-05-13) and the
 * Surveyor middleware-invariants verdict (2026-05-13 §Q7/Q8/Q9), fs-http
 * does NOT isolate middleware throws — a throw inside our middleware aborts
 * the caller's entire request. The wrapper owns that isolation discipline,
 * so this function is the throw boundary.
 *
 * Exported for direct unit testing. The parser's per-branch behavior is
 * difficult to discriminate from the outside (the wrapper's outer try/catch
 * swallows any throw the parser would emit), so mutation tests target this
 * function directly via its exported handle. Not part of the package's
 * public API surface — kept internal to the file via `index.ts`'s re-export
 * boundary.
 */
export const parseCacheHashHeader = (response: Response): Record<string, string> | null => {
    const headers = response.headers as Record<string, unknown> | undefined;
    const raw = headers?.[HEADER_NAME];
    if (typeof raw !== 'string') return null;
    if (!raw.startsWith(VERSION_PREFIX)) return null;
    const payload = raw.slice(VERSION_PREFIX.length);
    let decoded: string;
    try {
        decoded = decodeURIComponent(payload);
    } catch {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(decoded);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value !== 'string') return null;
        map[key] = value;
    }
    return map;
};

/**
 * Wraps {@link createAdapterStoreModule} with a hash-bumping cache-check that
 * suppresses redundant `retrieveAll` GETs at the source.
 *
 * On every response carrying `x-fs-cache-hashes`, the wrapper updates its
 * in-memory `currentServerHash`. At `retrieveAll()` time, it compares
 * `localHash` (hydrated from `storageService` at construction) against
 * `currentServerHash`; if both are non-null and equal, the inner
 * `retrieveAll()` is skipped entirely. After every successful inner
 * `retrieveAll()`, the current server hash is snapshotted into both the
 * in-memory `localHash` and `storageService` — never before, so a failed
 * round-trip cannot leave a persisted hash that doesn't match `state`.
 *
 * All wrapper concerns (in-flight deduplication, idempotent middleware
 * registration across stores sharing one `httpService`, exception-safe
 * header parsing) are baked into the factory. Adapter-store is unmodified.
 *
 * @see Architecture Locks 1-11 in
 *      `orders/fs-packages/fs-cached-adapter-store-scaffold-engineer-deployment.md`
 *      for the v1 scope-shaping decisions Commander made on 2026-05-13.
 */
export const createCachedAdapterStoreModule = <
    T extends Item,
    E extends Adapted<T, object> = Adapted<T>,
    N extends NewAdapted<T, object> = NewAdapted<T>,
>(
    config: AdapterStoreConfig<T, E, N>,
    options: CachedAdapterStoreOptions,
): StoreModuleForAdapter<T, E, N> => {
    const {cacheKey} = options;
    const {httpService, storageService} = config;
    const hashStorageKey = `${cacheKey}.cache-hash`;

    const inner = createAdapterStoreModule<T, E, N>(config);

    const initialPersistedHash = storageService.get<string | null>(hashStorageKey, null);
    const localHash: Ref<string | null> = ref(initialPersistedHash);
    const currentServerHash: Ref<string | null> = ref(null);

    const setCurrentHash: CacheKeySetter = (hash: string) => {
        currentServerHash.value = hash;
    };

    // Idempotent middleware registration. The registry is keyed by
    // HttpService instance, so multiple wrapper-factory calls sharing one
    // httpService produce ONE response middleware that fans out to all
    // registered cacheKey setters — not N middlewares parsing the same
    // header N times.
    //
    // We treat httpService as Pick<...>-typed in config, but the registry
    // needs a stable WeakMap key. Cast to HttpService is safe: the wrapper
    // requires registerResponseMiddleware on the same instance, and the
    // shape Pick captures is a subset of the live object.
    const httpServiceAsRegistryKey = httpService as HttpService;
    const existingSetters = httpServiceRegistry.get(httpServiceAsRegistryKey);
    if (existingSetters) {
        existingSetters.set(cacheKey, setCurrentHash);
    } else {
        const setters = new Map<string, CacheKeySetter>();
        setters.set(cacheKey, setCurrentHash);
        httpServiceRegistry.set(httpServiceAsRegistryKey, setters);
        httpServiceAsRegistryKey.registerResponseMiddleware((response: Response) => {
            try {
                const map = parseCacheHashHeader(response);
                if (map === null) return;
                for (const [key, hash] of Object.entries(map)) {
                    const setter = setters.get(key);
                    if (setter) setter(hash);
                }
            } catch (error) {
                // Defense-in-depth. parseCacheHashHeader is exception-safe by
                // construction, but a future change to the parser or a
                // pathological Response shape (e.g., a getter that throws on
                // `response.headers`) must NOT abort the caller's request.
                // fs-http does not isolate middleware throws — this catch is
                // the wrapper's contract with its consumers.
                // eslint-disable-next-line no-console
                console.debug(`${LOG_PREFIX} response middleware caught error`, error);
            }
        });
    }

    let inflight: Promise<void> | null = null;

    const retrieveAll = async (): Promise<void> => {
        if (inflight) return inflight;
        // Skip only when both are populated and equal. The `localHash !== null`
        // clause is load-bearing: without it, a fresh wrapper with no
        // persisted hash AND no server signal would have
        // `localHash === currentServerHash === null` → skip → empty state
        // forever. The `=== currentServerHash.value` comparison then handles
        // the populated-equality case AND implicitly rejects
        // `currentServerHash === null` (since localHash is non-null).
        if (localHash.value !== null && localHash.value === currentServerHash.value) {
            return;
        }
        inflight = (async () => {
            try {
                await inner.retrieveAll();
                // Persist after success only. The local hash must always
                // match the data currently in state — persisting on response
                // middleware receipt would race a cold-start re-mount that
                // skipped the fetch and rendered empty state.
                const serverHashSnapshot = currentServerHash.value;
                if (serverHashSnapshot !== null) {
                    localHash.value = serverHashSnapshot;
                    storageService.put(hashStorageKey, serverHashSnapshot);
                }
            } finally {
                inflight = null;
            }
        })();
        return inflight;
    };

    return {
        getAll: inner.getAll,
        getById: inner.getById,
        getOrFailById: inner.getOrFailById,
        generateNew: inner.generateNew,
        retrieveById: inner.retrieveById,
        retrieveAll,
    };
};
