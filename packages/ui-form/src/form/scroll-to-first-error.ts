import type {Ref} from 'vue';

import {watch} from 'vue';

import type {ValidationErrors} from './types';

import {messageId} from './field';

/**
 * On every `errors` change, scroll the form's first refused field into view, found by the ids the form
 * itself hands out: the control `field(name)` wired (`id(name)`), or else that field's message element.
 * The first in document order wins, whatever order the server listed the fields in. Ids are unique per
 * form, so another form's refusal never scrolls this one; a no-op when nothing refused is rendered.
 *
 * `behavior` is `'auto'` under `prefers-reduced-motion: reduce` — a JS `scrollIntoView` behavior is not
 * subject to the CSS media query, so it is honoured here explicitly. `flush: 'post'` fires after the mark
 * paints. Call inside `setup()` (as `useForm` does) so the watcher stops on unmount.
 */
export const useScrollToFirstError = (errors: Ref<ValidationErrors>, id: (name: string) => string): void => {
    watch(
        errors,
        () => {
            const [first] = Object.entries(errors.value)
                .filter(([, message]) => Boolean(message))
                .map(([name]) => document.getElementById(id(name)) ?? document.getElementById(messageId(id(name))))
                .filter((element): element is HTMLElement => element !== null)
                .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
            if (!first) return;

            const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
            first.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'center'});
        },
        {flush: 'post'},
    );
};
