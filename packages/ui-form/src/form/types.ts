import type {Ref} from 'vue';

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
    /** `true` once a 422 has been taken, until `clearErrors` (which a `'sent'` submit calls). */
    refused: Readonly<Ref<boolean>>;
    /**
     * The mapped keys of the last taken 422 that `errors` does not hold: not named by
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
 * 422 (`'refused'`), the action resolved `false` because it sent nothing, such as a save the user
 * declined (`'cancelled'`), or it never ran because a submit was already in flight (`'ignored'`).
 */
export type SubmitOutcome = 'sent' | 'refused' | 'cancelled' | 'ignored';

/** Form-submit helper returned by `useFormSubmit`. */
export interface UseFormSubmit {
    /**
     * Run a submit action with double-submit prevention. A 422 (validation) rejection is
     * taken into the form's bag and swallowed, so the form is preserved; any other rejection
     * is re-thrown to the caller / error boundary. An action that resolves `false` sent
     * nothing: the messages stay. The previous messages stand until the action settles.
     */
    handleSubmit: (action: () => Promise<unknown>) => Promise<SubmitOutcome>;
    /** `true` while a submit action is in flight — the form's loading state. */
    submitting: Ref<boolean>;
}

/** Options for `useForm`: the validation options plus the scroll to the first invalid field. */
export type UseFormOptions<T extends string = string> = UseValidationErrorsOptions<T> & {
    /**
     * When `handleSubmit` ends `'refused'`, scroll the first invalid field into view before it
     * resolves; never on `take` alone, so a 422 caught outside a submit leaves the page where it is.
     * Off unless you ask for it: the query is document-wide unless `scrollRoot` scopes it, so on a page
     * with more than one form a field another form still marks can be the one scrolled to. Requires
     * the controls to mark the errored field (the default target is `[aria-invalid="true"]`, which
     * this package's controls render).
     * @default false
     */
    scrollToError?: boolean;
    /**
     * Scopes the `scrollToError` query to one form's subtree; pass it when forms share a page.
     * Omitted: document-wide. Provided but `null`: no scroll (never falls back to the document).
     */
    scrollRoot?: Ref<HTMLElement | null>;
    /**
     * CSS selector for the invalid-field mark, used by `scrollToError`. Pass your own when your
     * inputs mark errors differently (e.g. a class); the form marks nothing itself.
     * @default '[aria-invalid="true"]'
     */
    scrollTarget?: string;
};

/**
 * Everything `useForm` returns: the field-error bag, `take` and `clearErrors` from
 * `useValidationErrors`, plus `handleSubmit` and the `submitting` loading flag from `useFormSubmit`.
 */
export type UseForm<T extends string = string> = UseValidationErrors<T> & UseFormSubmit;
