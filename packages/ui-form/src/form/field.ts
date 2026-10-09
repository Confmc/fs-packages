/** The id a form gives a field: its name with anything outside `[A-Za-z0-9_-]` turned into `-`, after an optional prefix. */
export const fieldId = (name: string, prefix?: string): string =>
    `${prefix ? `${prefix}-` : ''}${name.replace(/[^\w-]/g, '-')}`;

/** The id of a field's message, which the control names in `aria-describedby`. One rule for `field()` and `FormField`. */
export const messageId = (id: string): string => `${id}-error`;
