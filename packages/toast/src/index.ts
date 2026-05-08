import type {Component, VNode} from 'vue';
import type {ComponentProps} from 'vue-component-type-helpers';

import {defineComponent, h, onMounted, ref, watch} from 'vue';

/** Public API of a toast service instance. */
export interface ToastService<C extends Component> {
    /** Display a toast with the given props. Returns a unique ID for programmatic hiding. */
    show: (props: Omit<ComponentProps<C>, 'onClose'>) => string;
    /** Remove a specific toast by ID. No-op if the ID doesn't exist. */
    hide: (id: string) => void;
    /** Vue component that renders the toast queue. Mount this wherever you want toasts to appear. */
    ToastContainerComponent: Component;
}

/**
 * Create a toast service for a given Vue component.
 *
 * The service manages a FIFO queue — when the queue exceeds `maxToasts`,
 * the oldest toast is removed. Each toast component receives an `onClose`
 * prop that removes it from the queue when called.
 *
 * The container promotes itself to the browser top layer (via the Popover API
 * with `popover="manual"`) whenever at least one toast is queued, so toasts
 * remain visible above `<dialog>.showModal()` backdrops. The container demotes
 * back to the normal stacking context when the queue empties.
 *
 * @param component - The Vue component to render for each toast.
 * @param maxToasts - Maximum number of visible toasts (default: 4, minimum: 1).
 */
export const createToastService = <C extends Component>(component: C, maxToasts = 4): ToastService<C> => {
    const validatedMaxToasts = Math.max(1, Math.floor(maxToasts));
    const toasts = ref<{node: VNode; id: string}[]>([]);
    let toastId = 0;

    const hide = (id: string) => {
        const index = toasts.value.findIndex((toast) => toast.id === id);
        if (index === -1) return;

        toasts.value.splice(index, 1);
    };

    const show = (props: Omit<ComponentProps<C>, 'onClose'>): string => {
        if (toasts.value.length >= validatedMaxToasts && toasts.value[0]) {
            hide(toasts.value[0].id);
        }

        const id = `toast-${toastId++}`;
        const toastHider = () => hide(id);

        toasts.value.push({node: h(component, {key: id, ...props, onClose: toastHider}), id});

        return id;
    };

    const ToastContainerComponent = defineComponent({
        name: 'ToastContainer',
        setup() {
            const containerRef = ref<HTMLElement | null>(null);
            let isOpen = false;

            const showContainer = () => {
                const el = containerRef.value;
                if (!el || isOpen) return;
                try {
                    el.showPopover();
                    isOpen = true;
                } catch {
                    // Popover API unsupported, or element already open under a different
                    // code path — leave isOpen false so a later attempt can retry.
                }
            };

            const hideContainer = () => {
                const el = containerRef.value;
                if (!el || !isOpen) return;
                try {
                    el.hidePopover();
                } catch {
                    // Popover API unsupported, or element already closed — fall through.
                }
                isOpen = false;
            };

            onMounted(() => {
                if (toasts.value.length > 0) showContainer();
            });

            watch(
                () => toasts.value.length,
                (length) => {
                    if (length > 0) showContainer();
                    else hideContainer();
                },
            );

            return () =>
                h(
                    'div',
                    {ref: containerRef, popover: 'manual'},
                    toasts.value.map((toast) => toast.node),
                );
        },
    });

    return {show, hide, ToastContainerComponent};
};
