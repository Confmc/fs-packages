import type {Component, VNode} from 'vue';
import type {ComponentProps} from 'vue-component-type-helpers';

import {Suspense, defineComponent, h, markRaw, nextTick, onErrorCaptured, reactive, ref} from 'vue';

type UnregisterMiddleware = () => void;

/** Error handler for dialog middleware chain. Return `false` to stop propagation. */
export type DialogErrorHandler = (error: Error, context: {closeAll: () => void}) => boolean;

/** Host-level options applied to the `<dialog>` element itself, not the inner component. */
export interface DialogOpenOptions {
    /** Sets `aria-label` on the host `<dialog>` element. */
    ariaLabel?: string;
    /** Sets `aria-labelledby` on the host `<dialog>` element. */
    ariaLabelledBy?: string;
    /** Sets `aria-describedby` on the host `<dialog>` element. */
    ariaDescribedBy?: string;
    /**
     * Whether a backdrop click closes this dialog. Defaults to `true`; set `false` to close it yourself
     * via `onClose`. A getter is read at the click, so a dialog can refuse only while it is busy.
     */
    closeOnBackdropClick?: boolean | (() => boolean);
    /**
     * Whether Escape closes this dialog. Defaults to `true`; set `false` to close it yourself via
     * `onClose`. A getter is read at the key press, so a dialog can refuse only while it is busy.
     */
    closeOnEscape?: boolean | (() => boolean);
    /**
     * Where focus goes on close when the element that had focus at open can no longer take it
     * (removed from the document, or disabled). A getter is read at close time.
     */
    restoreFocusTo?: HTMLElement | null | (() => HTMLElement | null);
}

/** Public API of a dialog service instance. */
export interface DialogService {
    /** Open a component in a new dialog on top of the stack. */
    open: <C extends Component>(component: C, props: ComponentProps<C>, options?: DialogOpenOptions) => void;
    /** Close all dialogs in the stack. */
    closeAll: () => void;
    /** Register an error middleware handler. Returns an unregister function. */
    registerErrorMiddleware: (handler: DialogErrorHandler) => UnregisterMiddleware;
    /** Vue component that renders the dialog stack. Mount this in your template. */
    DialogContainerComponent: Component;
}

interface DialogEntry {
    render: () => VNode;
    key: string;
    restoreFocus: () => void;
    /** True once the element has been shown and has closed since. */
    isClosed: () => boolean;
}

const DIALOG_STYLE = 'padding:0;margin:auto;background:transparent;border:none';

const allowsClose = (option: boolean | (() => boolean) | undefined): boolean =>
    (typeof option === 'function' ? option() : option) !== false;

const prepareVModelProps = (props: Record<string, unknown>, onClose: () => void): Record<string, unknown> => {
    const prepared: Record<string, unknown> = reactive({...props, onClose});

    for (const key of Object.keys(prepared)) {
        if (!key.startsWith('onUpdate:')) continue;

        const modelPropName = key.slice('onUpdate:'.length);
        const originalHandler = prepared[key] as (...args: unknown[]) => void;

        prepared[key] = (value: unknown) => {
            prepared[modelPropName] = value;
            originalHandler(value);
        };
    }

    return prepared;
};

/**
 * Create a dialog service that manages a LIFO stack of dialogs.
 *
 * Each dialog is rendered in a native `<dialog>` element with `showModal()`.
 * The service handles body scroll lock, backdrop and Escape closing, focus
 * restore to the opener, v-model prop synchronization, and error middleware.
 *
 * Dialog content is wrapped in `Suspense` to support `defineAsyncComponent`.
 */
export const createDialogService = (): DialogService => {
    const dialogs = ref<DialogEntry[]>([]);
    const errorMiddleware: DialogErrorHandler[] = [];
    let dialogId = 0;

    const updateBodyScroll = () => {
        document.body.style.overflowY = dialogs.value.length > 0 ? 'hidden' : 'auto';
    };

    const closeFrom = (index: number) => {
        const [lowestClosed] = dialogs.value.splice(index);
        updateBodyScroll();

        // A modal makes everything outside it inert, so focus can only go back once the
        // removal has rendered.
        if (lowestClosed !== undefined) void nextTick(lowestClosed.restoreFocus);
    };

    // By key, not by the index at open: a late onClose from a dialog already gone would close
    // whichever dialog now holds that index (WR-1914).
    const closeByKey = (key: string) => {
        const index = dialogs.value.findIndex((dialog) => dialog.key === key);
        if (index !== -1) closeFrom(index);
    };

    const closeAll = () => closeFrom(0);

    const open = <C extends Component>(component: C, props: ComponentProps<C>, options?: DialogOpenOptions): void => {
        // The browser queues a native close event, so an entry whose element closed may still be on
        // the stack; it goes first, or its late event would close this dialog with it (LIFO).
        const stale = dialogs.value.findIndex((dialog) => dialog.isClosed());
        if (stale !== -1) closeFrom(stale);

        const key = `dialog-${dialogId++}`;
        const rawComponent = markRaw(component);

        const onClose = () => closeByKey(key);
        let element: HTMLDialogElement | null = null;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const restoreFocus = () => {
            if (opener?.isConnected === true) {
                opener.focus();
                if (document.activeElement === opener) return;
            }

            const fallback = options?.restoreFocusTo;
            (typeof fallback === 'function' ? fallback() : fallback)?.focus();
        };

        const prepared = prepareVModelProps(props as Record<string, unknown>, onClose);

        const render = () =>
            h(
                'dialog',
                {
                    key,
                    style: DIALOG_STYLE,
                    'aria-label': options?.ariaLabel,
                    'aria-labelledby': options?.ariaLabelledBy,
                    'aria-describedby': options?.ariaDescribedBy,
                    // Cancelled so a refused Escape keeps the dialog open; an accepted one closes through onClose.
                    onCancel: (event: Event) => {
                        event.preventDefault();
                        if (!allowsClose(options?.closeOnEscape)) return;

                        onClose();
                    },
                    // Chromium closes the element natively on a second Escape with no user activation
                    // in between, whatever onCancel did (WR-1913); the entry follows it off the stack.
                    // A close the service made itself finds no entry and does nothing.
                    onClose,
                    onClick: (event: MouseEvent) => {
                        if ((event.target as HTMLElement).tagName !== 'DIALOG') return;
                        // Opted out: the consumer manages backdrop close (e.g. a dirty-confirm) via onClose.
                        if (!allowsClose(options?.closeOnBackdropClick)) return;

                        onClose();
                    },
                    onVnodeMounted: (vnode: VNode) => {
                        element = vnode.el as HTMLDialogElement;
                        element.showModal();
                    },
                },
                h(Suspense, null, {default: () => h(rawComponent, prepared)}),
            );

        dialogs.value.push({render, key, restoreFocus, isClosed: () => element?.open === false});
        updateBodyScroll();
    };

    const registerErrorMiddleware = (handler: DialogErrorHandler): UnregisterMiddleware => {
        errorMiddleware.push(handler);

        return () => {
            const index = errorMiddleware.indexOf(handler);
            if (index > -1) errorMiddleware.splice(index, 1);
        };
    };

    const handleError = (error: unknown): boolean => {
        if (!(error instanceof Error)) return true;

        for (const handler of errorMiddleware) {
            const shouldPropagate = handler(error, {closeAll});
            if (!shouldPropagate) return false;
        }

        return true;
    };

    const DialogContainerComponent = defineComponent({
        name: 'DialogContainer',
        setup() {
            onErrorCaptured((error) => handleError(error));

            return () => dialogs.value.map((dialog) => dialog.render());
        },
    });

    return {open, closeAll, registerErrorMiddleware, DialogContainerComponent};
};
