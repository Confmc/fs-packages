import type {Ref} from 'vue';

import type {ValidationErrors} from './types';

/** The mark this package's controls render while invalid. */
const DEFAULT_TARGET = '[aria-invalid="true"]';

/**
 * Scroll the first invalid field (the mark the controls set) into view; a no-op when the error bag is
 * empty, so a refusal that named none of the form's fields never scrolls to some other marked field.
 *
 * - `root` scopes the query to one form's subtree. Omitted: document-wide; `null`: no scroll, never
 *   falling back to the document.
 * - `target` is the selector for the mark (default `[aria-invalid="true"]`); pass your own when your
 *   inputs mark errors with a class instead.
 * - `behavior` is `'auto'` under `prefers-reduced-motion: reduce`: a JS `scrollIntoView` behavior is not
 *   subject to the CSS media query, so it is honoured here explicitly.
 *
 * Call it once the DOM shows the refusal (after a `nextTick`), as `useForm`'s `handleSubmit` does.
 */
export const scrollToFirstError = (
    errors: ValidationErrors,
    root?: Ref<HTMLElement | null>,
    target: string = DEFAULT_TARGET,
): void => {
    if (!Object.keys(errors).length) return;

    const scope = root === undefined ? document : root.value;
    const field = scope?.querySelector(target);
    if (!field) return;

    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    field.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'center'});
};
