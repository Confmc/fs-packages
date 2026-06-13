export {createAdapterStoreModule} from './adapter-store';
export {resourceAdapter} from './resource-adapter';
export {
    BroadcastPayloadError,
    EntryNotFoundError,
    ExtendKeyCollisionError,
    ExtendPayloadError,
    MissingResponseDataError,
} from './errors';
export type {
    Item,
    DefaultNew,
    Adapted,
    NewAdapted,
    Adapter,
    AdapterStoreModule,
    AdapterStoreConfig,
    AdapterStoreBroadcast,
    StoreModuleForAdapter,
} from './types';
