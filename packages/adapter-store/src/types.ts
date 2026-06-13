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

/**
 * Constraint for the `extend` return type `X`: allows any NEW store-level method,
 * but maps any key that collides with a built-in `StoreModuleForAdapter` method to
 * `never`, so a colliding key fails to satisfy the constraint (compile error).
 * Unlike `Partial<Record<keyof Store, never>>`, this admits arbitrary new keys —
 * it only bans the base ones.
 */
export type ExtendShape<T extends Item, E extends Adapted<T, object>, N extends NewAdapted<T, object>, X> = {
    [K in keyof X]: K extends keyof StoreModuleForAdapter<T, E, N> ? never : X[K];
};

/** Configuration for createAdapterStoreModule. */
export type AdapterStoreConfig<
    T extends Item,
    E extends Adapted<T, object>,
    N extends NewAdapted<T, object>,
    X extends ExtendShape<T, E, N, X> = {},
> = {
    domainName: string;
    adapter: Adapter<T, E, N>;
    httpService: Pick<HttpService, 'getRequest'>;
    storageService: Pick<StorageService, 'get' | 'put'>;
    loadingService: Pick<LoadingService, 'ensureLoadingFinished'>;
    broadcast?: AdapterStoreBroadcast<T>;
    /**
     * Optional capability-injection hook. Runs once at store construction and
     * receives the same internal mutator tier (`AdapterStoreModule<T>`) the
     * `adapter` factory and `broadcast.subscribe` already get. Returns an object
     * of consumer-defined store-level methods that are merged onto the public
     * surface. The internal `setById` stays unexposed — `extend` is the same
     * trust model as `adapter`/`broadcast`, generalized: a sanctioned door for
     * consumer-specific fetches (e.g. fetch-one-by-string-route-binding-key)
     * without app-specific concepts entering the package.
     *
     * Returned keys must be NEW names. A key that collides with a built-in store
     * method (`getAll`, `getById`, `getOrFailById`, `generateNew`, `retrieveById`,
     * `retrieveAll`) **throws `ExtendKeyCollisionError` at construction** — on every
     * call form. It is *additionally* a compile error when the extend return type
     * `X` is supplied or inferred (e.g. as the 4th type argument), which is the form
     * you use to make the extended methods callable. Unlike `broadcast`, whose
     * handlers never reach the public surface, `extend`'s output IS the public
     * surface, so a collision would otherwise silently shadow the built-in.
     */
    extend?: (storeModule: AdapterStoreModule<T>) => X;
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
