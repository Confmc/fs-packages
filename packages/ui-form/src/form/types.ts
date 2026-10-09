import type {ComputedRef, Ref} from 'vue';

import type {FieldComponent} from './field';

/** Field-error bag: the first backend validation message per field key. */
export type ValidationErrors<T extends string = string> = Partial<Record<T, string>>;

/** Reactive validation-error state returned by `useValidationErrors`. */
export interface UseValidationErrors<T extends string = string> {
    /** Current field errors. Populated from a 422 response, cleared on demand. */
    errors: Ref<ValidationErrors<T>>;
    /** Clear all field errors, the refusal and the unmapped keys together. */
    clearErrors: () => void;
    /** `true` once a 422 has been accepted, until `clearErrors` (which `handleSubmit` calls first). */
    refused: Readonly<Ref<boolean>>;
    /**
     * The mapped keys of the last accepted 422 that `errors` does not hold: not named by
     * `fields`, or whose value was not a list with a string first entry. Each name appears
     * once, however many dropped keys map to it, and never while another key bound it.
     */
    unmapped: Readonly<Ref<readonly string[]>>;
    /** The last accepted 422 named nothing this form can mark — ADR-0048 rule 4's empty-bag check, kept in one place. */
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
    /**
     * Consulted on every 422; while it returns `false` the 422 is ignored — `errors`,
     * `refused` and `unmapped` stay as they were. `useForm`'s `onlyWhileSubmitting` passes
     * one that reads its own `submitting`. Omitted: every 422 is taken.
     */
    acceptWhen?: () => boolean;
}

/** Form-submit helper returned by `useFormSubmit`. */
export interface UseFormSubmit {
    /**
     * Run a submit action with double-submit prevention. A 422 (validation)
     * rejection is swallowed — the field errors have already been surfaced by
     * `useValidationErrors`' response middleware, so the form is preserved. Any
     * other rejection is re-thrown to the caller / error boundary.
     */
    handleSubmit: (action: () => Promise<void>) => Promise<void>;
    /** `true` while a submit action is in flight — the form's loading state. */
    submitting: Ref<boolean>;
}

/** Options for `useForm`: the validation options plus `useForm`-only behaviour. */
export type UseFormOptions<T extends string = string> = Omit<UseValidationErrorsOptions<T>, 'acceptWhen'> & {
    /**
     * Take a 422 only while this form's `handleSubmit` is in flight, so a refusal that lands
     * while the form is idle (a late answer from a screen the user left) does not enter its bag.
     * This is a time window, not request identity: ANY request on the same `HttpService` that
     * answers 422 during the window lands here too — another form's submit, a background save,
     * a dialog's request. Telling the requests apart needs a marker the consumer threads into
     * its request options (WR-1992; DECISIONS D1).
     * @default false
     */
    onlyWhileSubmitting?: boolean;
    /**
     * On a 422, scroll the first invalid field into view. Off unless you ask for it: an
     * `HttpService` is shared, so a 422 fills every mounted form's bag and this cannot tell
     * whose refusal it was — turning it on without a `scrollRoot` lets one form's refusal
     * scroll the page to another form's field. Requires the presentation layer to mark the
     * errored control (the default target is `[aria-invalid="true"]`, which
     * this package's controls render from `:invalid`).
     * @default false
     */
    scrollToError?: boolean;
    /**
     * Scopes the `scrollToError` query to one form's subtree — pass it when forms
     * share a page (a dialog over a page form on the same `HttpService` **must** pass
     * it). Omitted: document-wide. Provided but `null`: no scroll (never falls back to
     * document).
     */
    scrollRoot?: Ref<HTMLElement | null>;
    /**
     * CSS selector for the invalid-field mark, used by `scrollToError`. Defaults to
     * `'[aria-invalid="true"]'` (what this package's controls render). Pass your
     * own when your inputs mark errors differently (e.g. a class) — the package derives
     * no ids and marks nothing itself.
     * @default '[aria-invalid="true"]'
     */
    scrollTarget?: string;
};

/**
 * Everything `useForm` returns: the field-error bag and `clearErrors` from
 * `useValidationErrors`, plus `handleSubmit` and the `submitting` loading flag
 * from `useFormSubmit` — wired together so a page composes one call, not two.
 */
export type UseForm<T extends string = string> = UseValidationErrors<T> & UseFormSubmit & UseFormClient<T>;

/** The refusals a form makes itself, next to the server's. */
export interface UseFormClient<T extends string = string> {
    /** Refusals the form made itself (a check before sending). `handleSubmit` leaves them alone. */
    clientErrors: Readonly<Ref<ValidationErrors<T>>>;
    /** What the fields show: the server's errors with the client refusals on top (client wins per key). */
    fieldErrors: ComputedRef<ValidationErrors<T>>;
    /** A `FormField` bound to this form's `fieldErrors`: `<form.Field name="email">`. */
    Field: FieldComponent<T>;
    /**
     * One field's props for a control that renders its own label and message:
     * `<Textarea v-bind="form.field('description')" label="…" v-model="…" />`.
     */
    field: (name: T) => FieldProps;
    /** Refuse a field from the client, e.g. a check that runs before the request is sent. */
    refuse: (field: T, message: string) => void;
    /**
     * Set the client's whole verdict at once, e.g. the result of a pure `validate(draft)`: the bag
     * REPLACES every earlier client refusal, so a field fixed since the last check is no longer
     * refused. Empty messages are no refusal. Returns `true` when it refused anything, so a save can
     * stop with `if (setRefusals(validate(draft))) return;`. The server's errors are untouched.
     */
    setRefusals: (bag: ValidationErrors<T>) => boolean;
    /** Withdraw the client refusal on these fields; the server's errors are untouched. */
    withdraw: (...fields: T[]) => void;
    /** Withdraw every client refusal, e.g. when an editor opens or closes. */
    clearClient: () => void;
}

/** What `useForm().field(name)` hands a control: the field's current message, read from `fieldErrors`. */
export interface FieldProps {
    error: string | undefined;
}
