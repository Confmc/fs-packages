import type {ComputedRef, Ref} from 'vue';

import type {FieldBinding} from '../types';
import type {FieldLabelComponent, MessageComponent} from './field';
import type {Path, PathValue} from './path';

/** Field-error bag: the first backend validation message per field key. */
export type ValidationErrors<T extends string = string> = Partial<Record<T, string>>;

/** Reactive validation-error state returned by `useValidationErrors`. */
export interface UseValidationErrors<T extends string = string> {
    /** Current field errors. Populated by `take` from a 422, cleared on demand. */
    errors: Ref<ValidationErrors<T>>;
    /** Clear all field errors, the refusal and the unmapped keys together. */
    clearErrors: () => void;
    /**
     * Bind the validation errors of a caught 422 and return `true`; anything else returns `false`
     * untouched. `handleSubmit` does this with its own error; call it for a 422 caught elsewhere:
     * `catch (error) { if (!form.take(error)) throw error; }`.
     */
    take: (error: unknown) => boolean;
    /** `true` once a 422 has been taken, until `clearErrors` (which `handleSubmit` calls first). */
    refused: Readonly<Ref<boolean>>;
    /**
     * The mapped keys of the last accepted 422 that `errors` does not hold: not named by
     * `fields`, or whose value was not a list with a string first entry. Each name appears
     * once, however many dropped keys map to it, and never while another key bound it.
     */
    unmapped: Readonly<Ref<readonly string[]>>;
    /**
     * The last taken 422 named no field this form holds (nothing to point at), so a caller can say so
     * after `outcome === 'refused'`. Decided when it is taken: dropping messages later never flips it.
     */
    refusedUnnamed: Readonly<Ref<boolean>>;
}

/** Options for `useValidationErrors`. */
export interface UseValidationErrorsOptions<T extends string = string> {
    /**
     * Maps each raw backend field key to the key stored in the error bag.
     * Defaults to identity — keys are used verbatim (e.g. `first_name`). Pass a
     * snake→camel converter (such as a per-key wrapper over `fs-helpers`'
     * `deepCamelKeys`) when your app addresses fields in camelCase.
     * @default (key) => key
     */
    keyMapper?: (key: string) => string;
    /**
     * The fields this form can mark, by their `keyMapper` name. A 422 key outside the
     * list is left out of `errors` and reported in `unmapped`. Omitted: every key binds.
     */
    fields?: readonly T[];
}

/**
 * How a `handleSubmit` call ended: the action ran to the end (`'sent'`), the server refused it with a
 * 422 (`'refused'`), or it never ran because a submit was already in flight (`'ignored'`).
 */
export type SubmitOutcome = 'sent' | 'refused' | 'ignored';

/** Form-submit helper returned by `useFormSubmit`. */
export interface UseFormSubmit {
    /**
     * Run a submit action with double-submit prevention. A 422 (validation) rejection is
     * taken into the form's bag and swallowed, so the form is preserved; any other rejection
     * is re-thrown to the caller / error boundary.
     */
    handleSubmit: (action: () => Promise<void>) => Promise<SubmitOutcome>;
    /** `true` while a submit action is in flight — the form's loading state. */
    submitting: Ref<boolean>;
}

/** Options for `useForm`: the validation options plus `useForm`-only behaviour. */
export type UseFormOptions<T extends string = string> = UseValidationErrorsOptions<T> & {
    /**
     * When `handleSubmit` ends `'refused'` (the server's 422, or `validate`'s refusals), scroll the
     * first refused field into view, found by the ids this form hands out (`field(name)`'s control,
     * else its `Message`). Never on `refuse`/`setRefusals` alone, so typing never scrolls.
     * @default true
     */
    scrollToError?: boolean;
    /**
     * Replaces the prefix of every id `field()` derives. By default each form takes its own from Vue's
     * `useId()` (`v-3-email`), so ids are unique without anyone thinking; set this only when something
     * outside the form needs a fixed id: `idPrefix: 'invoice'` gives `invoice-email`.
     */
    idPrefix?: string;
};

/**
 * Everything `useForm` returns: the field-error bag and `clearErrors` from
 * `useValidationErrors`, plus `handleSubmit` and the `submitting` loading flag
 * from `useFormSubmit` — wired together so a page composes one call, not two.
 */
export type UseForm<T extends string = string> = UseValidationErrors<T> &
    Pick<UseFormSubmit, 'submitting'> &
    UseFormClient<T> & {
        /**
         * `useFormSubmit`'s `handleSubmit`, plus two steps. `validate` runs first: a bag with a message
         * becomes the client refusals (`setRefusals`) and the call ends `'refused'` without running the
         * action; an empty one clears them and the action runs. On `'refused'` (either way) the first
         * refused field scrolls into view, unless `scrollToError` is off.
         */
        handleSubmit: (
            action: () => Promise<void>,
            options?: {validate?: () => ValidationErrors<T>},
        ) => Promise<SubmitOutcome>;
    };

/** The refusals a form makes itself, next to the server's. */
export interface UseFormClient<T extends string = string> {
    /** Refusals the form made itself (a check before sending). Only `handleSubmit`'s `validate` replaces them. */
    clientErrors: Readonly<Ref<ValidationErrors<T>>>;
    /** What the fields show: the server's errors with the client refusals on top (client wins per key). */
    fieldErrors: ComputedRef<ValidationErrors<T>>;
    /**
     * Everything that links one field to the form: `<TextInput v-bind="field('email')" v-model="email" />`
     * plus `<FieldMessage v-bind="field('email')" />`, or a control that draws its own label and message.
     * The id is the form's prefix plus the name, so it is the same on every render and unique per form.
     */
    field: (name: T) => FieldProps;
    /** A `FormLabel` for one of this form's fields: `<FieldLabel name="email" label="E-mail" required />`. */
    FieldLabel: FieldLabelComponent<T>;
    /** One field's message, its element always rendered: `<Message name="email" />`. */
    Message: MessageComponent<T>;
    /** Refuse a field from the client, e.g. a check that runs before the request is sent. */
    refuse: (field: T, message: string) => void;
    /**
     * Set the client's whole verdict at once, e.g. the result of a pure `validate(draft)`: the bag
     * REPLACES every earlier client refusal, so a field fixed since the last check is no longer
     * refused. Empty messages are no refusal. Returns `true` when it refused anything, so a save can
     * stop with `if (setRefusals(validate(draft))) return;`. The server's errors are untouched.
     */
    setRefusals: (bag: ValidationErrors<T>) => boolean;
    /**
     * Drop these fields' server messages and client refusals now, instead of at the next submit — e.g.
     * when picking a value answers what the message said. Nothing calls it for you.
     */
    withdraw: (...fields: T[]) => void;
    /** Withdraw every client refusal, e.g. when an editor opens or closes. */
    clearClient: () => void;
}

/** What `useForm().field(name)` hands a control: the wiring plus the field's message from `fieldErrors`. */
export interface FieldProps extends FieldBinding {
    error: string | undefined;
}

/** What `field(name)` adds when the form has a draft: the value at that path, and the write back into it. */
export interface FieldModel<V> {
    modelValue: V;
    'onUpdate:modelValue': (value: V) => void;
}

/** `useForm`'s options when it points at the component's draft: the field names are the draft's paths. */
export type UseDraftFormOptions<D extends object> = UseFormOptions<Path<D>> & {
    /**
     * The component's own draft (a ref; stores and adapters stay untouched). With it, `field(name)`
     * also carries the value at that path and writes changes back into `draft.value`, so
     * `<TextInput v-bind="field('firstName')" />` needs no `v-model`. Messages stay until the next
     * submit, as everywhere else; `withdraw(name)` drops one sooner where a form wants that.
     */
    draft: Ref<D>;
};

/** Everything `useForm` returns for a form with a draft: as `UseForm`, named by the draft's paths. */
export type UseDraftForm<D extends object> = Omit<UseForm<Path<D>>, 'field'> & {
    /** The wiring plus the value: `modelValue` is typed as the value at that path. */
    field: <P extends Path<D>>(name: P) => FieldProps & FieldModel<PathValue<D, P>>;
};
