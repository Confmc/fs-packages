import type {Ref} from 'vue';

import {watch} from 'vue';

/** The events that commit or activate a checkbox-family control. */
const GUARDED_EVENTS = ['click', 'input', 'change'] as const;

/**
 * Makes a disabled control inert to every consumer `click`/`input`/`change` listener, in the
 * CAPTURE phase on `element` — the family rule `Pressable` and `Disclosure` already keep.
 *
 * The browser is no help: Chromium withholds these only for USER interaction. A dispatched
 * `change` or `input` runs every listener on a disabled input, and a dispatched `click` on a
 * disabled checkbox or radio runs every listener AND flips the native `checked` (measured). A
 * capture listener on the target runs before every bubble listener on it, so the consumer's
 * fall-through handler is stopped without reordering Vue's merged handlers — an enabled control
 * keeps the order its consumers already see. `preventDefault()` on the click is what undoes the
 * flip; `stopImmediatePropagation()` withholds the rest, ancestors included.
 *
 * Attached natively rather than as `@click.capture` for the reason `Pressable` gives: a second Vue
 * invoker for the same event on one element can drop the consumer's handler on Vue's `_vts` stamp.
 */
export const guardWhileDisabled = (element: Readonly<Ref<HTMLElement | null>>, isDisabled: () => boolean): void => {
    const guard = (event: Event): void => {
        if (!isDisabled()) return;

        event.preventDefault();
        event.stopImmediatePropagation();
    };

    watch(
        element,
        (current, previous) => {
            for (const type of GUARDED_EVENTS) {
                previous?.removeEventListener(type, guard, true);
                current?.addEventListener(type, guard, true);
            }
        },
        {flush: 'sync'},
    );
};
