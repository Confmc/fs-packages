/**
 * Where the client IP is read from.
 *
 * `'header'` — a client-IP header written by the platform edge proxy from the TCP peer
 * (fly-proxy's `Fly-Client-IP`). `'socket'` — the TCP peer itself, correct only when Node
 * holds the public listener.
 */
export type CloudflareGateSource = 'header' | 'socket';

/**
 * Client-IP headers an edge proxy is documented to write from the TCP peer and overwrite on every
 * request. A header joins this set only with that guarantee: a client-suppliable header is a bypass.
 */
export type CloudflareGateHeader = 'fly-client-ip';

/**
 * What a `'header'`-mode request without the header gets. `'allow'` admits it — correct only where
 * traffic that never crossed the edge proxy (a private network) must reach gated paths.
 */
export type CloudflareGateMissingHeader = 'deny' | 'allow';

export interface CloudflareGateOptions {
    /** Paths that bypass the gate entirely, matched exactly against `req.path`. No default — health-probe paths differ per app. */
    exemptPaths?: readonly string[];
    /** Client-IP header read in `'header'` mode, matched case-insensitively. Default `'fly-client-ip'`. */
    header?: CloudflareGateHeader;
    /** Default `'deny'`. */
    missingHeader?: CloudflareGateMissingHeader;
    /**
     * Called for every `'header'`-mode request without the header, before `missingHeader` applies. Not called for exempt paths.
     * Must be synchronous: a returned promise is refused with an error, because its failure would arrive after the decision.
     */
    onMissingHeader?: (req: CloudflareGateRequest) => void;
    /** Default `'header'`. */
    source?: CloudflareGateSource;
}

/** Structural subset of an Express 4/5 `Request` — duck-typed so the package needs no Express dependency. */
export interface CloudflareGateRequest {
    path: string;
    get: (name: string) => string | undefined;
    socket?: {remoteAddress?: string};
}

/** `403` rather than `number`: a narrower parameter keeps this assignable from both Express 4 and Express 5 `Response`. */
export interface CloudflareGateResponse {
    sendStatus: (code: 403) => void;
}

export type CloudflareGateMiddleware = (
    req: CloudflareGateRequest,
    res: CloudflareGateResponse,
    next: () => void,
) => void;

export interface CloudflareGate {
    middleware: CloudflareGateMiddleware;
    isCloudflareAddress: (value: string) => boolean;
}
