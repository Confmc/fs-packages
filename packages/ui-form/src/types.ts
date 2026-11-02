/**
 * A field's wiring, what a form's `field(name)` returns; `v-bind="form.field('email')"` puts it on the
 * control, so each key is a prop every control declares. `required` is left out on purpose: a control
 * that does not declare it would take it as a native attribute and switch on browser validation. Pass
 * `required` to a control that conveys it (`aria-required`).
 */
export interface FieldBinding {
    id: string;
    /** whether the field has a message; the control marks itself by it. */
    invalid: boolean;
    describedby: string | undefined;
}
