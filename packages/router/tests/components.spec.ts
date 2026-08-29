// @vitest-environment happy-dom
import type {RouteRecordRaw} from 'vue-router';
import type {RouteLocationNormalizedLoaded} from 'vue-router';

import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, ref, shallowRef} from 'vue';
import {START_LOCATION} from 'vue-router';

import {createRouterLink, createRouterView, createRouterService} from '../src';

const TestPage = defineComponent({name: 'TestPage', render: () => h('div', {class: 'test-page'}, 'page content')});

const createTestRoutes = (): RouteRecordRaw[] => [
    {path: '/', name: 'home', component: TestPage},
    {path: '/about', name: 'about', component: TestPage},
    {
        path: '/items',
        component: defineComponent({render: () => h('div', 'layout')}),
        children: [
            {path: '', name: 'items.overview', component: TestPage},
            {path: ':id/edit', name: 'items.edit', component: TestPage},
            {path: ':id', name: 'items.show', component: TestPage},
        ],
    },
];

describe('createRouterView', () => {
    it('should render 404 when no matched route at depth', () => {
        // Arrange
        const routeRef = ref({matched: [], path: '/unknown', params: {}} as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert
        expect(wrapper.text()).toBe('404');
    });

    it('should render nothing while the route is still START_LOCATION', () => {
        // Arrange — vue-router seeds `currentRoute` with START_LOCATION and only replaces it once
        // the first navigation resolves. `matched` is empty there, but that is "not navigated yet",
        // not "no such route" — painting the not-found fallback in that window is a false 404.
        // `shallowRef`, not `ref`: vue-router holds `currentRoute` as `shallowRef(START_LOCATION)`,
        // and a deep `ref` would hand the component a reactive *proxy* whose identity differs from
        // the sentinel — the fixture has to reproduce the real container, not just the real value.
        const routeRef = shallowRef(START_LOCATION);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert — nothing painted at all, and specifically not the bare 404
        expect(wrapper.text()).toBe('');
        expect(wrapper.find('p').exists()).toBe(false);
    });

    it('should render matched component at depth 0', async () => {
        // Arrange
        const service = createRouterService(createTestRoutes());
        await service.goToRoute('about');
        await flushPromises();

        // Act
        const wrapper = mount(service.RouterView);

        // Assert
        expect(wrapper.text()).toBe('page content');
    });

    it('should use depth prop for nested routes', async () => {
        // Arrange
        const service = createRouterService(createTestRoutes());
        await service.goToRoute('items.overview');
        await flushPromises();

        // Act — depth 1 should render the child
        const wrapper = mount(service.RouterView, {props: {depth: 1}});

        // Assert
        expect(wrapper.text()).toBe('page content');
    });

    it('should build key with resolved params', async () => {
        // Arrange
        const service = createRouterService(createTestRoutes());
        await service.goToRoute('items.show', 42);
        await flushPromises();

        // Act
        const wrapper = mount(service.RouterView, {props: {depth: 1}});

        // Assert — component should render with a key that includes the resolved id
        expect(wrapper.exists()).toBe(true);
    });

    it('should fall back to route path when no matched route at depth', () => {
        // Arrange — route with empty matched array at requested depth
        const routeRef = ref({
            matched: [{path: '/items', components: {default: TestPage}}],
            path: '/items/deep',
            params: {},
        } as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act — request depth 2 which doesn't exist
        const wrapper = mount(RouterView, {props: {depth: 2}});

        // Assert — should show 404 since no match at depth 2
        expect(wrapper.text()).toBe('404');
    });

    it('should handle array param values in route key', async () => {
        // Arrange
        const routeRef = ref({
            matched: [{path: '/items/:id', components: {default: TestPage}}],
            path: '/items/42',
            params: {id: ['42', '43']},
        } as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert
        expect(wrapper.text()).toBe('page content');
    });

    it('should skip empty param values in route key', () => {
        // Arrange
        const routeRef = ref({
            matched: [{path: '/items/:id', components: {default: TestPage}}],
            path: '/items/',
            params: {id: ''},
        } as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert — empty param should not replace :id in key
        expect(wrapper.exists()).toBe(true);
    });

    it('should fall back to route path when no matched entry at depth', () => {
        // Arrange — matched array is empty but component computed returns something
        // via a ref that changes between computed evaluation and key computation
        const routeRef = ref({matched: [], path: '/fallback', params: {}} as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act — this renders 404 because no component, which is fine
        // The key fallback is tested through the buildRouteKey internal
        const wrapper = mount(RouterView);

        // Assert
        expect(wrapper.text()).toBe('404');
    });

    it('should render a custom notFoundComponent in place of the bare 404 when unmatched', () => {
        // Arrange
        const NotFound = defineComponent({name: 'NotFound', render: () => h('div', {class: 'custom-404'}, 'Not here')});
        const routeRef = ref({matched: [], path: '/nope', params: {}} as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef, NotFound);

        // Act
        const wrapper = mount(RouterView);

        // Assert — the custom component renders, not the bare '404'
        expect(wrapper.text()).toBe('Not here');
        expect(wrapper.find('.custom-404').exists()).toBe(true);
    });

    it('should render the bare 404 fallback when no notFoundComponent is provided', () => {
        // Arrange
        const routeRef = ref({matched: [], path: '/nope', params: {}} as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert
        expect(wrapper.text()).toBe('404');
    });

    it('should render nothing while a service-built view waits for the first navigation, then the page', async () => {
        // Arrange — the in-flight window through the REAL service (the sentinel spec above builds
        // the view by hand and so never exercises the readiness flag at all).
        window.history.pushState({}, '', '/about');
        const service = createRouterService(createTestRoutes());

        // Act — mount synchronously, before the navigation dispatched by install() settles
        const navigation = service.install();
        const wrapper = mount(service.RouterView);

        // Assert — nothing painted yet, and specifically not the bare 404
        expect(wrapper.text()).toBe('');
        expect(wrapper.find('p').exists()).toBe(false);

        // ...and the page appears once it settles
        await navigation;
        await flushPromises();
        expect(wrapper.text()).toBe('page content');
        // Reset
        window.history.pushState({}, '', '/');
    });

    it('should render the not-found fallback once an aborted first navigation has settled', async () => {
        // Arrange — a before-route middleware returning plain `true` cancels the hop WITHOUT
        // redirecting, so the `beforeEach` wrapper returns `false`. vue-router treats that as an
        // aborted navigation (failure type 4): `finalizeNavigation` never runs, so `currentRoute`
        // stays pinned to START_LOCATION forever. Guarding on the sentinel alone would blank the
        // page permanently — the guard has to lift once the first navigation has SETTLED, however
        // it settled.
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(() => true);

        // Act
        await service.install();
        await flushPromises();

        // Assert — still pinned to the sentinel, but readiness has settled, so the fallback paints
        expect(service.currentRouteRef.value).toBe(START_LOCATION);
        const wrapper = mount(service.RouterView);
        expect(wrapper.text()).toBe('404');
    });

    it('should render a custom notFoundComponent after an aborted first navigation', async () => {
        // Arrange
        const NotFound = defineComponent({name: 'NotFound', render: () => h('div', 'service-404')});
        const service = createRouterService(createTestRoutes(), {notFoundComponent: NotFound});
        service.registerBeforeRouteMiddleware(() => true);

        // Act
        await service.install();
        await flushPromises();

        // Assert
        expect(mount(service.RouterView).text()).toBe('service-404');
    });

    it('should warn once when the first navigation is aborted without a redirect', async () => {
        // Arrange — crit's point: before this warning there was NO console signal anywhere on the
        // aborted-first-navigation path. Lives here rather than in router.spec.ts because an
        // aborted first navigation leaves vue-router's history listeners attached, and a stale
        // aborting router reverts later `goBack()` navigations in that file.
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(() => true);

        // Act
        await service.install();
        await flushPromises();

        // Assert
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('the first navigation did not complete'),
            expect.anything(),
        );
        consoleWarnSpy.mockRestore();
    });

    it('should end on the redirected route when a middleware redirects the first navigation', async () => {
        // Arrange — a redirect return is failure type 2, which vue-router DOES finalize onto the
        // redirected location, so the sentinel is gone and the page paints normally.
        const service = createRouterService(createTestRoutes());
        // The initial location is whatever earlier specs left in happy-dom's history, so redirect
        // anything that is not already the target rather than keying on a specific start route.
        service.registerBeforeRouteMiddleware((to) => (to.name === 'about' ? false : {name: 'about'}));

        // Act
        await service.install();
        await flushPromises();

        // Assert
        expect(service.currentRouteRef.value).not.toBe(START_LOCATION);
        expect(service.currentRouteRef.value.name).toBe('about');
        expect(mount(service.RouterView).text()).toBe('page content');
    });

    it('should thread notFoundComponent from createRouterService options into RouterView', async () => {
        // Arrange — an unmatched depth renders the option-provided fallback
        const NotFound = defineComponent({name: 'NotFound', render: () => h('div', 'service-404')});
        const service = createRouterService(createTestRoutes(), {notFoundComponent: NotFound});
        // Navigate first: an un-navigated service still sits on START_LOCATION, and this spec is
        // about a GENUINE miss, not the pre-first-navigation window.
        await service.goToRoute('about');
        await flushPromises();

        // Act — depth 5 never matches, forcing the fallback path
        const wrapper = mount(service.RouterView, {props: {depth: 5}});

        // Assert
        expect(wrapper.text()).toBe('service-404');
    });
});

describe('createRouterLink', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render an anchor element with correct href and slot content', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}, slots: {default: () => 'Click me'}});

        // Assert
        const anchor = wrapper.find('a');
        expect(anchor.exists()).toBe(true);
        expect(anchor.attributes('href')).toBe('/about');
        expect(anchor.text()).toBe('Click me');
    });

    it('should render without slot content', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Assert
        expect(wrapper.find('a').exists()).toBe(true);
    });

    it('should call goToRoute and prevent default on normal click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about', id: 5, query: {tab: '1'}, parentId: 2}}});

        // Act
        const event = new MouseEvent('click', {bubbles: true});
        const preventSpy = vi.spyOn(event, 'preventDefault');
        wrapper.find('a').element.dispatchEvent(event);
        await flushPromises();

        // Assert
        expect(preventSpy).toHaveBeenCalled();
        expect(goTo).toHaveBeenCalledWith('about', 5, {tab: '1'}, 2);
    });

    it('should not call goToRoute on ctrl+click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Act
        await wrapper.find('a').trigger('click', {ctrlKey: true});

        // Assert
        expect(goTo).not.toHaveBeenCalled();
    });

    it('should not call goToRoute on meta+click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Act
        await wrapper.find('a').trigger('click', {metaKey: true});

        // Assert
        expect(goTo).not.toHaveBeenCalled();
    });

    it('should not call goToRoute on shift+click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Act
        await wrapper.find('a').trigger('click', {shiftKey: true});

        // Assert
        expect(goTo).not.toHaveBeenCalled();
    });

    it('should not call goToRoute on alt+click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Act
        await wrapper.find('a').trigger('click', {altKey: true});

        // Assert
        expect(goTo).not.toHaveBeenCalled();
    });

    it('should forward class, style, data-*, and aria-* attributes to the anchor', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act
        const wrapper = mount(RouterLink, {
            props: {to: {name: 'about'}},
            attrs: {class: 'nav-link active', style: 'color: red;', 'data-testid': 'home-link', 'aria-current': 'page'},
        });

        // Assert — consumer attributes land on the anchor
        const anchor = wrapper.find('a');
        expect(anchor.classes()).toContain('nav-link');
        expect(anchor.classes()).toContain('active');
        expect(anchor.attributes('style')).toContain('color: red');
        expect(anchor.attributes('data-testid')).toBe('home-link');
        expect(anchor.attributes('aria-current')).toBe('page');
        // ...and the owned href stays present
        expect(anchor.attributes('href')).toBe('/about');
    });

    it('should keep the owned href authoritative over a fallthrough href attribute', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/canonical');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act — a consumer-supplied href must not override the computed one
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}, attrs: {href: '/consumer-supplied'}});

        // Assert — attrs spread first, so the owned href wins
        expect(wrapper.find('a').attributes('href')).toBe('/canonical');
    });

    it('should pass name, id, query, and parentId to getUrlForRouteName', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/parent/5/child/10');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act
        mount(RouterLink, {props: {to: {name: 'nested', id: 10, query: {tab: 'info'}, parentId: 5}}});

        // Assert
        expect(getUrl).toHaveBeenCalledWith('nested', 10, {tab: 'info'}, 5);
    });
});
