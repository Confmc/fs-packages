// `process` is not a browser global, and this package declares no node types. The reference below
// exists purely as the token every consumer bundler replaces statically (Vite, webpack and rollup
// all substitute `process.env.NODE_ENV`), which is what strips this guard from production builds.
// `import.meta.env` is NOT usable here: ui-inputs emits a CJS artifact too, where `import.meta` is
// a syntax error — the same reason `.oxlintrc.json` disables `unicorn/prefer-import-meta-properties`.
declare const process: {env: {NODE_ENV?: string}};

/** The naming routes this check can see. Content is checked separately — it is not an attribute. */
const NAME_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'title'] as const;

const trimmedAttribute = (element: HTMLElement, name: string): string => (element.getAttribute(name) || '').trim();

/**
 * Dev-only guard for the one contract this family cannot express in its types: a focusable,
 * correctly-roled control that carries NO accessible name (WCAG 4.1.2, Level A). `label` is
 * optional on both callers and a slot may render empty, so "supply one of them" had no enforcement
 * beyond a docblock — and this package ships to every consumer territory, where an unnamed control
 * is a Level-A failure in each of them at once.
 *
 * Deliberately a PRESENCE check, not an accessible-name computation: `aria-labelledby` is taken at
 * its word rather than dereferenced, because its target may legitimately mount after this control
 * (a later sibling, a teleport), and a check that fired on that would cost the guard its authority.
 * A dangling IDREF therefore passes here; axe in the browser suite is the layer that catches it.
 */
export const warnWhenUnnamed = (element: HTMLElement, component: string, contentRoutes: string): void => {
    if (process.env.NODE_ENV === 'production') return;
    if ((element.textContent || '').trim() !== '') return;
    if (NAME_ATTRIBUTES.some((name) => trimmedAttribute(element, name) !== '')) return;

    console.warn(
        `[ui-inputs] <${component}> has no accessible name, so assistive technology announces an ` +
            `unnamed control (WCAG 4.1.2, Level A). Give it one of: ${contentRoutes}, \`aria-label\`, ` +
            '`aria-labelledby` or `title`.',
    );
};
