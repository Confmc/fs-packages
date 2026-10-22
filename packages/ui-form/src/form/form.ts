import type {Ref} from 'vue';

import {computed, nextTick, readonly, ref, useId} from 'vue';

import type {FieldBinding} from '../types';
import type {UiTexts} from './kit';
import type {
    FieldModel,
    SubmitOutcome,
    UseDraftForm,
    UseDraftFormOptions,
    UseForm,
    UseFormOptions,
    ValidationErrors,
} from './types';

import {createFormError, createFormLabel, fieldId, messageId} from './field';
import {useFormSubmit} from './form-submit';
import {createBoundControls, createTextedControls} from './kit';
import {readPath, writePath} from './path';
import {scrollToFirstError} from './scroll-to-first-error';
import {useValidationErrors} from './validation-errors';

/**
 * One-call form composable: the field-error bag, the refusal signal, the in-flight `submitting`
 * (loading) flag and a validation-aware `handleSubmit`, plus everything that links a field to the form.
 * It needs no HTTP service: `handleSubmit` takes the 422 its own action rejected with, so a form holds
 * exactly its own requests' refusals — a dialog's never lands in the page form behind it. A 422 caught
 * outside a submit (a lookup that refuses a field) goes in with `take(error)`. Any other rejection
 * propagates. The action must let the 422 reject: one it catches itself never reaches the form.
 *
 * `field(name)` is a field's whole link to the form — id, invalid, describedby and its message from
 * `fieldErrors` (the server's errors with the form's own refusals on top):
 * `<TextInput v-bind="field('email')" v-model="email" />` + `<FormError name="email" />`, or one control
 * that draws its own label and message through `FormField`. `field()` reads the form when it is called,
 * so call it in the render (the template), not once in `setup()`: a result kept from setup never
 * changes.
 *
 * Call `useForm` in a component's `setup()`: its ids end in a part from `useId()`, unless a fixed
 * `idPrefix` is given.
 *
 * @param options `keyMapper`, `fields`, `scrollToError`, `idPrefix`, `draft` — see `UseFormOptions`.
 */
// Two call shapes: names are free strings, or, with a `draft`, the draft's paths with typed values.
// The overloads are a type; the one implementation below is cast to it, since an arrow function cannot
// declare overloads and its `field` cannot be checked against both generic shapes at once.
export interface UseFormCall {
    <D extends object>(options: UseDraftFormOptions<D>): UseDraftForm<D>;
    // `draft` refused here: a draft TypeScript cannot read as a Ref (a generic shallowRef) is an error at
    // the call, not a silent fall back to a form without one. Name the type there: useForm<D>({draft}).
    <T extends string = string>(options?: UseFormOptions<T> & {draft?: never}): UseForm<T>;
}

const useFormBody = <T extends string = string>(
    options: UseFormOptions<T> & {draft?: Ref<object>} = {},
    texts: UiTexts = {},
): UseForm<T> => {
    const {keyMapper, fields, scrollToError = true, idPrefix, draft} = options;
    const validation = useValidationErrors<T>({keyMapper, fields});
    const submit = useFormSubmit(validation);

    const client = ref({}) as Ref<ValidationErrors<T>>;
    const fieldErrors = computed(() => ({...validation.errors.value, ...client.value}));

    const refuse = (field: T, message: string): void => {
        client.value = {...client.value, [field]: message};
    };

    const setRefusals = (bag: ValidationErrors<T>): boolean => {
        const kept = Object.entries(bag).filter((entry): entry is [string, string] => Boolean(entry[1]));
        client.value = Object.fromEntries(kept) as ValidationErrors<T>;

        return kept.length > 0;
    };

    // The user acted on these fields, so what was said about them no longer holds: drop their server
    // messages and client refusals. Reassigned only when something goes, so a keystroke is free.
    // A path takes everything under it along: `withdraw('goals')` drops `goals.1.title` too, for a list whose
    // rows moved (a message keyed by an index would otherwise sit on another row).
    const withdraw = (...fields: T[]): void => {
        const {errors} = validation;
        const named = (key: string) => fields.some((field) => key === field || key.startsWith(`${field}.`));
        const said = (Object.keys(errors.value) as T[]).filter(named);
        const refused = (Object.keys(client.value) as T[]).filter(named);

        if (said.length) {
            const next = {...errors.value};
            for (const field of said) delete next[field];
            errors.value = next;
        }
        if (refused.length) {
            const next = {...client.value};
            for (const field of refused) delete next[field];
            client.value = next;
        }
    };

    // Unique per form instance by default, so two forms with the same names never share an id.
    const unique = idPrefix === undefined ? {suffix: useId()} : {prefix: idPrefix};
    const id = (name: T): string => fieldId(name, unique);
    const message = (name: T): string | undefined => fieldErrors.value[name] || undefined;

    const field = (name: T): FieldBinding | (FieldBinding & FieldModel<unknown>) => {
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

    const refused = async (): Promise<SubmitOutcome> => {
        if (scrollToError) {
            await nextTick();
            scrollToFirstError(fieldErrors.value, id as (name: string) => string);
        }

        return 'refused';
    };

    const handleSubmit = async (
        action: () => Promise<unknown>,
        {validate}: {validate?: () => ValidationErrors<T>} = {},
    ): Promise<SubmitOutcome> => {
        if (submit.submitting.value) return 'ignored';
        if (validate && setRefusals(validate())) return refused();

        const outcome = await submit.handleSubmit(action);

        return outcome === 'refused' ? refused() : outcome;
    };

    return {
        ...validation,
        submitting: submit.submitting,
        handleSubmit,
        clientErrors: readonly(client) as Readonly<Ref<ValidationErrors<T>>>,
        fieldErrors,
        field,
        // the bound controls name fields by any string at runtime; their types narrow the names
        ...createBoundControls<T>(field as (name: string) => FieldBinding & Partial<FieldModel<unknown>>, texts),
        FormLabel: createFormLabel(id),
        FormError: createFormError(message, id),
        refuse,
        setRefusals,
        withdraw,
        clearClient,
    };
};

// The cast sits here, apart from the body, so mutation testing reaches the body (Stryker does not
// mutate inside a type assertion).
export const useForm = ((options?: UseFormOptions) => useFormBody(options)) as UseFormCall;

/**
 * The package configured once for an app: `useForm` and the bare controls that carry texts, with
 * those texts as their defaults (`createUiForm({texts: {placeholder: 'Kies…', emptyText: 'Geen opties'}})`).
 * Call it once at module level of the app and import its `useForm` where a form is built; the package's
 * own `useForm` is the same with the package's texts.
 */
export const createUiForm = ({texts = {}}: {texts?: UiTexts} = {}) => ({
    useForm: ((options?: UseFormOptions) => useFormBody(options, texts)) as UseFormCall,
    ...createTextedControls(texts),
});
