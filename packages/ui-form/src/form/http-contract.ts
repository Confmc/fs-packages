/** What a form reads from a failed request: its response status and body, when there is one. */
interface FailedRequest {
    response?: {status: number; data: unknown};
}

const HTTP_UNPROCESSABLE_ENTITY = 422;

/** A validation refusal: an axios error (fs-http's transport) whose response is a 422. */
export const isValidationRefusal = (error: unknown): error is Required<FailedRequest> =>
    typeof error === 'object' &&
    error !== null &&
    (error as {isAxiosError?: unknown}).isAxiosError === true &&
    (error as FailedRequest).response?.status === HTTP_UNPROCESSABLE_ENTITY;
