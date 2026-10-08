/**
 * The part of an HTTP service a form needs: somewhere to hear failed responses. Structural, so the
 * package imports nothing from `@script-development/fs-http` — its `HttpService` (0.5 and 0.6) fits
 * this as it is, and so does any service with the same `registerResponseErrorMiddleware` shape.
 */
export interface FormHttpService {
    /** Register a response-error middleware; returns a function that unregisters it. */
    registerResponseErrorMiddleware: (middleware: (error: FailedRequest) => void) => () => void;
}

/** What a form reads from a failed request: its response status and body, when there is one. */
export interface FailedRequest {
    response?: {status: number; data: unknown};
}

const HTTP_UNPROCESSABLE_ENTITY = 422;

/** A validation refusal: an axios error (fs-http's transport) whose response is a 422. */
export const isValidationRefusal = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    (error as {isAxiosError?: unknown}).isAxiosError === true &&
    (error as FailedRequest).response?.status === HTTP_UNPROCESSABLE_ENTITY;

/**
 * Wrap a middleware body so a throw cannot reject a resolved request or mask the real error: the
 * throw is reported loudly and swallowed. Same contract as fs-http's `guarded()` with its default
 * handler, kept here so the package needs no runtime import of fs-http (fs-http 0.6 also guards
 * every registration itself; 0.5 does not, so this one stays).
 */
export const loudlySwallowed =
    <T>(body: (arg: T) => void): ((arg: T) => void) =>
    (arg: T) => {
        try {
            body(arg);
        } catch (error) {
            console.error('[ui-form] form middleware threw and was swallowed:', error);
        }
    };
