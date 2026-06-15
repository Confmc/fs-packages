import type {ComputedRef, Ref} from 'vue';

import {computed, ref} from 'vue';

import type {
    Adapted,
    AdapterStoreConfig,
    AdapterStoreModule,
    ExtendShape,
    Item,
    NewAdapted,
    StoreModuleForAdapter,
} from './types';

import {BroadcastPayloadError, EntryNotFoundError, ExtendKeyCollisionError, ExtendPayloadError} from './errors';

export const createAdapterStoreModule = <
    T extends Item,
    E extends Adapted<T, object> = Adapted<T>,
    N extends NewAdapted<T, object> = NewAdapted<T>,
    X extends ExtendShape<T, E, N, X> = {},
>(
    config: AdapterStoreConfig<T, E, N, X>,
): StoreModuleForAdapter<T, E, N> & X => {
    const {domainName, adapter, httpService, storageService, loadingService, broadcast, extend} = config;

    const storedItems = storageService.get<{[id: number]: T}>(domainName, {});
    const frozenStoredItems = Object.fromEntries(
        Object.entries(storedItems).map(([id, item]) => [id, Object.freeze(item)]),
    ) as {[id: number]: Readonly<T>};

    const state: Ref<{[id: number]: Readonly<T>}> = ref(frozenStoredItems);

    const adaptedCache = new Map<number, E>();
    const getByIdComputedCache = new Map<number, ComputedRef<E | undefined>>();

    const getAdapted = (item: Readonly<T>): E => {
        const cached = adaptedCache.get(item.id);
        if (cached) {
            return cached;
        }
        const adapted = adapter(storeModule, () => state.value[item.id] as T);
        adaptedCache.set(item.id, adapted);
        return adapted;
    };

    // A value is storable only if it is an object with an integer `id`. The id must be
    // an integer, not merely `typeof === 'number'` — `NaN` / `Infinity` / a non-integer
    // float pass a typeof check yet corrupt the keyspace (`state.value[NaN]` stringifies
    // to `"NaN"`, and `deleteById` could never match it since `Number("NaN") !== NaN`).
    // Shared by every validating boundary that hands a mutator to consumer-authored code
    // (`broadcast`, `extend`), so the raw mutators below never leave the factory.
    const isStorableItem = (item: unknown): item is T =>
        typeof item === 'object' && item !== null && Number.isInteger((item as {id?: unknown}).id);

    const setById = (item: T): void => {
        state.value = {...state.value, [item.id]: Object.freeze(item)};
        storageService.put(domainName, state.value);
        adaptedCache.delete(item.id);
    };

    const deleteById = (id: number): void => {
        state.value = Object.fromEntries(Object.entries(state.value).filter(([key]) => Number(key) !== id)) as {
            [id: number]: Readonly<T>;
        };
        storageService.put(domainName, state.value);
        adaptedCache.delete(id);
        getByIdComputedCache.delete(id);
    };

    const storeModule: AdapterStoreModule<T> = {setById, deleteById};

    // Broadcast payloads arrive from an external channel (e.g. a WebSocket) and are
    // applied to the store without an HTTP round-trip — that non-HTTP path is the
    // feature. The trade-off is that unvalidated data would land straight in frozen
    // state, so a malformed payload would silently corrupt the store. The handlers
    // passed to the consumer's `subscribe` are therefore validating wrappers, not the
    // bare internal mutators: they reject a bad payload up front, and the raw
    // `setById`/`deleteById` never leave the factory.
    broadcast?.subscribe({
        onUpdate: (item) => {
            if (!isStorableItem(item)) {
                throw new BroadcastPayloadError(domainName, 'onUpdate', item);
            }
            setById(item);
        },
        onDelete: (id) => {
            if (!Number.isInteger(id)) {
                throw new BroadcastPayloadError(domainName, 'onDelete', id);
            }
            deleteById(id);
        },
    });

    const getById = (id: number): ComputedRef<E | undefined> => {
        const cached = getByIdComputedCache.get(id);
        if (cached) {
            return cached;
        }
        const computedRef = computed(() => (state.value[id] ? getAdapted(state.value[id]) : undefined));
        getByIdComputedCache.set(id, computedRef);
        return computedRef;
    };

    const base: StoreModuleForAdapter<T, E, N> = {
        getAll: computed(() => Object.values(state.value).map((item) => getAdapted(item))),
        getById,
        getOrFailById: async (id: number) => {
            await loadingService.ensureLoadingFinished();
            const item = getById(id).value;
            if (!item) throw new EntryNotFoundError(domainName, id);
            return item;
        },
        generateNew: () => adapter(storeModule),
        retrieveById: async (id: number) => {
            const {data} = await httpService.getRequest<T>(`${domainName}/${id}`);
            setById(data);
        },
        retrieveAll: async () => {
            const {data} = await httpService.getRequest<T[]>(domainName);
            state.value = data.reduce<{[id: number]: Readonly<T>}>((acc, item) => {
                acc[item.id] = Object.freeze(item);
                return acc;
            }, {});
            storageService.put(domainName, state.value);
            adaptedCache.clear();
            getByIdComputedCache.clear();
        },
    };

    // `extend` runs at construction and its return value becomes part of the public
    // store surface, so — like `broadcast` — it gets validating wrappers, not the raw
    // mutators. A consumer's extend method (e.g. `retrieveBySlug`) calls `setById` with
    // an HTTP-fetched item; the wrapper rejects a malformed payload (throwing
    // `ExtendPayloadError`) rather than letting it corrupt the keyspace. The raw
    // `setById`/`deleteById` never leave the factory through this door.
    const extendStoreModule: AdapterStoreModule<T> = {
        setById: (item) => {
            if (!isStorableItem(item)) {
                throw new ExtendPayloadError(domainName, 'setById', item);
            }
            setById(item);
        },
        deleteById: (id) => {
            if (!Number.isInteger(id)) {
                throw new ExtendPayloadError(domainName, 'deleteById', id);
            }
            deleteById(id);
        },
    };

    const extended = extend ? extend(extendStoreModule) : ({} as X);
    const baseKeys = new Set(Object.keys(base));
    for (const key of Object.keys(extended)) {
        if (baseKeys.has(key)) {
            throw new ExtendKeyCollisionError(key);
        }
    }
    return {...base, ...extended};
};
