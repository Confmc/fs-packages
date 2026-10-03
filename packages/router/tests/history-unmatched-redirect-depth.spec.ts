// @vitest-environment happy-dom
import type {RouteRecordRaw} from 'vue-router';

import {flushPromises} from '@vue/test-utils';
import {expect, it, vi} from 'vitest';
import {defineComponent, h} from 'vue';

import {createRouterService} from '../src';

// One service per file: `createWebHistory()` registers a `popstate` listener per service that is
// never removed, so a history-driven spec in a shared file drives every leftover service too (see
// `history-navigation.spec.ts`). An unmatched navigation can only be history-driven here, because
// every service entry point navigates by route name.

const TestPage = defineComponent({name: 'TestPage', render: () => h('div', 'page content')});

const createTestRoutes = (): RouteRecordRaw[] => [
    {path: '/', name: 'home', component: TestPage},
    {path: '/about', name: 'about', component: TestPage},
    {path: '/items', name: 'items.overview', component: TestPage},
    {path: '/items/:id', name: 'items.show', component: TestPage},
];

it('should start an unrelated redirect chain from zero after an unmatched URL ends an interrupted one', async () => {
    // Arrange — a redirect whose target's guard throws leaves its chain interrupted with the depth
    // raised; then the browser lands on a URL nothing matches. That hop is terminal, so the next
    // chain must get the full MAX_REDIRECT_DEPTH budget, not what the dead chain left behind.
    window.history.replaceState({}, '', '/');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createRouterService(createTestRoutes());
    await service.install();
    await flushPromises();
    let chainRedirects = 0;
    service.registerBeforeRouteMiddleware((to) => {
        if (to.name === 'about') return {name: 'items.overview'};
        if (to.name === 'items.overview') throw new Error('interrupted');
        if (to.name !== 'items.show' || chainRedirects >= 10) return false;
        chainRedirects += 1;

        return {name: 'items.show', id: chainRedirects + 1};
    });
    await service.goToRoute('about');
    await flushPromises();
    window.history.pushState({}, '', '/nope');
    window.dispatchEvent(new PopStateEvent('popstate', {state: window.history.state}));
    await flushPromises();
    expect(service.currentRouteRef.value.matched).toHaveLength(0);
    consoleErrorSpy.mockClear();

    // Act — exactly MAX_REDIRECT_DEPTH redirects, then a hop that proceeds
    await service.goToRoute('items.show', 1);
    for (let flush = 0; flush < 30; flush += 1) await flushPromises();

    // Assert — the cap did not trip, and the chain reached its destination
    expect(consoleErrorSpy.mock.calls.map((call) => String(call[0]))).toStrictEqual([]);
    expect(service.currentRouteRef.value.path).toBe('/items/11');
});
