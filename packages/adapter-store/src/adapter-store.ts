import type {ComputedRef, Ref} from 'vue';

import {computed, ref} from 'vue';

import type {Adapted, AdapterStoreConfig, AdapterStoreModule, Item, NewAdapted, StoreModuleForAdapter} from './types';

import {BroadcastPayloadError, EntryNotFoundError} from './errors';

export const createAdapterStoreModule = <
    T extends Item,
    E extends Adapted<T, object> = Adapted<T>,
    N extends NewAdapted<T, object> = NewAdapted<T>,
    X extends object = {},
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
    // `setById`/`deleteById` never leave the factory. The id must be an integer, not
    // merely `typeof === 'number'` — `NaN` / `Infinity` / a non-integer float would
    // pass a typeof check yet corrupt the keyspace (`state.value[NaN]` stringifies to
    // `"NaN"`, and `deleteById` could never match it since `Number("NaN") !== NaN`).
    broadcast?.subscribe({
        onUpdate: (item) => {
            if (typeof item !== 'object' || item === null || !Number.isInteger((item as {id?: unknown}).id)) {
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

    const extended = extend ? extend(storeModule) : ({} as X);
    return {...base, ...extended};
};
