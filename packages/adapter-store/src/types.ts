import type {Writable} from '@script-development/fs-helpers';
import type {HttpService} from '@script-development/fs-http';
import type {LoadingService} from '@script-development/fs-loading';
import type {StorageService} from '@script-development/fs-storage';
import type {ComputedRef, Ref} from 'vue';

/** Base constraint for all domain items — must have a numeric id. */
export type Item = {id: number};

/** Default type for new resources — strips the id field. Territories can override. */
export type DefaultNew<T extends Item> = Omit<T, 'id'>;

/**
 * Internal store module contract passed to adapters.
 * NOT part of the public API — adapters use this to mutate store state
 * after successful CRUD operations.
 */
export type AdapterStoreModule<T extends Item> = {setById: (item: T) => void; deleteById: (id: number) => void};

/** Base of a resource adapter: readonly resource + mutable ref + reset. */
type BaseResourceAdapter<T extends object> = Readonly<T> & {
    /** Reactive, mutable copy of the resource. */
    mutable: Ref<Writable<T>>;
    /** Reset the mutable state to the original resource. */
    reset: () => void;
};

/** Adapter for an existing resource. Provides update, patch, and delete. */
export type Adapted<T extends Item, N extends object = DefaultNew<T>> = BaseResourceAdapter<T> & {
    update(): Promise<T>;
    patch(partialItem: Partial<N>): Promise<T>;
    delete(): Promise<void>;
};

/** Adapter for a new resource (without id). Provides create. */
export type NewAdapted<T extends Item, N extends object = DefaultNew<T>> = BaseResourceAdapter<N> & {
    create(): Promise<T>;
};

/** Callable adapter type — overloaded for existing vs new resources. */
export type Adapter<T extends Item, E extends Adapted<T, object>, N extends NewAdapted<T, object>> = {
    (storeModule: AdapterStoreModule<T>): N;
    (storeModule: AdapterStoreModule<T>, resourceGetter: () => T): E;
};

/**
 * Contract for binding server-initiated events (e.g. WebSocket broadcasts)
 * to an adapter-store. The store calls `subscribe` once at construction and
 * routes incoming events straight into its internal mutation path.
 *
 * This is a **closed** contract: the handlers are consumed inside the consumer's
 * `subscribe` body (wired to an event source) and are never returned, so they do
 * not reach the public store surface. The handlers the store passes are validating
 * wrappers, not the bare internal mutators — `onUpdate` rejects a payload that is
 * not an object with an integer `id`, and `onDelete` rejects a non-integer id, each
 * throwing `BroadcastPayloadError` so a malformed broadcast cannot corrupt store
 * state (`NaN` / `Infinity` / a non-integer float pass a `typeof === 'number'` check
 * yet break the keyspace, so the guard requires an integer). Because the channel
 * applies events without an HTTP round-trip, do not
 * re-export the handlers onto your own public surface — that would publish a
 * non-HTTP write path for arbitrary callers.
 */
export type AdapterStoreBroadcast<T extends Item> = {
    subscribe: (handlers: {onUpdate: (item: T) => void; onDelete: (id: number) => void}) => () => void;
};

/** Configuration for createAdapterStoreModule. */
export type AdapterStoreConfig<T extends Item, E extends Adapted<T, object>, N extends NewAdapted<T, object>> = {
    domainName: string;
    adapter: Adapter<T, E, N>;
    httpService: Pick<HttpService, 'getRequest'>;
    storageService: Pick<StorageService, 'get' | 'put'>;
    loadingService: Pick<LoadingService, 'ensureLoadingFinished'>;
    broadcast?: AdapterStoreBroadcast<T>;
};

/** Public API of a store module. */
export type StoreModuleForAdapter<T extends Item, E extends Adapted<T, object>, N extends NewAdapted<T, object>> = {
    getAll: ComputedRef<E[]>;
    getById: (id: number) => ComputedRef<E | undefined>;
    getOrFailById: (id: number) => Promise<E>;
    generateNew: () => N;
    retrieveById: (id: number) => Promise<void>;
    retrieveAll: () => Promise<void>;
};
