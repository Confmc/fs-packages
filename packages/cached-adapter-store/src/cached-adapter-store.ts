import type {Adapted, AdapterStoreConfig, Item, NewAdapted} from '@script-development/fs-adapter-store';
import type {HttpService, ResponseMiddlewareFunc} from '@script-development/fs-http';
import type {Ref} from 'vue';

import {createAdapterStoreModule} from '@script-development/fs-adapter-store';
import {ref} from 'vue';

import type {CachedAdapterStoreOptions, CachedStoreModuleForAdapter} from './types';

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
 * Architecture Lock #5 in the scaffold Engineer deployment order, 2026-05-13).
 */
const HEADER_NAME = 'x-fs-cache-hashes';
const VERSION_PREFIX = 'v1.';

/**
 * Wire-protocol *request* header (frontend → backend, ADR-0032 Option A). The
 * wrapper stamps this on every outbound request to declare which cache keys
 * this SPA holds locally, so the backend can authorize + stamp only the
 * entitled subset on the response. Value shape: `v1.${urlencoded JSON}` where
 * the JSON is a flat **array** of cacheKey strings (e.g. `["lanes","labels"]`).
 *
 * Note the asymmetry against {@link HEADER_NAME}: the *response* payload is a
 * `{cacheKey: hash}` map (object); the *request* payload is a flat array of
 * keys. Same `v1.` version prefix, different payload shape — request declares
 * "here are the keys I cache", response answers "here are their current hashes".
 *
 * Emission is additive-by-default and old-backend-safe: a backend that does
 * not speak Option A simply ignores an unknown request header, and the
 * wrapper's response-side parse is unchanged. No opt-out flag (ADR-0032
 * §"Fallback semantics" — absent header is the documented degenerate case).
 */
const SUBSCRIBE_HEADER_NAME = 'x-fs-cache-hashes-subscribe';

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
 * The registry maps `HttpService` -> a map keyed by `cacheKey` -> the
 * per-cacheKey "observe & trigger" handler that owns
 * `currentServerHash` update AND the (deduped, skip-if-equal) call into
 * `inner.retrieveAll()`. When a new wrapper is constructed:
 *  - If its `httpService` is already registered, append the new cacheKey
 *    handler to the existing map.
 *  - Otherwise, install a single response middleware on the `httpService`
 *    that iterates the map and dispatches to the right handler.
 */
type CacheKeyHandler = (hash: string) => void;
const httpServiceRegistry = new WeakMap<HttpService, Map<string, CacheKeyHandler>>();

/**
 * Read-only accessor over the per-`HttpService` registry (ADR-0032 D1). Given
 * a registered `HttpService`, returns the array of cacheKeys currently
 * registered against it — exactly the `Map`'s keys, in insertion order. This
 * is the subscription set the outbound request middleware emits; we
 * deliberately reuse the existing response-dispatch registry rather than
 * maintaining a parallel `Set<string>` (D1): the registry keys already *are*
 * "the cache keys this service caches".
 *
 * Read live at request-fire time (not snapshotted at registration), so a
 * second store constructed on the same `HttpService` after the middleware was
 * installed is reflected on subsequent requests. Returns `[]` for an
 * unregistered service — a degenerate case the caller (the request middleware,
 * which is only installed once a handler-map exists) does not hit, but kept
 * total for safety. Never mutates the registry.
 *
 * Exported for direct unit testing under the mutation gate: the empty-registry
 * branch is unreachable through the public factory path (the request
 * middleware is only installed once a handler-map with ≥1 key exists), so the
 * `undefined → []` guard must be discriminated against the accessor directly,
 * not inferred from the factory surface.
 */
export const subscriptionKeysFor = (httpService: HttpService): string[] => {
    const handlers = httpServiceRegistry.get(httpService);
    if (handlers === undefined) return [];
    return Array.from(handlers.keys());
};

/**
 * Encode the subscription set into the `x-fs-cache-hashes-subscribe` request
 * header value: `v1.${rawurlencoded JSON array}`. Mirrors the response
 * header's `v1.` prefix + `encodeURIComponent(JSON.stringify(...))` encoding
 * so the backend uses one decode path for both directions. Exported for
 * direct unit testing under the mutation gate (the exact emitted string is the
 * contract — a weakened encoding must be caught here, not inferred from a
 * "header exists" assertion).
 */
export const encodeSubscribeHeader = (keys: string[]): string =>
    `${VERSION_PREFIX}${encodeURIComponent(JSON.stringify(keys))}`;

/**
 * Synchronous, exception-safe parse of the `x-fs-cache-hashes` header.
 * Returns the flat `{cacheKey: hash}` map on success, or `null` on any
 * failure mode (missing header, missing prefix, decode error, JSON parse
 * error, structurally wrong shape). The function never throws.
 *
 * Per Architecture Lock #10 (scaffold Engineer deployment order 2026-05-13)
 * and the Surveyor middleware-invariants verdict (2026-05-13 §Q7/Q8/Q9),
 * fs-http does NOT isolate middleware throws — a throw inside our middleware
 * aborts the caller's entire request. The wrapper owns that isolation
 * discipline, so this function is the throw boundary.
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
 * **Public surface is intentionally narrower than `StoreModuleForAdapter`.**
 * Consumers see `getAll`, `getById`, `getOrFailById`, `generateNew`, and a
 * single bootstrap entry point `prime()`. There is NO `retrieveAll` and NO
 * `retrieveById` on the returned module — retrieval is owned by the wrapper:
 *
 * - **Middleware-driven invalidation (steady state).** On every response
 *   carrying `x-fs-cache-hashes`, the wrapper updates its in-memory
 *   `currentServerHash` for each registered cacheKey AND, if
 *   `localHash !== currentServerHash`, triggers an internal
 *   `inner.retrieveAll()` (fire-and-forget; in-flight-deduped; skip-if-equal).
 * - **`prime()` (cold-start).** A single idempotent entry point for the
 *   case where no response has yet stamped a hash on this tab. Two rapid
 *   `prime()` calls dedupe to one inner fetch via the shared in-flight ref;
 *   once a successful inner retrieve has completed and `localHash !== null`,
 *   subsequent `prime()` calls return immediately without invoking inner.
 *
 * After every successful inner `retrieveAll()`, the current server hash is
 * snapshotted into both the in-memory `localHash` and `storageService` — never
 * before, so a failed round-trip cannot leave a persisted hash that doesn't
 * match `state`.
 *
 * All wrapper concerns (in-flight deduplication, idempotent middleware
 * registration across stores sharing one `httpService`, exception-safe
 * header parsing) are baked into the factory. Adapter-store is unmodified.
 *
 * @see Architecture Locks 1-10 in
 *      `orders/fs-packages/fs-cached-adapter-store-scaffold-engineer-deployment.md`
 *      for the v1 scope-shaping decisions Commander made on 2026-05-13.
 * @see Architecture Lock revisions (Commander 2026-05-13) in
 *      `orders/fs-packages/fs-cached-adapter-store-public-surface-narrowing-engineer-deployment.md`:
 *      Lock #11 REVERSED (`retrieveById` removed from public surface);
 *      new Lock #12 (`retrieveAll` removed from public surface);
 *      new Lock #13 (`prime()` is the only consumer-facing fetch entry point).
 */
export const createCachedAdapterStoreModule = <
    T extends Item,
    E extends Adapted<T, object> = Adapted<T>,
    N extends NewAdapted<T, object> = NewAdapted<T>,
>(
    config: AdapterStoreConfig<T, E, N>,
    options: CachedAdapterStoreOptions,
): CachedStoreModuleForAdapter<T, E, N> => {
    const {cacheKey} = options;
    const {httpService, storageService} = config;
    const hashStorageKey = `${cacheKey}.cache-hash`;

    const inner = createAdapterStoreModule<T, E, N>(config);

    const initialPersistedHash = storageService.get<string | null>(hashStorageKey, null);
    const localHash: Ref<string | null> = ref(initialPersistedHash);
    const currentServerHash: Ref<string | null> = ref(null);

    let inflight: Promise<void> | null = null;
    let hasCompletedAtLeastOnce = false;

    /**
     * Shared retrieve coordinator. Both `prime()` (cold-start consumer
     * trigger) and the response middleware (steady-state observer trigger)
     * call into this. Owns three responsibilities:
     *
     * 1. In-flight dedup — any second caller awaits the same promise.
     * 2. Skip-if-equal — if `localHash` and `currentServerHash` are both
     *    populated and equal, the inner fetch is skipped.
     * 3. Persist-after-success — only on a successful `inner.retrieveAll()`
     *    do we snapshot `currentServerHash` into `localHash` +
     *    `storageService`.
     *
     * Errors propagate to the caller (used by `prime()` to surface failures
     * up to consumer code). The middleware path is fire-and-forget; it does
     * NOT await the returned promise.
     */
    const triggerInnerRetrieveAll = async (): Promise<void> => {
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
                hasCompletedAtLeastOnce = true;
            } finally {
                inflight = null;
            }
        })();
        return inflight;
    };

    const handleObservedHash: CacheKeyHandler = (hash: string) => {
        currentServerHash.value = hash;
        // Middleware-driven invalidation. Once the new server hash differs from
        // localHash (the most common case being a fresh wrapper with
        // localHash === null), trigger the inner fetch. Fire-and-forget — the
        // middleware body stays synchronous from fs-http's perspective. The
        // outer try/catch around the middleware body (below) covers any
        // synchronous throw `triggerInnerRetrieveAll` could emit before
        // returning its promise; the promise itself resolves into the void
        // return type and any async rejection is contained inside the
        // inflight closure's try/finally — it does NOT escape back through
        // the middleware to abort the caller's request.
        //
        // `triggerInnerRetrieveAll` inherits the in-flight dedup and skip-when-
        // equal logic, so a header that arrives mid-retrieve doesn't double-fire
        // and a header that matches localHash doesn't fire at all. Note: the
        // skip-when-equal check happens *after* this line bumps currentServerHash,
        // so an equal observed hash is short-circuited by the trigger itself —
        // we do not duplicate that check here.
        //
        // v1 simplification: once-per-burst is the contract. If currentServerHash
        // continues changing after this trigger fires, later mismatches are
        // picked up on the *next* response that carries a still-mismatched hash.
        // The middleware path does NOT pre-check `localHash !== hash` to short-
        // circuit before calling — the trigger owns that decision.
        void triggerInnerRetrieveAll().catch(() => {
            // Swallowed by design. The trigger's own try/finally already
            // clears the in-flight ref and prevents persist-on-failure; a
            // top-level handler here exists so unhandled-rejection logs
            // don't fire on transient inner failures observed via the
            // middleware path. Consumers who care about middleware-driven
            // fetch failures observe via the inner adapter-store's own
            // failure surface, not via the wrapper.
        });
    };

    // Idempotent middleware registration. The registry is keyed by
    // HttpService instance, so multiple wrapper-factory calls sharing one
    // httpService produce ONE response middleware that fans out to all
    // registered cacheKey handlers — not N middlewares parsing the same
    // header N times.
    //
    // We treat httpService as Pick<...>-typed in config, but the registry
    // needs a stable WeakMap key. Cast to HttpService is safe: the wrapper
    // requires registerResponseMiddleware on the same instance, and the
    // shape Pick captures is a subset of the live object.
    const httpServiceAsRegistryKey = httpService as HttpService;
    const existingHandlers = httpServiceRegistry.get(httpServiceAsRegistryKey);
    if (existingHandlers) {
        existingHandlers.set(cacheKey, handleObservedHash);
    } else {
        const handlers = new Map<string, CacheKeyHandler>();
        handlers.set(cacheKey, handleObservedHash);
        httpServiceRegistry.set(httpServiceAsRegistryKey, handlers);
        httpServiceAsRegistryKey.registerResponseMiddleware((response: Response) => {
            try {
                const map = parseCacheHashHeader(response);
                if (map === null) return;
                for (const [key, hash] of Object.entries(map)) {
                    const handler = handlers.get(key);
                    if (handler) handler(hash);
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

        // Outbound subscribe-header emission (ADR-0032 Option A). Registered
        // ONCE per HttpService, alongside the response middleware, on the same
        // first-wrapper-per-service branch — so a single request middleware
        // stamps the full subscription set for every cached store sharing this
        // service, not N middlewares each appending its own key.
        //
        // Reads the registry keys *live* at fire time via `subscriptionKeysFor`
        // (closing over `httpServiceAsRegistryKey`), so stores constructed
        // after this registration are picked up on subsequent requests.
        //
        // The middleware mutates `request.headers` directly — that is the
        // documented fs-http RequestMiddlewareFunc contract (it receives the
        // mutable axios request config). Wrapped in a try/catch for the same
        // reason the response middleware is: fs-http does not isolate
        // middleware throws, so a pathological request config must not abort
        // the caller's request.
        httpServiceAsRegistryKey.registerRequestMiddleware((request) => {
            try {
                // The handler-map always carries ≥1 key by the time this fires
                // (the request middleware is installed on the same branch that
                // just registered the first cacheKey), so we stamp
                // unconditionally — no empty-set guard, which would be a dead
                // branch the mutation gate cannot discriminate. The
                // empty-registry case lives in `subscriptionKeysFor` and is
                // covered against the accessor directly.
                request.headers[SUBSCRIBE_HEADER_NAME] = encodeSubscribeHeader(
                    subscriptionKeysFor(httpServiceAsRegistryKey),
                );
            } catch (error) {
                // eslint-disable-next-line no-console
                console.debug(`${LOG_PREFIX} request middleware caught error`, error);
            }
        });
    }

    /**
     * Idempotent bootstrap. Exists purely to cover the cold-start path:
     * no response carrying `x-fs-cache-hashes` has yet been observed on this
     * tab, so the middleware-driven trigger cannot fire. After the first
     * successful inner retrieve, this becomes a no-op once `localHash !== null`
     * — at that point the response middleware is the authoritative trigger
     * for any subsequent re-fetches.
     */
    const prime = async (): Promise<void> => {
        if (hasCompletedAtLeastOnce && localHash.value !== null) return;
        return triggerInnerRetrieveAll();
    };

    return {
        getAll: inner.getAll,
        getById: inner.getById,
        getOrFailById: inner.getOrFailById,
        generateNew: inner.generateNew,
        prime,
    };
};
