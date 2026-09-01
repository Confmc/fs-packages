import type {LocationQueryRaw, NavigationHookAfter, RouteLocationRaw, RouteRecordRaw} from 'vue-router';

import {computed, shallowRef} from 'vue';
import {createRouter, createWebHistory, isNavigationFailure, NavigationFailureType} from 'vue-router';

import type {BeforeRouteMiddleware, RouteName, RouterService, RouterServiceOptions} from './types';

import {createRouterLink, createRouterView} from './components';
import {CREATE_PAGE_NAME, EDIT_PAGE_NAME, OVERVIEW_PAGE_NAME, SHOW_PAGE_NAME} from './routes';

export const createRouterService = <Routes extends RouteRecordRaw[]>(
    routes: Routes,
    options?: RouterServiceOptions,
): RouterService<Routes> => {
    const router = createRouter({history: createWebHistory(options?.base), routes});

    const flattenedRoutes = routes
        .flatMap((route) => ('children' in route ? route.children : route))
        .filter((route): route is RouteRecordRaw => Boolean(route));

    const getRoutePath = (name: string): string => router.getRoutes().find((route) => route.name === name)?.path ?? '';

    const resolveParentId = (overrideParentId?: number): string | number | undefined => {
        if (overrideParentId) return overrideParentId;

        // CRUD routes use single :parentId — repeatable params (:parentId+) are not supported
        return currentRouteRef.value.params.parentId as string | undefined;
    };

    const resolveRouteParams = (
        name: string,
        id?: number | string,
        overrideParentId?: number,
    ): Record<string, string | number> => {
        const params: Record<string, string | number> = {};
        const targetPath = getRoutePath(name);
        const parentId = resolveParentId(overrideParentId);

        if (parentId) params.parentId = parentId;
        if (id) {
            params.id = id;
            if (!params.parentId || !targetPath.includes(':id')) params.parentId = id;
        }

        return Object.fromEntries(Object.entries(params).filter(([key]) => targetPath.includes(`:${key}`)));
    };

    const buildRouteLocation = (
        name: RouteName<Routes>,
        id?: number | string,
        query?: LocationQueryRaw,
        parentId?: number,
    ): RouteLocationRaw => {
        const route: RouteLocationRaw = {name};
        const params = resolveRouteParams(name as string, id, parentId);

        if (Object.keys(params).length > 0) route.params = params;
        if (query) route.query = query;

        return route;
    };

    // Guards only run on a later microtask, so a consumer that mounts in the same turn as a
    // programmatic navigation would otherwise observe the sentinel route with nothing marked in
    // flight — and paint the fallback. `install()` opens the window for exactly that reason;
    // `goToRoute`/`replaceRoute` are the same entry point reached from consumer code. Opening it
    // again for a redirect this wrapper dispatches is harmless: that runs inside an open window.
    const dispatchNavigation = async (navigate: () => Promise<unknown>): Promise<void> => {
        navigating.value = true;

        try {
            await navigate();
        } catch (error) {
            // `router.push`/`replace` throw SYNCHRONOUSLY for an unknown route name, and reject
            // when a guard throws. Neither outcome leaves a successor in flight and neither reaches
            // `afterEach`, so this is the only place left to end the window. Deliberately NOT a
            // `finally`: the hop this wrapper aborts in order to dispatch a redirect resolves while
            // its successor is still running its guards, and closing there reopens the false-404
            // frame the in-flight window exists to prevent.
            endNavigationWindow(error);

            throw error;
        }
    };

    const goToRoute: RouterService<Routes>['goToRoute'] = (name, id, query, parentId) =>
        dispatchNavigation(() => router.push(buildRouteLocation(name, id, query, parentId)));

    const replaceRoute: RouterService<Routes>['replaceRoute'] = (name, id, query, parentId) =>
        dispatchNavigation(() => router.replace(buildRouteLocation(name, id, query, parentId)));

    const normalizedRouteToSpecificRoute: RouterService<Routes>['normalizedRouteToSpecificRoute'] = (route) => {
        const specificRoute = flattenedRoutes.find(({path, name}) => name === route.name || path === route.path);

        if (!specificRoute) throw new Error(`${route.path} is an unknown route`);

        return specificRoute;
    };

    const getUrlForRouteName: RouterService<Routes>['getUrlForRouteName'] = (name, id, query, parentId) =>
        router.resolve({name, params: resolveRouteParams(name as string, id, parentId), query}).fullPath;

    // Readiness is a fact this service knows, not one it asks vue-router for. fs-router redirects
    // by ABORTING — the wrapper below dispatches its own navigation and returns `false`, which
    // vue-router records as a type-4 abort and reports through `markAsReady(error)`. Keying
    // readiness on `router.isReady()` therefore mislabels every redirecting first hop as a failure
    // (a false warn on every cold load of an auth-guarded app) and leaves `ready === false` with an
    // emptied handler list, so a later `isReady()` never settles.
    //
    // `navigating` is true while a navigation is in flight; `RouterView` paints nothing only while
    // it is true AND the route is still the sentinel. A redirect chain keeps it true throughout, so
    // no frame exists in which the route is START_LOCATION with nothing in flight — that is what
    // would flash the not-found fallback between the abort and the redirected hop finalizing.
    // A service nobody navigates leaves it false, so an un-navigated view keeps the fallback.
    const navigating = shallowRef(false);

    // Set once, by the first navigation that is not a redirect-abort of this wrapper's own making.
    let settled = false;
    let markSettled!: () => void;
    // Resolves — never rejects — on both success and genuine failure. A rejecting readiness promise
    // on a cancelled first hop is what hung consumers before.
    const readyPromise = new Promise<void>((resolve) => {
        markSettled = resolve;
    });

    // The one place the in-flight window ends. vue-router has THREE terminal paths and `afterEach`
    // is only one of them: a guard that throws is routed through `triggerError`, which skips
    // `afterEach` entirely, and `router.push({name})` throws synchronously for an unknown name.
    // Closing from a single path is what left a thrown guard with a permanently blank view and an
    // `isReady()` that never settled. Idempotent by construction — every terminal path may call it,
    // and a second call is a no-op beyond re-clearing an already-clear flag.
    const endNavigationWindow = (failure?: unknown): void => {
        navigating.value = false;

        if (settled) return;

        settled = true;
        // Only a GENUINE failure of the first navigation is worth a console signal — a redirect
        // never reaches here, so an auth guard no longer warns on cold load.
        if (failure) console.warn('fs-router: the first navigation did not complete, rendering not-found', failure);

        markSettled();
    };

    // `to.fullPath` of every hop this wrapper aborted in order to dispatch a redirect. Keyed rather
    // than latched: vue-router runs the redirected hop's `beforeEach` BEFORE the aborted hop's
    // `afterEach` (observed: before:home, before:about, after:home:fail4, after:about:ok), so a
    // latch cleared on the next `beforeEach` entry would already be gone when `afterEach` reads it.
    // Every aborted hop always produces exactly one `afterEach`, so the set always drains — which
    // is also why membership alone is the whole test: no entry can outlive the hop that added it,
    // so a later navigation can never match a stale path.
    const redirectAbortedPaths = new Set<string>();

    // Bounds the middleware redirect-return chain. Each returned `MiddlewareRedirect` cancels the
    // pending hop and dispatches a fresh navigation, which re-enters `beforeEach` and re-runs the
    // whole chain — so two middleware that redirect into each other's guarded routes (a
    // misconfigured login↔dashboard guard) would recurse without bound. `redirectDepth` counts
    // consecutive redirects and is reset to 0 the moment a chain terminates — a navigation is
    // allowed to proceed, or a middleware cancels without redirecting — so the cap only ever trips
    // on a genuine loop, never on unrelated back-to-back navigations. Mirrors vue-router's own
    // internal max-redirect ceiling.
    const MAX_REDIRECT_DEPTH = 10;
    let redirectDepth = 0;

    const beforeRouteMiddleware: BeforeRouteMiddleware<Routes>[] = [];
    router.beforeEach(async (to, from) => {
        navigating.value = true;

        const toNormalized = normalizedRouteToSpecificRoute(to);
        const fromNormalized = from.name ? normalizedRouteToSpecificRoute(from) : toNormalized;

        let cancelled = false;
        for (const middleware of beforeRouteMiddleware) {
            const result = await middleware(toNormalized, fromNormalized);
            if (result === false) continue;

            // A truthy object return cancels the pending hop and navigates to the target in one
            // step — replace when `replace: true`, push otherwise. A boolean `true` just cancels.
            if (result !== true) {
                if (redirectDepth >= MAX_REDIRECT_DEPTH) {
                    redirectDepth = 0;
                    console.error(
                        `fs-router: middleware redirect chain exceeded ${MAX_REDIRECT_DEPTH} hops — aborting to break a redirect loop`,
                    );

                    return false;
                }

                redirectDepth += 1;
                // Fire-and-forget: the dispatch resolves once the redirect navigation settles.
                // `router.push`/`replace` resolve (not reject) for NavigationDuplicated/Aborted, but
                // they DO reject when a guard or lazy component further down the redirected chain
                // throws — attach a reporter so that surfaces instead of an unhandled rejection.
                const dispatch = result.replace ? replaceRoute : goToRoute;
                void dispatch(result.name, result.id, result.query, result.parentId).catch((error: unknown) => {
                    console.error('fs-router: middleware redirect navigation failed', error);
                });

                // The chain continues in the dispatched navigation — do NOT reset the depth here,
                // and do NOT let this hop's abort end the in-flight window or reach the console:
                // the redirect is a success in progress, not a failed navigation.
                redirectAbortedPaths.add(to.fullPath);

                return false;
            }

            // Plain `true` cancels the hop without redirecting; the chain terminates.
            cancelled = true;
            break;
        }

        // The chain terminated without dispatching a redirect (a `true` cancel or a clean proceed),
        // so reset the depth for the next, unrelated navigation.
        redirectDepth = 0;

        return cancelled ? false : undefined;
    });

    const afterRouteMiddleware: NavigationHookAfter[] = [...(options?.afterRouteCallbacks ?? [])];
    router.afterEach((to, from, failure) => {
        // Two hops end nothing, because in both a SUCCESSOR is already in flight and will run its
        // own `afterEach`: one this wrapper aborted in order to dispatch a redirect, and one a
        // later navigation overtook — vue-router marks the latter `cancelled` (type 8), which can
        // only happen because another navigation started. Ending the window on either would drop
        // the in-flight flag while `currentRoute` is still the sentinel (the false-404 frame this
        // release exists to close) and warn about a cold start that is in fact proceeding.
        const supersededByOwnRedirect = redirectAbortedPaths.delete(to.fullPath);
        const supersededByLaterNavigation = isNavigationFailure(failure, NavigationFailureType.cancelled);
        if (!supersededByOwnRedirect && !supersededByLaterNavigation) endNavigationWindow(failure);

        for (const middleware of afterRouteMiddleware) middleware(to, from, failure);
    });

    // The terminal path `afterEach` never sees. A thrown guard — a consumer middleware, or this
    // wrapper's own `normalizedRouteToSpecificRoute` on any unmatched path, which is every cold
    // load of an unknown URL — reaches `triggerError` and nothing else. It is a genuine failure of
    // the navigation, so it ends the window exactly as an abort does: the not-found fallback paints
    // instead of a blank page, and readiness settles instead of hanging. Registering a handler at
    // all also retires vue-router's own `[VUE_ROUTER_R0010]` "register an error handler" warning.
    router.onError((error) => endNavigationWindow(error));

    const currentRouteRef = router.currentRoute;

    const onPage: RouterService<Routes>['onPage'] = (pageName) => {
        const currentName = currentRouteRef.value.name;
        if (!currentName) return false;

        return currentName.toString() === pageName;
    };

    const fullPath =
        (options?.base ? location.pathname.replace(options.base, '') : location.pathname) +
        location.search +
        location.hash;

    return {
        install: () => {
            // Synchronously, before the push: guards only run on a later microtask, so a consumer
            // that mounts immediately after calling `install()` would otherwise see a window with
            // the sentinel route and nothing marked in flight — and paint the fallback.
            navigating.value = true;

            return router.push(fullPath);
        },
        isReady: () => readyPromise,
        normalizedRouteToSpecificRoute,

        goToRoute,
        replaceRoute,
        goToCreatePage: (name) => goToRoute(`${name}${CREATE_PAGE_NAME}`),
        goToOverviewPage: (name) => goToRoute(`${name}${OVERVIEW_PAGE_NAME}`),
        goToEditPage: (name, id) => goToRoute(`${name}${EDIT_PAGE_NAME}`, id),
        goToShowPage: (name, id, query) => goToRoute(`${name}${SHOW_PAGE_NAME}`, id, query),

        getUrlForRouteName,
        goBack: () => router.back(),

        registerBeforeRouteMiddleware: (middleware) => {
            beforeRouteMiddleware.push(middleware);

            return () => {
                const index = beforeRouteMiddleware.indexOf(middleware);
                if (index > -1) beforeRouteMiddleware.splice(index, 1);
            };
        },
        registerAfterRouteMiddleware: (middleware) => {
            afterRouteMiddleware.push(middleware);

            return () => {
                const index = afterRouteMiddleware.indexOf(middleware);
                if (index > -1) afterRouteMiddleware.splice(index, 1);
            };
        },

        currentRouteRef,
        currentRouteQuery: computed(() => currentRouteRef.value.query),
        currentRouteId: computed(() => {
            const currentRouteId = currentRouteRef.value.params.id;
            if (!currentRouteId) throw new Error('This route has no route id');

            return Number.parseInt(currentRouteId.toString(), 10);
        }),
        currentRouteSlug: computed(() => {
            // CRUD routes use single :id — repeatable params (:id+) are not supported
            const slug = currentRouteRef.value.params.id as string | undefined;
            if (!slug) throw new Error('This route has no route id');

            return slug;
        }),
        currentParentId: computed(() => {
            const currentParentId = currentRouteRef.value.params.parentId;
            if (!currentParentId) throw new Error('This route has no parent id');

            return Number.parseInt(currentParentId.toString(), 10);
        }),
        changeRouteQuery: (query) => void router.push({query}),

        onPage,
        onCreatePage: (baseRouteName) => onPage(baseRouteName + CREATE_PAGE_NAME),
        onEditPage: (baseRouteName) => onPage(baseRouteName + EDIT_PAGE_NAME),
        onOverviewPage: (baseRouteName) => onPage(baseRouteName + OVERVIEW_PAGE_NAME),
        onShowPage: (baseRouteName) => onPage(baseRouteName + SHOW_PAGE_NAME),
        routeExists: (to) => {
            try {
                return !!router.resolve(to).name;
            } catch {
                return false;
            }
        },

        RouterView: createRouterView(currentRouteRef, options?.notFoundComponent, navigating),
        RouterLink: createRouterLink(getUrlForRouteName, goToRoute),
    };
};
