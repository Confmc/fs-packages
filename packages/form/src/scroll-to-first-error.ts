import type {Ref} from 'vue';

import {watch} from 'vue';

import type {ValidationErrors} from './types';

/**
 * On every `errors` change, scroll the first `[aria-invalid="true"]` into view (the
 * mark the presentation layer sets); a no-op when nothing is marked. `root` scopes
 * the query to one form's subtree — omitted: document-wide; `null`: no scroll, never
 * falling back to document.
 *
 * `flush: 'post'` fires after the mark paints. Call inside `setup()` (as `useForm`
 * does) so the watcher stops on unmount.
 */
export const useScrollToFirstError = (errors: Ref<ValidationErrors>, root?: Ref<HTMLElement | null>): void => {
    watch(
        errors,
        () => {
            const scope = root === undefined ? document : root.value;
            scope?.querySelector('[aria-invalid="true"]')?.scrollIntoView({behavior: 'smooth', block: 'center'});
        },
        {flush: 'post'},
    );
};
