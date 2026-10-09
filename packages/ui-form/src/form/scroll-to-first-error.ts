import type {ValidationErrors} from './types';

import {messageId} from './field';

/**
 * Scroll the form's first refused field into view, found by the ids the form itself hands out: the
 * control `field(name)` wired (`id(name)`), or else that field's message element. The first in document
 * order wins, whatever order the bag lists the fields in; a no-op when nothing refused is rendered.
 *
 * `behavior` is `'auto'` under `prefers-reduced-motion: reduce` — a JS `scrollIntoView` behavior is not
 * subject to the CSS media query, so it is honoured here explicitly. Call it once the DOM shows the
 * refusal (after a `nextTick`), as `useForm`'s `handleSubmit` does.
 */
export const scrollToFirstError = (errors: ValidationErrors, id: (name: string) => string): void => {
    const [first] = Object.entries(errors)
        .filter(([, message]) => Boolean(message))
        .map(([name]) => document.getElementById(id(name)) ?? document.getElementById(messageId(id(name))))
        .filter((element): element is HTMLElement => element !== null)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (!first) return;

    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'center'});
};
