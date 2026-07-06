// @vitest-environment happy-dom
import type {RouteRecordRaw} from 'vue-router';

import {flushPromises} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h} from 'vue';

import {createRouterService} from '../src';

const TestLayout = defineComponent({name: 'TestLayout', render: () => h('div', 'layout')});
const TestPage = defineComponent({name: 'TestPage', render: () => h('div', 'page')});

const createTestRoutes = (): RouteRecordRaw[] => [
    {path: '/', name: 'home', component: TestPage},
    {path: '/about', name: 'about', component: TestPage},
    {
        path: '/items',
        component: TestLayout,
        children: [
            {path: '', name: 'items.overview', component: TestPage},
            {path: 'create', name: 'items.create', component: TestPage},
            {path: ':id/edit', name: 'items.edit', component: TestPage},
            {path: ':id', name: 'items.show', component: TestPage},
        ],
    },
];

describe('router service', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createRouterService', () => {
        it('should return all expected properties', () => {
            // Act
            const service = createRouterService(createTestRoutes());

            // Assert
            expect(service).toHaveProperty('install');
            expect(service).toHaveProperty('goToRoute');
            expect(service).toHaveProperty('goToCreatePage');
            expect(service).toHaveProperty('goToOverviewPage');
            expect(service).toHaveProperty('goToEditPage');
            expect(service).toHaveProperty('goToShowPage');
            expect(service).toHaveProperty('getUrlForRouteName');
            expect(service).toHaveProperty('goBack');
            expect(service).toHaveProperty('registerBeforeRouteMiddleware');
            expect(service).toHaveProperty('registerAfterRouteMiddleware');
            expect(service).toHaveProperty('normalizedRouteToSpecificRoute');
            expect(service).toHaveProperty('currentRouteRef');
            expect(service).toHaveProperty('currentRouteQuery');
            expect(service).toHaveProperty('currentRouteId');
            expect(service).toHaveProperty('currentRouteSlug');
            expect(service).toHaveProperty('currentParentId');
            expect(service).toHaveProperty('changeRouteQuery');
            expect(service).toHaveProperty('onPage');
            expect(service).toHaveProperty('onCreatePage');
            expect(service).toHaveProperty('onEditPage');
            expect(service).toHaveProperty('onOverviewPage');
            expect(service).toHaveProperty('onShowPage');
            expect(service).toHaveProperty('routeExists');
            expect(service).toHaveProperty('RouterView');
            expect(service).toHaveProperty('RouterLink');
        });
    });

    describe('install', () => {
        it('should be callable without throwing', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert
            expect(() => service.install()).not.toThrow();
        });

        it('should navigate to current location', async () => {
            // Arrange
            window.history.pushState({}, '', '/about');
            const service = createRouterService(createTestRoutes());
            const afterSpy = vi.fn();
            service.registerAfterRouteMiddleware(afterSpy);

            // Act
            service.install();
            await flushPromises();

            // Assert
            expect(afterSpy).toHaveBeenCalled();
        });

        it('should include search and hash from location', async () => {
            // Arrange
            window.history.pushState({}, '', '/about?q=test#section');
            const service = createRouterService(createTestRoutes());
            const afterSpy = vi.fn();
            service.registerAfterRouteMiddleware(afterSpy);

            // Act
            service.install();
            await flushPromises();

            // Assert
            expect(afterSpy).toHaveBeenCalled();
            expect(service.currentRouteRef.value.query.q).toBe('test');
            expect(service.currentRouteRef.value.hash).toBe('#section');
            // Reset
            window.history.pushState({}, '', '/');
        });

        it('should strip base path from location', async () => {
            // Arrange
            window.history.pushState({}, '', '/app/about');
            const service = createRouterService(createTestRoutes(), {base: '/app'});
            const afterSpy = vi.fn();
            service.registerAfterRouteMiddleware(afterSpy);

            // Act
            service.install();
            await flushPromises();

            // Assert
            expect(afterSpy).toHaveBeenCalled();
            // Reset
            window.history.pushState({}, '', '/');
        });
    });

    describe('goToRoute', () => {
        it('should navigate to named route', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('about');
        });

        it('should navigate with id param', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.goToRoute('items.show', 42);
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('items.show');
            expect(service.currentRouteRef.value.params.id).toBe('42');
        });

        it('should navigate with string id param', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.goToRoute('items.show', 'my-slug');
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.params.id).toBe('my-slug');
        });

        it('should navigate with query params', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.goToRoute('about', undefined, {page: '2'});
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.query.page).toBe('2');
        });

        it('should navigate with parentId override', async () => {
            // Arrange
            const routes: RouteRecordRaw[] = [
                {path: '/', name: 'home', component: TestPage},
                {path: '/parent/:parentId/child/:id', name: 'nested', component: TestPage},
            ];
            const service = createRouterService(routes);

            // Act
            await service.goToRoute('nested', 10, undefined, 5);
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.params.id).toBe('10');
            expect(service.currentRouteRef.value.params.parentId).toBe('5');
        });

        it('should resolve parentId from current route when no override', async () => {
            // Arrange
            const routes: RouteRecordRaw[] = [
                {path: '/', name: 'home', component: TestPage},
                {
                    path: '/parent/:parentId/child',
                    component: TestLayout,
                    children: [
                        {path: '', name: 'child.overview', component: TestPage},
                        {path: ':id/edit', name: 'child.edit', component: TestPage},
                    ],
                },
            ];
            const service = createRouterService(routes);

            // Navigate to nested route first
            await service.goToRoute('child.overview', undefined, undefined, 7);
            await flushPromises();

            // Act — navigate to edit without explicit parentId
            await service.goToRoute('child.edit', 3);
            await flushPromises();

            // Assert — parentId should be inherited from current route
            expect(service.currentRouteRef.value.params.parentId).toBe('7');
        });

        it('should not add params that are not in the target path', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act — navigate to route without :id param, providing an id
            await service.goToRoute('about');
            await flushPromises();

            // Assert — route should not have id param
            expect(service.currentRouteRef.value.params.id).toBeUndefined();
        });

        it('should set parentId to id when navigating to show page from flat context', async () => {
            // Arrange — route with :id but no :parentId
            const service = createRouterService(createTestRoutes());

            // Act — navigate with id to a route that has :id in path
            await service.goToRoute('items.show', 42);
            await flushPromises();

            // Assert — id should be correctly set
            expect(service.currentRouteRef.value.params.id).toBe('42');
        });

        it('should not set query when query is undefined', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert — query should be empty
            expect(Object.keys(service.currentRouteRef.value.query)).toHaveLength(0);
        });
    });

    describe('replaceRoute', () => {
        it('should navigate to named route', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.replaceRoute('about');
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('about');
        });

        it('should navigate with id param', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.replaceRoute('items.show', 42);
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.params.id).toBe('42');
        });

        it('should navigate with query params', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.replaceRoute('about', undefined, {page: '3'});
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.query.page).toBe('3');
        });

        it('should navigate with parentId override', async () => {
            // Arrange
            const routes: RouteRecordRaw[] = [
                {path: '/', name: 'home', component: TestPage},
                {path: '/parent/:parentId/child/:id', name: 'nested', component: TestPage},
            ];
            const service = createRouterService(routes);

            // Act
            await service.replaceRoute('nested', 10, undefined, 5);
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.params.id).toBe('10');
            expect(service.currentRouteRef.value.params.parentId).toBe('5');
        });

        it('should replace the current history entry instead of pushing', async () => {
            // Arrange — build a two-entry history, then replace the top
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('home');
            await flushPromises();
            await service.goToRoute('about');
            await flushPromises();

            // Act
            await service.replaceRoute('items.overview');
            await flushPromises();
            expect(service.currentRouteRef.value.name).toBe('items.overview');

            // Assert — 'about' was replaced (not pushed over), so Back lands on 'home'
            service.goBack();
            await flushPromises();
            expect(service.currentRouteRef.value.name).toBe('home');
        });
    });

    describe('CRUD navigation shortcuts', () => {
        it('goToCreatePage should navigate to .create route', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            await service.goToCreatePage('items');
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('items.create');
        });

        it('goToOverviewPage should navigate to .overview route', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            await service.goToOverviewPage('items');
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('items.overview');
        });

        it('goToEditPage should navigate to .edit route with id', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            await service.goToEditPage('items', 123);
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('items.edit');
            expect(service.currentRouteRef.value.params.id).toBe('123');
        });

        it('goToShowPage should navigate to .show route with id', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            await service.goToShowPage('items', 456);
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('items.show');
            expect(service.currentRouteRef.value.params.id).toBe('456');
        });

        it('goToShowPage should accept query params', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            await service.goToShowPage('items', 789, {tab: 'details'});
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('items.show');
            expect(service.currentRouteRef.value.query.tab).toBe('details');
        });
    });

    describe('getUrlForRouteName', () => {
        it('should return URL for named route', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert
            expect(service.getUrlForRouteName('about')).toBe('/about');
        });

        it('should return URL with id param', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert
            expect(service.getUrlForRouteName('items.show', 42)).toBe('/items/42');
        });

        it('should return URL with query params', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert
            expect(service.getUrlForRouteName('about', undefined, {page: '1'})).toBe('/about?page=1');
        });

        it('should handle route without :id in path when id is provided', () => {
            // Arrange — about has no :id param, tests the getRoutePath → resolveRouteParams path filtering
            const service = createRouterService(createTestRoutes());

            // Act — providing id for a route without :id param
            const url = service.getUrlForRouteName('about', 42);

            // Assert — id should be filtered out since /about has no :id
            expect(url).toBe('/about');
        });

        it('should return URL with parentId', () => {
            // Arrange
            const routes: RouteRecordRaw[] = [
                {path: '/parent/:parentId/child/:id', name: 'nested', component: TestPage},
            ];
            const service = createRouterService(routes);

            // Act & Assert
            expect(service.getUrlForRouteName('nested', 10, undefined, 5)).toBe('/parent/5/child/10');
        });

        it('should throw for unknown route name', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert — vue-router throws when resolving unknown names
            // @ts-expect-error testing runtime behavior with invalid name
            expect(() => service.getUrlForRouteName('nonexistent')).toThrow();
        });
    });

    describe('goBack', () => {
        it('should navigate back in history', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('home');
            await flushPromises();
            await service.goToRoute('about');
            await flushPromises();
            expect(service.currentRouteRef.value.name).toBe('about');

            // Act
            service.goBack();
            await flushPromises();

            // Assert — should have gone back to home
            expect(service.currentRouteRef.value.name).toBe('home');
        });
    });

    describe('normalizedRouteToSpecificRoute', () => {
        it('should find route by name', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            const result = service.normalizedRouteToSpecificRoute({name: 'about', path: '/about'});

            // Assert
            expect(result.name).toBe('about');
        });

        it('should find route by path', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            const result = service.normalizedRouteToSpecificRoute({name: undefined, path: '/about'});

            // Assert
            expect(result.name).toBe('about');
        });

        it('should find child routes', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            const result = service.normalizedRouteToSpecificRoute({name: 'items.create', path: '/items/create'});

            // Assert
            expect(result.name).toBe('items.create');
        });

        it('should throw for unknown route', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert
            expect(() => service.normalizedRouteToSpecificRoute({name: undefined, path: '/unknown'})).toThrow(
                '/unknown is an unknown route',
            );
        });
    });

    describe('registerBeforeRouteMiddleware', () => {
        it('should return unregister function', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            const unregister = service.registerBeforeRouteMiddleware(() => false);

            // Assert
            expect(typeof unregister).toBe('function');
        });

        it('should execute middleware on navigation', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            const middleware = vi.fn<() => boolean>().mockReturnValue(false);
            service.registerBeforeRouteMiddleware(middleware);

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert
            expect(middleware).toHaveBeenCalled();
        });

        it('should block navigation when middleware returns true', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('home');
            await flushPromises();

            const middleware = vi.fn<() => boolean>().mockReturnValue(true);
            service.registerBeforeRouteMiddleware(middleware);
            const pushSpy = vi.spyOn(window.history, 'pushState');
            const replaceSpy = vi.spyOn(window.history, 'replaceState');

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert — a pure boolean cancel neither commits the hop nor kicks off any
            // redirect navigation, so no history mutation happens at all
            expect(service.currentRouteRef.value.name).not.toBe('about');
            expect(service.currentRouteRef.value.name).toBe('home');
            expect(pushSpy).not.toHaveBeenCalled();
            expect(replaceSpy).not.toHaveBeenCalled();
        });

        it('should not execute middleware after unregistering', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            const middleware = vi.fn<() => boolean>().mockReturnValue(false);
            const unregister = service.registerBeforeRouteMiddleware(middleware);

            // Act
            unregister();
            await service.goToRoute('about');
            await flushPromises();

            // Assert
            expect(middleware).not.toHaveBeenCalled();
        });

        it('should handle double unregister without throwing', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            const unregister = service.registerBeforeRouteMiddleware(() => false);

            // Act & Assert
            unregister();
            expect(() => unregister()).not.toThrow();
        });

        it('should not remove other middleware when double-unregistering', async () => {
            // Arrange — register two middleware, unregister first one twice
            const service = createRouterService(createTestRoutes());
            const middlewareA = vi.fn<() => boolean>().mockReturnValue(false);
            const middlewareB = vi.fn<() => boolean>().mockReturnValue(false);
            const unregisterA = service.registerBeforeRouteMiddleware(middlewareA);
            service.registerBeforeRouteMiddleware(middlewareB);

            // Act — unregister A twice (second should be no-op)
            unregisterA();
            unregisterA();
            await service.goToRoute('about');
            await flushPromises();

            // Assert — A should not be called, B should still work
            expect(middlewareA).not.toHaveBeenCalled();
            expect(middlewareB).toHaveBeenCalled();
        });

        it('should use toNormalized as fromNormalized on initial navigation', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            let fromRoute: unknown;
            let toRoute: unknown;
            service.registerBeforeRouteMiddleware((to, from) => {
                toRoute = to;
                fromRoute = from;
                return false;
            });

            // Act — first navigation, from has no name
            await service.goToRoute('about');
            await flushPromises();

            // Assert — from should equal to since initial route has no name
            expect(fromRoute).toBe(toRoute);
        });

        it('should let navigation complete when middleware returns false', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            service.registerBeforeRouteMiddleware(() => false);

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert — a falsy return does not cancel or redirect
            expect(service.currentRouteRef.value.name).toBe('about');
        });

        it('should cancel the hop and navigate to the target when middleware returns a redirect object', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('home');
            await flushPromises();
            service.registerBeforeRouteMiddleware((to) => (to.name === 'about' ? {name: 'items.overview'} : false));

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert — the redirect target committed, not the blocked 'about' hop
            expect(service.currentRouteRef.value.name).toBe('items.overview');
        });

        it('should short-circuit later middleware when a redirect object is returned', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('home');
            await flushPromises();
            service.registerBeforeRouteMiddleware((to) => (to.name === 'about' ? {name: 'items.overview'} : false));
            const observed: string[] = [];
            service.registerBeforeRouteMiddleware((to) => {
                observed.push(String(to.name));
                return false;
            });

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert — the redirecting middleware returns object → chain stops, blocked hop never
            // reaches the follow-on middleware (a dropped `return false` would let it through)
            expect(observed).not.toContain('about');
            expect(service.currentRouteRef.value.name).toBe('items.overview');
        });

        it('should carry id, query, and parentId from the redirect object to the target', async () => {
            // Arrange
            const routes: RouteRecordRaw[] = [
                {path: '/', name: 'home', component: TestPage},
                {path: '/parent/:parentId/child/:id', name: 'nested', component: TestPage},
                {path: '/start', name: 'start', component: TestPage},
            ];
            const service = createRouterService(routes);
            await service.goToRoute('home');
            await flushPromises();
            service.registerBeforeRouteMiddleware((to) =>
                to.name === 'start' ? {name: 'nested', id: 10, query: {tab: 'x'}, parentId: 5} : false,
            );

            // Act
            await service.goToRoute('start');
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('nested');
            expect(service.currentRouteRef.value.params.id).toBe('10');
            expect(service.currentRouteRef.value.params.parentId).toBe('5');
            expect(service.currentRouteRef.value.query.tab).toBe('x');
        });

        it('should use push semantics when the redirect omits replace', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('home');
            await flushPromises();
            service.registerBeforeRouteMiddleware((to) => (to.name === 'about' ? {name: 'items.overview'} : false));
            const pushSpy = vi.spyOn(window.history, 'pushState');

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert — a push navigation calls history.pushState (vue-router also replaceStates to
            // save scroll on every hop, so pushState is the discriminator between push and replace)
            expect(service.currentRouteRef.value.name).toBe('items.overview');
            expect(pushSpy).toHaveBeenCalled();
        });

        it('should use replace semantics when the redirect sets replace:true', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('home');
            await flushPromises();
            service.registerBeforeRouteMiddleware((to) =>
                to.name === 'about' ? {name: 'items.overview', replace: true} : false,
            );
            const pushSpy = vi.spyOn(window.history, 'pushState');
            const replaceSpy = vi.spyOn(window.history, 'replaceState');

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert — a replace navigation replaceStates but never pushStates (the discriminator)
            expect(service.currentRouteRef.value.name).toBe('items.overview');
            expect(replaceSpy).toHaveBeenCalled();
            expect(pushSpy).not.toHaveBeenCalled();
        });

        it('should redirect when an async middleware resolves a redirect object', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('home');
            await flushPromises();
            service.registerBeforeRouteMiddleware(async (to) =>
                to.name === 'about' ? {name: 'items.overview'} : false,
            );

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert — the awaited object return redirects just like a sync one
            expect(service.currentRouteRef.value.name).toBe('items.overview');
        });
    });

    describe('registerAfterRouteMiddleware', () => {
        it('should return unregister function', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            const unregister = service.registerAfterRouteMiddleware(() => {});

            // Assert
            expect(typeof unregister).toBe('function');
        });

        it('should execute middleware after navigation', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            const middleware = vi.fn();
            service.registerAfterRouteMiddleware(middleware);

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert
            expect(middleware).toHaveBeenCalled();
        });

        it('should not execute middleware after unregistering', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            const middleware = vi.fn();
            const unregister = service.registerAfterRouteMiddleware(middleware);

            // Act
            unregister();
            await service.goToRoute('about');
            await flushPromises();

            // Assert
            expect(middleware).not.toHaveBeenCalled();
        });

        it('should handle double unregister without throwing', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            const unregister = service.registerAfterRouteMiddleware(() => {});

            // Act & Assert
            unregister();
            expect(() => unregister()).not.toThrow();
        });

        it('should not remove other middleware when double-unregistering', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            const middlewareA = vi.fn();
            const middlewareB = vi.fn();
            const unregisterA = service.registerAfterRouteMiddleware(middlewareA);
            service.registerAfterRouteMiddleware(middlewareB);

            // Act — unregister A twice (second should be no-op)
            unregisterA();
            unregisterA();
            await service.goToRoute('about');
            await flushPromises();

            // Assert — A should not be called, B should still work
            expect(middlewareA).not.toHaveBeenCalled();
            expect(middlewareB).toHaveBeenCalled();
        });
    });

    describe('afterRouteCallbacks option', () => {
        it('should execute callbacks provided in options', async () => {
            // Arrange
            const callback = vi.fn();
            const service = createRouterService(createTestRoutes(), {afterRouteCallbacks: [callback]});

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert
            expect(callback).toHaveBeenCalled();
        });
    });

    describe('currentRouteRef', () => {
        it('should be a reactive ref', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Assert
            expect(service.currentRouteRef.value).toBeDefined();
        });

        it('should update when route changes', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.goToRoute('about');
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.name).toBe('about');
        });
    });

    describe('currentRouteQuery', () => {
        it('should reflect current query params', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act
            await service.goToRoute('about', undefined, {search: 'test'});
            await flushPromises();

            // Assert
            expect(service.currentRouteQuery.value.search).toBe('test');
        });
    });

    describe('currentRouteId', () => {
        it('should return parsed integer id', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('items.show', 42);
            await flushPromises();

            // Act & Assert
            expect(service.currentRouteId.value).toBe(42);
        });

        it('should throw when route has no id', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('about');
            await flushPromises();

            // Act & Assert
            expect(() => service.currentRouteId.value).toThrow('This route has no route id');
        });
    });

    describe('currentRouteSlug', () => {
        it('should return string slug from id param', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('items.show', 'my-slug');
            await flushPromises();

            // Act & Assert
            expect(service.currentRouteSlug.value).toBe('my-slug');
        });

        it('should throw when route has no id', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('about');
            await flushPromises();

            // Act & Assert
            expect(() => service.currentRouteSlug.value).toThrow('This route has no route id');
        });
    });

    describe('currentParentId', () => {
        it('should return parsed integer parentId', async () => {
            // Arrange
            const routes: RouteRecordRaw[] = [
                {path: '/', name: 'home', component: TestPage},
                {path: '/parent/:parentId/child/:id', name: 'nested', component: TestPage},
            ];
            const service = createRouterService(routes);
            await service.goToRoute('nested', 10, undefined, 5);
            await flushPromises();

            // Act & Assert
            expect(service.currentParentId.value).toBe(5);
        });

        it('should throw when route has no parentId', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('items.show', 1);
            await flushPromises();

            // Act & Assert
            expect(() => service.currentParentId.value).toThrow('This route has no parent id');
        });
    });

    describe('changeRouteQuery', () => {
        it('should update query params on current route', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('about');
            await flushPromises();

            // Act
            service.changeRouteQuery({filter: 'active'});
            await flushPromises();

            // Assert
            expect(service.currentRouteRef.value.query.filter).toBe('active');
        });
    });

    describe('onPage', () => {
        it('should return true when on specified page', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('about');
            await flushPromises();

            // Act & Assert
            expect(service.onPage('about')).toBe(true);
        });

        it('should return false when not on specified page', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('about');
            await flushPromises();

            // Act & Assert
            expect(service.onPage('home')).toBe(false);
        });

        it('should return false when current route has no name', () => {
            // Arrange — initial route before any navigation has no name
            const service = createRouterService(createTestRoutes());

            // Act & Assert — must return false specifically, not just a boolean
            expect(service.onPage('home')).toBe(false);
        });
    });

    describe('CRUD page detection', () => {
        it('onCreatePage should detect create page', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('items.create');
            await flushPromises();

            // Act & Assert
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            expect(service.onCreatePage('items')).toBe(true);
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            expect(service.onCreatePage('other')).toBe(false);
        });

        it('onEditPage should detect edit page', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('items.edit', 1);
            await flushPromises();

            // Act & Assert
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            expect(service.onEditPage('items')).toBe(true);
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            expect(service.onEditPage('other')).toBe(false);
        });

        it('onOverviewPage should detect overview page', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('items.overview');
            await flushPromises();

            // Act & Assert
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            expect(service.onOverviewPage('items')).toBe(true);
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            expect(service.onOverviewPage('other')).toBe(false);
        });

        it('onShowPage should detect show page', async () => {
            // Arrange
            const service = createRouterService(createTestRoutes());
            await service.goToRoute('items.show', 1);
            await flushPromises();

            // Act & Assert
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            expect(service.onShowPage('items')).toBe(true);
            // @ts-expect-error testing runtime behavior with generic RouteRecordRaw[]
            expect(service.onShowPage('other')).toBe(false);
        });
    });

    describe('routeExists', () => {
        it('should return true for existing named route', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert
            expect(service.routeExists({name: 'about'})).toBe(true);
        });

        it('should return false for non-existing route', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert
            expect(service.routeExists({name: 'nonexistent'})).toBe(false);
        });

        it('should return true for existing path', () => {
            // Arrange
            const service = createRouterService(createTestRoutes());

            // Act & Assert
            expect(service.routeExists({path: '/about'})).toBe(true);
        });
    });

    describe('routes without children', () => {
        it('should handle routes that are all top-level', () => {
            // Arrange
            const routes: RouteRecordRaw[] = [
                {path: '/', name: 'home', component: TestPage},
                {path: '/about', name: 'about', component: TestPage},
            ];

            // Act
            const service = createRouterService(routes);

            // Assert
            const result = service.normalizedRouteToSpecificRoute({name: 'about', path: '/about'});
            expect(result.name).toBe('about');
        });
    });
});
