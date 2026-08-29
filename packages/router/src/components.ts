import type {Ref} from 'vue';
import type {LocationQueryRaw, RouteComponent, RouteLocationNormalizedLoaded, RouteRecordRaw} from 'vue-router';

import {computed, defineComponent, h} from 'vue';
import {START_LOCATION} from 'vue-router';

import type {RouteName, RouterLinkComponent, RouterService, RouterViewComponent} from './types';

const buildRouteKey = (route: RouteLocationNormalizedLoaded, depth: number): string => {
    let key = route.matched[depth].path;
    for (const [paramName, paramValue] of Object.entries(route.params)) {
        const value = Array.isArray(paramValue) ? paramValue[0] : paramValue;
        if (value) key = key.replace(`:${paramName}`, value);
    }

    return key;
};

/**
 * `readyRef` reports whether the first navigation has SETTLED — resolved, redirected or failed.
 * It is optional so the existing two-argument signature keeps working, but a consumer who
 * hand-builds a view without it gets the sentinel-only guard: correct for the transient window,
 * and a permanently blank page if their first navigation is aborted without a redirect.
 * `createRouterService` always supplies it.
 */
export const createRouterView = (
    currentRouteRef: Ref<RouteLocationNormalizedLoaded>,
    notFoundComponent?: RouteComponent,
    readyRef?: Ref<boolean>,
): RouterViewComponent =>
    defineComponent<{depth?: number}>(
        ({depth = 0}) => {
            const component = computed(() => {
                const matched = currentRouteRef.value.matched[depth];
                return matched?.components?.default ?? null;
            });

            return () => {
                // vue-router seeds `currentRoute` with START_LOCATION and only replaces it once the
                // first navigation resolves. Its `matched` is empty, but that means "not navigated
                // yet", not "no such route" — painting the not-found fallback there is a false 404
                // on every cold load. Identity against the exported sentinel, never a
                // `matched.length === 0` heuristic, which also describes a genuine miss.
                //
                // The sentinel alone cannot say WHY the route is still START_LOCATION: an aborted
                // first navigation (a middleware cancelling without redirecting) leaves it pinned
                // there forever, and blanking on that would never paint anything. Readiness
                // settles either way, so paint nothing only while the first navigation is still
                // in flight; once it has settled, a pinned route falls through to not-found.
                if (!readyRef?.value && currentRouteRef.value === START_LOCATION) return null;

                if (!component.value) return notFoundComponent ? h(notFoundComponent) : h('p', ['404']);

                return h(component.value, {key: buildRouteKey(currentRouteRef.value, depth)});
            };
        },
        // https://vuejs.org/api/general.html#function-signature
        // manual runtime props declaration is currently still needed
        {props: ['depth']},
    );

export const createRouterLink = <Routes extends RouteRecordRaw[]>(
    getUrlForRouteName: RouterService<Routes>['getUrlForRouteName'],
    goToRoute: RouterService<Routes>['goToRoute'],
): RouterLinkComponent<Routes> =>
    defineComponent<{to: {name: RouteName<Routes>; query?: LocationQueryRaw; id?: number | string; parentId?: number}}>(
        (props, {slots, attrs}) =>
            () =>
                h(
                    'a',
                    {
                        // Merge consumer-set fallthrough attrs (class/style/data-*/aria-*) onto the
                        // anchor; spread first so the owned href/onClick stay authoritative.
                        ...attrs,
                        href: getUrlForRouteName(props.to.name, props.to.id, props.to.query, props.to.parentId),
                        onClick: (event: MouseEvent) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

                            event.preventDefault();
                            goToRoute(props.to.name, props.to.id, props.to.query, props.to.parentId);
                        },
                    },
                    slots.default?.(),
                ),
        // https://vuejs.org/api/general.html#function-signature
        // manual runtime props declaration is currently still needed
        {props: ['to'], inheritAttrs: false},
    );
