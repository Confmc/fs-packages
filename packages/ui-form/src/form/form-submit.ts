import {ref} from 'vue';

import type {SubmitOutcome, UseFormSubmit} from './types';

/**
 * Wrap a form-submit action with double-submit prevention and validation-aware
 * error handling. While an action is in flight `submitting` is `true` and
 * re-entrant calls are ignored. Before each attempt `clearErrors()` resets the
 * previous field errors.
 *
 * A rejection is offered to `take`: a 422 it takes is swallowed (the populated
 * form is preserved) and reads as `'refused'`; every other rejection is re-thrown
 * to the caller / async error boundary.
 *
 * @param validationErrors `clearErrors` and `take` — typically the object returned by `useValidationErrors`.
 */
export const useFormSubmit = (validationErrors: {
    clearErrors: () => void;
    take: (error: unknown) => boolean;
}): UseFormSubmit => {
    const submitting = ref(false);

    const handleSubmit = async (action: () => Promise<void>): Promise<SubmitOutcome> => {
        if (submitting.value) return 'ignored';

        submitting.value = true;
        validationErrors.clearErrors();

        try {
            await action();

            return 'sent';
        } catch (error) {
            if (validationErrors.take(error)) return 'refused';

            throw error;
        } finally {
            submitting.value = false;
        }
    };

    return {handleSubmit, submitting};
};
