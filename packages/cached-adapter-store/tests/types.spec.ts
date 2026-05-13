import type {
    Adapted,
    AdapterStoreConfig,
    Item,
    NewAdapted,
    StoreModuleForAdapter,
} from '@script-development/fs-adapter-store';

import {describe, expectTypeOf, it} from 'vitest';

import type {CachedAdapterStoreOptions} from '../src/types';

import {createCachedAdapterStoreModule} from '../src/cached-adapter-store';

/**
 * Type-only assertions. These prove the wrapper's drop-in-compatibility
 * invariant: a value produced by `createCachedAdapterStoreModule<A, B, C>`
 * is assignable to `StoreModuleForAdapter<A, B, C>`. If this ever breaks
 * (e.g., the wrapper accidentally widens or narrows the return type),
 * vitest's `expectTypeOf` will surface the regression at typecheck time
 * via the spec file's tsc pass.
 */
interface DemoItem extends Item {
    id: number;
    name: string;
}

type DemoAdapted = Adapted<DemoItem>;
type DemoNewAdapted = NewAdapted<DemoItem>;

describe('createCachedAdapterStoreModule type surface', () => {
    it('returns StoreModuleForAdapter<T, E, N>', () => {
        expectTypeOf(createCachedAdapterStoreModule<DemoItem, DemoAdapted, DemoNewAdapted>)
            .parameter(0)
            .toEqualTypeOf<AdapterStoreConfig<DemoItem, DemoAdapted, DemoNewAdapted>>();
        expectTypeOf(createCachedAdapterStoreModule<DemoItem, DemoAdapted, DemoNewAdapted>)
            .parameter(1)
            .toEqualTypeOf<CachedAdapterStoreOptions>();
        expectTypeOf(createCachedAdapterStoreModule<DemoItem, DemoAdapted, DemoNewAdapted>).returns.toEqualTypeOf<
            StoreModuleForAdapter<DemoItem, DemoAdapted, DemoNewAdapted>
        >();
    });

    it('CachedAdapterStoreOptions has only cacheKey (no staleAfterMs, etc.)', () => {
        expectTypeOf<CachedAdapterStoreOptions>().toEqualTypeOf<{cacheKey: string}>();
    });
});
