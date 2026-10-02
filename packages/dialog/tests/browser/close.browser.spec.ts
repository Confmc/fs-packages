import type {App} from 'vue';

// Real Chromium, because the defect lives in its close watcher: happy-dom fires no cancel on
// a key press and has no user-activation rule. The happy-dom suite pins the service's reaction
// to a close event; this file pins that a real Escape produces one (WR-1913).
import {afterEach, describe, expect, it} from 'vitest';
import {userEvent} from 'vitest/browser';
import {createApp, defineComponent, h, nextTick} from 'vue';

import {createDialogService} from '../../src/index';

const Content = defineComponent({render: () => h('button', 'inside')});

const settle = async () => {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 50));
};

describe('native close in Chromium (WR-1913)', () => {
    let app: App | undefined;
    let host: HTMLElement | undefined;

    const mountService = () => {
        const service = createDialogService();
        host = document.createElement('div');
        document.body.append(host);
        app = createApp(service.DialogContainerComponent);
        app.mount(host);

        return {service, stack: () => host!.querySelectorAll('dialog')};
    };

    afterEach(() => {
        app?.unmount();
        host?.remove();
        document.body.style.overflowY = '';
    });

    it('should close on a single Escape when Escape is allowed', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {});
        await settle();

        // Act
        await userEvent.keyboard('{Escape}');
        await settle();

        // Assert
        expect(stack()).toHaveLength(0);
        expect(document.body.style.overflowY).toBe('auto');
    });

    it('should keep the stack in sync when Chromium force-closes an opted-out dialog', async () => {
        // Arrange
        const {service, stack} = mountService();
        const cancelable: boolean[] = [];
        const record = (event: Event) => cancelable.push(event.cancelable);
        document.addEventListener('cancel', record, true);
        service.open(Content, {}, {closeOnEscape: false});
        await settle();
        const element = stack()[0]!;

        // Act
        await userEvent.keyboard('{Escape}');
        await settle();
        const openAfterFirst = element.open;
        await userEvent.keyboard('{Escape}');
        await settle();
        document.removeEventListener('cancel', record, true);

        // Assert
        expect(openAfterFirst).toBe(true);
        // Without the force-close this spec would pass on a service with no close listener.
        expect(cancelable).toEqual([true, false]);
        expect(stack()).toHaveLength(0);
        expect(document.body.style.overflowY).toBe('auto');
    });

    it('should keep the stack in sync when the element is closed from outside', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {}, {closeOnEscape: false});
        await settle();

        // Act
        stack()[0]!.close();
        await settle();

        // Assert
        expect(stack()).toHaveLength(0);
        expect(document.body.style.overflowY).toBe('auto');
    });
});
