import {devWarningsSuppressed} from './dev-warning';

/** The naming routes this check can see. Content is checked separately — it is not an attribute. */
const NAME_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'title'] as const;

const trimmedAttribute = (element: HTMLElement, name: string): string => (element.getAttribute(name) || '').trim();

/**
 * The rendered text that actually reaches the accessible name — which is NOT `textContent`. A
 * subtree marked `aria-hidden="true"` contributes nothing to the name computation, so counting it
 * lets the exact shape this guard exists for silence the guard: a control whose only slot content
 * is a decorative icon has a non-empty `textContent` and no accessible name at all.
 *
 * Measured on a detached CLONE so the live control is never touched, and by subtraction so the
 * walk cannot disagree with the platform about what `textContent` collects. Only the literal
 * `aria-hidden="true"` hides — `"false"` and an absent attribute both name.
 */
const namingText = (element: HTMLElement): string => {
    const copy = element.cloneNode(true) as Element;
    for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();

    return String(copy.textContent);
};

/**
 * Dev-only guard for the one contract this family cannot express in its types: a focusable,
 * correctly-roled control that carries NO accessible name (WCAG 4.1.2, Level A). `label` is
 * optional on both callers and a slot may render empty, so "supply one of them" had no enforcement
 * beyond a docblock — and this package ships to every consumer territory, where an unnamed control
 * is a Level-A failure in each of them at once.
 *
 * Scope, stated precisely because a guard that overstates its reach is worse than none:
 *
 * - **Content** is filtered for `aria-hidden`, so a decorative-icon-only control still warns.
 * - **Attributes** are a PRESENCE check, not an accessible-name computation: `aria-labelledby` is
 *   taken at its word rather than dereferenced, because its target may legitimately mount after
 *   this control (a later sibling, a teleport), and a check that fired on that would cost the
 *   guard its authority. A dangling IDREF therefore passes here; axe in the browser suite is the
 *   layer that catches it.
 */
export const warnWhenUnnamed = (element: HTMLElement, component: string, contentRoutes: string): void => {
    if (devWarningsSuppressed()) return;
    if (namingText(element).trim() !== '') return;
    if (NAME_ATTRIBUTES.some((name) => trimmedAttribute(element, name) !== '')) return;

    console.warn(
        `[ui-inputs] <${component}> has no accessible name, so assistive technology announces an ` +
            `unnamed control (WCAG 4.1.2, Level A). Give it one of: ${contentRoutes}, \`aria-label\`, ` +
            '`aria-labelledby` or `title`.',
    );
};
