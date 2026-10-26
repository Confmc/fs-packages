import type {StyleValue} from 'vue';

/**
 * A control's attribute split. `class` and `style` stay on the root, where consumers style the
 * whole control; everything else — `aria-label`, `aria-labelledby`, `data-*`, listeners — goes to
 * the control element (the `<input>`, or the element carrying role="combobox"), where an accessible
 * name lands.
 */
export const rootAttrs = (attrs: Record<string, unknown>): {class?: unknown; style?: StyleValue} => ({
    class: attrs.class,
    style: attrs.style as StyleValue | undefined,
});

export const controlAttrs = (attrs: Record<string, unknown>): Record<string, unknown> => {
    const {class: _class, style: _style, ...rest} = attrs;

    return rest;
};
