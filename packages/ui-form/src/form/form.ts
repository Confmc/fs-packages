import type {Ref} from 'vue';

import {computed, readonly, ref, useId} from 'vue';

import type {FormHttpService} from './http-contract';
import type {
    FieldModel,
    FieldProps,
    UseDraftForm,
    UseDraftFormOptions,
    UseForm,
    UseFormOptions,
    ValidationErrors,
} from './types';

import {createFieldLabel, createMessage, fieldId, messageId} from './field';
import {useFormSubmit} from './form-submit';
import {readPath, writePath} from './path';
import {useScrollToFirstError} from './scroll-to-first-error';
import {useValidationErrors} from './validation-errors';

/**
 * One-call form composable. Wires `useValidationErrors` and `useFormSubmit`
 * together so a page gets the field-error bag, the refusal signal, the in-flight
 * `submitting` (loading) flag, and a validation-aware `handleSubmit` from a single
 * call instead of composing two. Call it in a page or component `setup()`: the
 * 422 middleware unregisters on unmount.
 *
 * A 422 populates `errors` and raises `refused` via the internal response
 * middleware — also when the action catches the 422 itself — and is swallowed by
 * `handleSubmit`, so the form is preserved; any other rejection propagates. Reach
 * for the underlying `useValidationErrors` / `useFormSubmit` primitives directly
 * when you need one half without the other (e.g. a validation-less confirm action).
 *
 * `field(name)` is a field's whole link to the form — id, invalid, describedby and its message from
 * `fieldErrors` (the server's errors with the form's own refusals on top):
 * `<TextInput v-bind="field('email')" v-model="email" />` + `<FieldMessage v-bind="field('email')" />`,
 * or one control that draws its own label and message through `FormField`.
 *
 * @param httpService the fs-http service whose 422 responses to observe.
 * @param options     `keyMapper`, `fields`, `onlyWhileSubmitting`, `scrollToError`, `scrollRoot`,
 *                    `scrollTarget`, `idPrefix` — see `UseFormOptions`.
 */
// Two call shapes: names are free strings, or, with a `draft`, the draft's paths with typed values.
// The overloads are a type; the one implementation below is cast to it, since an arrow function cannot
// declare overloads and its `field` cannot be checked against both generic shapes at once.
interface UseFormCall {
    <D extends object>(httpService: FormHttpService, options: UseDraftFormOptions<D>): UseDraftForm<D>;
    <T extends string = string>(httpService: FormHttpService, options?: UseFormOptions<T>): UseForm<T>;
}

export const useForm = (<T extends string = string>(
    httpService: FormHttpService,
    options: UseFormOptions<T> & {draft?: Ref<object>} = {},
): UseForm<T> => {
    const {
        keyMapper,
        fields,
        onlyWhileSubmitting = false,
        scrollToError = false,
        scrollRoot,
        scrollTarget,
        idPrefix,
        draft,
    } = options;
    const validation = useValidationErrors<T>(httpService, {
        keyMapper,
        fields,
        acceptWhen: onlyWhileSubmitting ? () => submit.submitting.value : undefined,
    });
    const submit = useFormSubmit(validation);

    const client = ref({}) as Ref<ValidationErrors<T>>;
    const fieldErrors = computed(() => ({...validation.errors.value, ...client.value}));

    if (scrollToError) useScrollToFirstError(fieldErrors, scrollRoot, scrollTarget);

    const refuse = (field: T, message: string): void => {
        client.value = {...client.value, [field]: message};
    };

    const setRefusals = (bag: ValidationErrors<T>): boolean => {
        const kept = Object.entries(bag).filter((entry): entry is [string, string] => Boolean(entry[1]));
        client.value = Object.fromEntries(kept) as ValidationErrors<T>;

        return kept.length > 0;
    };

    const withdraw = (...fields: T[]): void => {
        const next = {...client.value};
        for (const field of fields) delete next[field];
        client.value = next;
    };

    // Unique per form instance by default, so two forms with the same names never share an id.
    const prefix = idPrefix ?? useId();
    const id = (name: T): string => fieldId(name, prefix);
    const message = (name: T): string | undefined => fieldErrors.value[name] || undefined;

    const field = (name: T): FieldProps | (FieldProps & FieldModel<unknown>) => {
        const error = message(name);
        const wiring = {
            id: id(name),
            invalid: Boolean(error),
            describedby: error ? messageId(id(name)) : undefined,
            error,
        };
        if (!draft) return wiring;

        return {
            ...wiring,
            modelValue: readPath(draft.value, name),
            'onUpdate:modelValue': (value: unknown) => writePath(draft.value, name, value),
        };
    };

    const clearClient = (): void => {
        client.value = {};
    };

    return {
        ...validation,
        ...submit,
        clientErrors: readonly(client) as Readonly<Ref<ValidationErrors<T>>>,
        fieldErrors,
        field,
        FieldLabel: createFieldLabel(id),
        Message: createMessage(message, id),
        refuse,
        setRefusals,
        withdraw,
        clearClient,
    };
}) as UseFormCall;
