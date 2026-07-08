import type {Ref} from 'vue';

/** Field-error bag: the first backend validation message per field key. */
export type ValidationErrors<T extends string = string> = Partial<Record<T, string>>;

/** Reactive validation-error state returned by `useValidationErrors`. */
export type UseValidationErrors<T extends string = string> = {
    /** Current field errors. Populated from a 422 response, cleared on demand. */
    errors: Ref<ValidationErrors<T>>;
    /** Clear all field errors. */
    clearErrors: () => void;
};

/** Options for `useValidationErrors`. */
export type UseValidationErrorsOptions = {
    /**
     * Maps each raw backend field key to the key stored in the error bag.
     * Defaults to identity — keys are used verbatim (e.g. `first_name`). Pass a
     * snake→camel converter (such as a per-key wrapper over `fs-helpers`'
     * `deepCamelKeys`) when your app addresses fields in camelCase.
     * @default (key) => key
     */
    keyMapper?: (key: string) => string;
};

/** Form-submit helper returned by `useFormSubmit`. */
export type UseFormSubmit = {
    /**
     * Run a submit action with double-submit prevention. A 422 (validation)
     * rejection is swallowed — the field errors have already been surfaced by
     * `useValidationErrors`' response middleware, so the form is preserved. Any
     * other rejection is re-thrown to the caller / error boundary.
     */
    handleSubmit: (action: () => Promise<void>) => Promise<void>;
    /** `true` while a submit action is in flight. */
    submitting: Ref<boolean>;
};
