import {ref} from 'vue';

import type {SubmitOutcome, UseFormSubmit} from './types';

import {isValidationRefusal} from './http-contract';

/**
 * Wrap a form-submit action with double-submit prevention and validation-aware
 * error handling. While an action is in flight `submitting` is `true` and
 * re-entrant calls are ignored. Before each attempt `clearErrors()` resets the
 * previous field errors.
 *
 * A 422 rejection is swallowed (the field errors were already surfaced by
 * `useValidationErrors`' middleware, so the populated form is preserved); every
 * other rejection is re-thrown to the caller / async error boundary.
 *
 * @param validationErrors anything exposing `clearErrors` — typically the object
 *                         returned by `useValidationErrors`.
 */
export const useFormSubmit = (validationErrors: {clearErrors: () => void}): UseFormSubmit => {
    const submitting = ref(false);

    const handleSubmit = async (action: () => Promise<void>): Promise<SubmitOutcome> => {
        if (submitting.value) return 'ignored';

        submitting.value = true;
        validationErrors.clearErrors();

        try {
            await action();

            return 'sent';
        } catch (error) {
            if (isValidationRefusal(error)) return 'refused';

            throw error;
        } finally {
            submitting.value = false;
        }
    };

    return {handleSubmit, submitting};
};
