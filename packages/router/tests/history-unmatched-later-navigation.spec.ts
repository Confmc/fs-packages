// @vitest-environment happy-dom
import type {MockInstance} from 'vitest';
import type {RouteRecordRaw} from 'vue-router';

import {flushPromises, mount} from '@vue/test-utils';
import {expect, it, vi} from 'vitest';
import {defineComponent, h} from 'vue';

import {createRouterService} from '../src';

// One service per file: `createWebHistory()` registers a `popstate` listener per service that is
// never removed, so a history-driven spec in a shared file drives every leftover service too, and
// their console lines land in this spec's spies (see `history-navigation.spec.ts`).

const TestPage = defineComponent({name: 'TestPage', render: () => h('div', 'page content')});

const createTestRoutes = (): RouteRecordRaw[] => [
    {path: '/', name: 'home', component: TestPage},
    {path: '/about', name: 'about', component: TestPage},
];

const fsRouterCalls = (...spies: MockInstance[]): unknown[][] =>
    spies.flatMap((spy) => spy.mock.calls.filter((call) => String(call[0]).startsWith('fs-router:')));

it('should not report a later navigation to an unknown URL through the error channel', async () => {
    // Arrange — after the app is up, a back/forward or raw link onto an unknown URL is a 404 too
    // (WR-1160): it paints the fallback and writes no fs-router line.
    window.history.replaceState({}, '', '/');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createRouterService(createTestRoutes());
    await service.install();
    await flushPromises();
    const wrapper = mount(service.RouterView);
    expect(wrapper.text()).toBe('page content');

    // Act
    window.history.pushState({}, '', '/nope');
    window.dispatchEvent(new PopStateEvent('popstate', {state: window.history.state}));
    await flushPromises();

    // Assert
    expect(service.currentRouteRef.value.matched).toHaveLength(0);
    expect(wrapper.text()).toBe('404');
    expect(fsRouterCalls(consoleWarnSpy, consoleErrorSpy)).toHaveLength(0);
});
