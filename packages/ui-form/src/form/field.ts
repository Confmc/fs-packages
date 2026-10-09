import {defineComponent, h} from 'vue';

import FormLabel from '../components/FormLabel.vue';

/** The id a form gives a field: its prefix, then its name with anything outside `[A-Za-z0-9_-]` turned into `-`. */
export const fieldId = (name: string, prefix: string): string => `${prefix}-${name.replace(/[^\w-]/g, '-')}`;

/** The id of a field's message, which the control names in `aria-describedby`. One rule for `field()` and `FormField`. */
export const messageId = (id: string): string => `${id}-error`;

/** The props of a form-bound `FormLabel`. */
export interface BoundFormLabelProps<T extends string = string> {
    /** the field the label names; its `for` is that field's id. */
    name: T;
    label: string;
    required?: boolean;
}

/**
 * A `FormLabel` bound to one form: `<FormLabel name="firstName" label="Voornaam" required />` points its
 * `for` at the id `field('firstName')` gives the control. Attributes fall through to the `<label>`; its
 * default slot renders after the label text and the required mark (a note like "optioneel").
 */
export const createFormLabel = <T extends string>(id: (name: T) => string) =>
    defineComponent(
        (props: BoundFormLabelProps<T>, {slots}) =>
            () =>
                h(
                    FormLabel,
                    {htmlFor: id(props.name), required: props.required},
                    {default: () => props.label, after: slots.default},
                ),
        {name: 'FormLabel', props: ['name', 'label', 'required']},
    );

/**
 * A field's message bound to one form: `<FormError name="firstName" />`. The element is always there,
 * empty while the field is clean, so it can hold its place in a row layout; the message fills it under
 * the id the control's `aria-describedby` names. Attributes fall through to it.
 */
export const createFormError = <T extends string>(message: (name: T) => string | undefined, id: (name: T) => string) =>
    defineComponent(
        (props: {name: T}) => () =>
            h('p', {id: messageId(id(props.name)), class: 'ui-error', role: 'alert'}, message(props.name)),
        {name: 'FormError', props: ['name']},
    );

/** The components `createFormLabel` and `createFormError` return. */
export type FormLabelComponent<T extends string = string> = ReturnType<typeof createFormLabel<T>>;
export type FormErrorComponent<T extends string = string> = ReturnType<typeof createFormError<T>>;
