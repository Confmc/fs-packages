import type {MaybeRefOrGetter} from 'vue';

import {defineComponent, h, toValue} from 'vue';

import type {ValidationErrors} from './types';

import FormField from '../components/FormField.vue';

/** The props of a form-bound `Field`: `FormField`'s, plus the `name` its message is read under. */
export interface FieldProps<T extends string = string> {
    /** the field's key in the form's error bag; the message is read verbatim as `errors[name]`. */
    name: T;
    label?: string;
    required?: boolean;
    /** an explicit message wins over the bag. */
    error?: string;
    id?: string;
    orientation?: 'vertical' | 'horizontal';
}

/**
 * A `FormField` bound to one error bag: `<Field name="email" v-slot="{field}">` shows `errors.email`,
 * and `v-bind="field"` on the control wires it (see `FormField`). The bag is closed over, not provided,
 * so a field reads exactly the form it came from. `useForm` returns one as `Field`; call this yourself
 * for a bag from another source, or to give a component spec a bag.
 */
// NoInfer: the bag's literal keys must not narrow T. A Field typed on `'email'` would not fit where a
// component expects `UseForm['Field']` (string keys); pass T explicitly to narrow it on purpose.
export const createField = <T extends string = string>(errors: MaybeRefOrGetter<ValidationErrors<NoInfer<T>>>) =>
    defineComponent(
        (props: FieldProps<T>, {slots}) =>
            () =>
                h(
                    FormField,
                    {
                        label: props.label,
                        required: props.required,
                        id: props.id,
                        orientation: props.orientation,
                        error: props.error ?? toValue(errors)[props.name],
                    },
                    slots,
                ),
        // The keys again, at runtime: the setup-function form of defineComponent cannot read them off
        // FieldProps. The options form would infer them, but only through a double cast for the generic
        // `name` (`String as unknown as PropType<T>`), so the short list is the plainer of the two.
        {name: 'Field', props: ['name', 'label', 'required', 'error', 'id', 'orientation']},
    );

/** The component `createField` returns. */
export type FieldComponent<T extends string = string> = ReturnType<typeof createField<T>>;
