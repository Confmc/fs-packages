import type {App} from 'vue';

// A real browser, because the defect lives in its close watcher: happy-dom fires no cancel on
// a key press and has no user-activation rule. The happy-dom suite pins the attribute and the
// service's reaction to a close event; this file pins what a real Escape does (WR-1913).
import {afterEach, describe, expect, it, vi} from 'vitest';
import {userEvent} from 'vitest/browser';
import {createApp, defineComponent, h, nextTick} from 'vue';

import {createDialogService} from '../../src/index';

const Content = defineComponent({render: () => h('button', 'inside')});

const settle = async () => {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 50));
};

describe('Escape and a native close in a real browser (WR-1913)', () => {
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

    const pressEscape = async (times = 1) => {
        for (let press = 0; press < times; press++) {
            await userEvent.keyboard('{Escape}');
            await settle();
        }
    };

    // Without closedby the second press gets an uncancelable cancel and closes the dialog.
    it('should keep an opted-out dialog open through repeated Escape', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {}, {closeOnEscape: false});
        await settle();

        // Act
        await pressEscape(4);

        // Assert
        expect(stack()).toHaveLength(1);
        expect(stack()[0]!.open).toBe(true);
        expect(document.body.style.overflowY).toBe('hidden');
    });

    it('should keep an opted-out dialog open through repeated Escape with focus on the body', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {}, {closeOnEscape: false});
        await settle();
        (document.activeElement as HTMLElement).blur();

        // Act
        await pressEscape(4);

        // Assert
        expect(document.activeElement).toBe(document.body);
        expect(stack()[0]?.open).toBe(true);
    });

    it('should keep an opted-out dialog open while Escape is held down', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {}, {closeOnEscape: false});
        await settle();

        // Act
        await userEvent.keyboard('{Escape>5/}');
        await settle();

        // Assert
        expect(stack()[0]?.open).toBe(true);
    });

    it('should hold while a getter refuses and close on the first press once it allows', async () => {
        // Arrange
        const {service, stack} = mountService();
        let busy = true;
        service.open(Content, {}, {closeOnEscape: () => !busy});
        await settle();

        // Act
        await pressEscape(3);
        const heldWhileBusy = stack()[0]?.open;
        busy = false;
        await pressEscape();

        // Assert
        expect(heldWhileBusy).toBe(true);
        expect(stack()).toHaveLength(0);
    });

    it('should close a top dialog that allows Escape and then hold the one below that refuses', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {}, {closeOnEscape: false});
        service.open(Content, {});
        await settle();
        const lower = stack()[0]!;

        // Act
        await pressEscape();
        const afterFirst = stack().length;
        await pressEscape(3);

        // Assert
        expect(afterFirst).toBe(1);
        expect(stack()[0]).toBe(lower);
        expect(lower.open).toBe(true);
    });

    it('should hold a top dialog that refuses over one below that allows', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {});
        service.open(Content, {}, {closeOnEscape: false});
        await settle();

        // Act
        await pressEscape(3);

        // Assert
        expect(stack()).toHaveLength(2);
        expect(stack()[0]!.open).toBe(true);
        expect(stack()[1]!.open).toBe(true);
    });

    it('should close stacked dialogs one per press', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {});
        service.open(Content, {});
        await settle();

        // Act
        await pressEscape();
        const afterFirst = stack().length;
        await pressEscape();

        // Assert
        expect(afterFirst).toBe(1);
        expect(stack()).toHaveLength(0);
    });

    it('should hold when something inside the dialog stops the key on its way up', async () => {
        // Arrange
        const {service, stack} = mountService();
        const Stopping = defineComponent({
            render: () => h('button', {onKeydown: (event: KeyboardEvent) => event.stopPropagation()}, 'inside'),
        });
        service.open(Stopping, {}, {closeOnEscape: false});
        await settle();

        // Act
        await pressEscape(4);

        // Assert
        expect(stack()[0]?.open).toBe(true);
    });

    it('should hand the key to a listener inside a refusing dialog, not cancelled', async () => {
        // Arrange
        const {service} = mountService();
        const seen: boolean[] = [];
        const Listening = defineComponent({
            render: () =>
                h('button', {onKeydown: (event: KeyboardEvent) => seen.push(event.defaultPrevented)}, 'inside'),
        });
        service.open(Listening, {}, {closeOnEscape: false});
        await settle();

        // Act
        await pressEscape(2);

        // Assert
        expect(seen).toEqual([false, false]);
    });

    it('should let a popover inside a refusing dialog close on Escape', async () => {
        // Arrange
        const {service, stack} = mountService();
        const WithPopover = defineComponent({
            render: () =>
                h('div', [h('button', 'inside'), h('div', {id: 'inner-popover', popover: 'auto'}, 'popover')]),
        });
        service.open(WithPopover, {}, {closeOnEscape: false});
        await settle();
        const popover = document.getElementById('inner-popover')!;
        popover.showPopover();
        await settle();

        // Act
        await pressEscape();

        // Assert
        expect(popover.matches(':popover-open')).toBe(false);
        expect(stack()[0]?.open).toBe(true);
    });

    it('should let a native dialog inside a refusing dialog close on Escape', async () => {
        // Arrange
        const {service, stack} = mountService();
        const WithDialog = defineComponent({
            render: () => h('div', [h('button', 'inside'), h('dialog', {id: 'inner-dialog'}, [h('button', 'nested')])]),
        });
        service.open(WithDialog, {}, {closeOnEscape: false});
        await settle();
        const nested = document.getElementById('inner-dialog') as HTMLDialogElement;
        nested.showModal();
        await settle();

        // Act
        await pressEscape();

        // Assert
        expect(nested.open).toBe(false);
        expect(stack()[0]?.open).toBe(true);
    });

    // happy-dom removes a listener whatever its capture flag, so only a browser can show a leak.
    it('should stop reading closeOnEscape once the host has unmounted', async () => {
        // Arrange
        const {service} = mountService();
        const closeOnEscape = vi.fn(() => false);
        service.open(Content, {}, {closeOnEscape});
        await settle();
        app?.unmount();
        app = undefined;

        // Act
        await pressEscape();

        // Assert
        expect(closeOnEscape).not.toHaveBeenCalled();
    });

    // Chromium queues the close event as a task, so a dialog opened in between is already on the
    // stack when the closed element's event arrives.
    it('should keep a dialog opened in the same turn as a native close', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {});
        await settle();
        const closed = stack()[0]!;

        // Act
        closed.close();
        service.open(Content, {});
        await settle();

        // Assert
        expect(stack()).toHaveLength(1);
        expect(stack()[0]).not.toBe(closed);
        expect(stack()[0]!.open).toBe(true);
        expect(stack()[0]!.contains(document.activeElement)).toBe(true);
        expect(document.body.style.overflowY).toBe('hidden');
    });

    it('should keep a dialog opened in a microtask after a native close', async () => {
        // Arrange
        const {service, stack} = mountService();
        service.open(Content, {});
        await settle();
        const closed = stack()[0]!;

        // Act
        closed.close();
        await Promise.resolve();
        service.open(Content, {});
        await settle();

        // Assert
        expect(stack()).toHaveLength(1);
        expect(stack()[0]).not.toBe(closed);
        expect(stack()[0]!.open).toBe(true);
        expect(stack()[0]!.contains(document.activeElement)).toBe(true);
        expect(document.body.style.overflowY).toBe('hidden');
    });

    it('should return focus to the outside opener after closing a dialog opened from inside a closed one', async () => {
        // Arrange
        const {service, stack} = mountService();
        const outside = document.createElement('button');
        document.body.append(outside);
        outside.focus();
        let closeUpper: (() => void) | undefined;
        const Upper = defineComponent({
            props: {onClose: Function},
            setup: (props) => {
                closeUpper = props.onClose as () => void;
            },
            render: () => h('button', 'upper'),
        });
        service.open(Content, {});
        await settle();
        const lower = stack()[0]!;
        lower.querySelector('button')!.focus();
        service.open(Upper, {});
        await settle();
        lower.close();
        await settle();

        // Act
        closeUpper?.();
        await settle();

        // Assert
        expect(stack()).toHaveLength(0);
        expect(document.activeElement).toBe(outside);
        outside.remove();
    });

    it('should keep the stack in sync when a form with method=dialog closes a refusing dialog', async () => {
        // Arrange
        const {service, stack} = mountService();
        const WithForm = defineComponent({
            render: () => h('form', {method: 'dialog'}, [h('button', {id: 'inner-submit'}, 'submit')]),
        });
        service.open(WithForm, {}, {closeOnEscape: false});
        await settle();
        await pressEscape(2);

        // Act
        document.getElementById('inner-submit')!.click();
        await settle();

        // Assert
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
