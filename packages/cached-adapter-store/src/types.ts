/**
 * Options for {@link createCachedAdapterStoreModule}.
 *
 * Intentionally minimal in v1: only `cacheKey` is exposed. No `staleAfterMs`,
 * no `onMissingServerHash`, no `hashExtractor`, no `hashStorageKey`, no
 * `legacyHeaderName`. The hash-or-fetch protocol is the contract; opting out
 * of any leg of it requires re-thinking the protocol itself, which is a
 * separate concern.
 */
export type CachedAdapterStoreOptions = {
    /**
     * The cache key used both as the lookup key inside the `x-fs-cache-hashes`
     * response header AND as the localStorage key for the persisted hash
     * (`${cacheKey}.cache-hash`). The backend is expected to stamp this exact
     * key in the header value whenever the underlying data changes.
     */
    cacheKey: string;
};
