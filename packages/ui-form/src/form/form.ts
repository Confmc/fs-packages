import type {Ref} from 'vue';

import {computed, nextTick, readonly, ref, useId} from 'vue';

import type {FieldBinding} from '../types';
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
import {readPath, writePath} from './path';
import {scrollToFirstError} from './scroll-to-first-error';
import {useValidationErrors} from './validation-errors';

// A draft typed `any` has every path, so its form would check no name. It gets `DraftTypeUnknown`
// instead, every member `never`: reading a member's value, calling `handleSubmit` or assigning the form to
// anything but a form is an error. It still fits `UseDraftForm` (as `never` did), because a helper generic
// over D returns the unresolved `DraftFormOf<D>`, which TypeScript accepts only when both branches fit.
// A shallowRef over a generic D is read as `any`, as TypeScript cannot read it as a Ref<D>; name the type
// there: useForm<D>({draft}).
type DraftTypeUnknown = {readonly [K in keyof UseForm]: never};
type DraftFormOf<D extends object> = unknown extends D ? DraftTypeUnknown : UseDraftForm<D>;

/**
 * The type of `useForm`: two call shapes, names as free strings, or, with a `draft`, the draft's paths.
 * Exported so a wrapper that configures `useForm` can be typed as `useForm` itself, keeping both shapes.
 */
// The overloads are a type; the one implementation below is cast to it, since an arrow function cannot
// declare overloads.
export interface UseFormCall {
    <D extends object>(options: UseDraftFormOptions<D>): DraftFormOf<D>;
    // `draft` refused here: a draft the first overload cannot take (not a ref) is an error, even from a
    // variable an excess-property check never sees, never a form with free names.
    <T extends string = string>(options?: UseFormOptions<T> & {draft?: never}): UseForm<T>;
}

const useFormBody = <T extends string = string>(
    options: UseFormOptions<T> & {draft?: Ref<object>} = {},
): UseForm<T> => {
    const {keyMapper, fields, scrollToError = true, idPrefix, draft} = options;
    const validation = useValidationErrors<T>({keyMapper, fields});
    const submit = useFormSubmit(validation);

    const client = ref({}) as Ref<ValidationErrors<T>>;
    const fieldErrors = computed(() => ({...validation.errors.value, ...client.value}));

    // An empty message is no refusal (as in `setRefusals`): it drops the field's, so the server's shows again.
    // A refusal already standing, or none dropped, assigns nothing: a check per keystroke costs no render.
    const refuse = (field: T, message: string): void => {
        if ((client.value[field] ?? '') === message) return;

        const next = {...client.value};
        if (message) next[field] = message;
        else delete next[field];
        client.value = next;
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
        const serverSaid = (Object.keys(errors.value) as T[]).filter(named);
        const clientSaid = (Object.keys(client.value) as T[]).filter(named);

        if (serverSaid.length) {
            const next = {...errors.value};
            for (const field of serverSaid) delete next[field];
            errors.value = next;
        }
        if (clientSaid.length) {
            const next = {...client.value};
            for (const field of clientSaid) delete next[field];
            client.value = next;
        }
    };

    // Unique per form instance by default, so two forms with the same names never share an id.
    const unique = idPrefix === undefined ? {suffix: useId()} : {prefix: idPrefix};
    const id = (name: T): string => fieldId(name, unique);
    const message = (name: T): string | undefined => fieldErrors.value[name] || undefined;

    const field = (name: T): FieldBinding | (FieldBinding & FieldModel<unknown>) => {
        const error = message(name);
        const wiring = {id: id(name), invalid: Boolean(error), describedby: error ? messageId(id(name)) : undefined};
        if (!draft) return wiring;

        return {
            ...wiring,
            modelValue: readPath(draft.value, name),
            'onUpdate:modelValue': (value: unknown) => writePath(draft.value, name, value),
        };
    };

    const refused = async (): Promise<SubmitOutcome> => {
        if (scrollToError) {
            // The lookup is by id, so a message element rendered only once refused must be in the DOM
            // first. `validate`'s refusals are set in this same tick, so they need it; a server refusal
            // resumes after Vue's flush already ran, and takes it so it never depends on that order.
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
        FormLabel: createFormLabel(id),
        FormError: createFormError(message, id),
        refuse,
        setRefusals,
        withdraw,
    };
};

/**
 * One-call form composable. Wires `useValidationErrors` and `useFormSubmit` together so a page gets
 * the field-error bag, the refusal signal, the in-flight `submitting` (loading) flag, and a
 * validation-aware `handleSubmit` from a single call instead of composing two, plus everything that
 * links a field to the form.
 *
 * It needs no HTTP service: `handleSubmit` takes the 422 its own action rejects with, so a form holds
 * exactly its own requests' refusals; a dialog's never lands in the page form behind it. A 422 caught
 * outside a submit goes in with `take(error)`. Any other rejection propagates. The action must let the
 * 422 reject: one it catches itself never reaches the form. Reach for `useValidationErrors` /
 * `useFormSubmit` directly when you need one half without the other.
 *
 * `field(name)` is a field's link to the form: its id, whether it is invalid, and the message id its
 * `aria-describedby` names while it has one: `<TextInput v-bind="field('email')" v-model="email" />` +
 * `<FormError name="email" />`, with `<FormLabel name="email" label="E-mail" />` pointing at the same id.
 * `field()` reads the form when it is called, so call it in the render (the template), not once in
 * `setup()`: a result kept from setup never changes.
 *
 * The form refuses fields itself too, next to the server: `refuse(name, message)` refuses one field,
 * `setRefusals(bag)` sets the client's whole verdict (replacing the last one), and
 * `handleSubmit(action, {validate})` checks before it sends: a bag with a message refuses the submit
 * without running the action, an empty one clears the client's refusals and sends. `fieldErrors` is what
 * the fields show, the server's `errors` with `clientErrors` on top (the client's message wins on a field
 * both name); `field()`, `FormError` and the scroll read it. A sent submit clears only the server's
 * messages. `withdraw(...names)` drops both kinds for those fields now, everything under their paths
 * included, e.g. when picking a value answers what a message said; nothing calls it for you.
 *
 * Unless `scrollToError` is `false`, a submit that ends `'refused'` (the server's 422 or `validate`'s
 * refusals) scrolls the first refused field into view before it resolves, found by this form's own ids.
 * Only a submit scrolls: a 422 handed to `take`, a `refuse` or `setRefusals`, or a cleared bag never moves
 * the page.
 *
 * With a `draft`, the field names are the draft's paths (`useForm({draft})` names `errors`, `fields` and
 * every name the form takes by `Path<D>`), and `field(name)` also carries the value at that path and writes changes back into the
 * draft; without one they are free strings, or the union given as `T`.
 *
 * Call `useForm` in a component's `setup()`: its ids end in a part from Vue's `useId()`, unless a fixed
 * `idPrefix` is given. `useId()` counts per app, so two Vue apps mounted on one page need their own
 * `app.config.idPrefix` to keep their forms' ids apart.
 *
 * @param options `keyMapper`, `fields`, `scrollToError`, `idPrefix`, `draft` — see `UseFormOptions` and
 *                `UseDraftFormOptions`.
 */
// The cast sits here, apart from the body, so mutation testing reaches the body (Stryker does not
// mutate inside a type assertion).
export const useForm = useFormBody as UseFormCall;
