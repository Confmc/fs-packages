// @vitest-environment happy-dom
import type {
    Adapted,
    Adapter,
    AdapterStoreConfig,
    AdapterStoreModule,
    Item,
    NewAdapted,
} from '@script-development/fs-adapter-store';
import type {
    HttpService,
    RequestMiddlewareFunc,
    ResponseErrorMiddlewareFunc,
    ResponseMiddlewareFunc,
    UnregisterMiddleware,
} from '@script-development/fs-http';
import type {LoadingService} from '@script-development/fs-loading';
import type {StorageService} from '@script-development/fs-storage';
import type {AxiosResponse} from 'axios';
import type {Ref} from 'vue';

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ref} from 'vue';

import {createCachedAdapterStoreModule} from '../src/cached-adapter-store';

type TestStorageService = Pick<StorageService, 'get' | 'put'>;
type TestLoadingService = Pick<LoadingService, 'ensureLoadingFinished'>;

interface TestItem extends Item {
    id: number;
    name: string;
}

type TestNew = Omit<TestItem, 'id'>;
type TestAdapted = Adapted<TestItem> & {tag: () => string};
type TestNewAdapted = NewAdapted<TestItem> & {tag: () => string};

function makeTestAdapter(storeModule: AdapterStoreModule<TestItem>): TestNewAdapted;
function makeTestAdapter(storeModule: AdapterStoreModule<TestItem>, resourceGetter: () => TestItem): TestAdapted;
function makeTestAdapter(
    _storeModule: AdapterStoreModule<TestItem>,
    resourceGetter?: () => TestItem,
): TestAdapted | TestNewAdapted {
    if (resourceGetter) {
        const adapted = {} as TestAdapted;
        const source = resourceGetter();
        for (const key of Object.keys(source)) {
            Object.defineProperty(adapted, key, {
                get: () => resourceGetter()[key as keyof TestItem],
                enumerable: true,
                configurable: false,
            });
        }
        Object.defineProperty(adapted, 'mutable', {
            value: ref({...resourceGetter()}) as Ref<TestNew>,
            enumerable: true,
            configurable: false,
            writable: false,
        });
        Object.defineProperty(adapted, 'reset', {value: vi.fn(), enumerable: true});
        Object.defineProperty(adapted, 'update', {value: vi.fn(), enumerable: true});
        Object.defineProperty(adapted, 'patch', {value: vi.fn(), enumerable: true});
        Object.defineProperty(adapted, 'delete', {value: vi.fn(), enumerable: true});
        Object.defineProperty(adapted, 'tag', {value: () => `adapted-${resourceGetter().id}`, enumerable: true});
        return adapted;
    }
    return {
        name: '',
        mutable: ref({name: ''}) as Ref<TestNew>,
        reset: vi.fn(),
        create: vi.fn(),
        tag: () => 'new-adapted',
    } as unknown as TestNewAdapted;
}

type FakeHttpService = HttpService & {
    deliver: (response: AxiosResponse) => void;
    getResponseMiddlewares: () => ResponseMiddlewareFunc[];
};

const makeFakeHttpService = (): FakeHttpService => {
    const responseMiddlewares: ResponseMiddlewareFunc[] = [];
    const requestMiddlewares: RequestMiddlewareFunc[] = [];
    const responseErrorMiddlewares: ResponseErrorMiddlewareFunc[] = [];
    const unregisterFrom = <T>(array: T[], item: T): UnregisterMiddleware => {
        return () => {
            const index = array.indexOf(item);
            if (index > -1) array.splice(index, 1);
        };
    };
    const service: FakeHttpService = {
        getRequest: vi.fn(),
        postRequest: vi.fn(),
        putRequest: vi.fn(),
        patchRequest: vi.fn(),
        deleteRequest: vi.fn(),
        downloadRequest: vi.fn(),
        previewRequest: vi.fn(),
        streamRequest: vi.fn(),
        registerRequestMiddleware: (fn: RequestMiddlewareFunc) => {
            requestMiddlewares.push(fn);
            return unregisterFrom(requestMiddlewares, fn);
        },
        registerResponseMiddleware: (fn: ResponseMiddlewareFunc) => {
            responseMiddlewares.push(fn);
            return unregisterFrom(responseMiddlewares, fn);
        },
        registerResponseErrorMiddleware: (fn: ResponseErrorMiddlewareFunc) => {
            responseErrorMiddlewares.push(fn);
            return unregisterFrom(responseErrorMiddlewares, fn);
        },
        deliver: (response: AxiosResponse) => {
            for (const middleware of responseMiddlewares) middleware(response);
        },
        getResponseMiddlewares: () => responseMiddlewares,
    };
    return service;
};

const makeResponse = (headers: Record<string, string>): AxiosResponse =>
    ({data: null, status: 200, statusText: 'OK', headers, config: {} as unknown}) as unknown as AxiosResponse;

const encodeHashHeader = (map: Record<string, string>): string => `v1.${encodeURIComponent(JSON.stringify(map))}`;

const makeConfig = (
    httpService: FakeHttpService,
    storageService: TestStorageService,
    loadingService: TestLoadingService,
    domainName = 'lanes',
): AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> => ({
    domainName,
    adapter: makeTestAdapter as Adapter<TestItem, TestAdapted, TestNewAdapted>,
    httpService,
    storageService,
    loadingService,
});

const makeStorageService = (initial: Record<string, unknown> = {}): TestStorageService => {
    const store: Record<string, unknown> = {...initial};
    return {
        get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined => {
            if (key in store) return store[key] as T;
            return defaultValue;
        }) as TestStorageService['get'],
        put: vi.fn((key: string, value: unknown) => {
            store[key] = value;
        }),
    };
};

/**
 * Reusable test rig that proves "would skip if currentServerHash === 'X' OR would
 * fetch otherwise". Tests that need a mutation-discriminating no-signal assertion
 * persist 'X' to storage AND seed the malformed response with a payload that
 * would parse to {lanes: 'X'} ONLY if the parser is broken. After delivery, we
 * call retrieveAll and assert whether httpService.getRequest fired.
 *
 * If the parser correctly rejects → currentServerHash null → fetch (1 call).
 * If the parser incorrectly accepts → currentServerHash 'X' === localHash 'X'
 *   → skip (0 calls). The assertion `getRequest.toHaveBeenCalledTimes(1)`
 *   discriminates between these two outcomes.
 */
const setupMalformDiscriminator = (cacheKey = 'lanes') => {
    const httpService = makeFakeHttpService();
    const storageService = makeStorageService({[`${cacheKey}.cache-hash`]: 'X'});
    const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
    vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
    const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
        makeConfig(httpService, storageService, loadingService, cacheKey),
        {cacheKey},
    );
    return {httpService, storageService, store};
};

describe('createCachedAdapterStoreModule', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('public API surface', () => {
        it('returns all StoreModuleForAdapter methods including wrapped retrieveAll', () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );
            expect(typeof store.retrieveAll).toBe('function');
            expect(typeof store.retrieveById).toBe('function');
            expect(typeof store.getOrFailById).toBe('function');
            expect(typeof store.generateNew).toBe('function');
            expect(store.getAll).toBeDefined();
            expect(typeof store.getById).toBe('function');
        });

        it('passes through retrieveById unchanged', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: {id: 5, name: 'Lane 5'},
            } as AxiosResponse<TestItem>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            await store.retrieveById(5);

            expect(httpService.getRequest).toHaveBeenCalledWith('lanes/5');
            expect(store.getById(5).value?.tag()).toBe('adapted-5');
        });
    });

    describe('skip-or-fetch decision', () => {
        it('fetches on cold start (no localHash, no currentServerHash)', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            await store.retrieveAll();

            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
            expect(httpService.getRequest).toHaveBeenCalledWith('lanes');
        });

        it('fetches when localHash is set but currentServerHash is still null (no signal received)', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService({'lanes.cache-hash': 'abc'});
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            await store.retrieveAll();

            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('fetches when localHash is null but currentServerHash is set (cold start with signal)', async () => {
            // Discriminates the `localHash !== null` clause. If that clause were
            // flipped to `true`, then localHash (null) === currentServerHash
            // ('abc') would be false → still fetch. But if the comparison were
            // mutated to use `!==` instead of `===`, this case would skip. So
            // we keep this test as a baseline; the equality-flip is killed
            // elsewhere via the all-null short-circuit assertion.
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'server-only'})}));
            await store.retrieveAll();

            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('fetches when localHash and currentServerHash differ', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService({'lanes.cache-hash': 'old-hash'});
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'new-hash'})}));

            await store.retrieveAll();

            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('skips when localHash and currentServerHash are equal', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService({'lanes.cache-hash': 'matching-hash'});
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'matching-hash'})}));

            await store.retrieveAll();

            expect(httpService.getRequest).not.toHaveBeenCalled();
        });

        it('skips return undefined (not the inflight promise) on a synchronous hit', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService({'lanes.cache-hash': 'h'});
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'h'})}));

            await expect(store.retrieveAll()).resolves.toBeUndefined();
            expect(httpService.getRequest).not.toHaveBeenCalled();
        });
    });

    describe('persist-after-success timing', () => {
        it('persists localHash to storageService only after inner.retrieveAll succeeds', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'server-hash'})}));
            expect(storageService.put).not.toHaveBeenCalledWith('lanes.cache-hash', expect.anything());

            await store.retrieveAll();

            expect(storageService.put).toHaveBeenCalledWith('lanes.cache-hash', 'server-hash');
        });

        it('does NOT persist localHash when inner.retrieveAll rejects', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockRejectedValue(new Error('network died'));
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'server-hash'})}));

            await expect(store.retrieveAll()).rejects.toThrow('network died');

            expect(storageService.put).not.toHaveBeenCalledWith('lanes.cache-hash', expect.anything());
        });

        it('does NOT persist when retrieveAll succeeds but no server hash has been received yet', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            await store.retrieveAll();

            // Discriminating assertion: if `if (serverHashSnapshot !== null)`
            // were mutated to `if (true)`, storageService.put would be called
            // with ('lanes.cache-hash', null). We assert it was NEVER called
            // with that key at all.
            expect(storageService.put).not.toHaveBeenCalledWith('lanes.cache-hash', expect.anything());
            expect(storageService.put).not.toHaveBeenCalledWith('lanes.cache-hash', null);
        });

        it('captures the current server hash at success time, not at receipt time', async () => {
            // If a later response carries a different hash AFTER retrieveAll
            // returns but the snapshot was taken correctly, the persisted hash
            // matches the data that was actually retrieved.
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'A'})}));
            await store.retrieveAll();

            // Persisted hash matches the in-memory currentServerHash at success time.
            expect(storageService.put).toHaveBeenCalledWith('lanes.cache-hash', 'A');
        });
    });

    describe('in-flight deduplication', () => {
        it('invokes inner.retrieveAll exactly once when called twice in rapid succession', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            let resolveGet!: (value: AxiosResponse<TestItem[]>) => void;
            const pending = new Promise<AxiosResponse<TestItem[]>>((resolve) => {
                resolveGet = resolve;
            });
            vi.mocked(httpService.getRequest).mockReturnValue(pending);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            const first = store.retrieveAll();
            const second = store.retrieveAll();

            resolveGet({data: []} as AxiosResponse<TestItem[]>);
            await Promise.all([first, second]);

            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('allows a fresh fetch after the previous inflight call settles', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            await store.retrieveAll();
            await store.retrieveAll();

            expect(httpService.getRequest).toHaveBeenCalledTimes(2);
        });

        it('clears inflight on rejection so subsequent retries can fire', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest)
                .mockRejectedValueOnce(new Error('first failed'))
                .mockResolvedValueOnce({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            await expect(store.retrieveAll()).rejects.toThrow('first failed');
            await store.retrieveAll();

            expect(httpService.getRequest).toHaveBeenCalledTimes(2);
        });
    });

    describe('idempotent middleware registration', () => {
        it('registers exactly one response middleware when multiple wrappers share an httpService', () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};

            createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService, 'lanes'),
                {cacheKey: 'lanes'},
            );
            createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService, 'teams'),
                {cacheKey: 'teams'},
            );

            expect(httpService.getResponseMiddlewares()).toHaveLength(1);
        });

        it('still updates currentServerHash for every registered cacheKey when sharing one middleware', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService({
                'lanes.cache-hash': 'lanes-hash',
                'teams.cache-hash': 'teams-hash',
            });
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};

            const laneStore = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService, 'lanes'),
                {cacheKey: 'lanes'},
            );
            const teamStore = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService, 'teams'),
                {cacheKey: 'teams'},
            );

            httpService.deliver(
                makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'lanes-hash', teams: 'teams-hash'})}),
            );

            await laneStore.retrieveAll();
            await teamStore.retrieveAll();
            expect(httpService.getRequest).not.toHaveBeenCalled();
        });

        it('ignores unregistered cacheKeys without affecting any setter', async () => {
            // Pins the `if (setter)` lookup in the iteration. If that check
            // were flipped to `if (true)`, calling `undefined(hash)` would
            // throw, but the wrapper's try/catch would swallow it. The
            // discriminating assertion: a registered store's currentServerHash
            // must be SET correctly even when an unregistered key arrives
            // alongside it in the same response.
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService({'lanes.cache-hash': 'matching'});
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService, 'lanes'),
                {cacheKey: 'lanes'},
            );
            // 'unknown' is NOT a registered cacheKey on this httpService.
            // The middleware must skip it (setters.get returns undefined) and
            // STILL process 'lanes'.
            httpService.deliver(
                makeResponse({'x-fs-cache-hashes': encodeHashHeader({unknown: 'whatever', lanes: 'matching'})}),
            );

            await store.retrieveAll();

            // Registered key was applied → skip.
            expect(httpService.getRequest).not.toHaveBeenCalled();
        });

        it('registers a fresh middleware for a different httpService instance', () => {
            const httpA = makeFakeHttpService();
            const httpB = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};

            createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpA, storageService, loadingService, 'lanes'),
                {cacheKey: 'lanes'},
            );
            createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpB, storageService, loadingService, 'lanes'),
                {cacheKey: 'lanes'},
            );

            expect(httpA.getResponseMiddlewares()).toHaveLength(1);
            expect(httpB.getResponseMiddlewares()).toHaveLength(1);
        });
    });

    describe('parser branches (mutation-discriminating)', () => {
        // Each test uses setupMalformDiscriminator:
        //   - storage has localHash = 'X'
        //   - retrieveAll's `getRequest` is mocked
        //   - if parser correctly REJECTS the input → currentServerHash null
        //     → fetch (1 call to getRequest)
        //   - if parser INCORRECTLY accepts and sets currentServerHash = 'X'
        //     → skip (0 calls)
        // The assertion `toHaveBeenCalledTimes(1)` therefore pins the rejection
        // behavior of each parser branch.

        it('rejects header value when not a string (e.g., array form)', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            const response = {
                data: null,
                status: 200,
                statusText: 'OK',
                config: {},
                headers: {'x-fs-cache-hashes': ['v1.something'] as unknown as string},
            } as unknown as AxiosResponse;
            httpService.deliver(response);

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects header value missing the v1. prefix', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeURIComponent(JSON.stringify({lanes: 'X'}))}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects header value with wrong version prefix (v2.)', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(
                makeResponse({'x-fs-cache-hashes': `v2.${encodeURIComponent(JSON.stringify({lanes: 'X'}))}`}),
            );

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects malformed URI sequence after the v1. prefix', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': 'v1.%E0%A4%A'}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects malformed JSON after v1. prefix (truncated brace)', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': `v1.${encodeURIComponent('{"lanes":"X"')}`}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects valid JSON that parses to null', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': `v1.${encodeURIComponent('null')}`}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects valid JSON array (not an object)', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': `v1.${encodeURIComponent('["lanes","X"]')}`}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects valid JSON primitive (string/number)', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': `v1.${encodeURIComponent('"X"')}`}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects valid JSON object where a value is not a string', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': `v1.${encodeURIComponent('{"lanes":42}')}`}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects absent x-fs-cache-hashes header entirely', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects absent response.headers object', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            const responseWithoutHeaders = {
                data: null,
                status: 200,
                statusText: 'OK',
                config: {},
            } as unknown as AxiosResponse;
            httpService.deliver(responseWithoutHeaders);

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('rejects valid v1. payload missing the wrapper-registered cacheKey', async () => {
            // Pins the `if (map === null) return` early-return and the
            // setter-key lookup: the map has well-formed keys but NOT 'lanes',
            // so the setter for 'lanes' never fires.
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({teams: 'X', users: 'X'})}));

            await store.retrieveAll();
            expect(httpService.getRequest).toHaveBeenCalledTimes(1);
        });

        it('ACCEPTS valid v1. payload with matching cacheKey and value (positive control)', async () => {
            // Positive control matching the negative tests above. With
            // localHash 'X' persisted and a valid v1. payload {lanes: 'X'},
            // the parser correctly accepts → currentServerHash = 'X' →
            // localHash === currentServerHash → skip → 0 calls. This
            // discriminates "parser rejects everything" mutations from
            // "parser accepts everything" mutations.
            const {httpService, store} = setupMalformDiscriminator();
            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'X'})}));

            await store.retrieveAll();
            expect(httpService.getRequest).not.toHaveBeenCalled();
        });
    });

    describe('exception-safe response middleware (Architecture Lock #10)', () => {
        it('5a: malformed v1 prefix → no throw; consumer caller-resolves cleanly', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            expect(() =>
                httpService.deliver(
                    makeResponse({'x-fs-cache-hashes': `v2.${encodeURIComponent(JSON.stringify({lanes: 'X'}))}`}),
                ),
            ).not.toThrow();

            await expect(store.retrieveAll()).resolves.toBeUndefined();
        });

        it('5b: malformed JSON → no throw', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            expect(() =>
                httpService.deliver(makeResponse({'x-fs-cache-hashes': `v1.${encodeURIComponent('{"lanes":"X"')}`})),
            ).not.toThrow();

            await expect(store.retrieveAll()).resolves.toBeUndefined();
        });

        it('5c: valid JSON but missing the cacheKey → no throw, no state change', async () => {
            const {httpService, store} = setupMalformDiscriminator();
            expect(() =>
                httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({teams: 'X', users: 'X'})})),
            ).not.toThrow();

            await expect(store.retrieveAll()).resolves.toBeUndefined();
        });

        it('5-success: valid v1. header for our cacheKey → currentServerHash updated; localHash persisted after retrieveAll succeeds', async () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({data: []} as AxiosResponse<TestItem[]>);
            const store = createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            httpService.deliver(makeResponse({'x-fs-cache-hashes': encodeHashHeader({lanes: 'fresh-hash'})}));
            expect(storageService.put).not.toHaveBeenCalledWith('lanes.cache-hash', 'fresh-hash');

            await store.retrieveAll();

            expect(storageService.put).toHaveBeenCalledWith('lanes.cache-hash', 'fresh-hash');
        });

        it('parser-null path returns early without entering the iteration (no debug log on no-signal)', () => {
            // Discriminating line 156's `if (map === null) return`. If the
            // guard were flipped, the iteration body would execute against a
            // null map and Object.entries(null) would throw, caught by the
            // outer try/catch and surfaced as a debug log. We assert the
            // debug log was NOT called on a clean no-signal response.
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
            createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            // Deliver a response WITHOUT the cache header — parser returns null.
            httpService.deliver(makeResponse({'content-type': 'application/json'}));

            expect(debugSpy).not.toHaveBeenCalled();
        });

        it('pathological response.headers (getter throws) → middleware catches and does not abort the chain', () => {
            const httpService = makeFakeHttpService();
            const storageService = makeStorageService();
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
            createCachedAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>(
                makeConfig(httpService, storageService, loadingService),
                {cacheKey: 'lanes'},
            );

            const response = {data: null, status: 200, statusText: 'OK', config: {}} as unknown as AxiosResponse;
            Object.defineProperty(response, 'headers', {
                get: () => {
                    throw new Error('headers getter exploded');
                },
            });

            expect(() => httpService.deliver(response)).not.toThrow();
            expect(debugSpy).toHaveBeenCalledWith(
                '[fs-cached-adapter-store] response middleware caught error',
                expect.any(Error),
            );
        });
    });
});
