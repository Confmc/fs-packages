/** The minimal shape every option in a select must satisfy: a stable identity. */
export interface SelectItem {
    id: string | number;
}

/**
 * How to derive a display string from an option: either the name of a string
 * property on the option, or a getter function.
 *
 * The `& string` is load-bearing at BUILD time, not just for type narrowing. Vue's SFC
 * compiler derives each prop's runtime validator from its type, and it cannot statically
 * expand a bare `keyof T` for an unresolved generic — it dropped that arm and emitted
 * `label: {type: Function}`, so the string form this type documents warned at runtime on
 * every mount. `keyof T & string` resolves to `String`, so the emitted validator is
 * `[String, Function]`: both arms accepted, key autocomplete preserved at call sites.
 */
export type LabelKey<T> = (keyof T & string) | ((option: T) => string);

/**
 * What `FormField`'s slot hands the control as `field`; `v-bind="field"` puts it on the control, so
 * each key is a prop every control declares. `required` is left out on purpose: a control that does
 * not declare it would take it as a native attribute and switch on browser validation. Pass
 * `required` to a control that conveys it (`aria-required`).
 */
export interface FieldBinding {
    id: string;
    invalid: boolean;
    describedby: string | undefined;
}
