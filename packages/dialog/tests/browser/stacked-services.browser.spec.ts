import type {App} from 'vue';

// Its own file, so its own page: after earlier key presses on a page Chromium stops grouping
// dialogs, and these specs would pass there without the rule they pin (WR-1913).
import {afterEach, describe, expect, it} from 'vitest';
import {userEvent} from 'vitest/browser';
import {createApp, defineComponent, h, nextTick} from 'vue';

import {createDialogService} from '../../src/index';

const Content = defineComponent({render: () => h('button', 'inside')});

const settle = async () => {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 50));
};

const pressEscape = async (times = 1) => {
    for (let press = 0; press < times; press++) {
        await userEvent.keyboard('{Escape}');
        await settle();
    }
};

describe('Escape with dialogs from more than one source', () => {
    const mounted: {app: App; host: HTMLElement}[] = [];

    const mountService = () => {
        const service = createDialogService();
        const host = document.createElement('div');
        document.body.append(host);
        const app = createApp(service.DialogContainerComponent);
        app.mount(host);
        mounted.push({app, host});

        return {service, stack: () => host.querySelectorAll('dialog')};
    };

    afterEach(() => {
        for (const {app, host} of mounted.splice(0)) {
            app.unmount();
            host.remove();
        }
        document.body.style.overflowY = '';
    });

    it('should hold a dialog of another service under a top that refuses', async () => {
        // Arrange
        const lower = mountService();
        const upper = mountService();
        lower.service.open(Content, {});
        upper.service.open(Content, {}, {closeOnEscape: false});
        await settle();

        // Act
        await pressEscape(3);

        // Assert
        expect(lower.stack()[0]?.open).toBe(true);
        expect(upper.stack()[0]?.open).toBe(true);
    });

    it('should close the dialogs of three services one per press', async () => {
        // Arrange
        const services = [mountService(), mountService(), mountService()];
        for (const {service} of services) service.open(Content, {});
        await settle();
        const remaining = () => services.map(({stack}) => stack().length);

        // Act & Assert
        await pressEscape();
        expect(remaining()).toEqual([1, 1, 0]);
        await pressEscape();
        expect(remaining()).toEqual([1, 0, 0]);
        await pressEscape();
        expect(remaining()).toEqual([0, 0, 0]);
    });

    it('should leave a dialog open under a native dialog the page opened on top of it', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {});
        await settle();
        const page = document.createElement('dialog');
        page.innerHTML = '<button>page</button>';
        document.body.append(page);
        page.showModal();
        await settle();

        // Act
        await pressEscape();
        const pageOpen = page.open;
        const serviceDialogs = stack().length;
        page.remove();

        // Assert
        expect(pageOpen).toBe(false);
        expect(serviceDialogs).toBe(1);
    });
});
