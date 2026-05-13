import type {
    Adapted,
    Adapter,
    AdapterStoreConfig,
    Item,
    NewAdapted,
    StoreModuleForAdapter,
} from '@script-development/fs-adapter-store';
import type {HttpService} from '@script-development/fs-http';
import type {LoadingService} from '@script-development/fs-loading';
import type {StorageService} from '@script-development/fs-storage';

import {describe, expectTypeOf, it} from 'vitest';

import type {CachedAdapterStoreOptions, CachedStoreModuleForAdapter} from '../src/types';

import {createCachedAdapterStoreModule} from '../src/cached-adapter-store';

/**
 * Type-only assertions. These prove the wrapper's intentionally NARROWER
 * surface invariant: a value produced by `createCachedAdapterStoreModule<A, B, C>`
 * is assignable to `CachedStoreModuleForAdapter<A, B, C>` AND is NOT assignable
 * to `StoreModuleForAdapter<A, B, C>`. If the wrapper ever accidentally widens
 * its return shape to include `retrieveAll` / `retrieveById` again, the
 * `@ts-expect-error` line below will go from "expected error" to "no error" and
 * fail typecheck.
 */
interface DemoItem extends Item {
    id: number;
    name: string;
}

type DemoAdapted = Adapted<DemoItem>;
type DemoNewAdapted = NewAdapted<DemoItem>;

describe('createCachedAdapterStoreModule type surface', () => {
    it('returns CachedStoreModuleForAdapter<T, E, N>', () => {
        expectTypeOf(createCachedAdapterStoreModule<DemoItem, DemoAdapted, DemoNewAdapted>)
            .parameter(0)
            .toEqualTypeOf<AdapterStoreConfig<DemoItem, DemoAdapted, DemoNewAdapted>>();
        expectTypeOf(createCachedAdapterStoreModule<DemoItem, DemoAdapted, DemoNewAdapted>)
            .parameter(1)
            .toEqualTypeOf<CachedAdapterStoreOptions>();
        expectTypeOf(createCachedAdapterStoreModule<DemoItem, DemoAdapted, DemoNewAdapted>).returns.toEqualTypeOf<
            CachedStoreModuleForAdapter<DemoItem, DemoAdapted, DemoNewAdapted>
        >();
    });

    it('CachedAdapterStoreOptions has only cacheKey (no staleAfterMs, etc.)', () => {
        expectTypeOf<CachedAdapterStoreOptions>().toEqualTypeOf<{cacheKey: string}>();
    });

    it('return type is NOT assignable to StoreModuleForAdapter<T, E, N>', () => {
        // The narrower CachedStoreModuleForAdapter intentionally lacks
        // `retrieveAll` and `retrieveById`. Assigning to the wider type must
        // fail typecheck. The `@ts-expect-error` directly below is the
        // assertion — if a future refactor accidentally re-adds those keys to
        // the public return, this directive becomes unused and tsc errors out
        // ("Unused '@ts-expect-error' directive"), which fails CI.
        //
        // The body is guarded by `if (false)` so that the type-level
        // assignment is type-checked but the runtime call into
        // createCachedAdapterStoreModule (which would invoke the real
        // adapter-store factory against an empty config) never executes.
        if (false as boolean) {
            const config = {} as AdapterStoreConfig<DemoItem, DemoAdapted, DemoNewAdapted>;
            const options = {cacheKey: 'x'} as CachedAdapterStoreOptions;
            // @ts-expect-error — narrower than StoreModuleForAdapter (no retrieveAll / retrieveById)
            const _wider: StoreModuleForAdapter<DemoItem, DemoAdapted, DemoNewAdapted> = createCachedAdapterStoreModule<
                DemoItem,
                DemoAdapted,
                DemoNewAdapted
            >(config, options);
            void _wider;
        }
        // Reference the surrounding library types so this spec file's import
        // graph remains representative of a real consumer (and the type test
        // doesn't get tree-shaken into nothing by an over-zealous linter
        // tomorrow). These are pure type references — no runtime cost.
        type _UnusedAdapter = Adapter<DemoItem, DemoAdapted, DemoNewAdapted>;
        type _UnusedHttp = HttpService;
        type _UnusedLoading = LoadingService;
        type _UnusedStorage = StorageService;
        void (null as unknown as _UnusedAdapter);
        void (null as unknown as _UnusedHttp);
        void (null as unknown as _UnusedLoading);
        void (null as unknown as _UnusedStorage);
    });
});
