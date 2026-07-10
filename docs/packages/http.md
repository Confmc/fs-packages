# fs-http

HTTP service factory with middleware architecture.

```bash
npm install @script-development/fs-http
```

## What It Does

`fs-http` wraps [axios](https://axios-http.com/) in a factory pattern, giving you typed HTTP methods and a middleware pipeline for intercepting requests and responses. It's framework-agnostic — no Vue dependency.

## Basic Usage

```typescript
import {createHttpService} from '@script-development/fs-http';

const http = createHttpService('https://api.example.com');

// All methods are generic — pass your response type
const response = await http.getRequest<User[]>('/users');
const users = response.data;

// POST with data
await http.postRequest<User>('/users', {name: 'Alice', email: 'alice@example.com'});

// PUT, PATCH, DELETE
await http.putRequest<User>('/users/1', updatedUser);
await http.patchRequest<User>('/users/1', {name: 'Bob'});
await http.deleteRequest('/users/1');
```

## Configuration

```typescript
const http = createHttpService('https://api.example.com', {
    // Request timeout in milliseconds (default: 30000, pass 0 to disable)
    timeout: 30_000,

    // Send cookies with cross-origin requests (default: true)
    withCredentials: true,

    // Include XSRF token header (default: false)
    withXSRFToken: false,

    // Auto-toggle credentials based on same-origin check (default: false)
    smartCredentials: true,

    // Additional default headers
    headers: {'X-Custom-Header': 'value'},
});
```

### Smart Credentials

When `smartCredentials` is enabled, the service automatically includes credentials for same-origin requests and excludes them for cross-origin requests. This is useful when your application talks to both your own API and third-party services.

## Timeout

The factory ships a compliant timeout surface per the **Doctrine #8 library-author extension** (war-room CLAUDE.md, 2026-04-22).

> Library-author extension (2026-04-22) — Shared HTTP factory packages (e.g., `@script-development/fs-http`) must expose a compliant timeout surface: a default, a required option, or a documented contract plus consumer-level enforcement. Inheriting framework defaults at the library layer silently propagates the violation to every consumer territory.

### Default

Every request method that goes through the axios pipeline — `getRequest`, `postRequest`, `putRequest`, `patchRequest`, `deleteRequest` — inherits a **30000ms (30s) default timeout** when no override is provided. This default is the Armory's compliance posture: consumer territories that adopt fs-http inherit Doctrine #8 enforcement automatically rather than re-implementing it per call.

### Service-wide Override

Pass `timeout` in the options to tighten (or relax) the service-wide default for every request the service issues:

```typescript
// Tighten for a fast-API service
const http = createHttpService('https://api.example.com', {timeout: 5_000});
```

### Service-wide Opt-out

Pass `timeout: 0` to disable the default. The consumer accepts Doctrine #8 enforcement at the call layer — typical use cases are AI streaming endpoints with their own timeout discipline, where a bounded request timeout is wrong by construction:

```typescript
const http = createHttpService('https://ai.example.com', {timeout: 0});
```

### Per-request Override

The existing `AxiosRequestConfig.timeout` parameter on each method overrides the service-wide value for a single call. Use this when most calls fit the service default but a specific endpoint needs different latency tolerance:

```typescript
// Service default (30000ms) for most calls; per-call override for the long one
await http.postRequest('/generate-report', payload, {timeout: 120_000});
```

### `DEFAULT_TIMEOUT_MS`

The default is also exported as a barrel-level constant for consumers that want to reference it explicitly (e.g., to derive a related timeout, or to assert parity in a test):

```typescript
import {DEFAULT_TIMEOUT_MS} from '@script-development/fs-http';
```

## Authentication & XSRF

`withXSRFToken` defaults to `false` because the factory does not know what authentication shape it sits in front of — Laravel Sanctum SPA, stateless API tokens, OIDC backends, and third-party API gateways all want different answers. Consumers must opt in explicitly when their backend plants an XSRF cookie.

### Laravel Sanctum SPA

Laravel's Sanctum stateful middleware plants an `XSRF-TOKEN` cookie on the SPA's domain during the `/sanctum/csrf-cookie` handshake. axios 1.x will only read that cookie and forward it as the `X-XSRF-TOKEN` header when `withXSRFToken: true` is passed explicitly. Without that flag every state-changing request (POST / PUT / PATCH / DELETE) returns **HTTP 419 (CSRF token mismatch)** from Sanctum's middleware.

```typescript
const http = createHttpService(`${location.origin}/api`, {
    withXSRFToken: true, // Laravel Sanctum SPA — read XSRF-TOKEN cookie
    withCredentials: true, // send session cookie (default true)
});
```

::: warning Mocked transports hide this failure mode
Page-integration test suites that mock `@script-development/fs-http` (per ADR-0017) bypass axios entirely — the XSRF cookie / `X-XSRF-TOKEN` header round-trip never executes, so a missing `withXSRFToken: true` does not surface in test output. The first signal arrives in production: every state-changing request to a Sanctum SPA backend returns 419. Set `withXSRFToken: true` at instantiation in any Sanctum SPA consumer.
:::

### Stateless / token / non-Sanctum stacks

Stateless API token stacks (Bearer tokens, OAuth2 access tokens), OIDC backends that do not plant an `XSRF-TOKEN` cookie, and third-party API gateways should leave `withXSRFToken` at the default `false`. Enabling it is a no-op when no `XSRF-TOKEN` cookie exists on the request origin, but the explicit `false` documents the consumer's authentication shape and prevents drift if a Sanctum-shaped middleware is added to the same domain later.

## Middleware

The middleware system lets you intercept requests at three points in the lifecycle. Every registration returns an unregister function:

### Request Middleware

Runs before each request is sent. Use it for authentication headers, request logging, or request modification:

```typescript
const unregister = http.registerRequestMiddleware((config) => {
    const token = getAuthToken();
    if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
    }
});

// Later: stop intercepting
unregister();
```

### Response Middleware

Runs after a successful response. Use it for response logging, analytics, or cache invalidation:

```typescript
const unregister = http.registerResponseMiddleware((response) => {
    console.log(`${response.config.method} ${response.config.url} → ${response.status}`);
});
```

### Response Error Middleware

Runs when a request fails. Use it for global error handling, authentication redirects, or error reporting:

```typescript
const unregister = http.registerResponseErrorMiddleware((error) => {
    if (error.response?.status === 401) {
        redirectToLogin();
    }

    if (error.response?.status === 500) {
        reportToSentry(error);
    }
});
```

::: tip Composing middleware
Other packages hook into these middleware points. `fs-loading` registers request + response + error middleware to track loading state. `fs-dialog` can register error middleware to show error dialogs. You can stack as many middleware handlers as you need — they all run independently.
:::

## Middleware guarding (default-on since 0.6.0 — ADR-0037)

`fs-http` invokes middleware **synchronously and un-awaited, by design** — the interceptor loops are never `await`ed, so async middleware is out of contract. The hazard: if a middleware body throws (a toast that blows up, a store write, a router push, a `JSON.parse` of a cache hash), that throw would escape into the interceptor chain — on the response path **rejecting a resolved 200**, on the error path **replacing the original `AxiosError` with the middleware's throw** and masking the real API failure.

**Since 0.6.0, `fs-http` guards every registered middleware body by default.** `register*Middleware` wraps the supplied body in `guarded()` internally, so a side-effect throw is caught, reported loudly, and swallowed — the interceptor chain is never corrupted — **without you doing anything**. The library stays **loud** (it surfaces the failure, never silently eats it) and **sync-only**.

```typescript
import {createHttpService} from '@script-development/fs-http';

const http = createHttpService(`${location.origin}/api`);

// Guarded automatically: a throw here no longer rejects the resolved 200.
http.registerResponseMiddleware((response) => {
    showToast(`Loaded ${response.config.url}`); // may throw — contained
});

// Guarded automatically: a throw here no longer masks the real AxiosError.
http.registerResponseErrorMiddleware((error) => {
    openErrorDialog(error); // may throw — the 500 still surfaces to the caller
});
```

### Routing the loud signal (`onMiddlewareError`)

By default a swallowed throw is logged loudly via `console.error` (visible to any error tracker that hooks `console`). Pass a service-level `onMiddlewareError` handler to route every auto-guarded middleware failure on that service elsewhere. It receives the thrown value and **must not re-throw** — re-throwing re-opens the exact failure the guard closes.

```typescript
import {createHttpService, type GuardedMiddlewareErrorHandler} from '@script-development/fs-http';

const reportToTracker: GuardedMiddlewareErrorHandler = (error) => {
    errorTracker.capture(error); // must not re-throw
};

const http = createHttpService(`${location.origin}/api`, {onMiddlewareError: reportToTracker});

// Any throw from this body is routed to reportToTracker, not console.error.
http.registerResponseMiddleware((response) => {
    analytics.record(response.status);
});
```

### Opting out (`{guard: false}`)

For the rare body that genuinely wants a throw to propagate, register it unguarded. No such consumer exists today; the option is insurance against a one-way door, not a feature with a known use.

```typescript
http.registerRequestMiddleware(
    (config) => {
        assertInvariant(config); // a throw here WILL reject the request
    },
    {guard: false},
);
```

### `guarded()` (manual wrap)

`guarded()` remains a public export for the `{guard: false}` case, for manual composition, and for consumers still on older fs-http where guarding was opt-in. All three middleware types share the `(arg) => void` shape, so one generic wraps any of them and stays assignable with **zero casts** — `guarded(reqBody)`, `guarded(resBody)`, `guarded(errBody)`. Note that wrapping a body you then register through the default path double-wraps it (inner catches, outer auto-guard never fires) — harmless, but redundant.

```typescript
import {guarded} from '@script-development/fs-http';

const wrapped = guarded((response) => analytics.record(response.status), reportToTracker);
```

::: tip Why default-on, not opt-in
The 2026-05-13 ruling rejected a _silent_ library-side try/catch (silent middleware failure is worse than a loud throw). `guarded()` is a third option that did not exist then — **loud swallow**: it surfaces the failure _and_ lets the request complete correctly. Making it the default (ADR-0037) serves the "be loud, never silent" value strictly better than a loud throw, which still corrupts the request outcome. The fleet-wide WR-0290 wave proved an opt-in consumer obligation is unmet by default — so the guard moved to the substrate.
:::

## File Operations

`downloadRequest` and `previewRequest` are **transport-only** — they GET an endpoint as a `Blob` and return the full `AxiosResponse<Blob>`. Neither touches the DOM. There is no browser save dialog and no object-URL management inside fs-http; the consumer owns that orchestration (fs-packages issue #59). The two names share identical transport (`responseType: 'blob'`); the separate name communicates intent (download = save-to-disk, preview = inline-display).

### Download

GET a file as a `Blob`, then hand the blob to a download utility such as [`triggerDownload`](/packages/helpers) from `@script-development/fs-helpers`:

```typescript
import {triggerDownload} from '@script-development/fs-helpers';

const response = await http.downloadRequest('/reports/annual');
triggerDownload(response.data, 'annual-report.pdf');
```

The response is the full `AxiosResponse<Blob>`, so headers (e.g. `content-type`) are available before the hand-off if you need to derive a filename or extension.

### Preview

GET a file as a `Blob` for inline display (images, PDFs). The consumer manages the object-URL lifecycle:

```typescript
const response = await http.previewRequest('/documents/123/preview');
const blobUrl = URL.createObjectURL(response.data);
// Use blobUrl in an <img> or <iframe> src; revoke when done:
// URL.revokeObjectURL(blobUrl);
```

::: warning `streamRequest` removed in 0.4.0
`streamRequest` was removed in 0.4.0 — it carried four library-invariant
violations on its option-honoring surface (XSRF cookie read, `withXSRFToken`
config, `headers` config, `timeout` config) and had zero realized consumers
across the war-room fleet. See [CHANGELOG](https://github.com/script-development/fs-packages/blob/main/packages/http/CHANGELOG.md#040)
for the disposition and replacement guidance.
:::

## Error Handling

Use the `isAxiosError` type guard to safely check errors:

```typescript
import {isAxiosError} from '@script-development/fs-http';

try {
    await http.postRequest('/users', data);
} catch (error) {
    if (isAxiosError<{message: string}>(error)) {
        // error.response?.data is typed as { message: string }
        console.error(error.response?.data.message);
    }
}
```

## API Reference

### `createHttpService(baseURL, options?)`

| Parameter                   | Type                            | Description                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseURL`                   | `string`                        | Base URL for all requests. **Must be absolute** (e.g. `${location.origin}/api`); relative paths fail fast.                                                                                                                             |
| `options.timeout`           | `number \| undefined`           | Request timeout in milliseconds (default: `30000`; pass `0` to disable)                                                                                                                                                                |
| `options.headers`           | `Record<string, string>`        | Default headers                                                                                                                                                                                                                        |
| `options.withCredentials`   | `boolean`                       | Send cookies cross-origin (default: `true`)                                                                                                                                                                                            |
| `options.withXSRFToken`     | `boolean`                       | Forward `XSRF-TOKEN` cookie as `X-XSRF-TOKEN` header (default: `false`). Set `true` for Laravel Sanctum SPA; leave `false` for stateless / token / non-Sanctum stacks. See [Authentication & XSRF](#authentication-xsrf).              |
| `options.smartCredentials`  | `boolean`                       | Auto-toggle credentials by origin (default: `false`)                                                                                                                                                                                   |
| `options.onMiddlewareError` | `GuardedMiddlewareErrorHandler` | Handler for a throw from any auto-guarded middleware on this service (default: a loud `console.error`). Route to an error tracker. Must not re-throw. See [Middleware guarding](#middleware-guarding-default-on-since-0-6-0-adr-0037). |

### Constants

| Constant             | Type           | Description                                                                              |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `DEFAULT_TIMEOUT_MS` | `const number` | Service-wide default timeout in milliseconds (`30000`); barrel-exported for consumer use |

### Service Methods

| Method                                      | Returns                        |
| ------------------------------------------- | ------------------------------ |
| `getRequest<T>(endpoint, options?)`         | `Promise<AxiosResponse<T>>`    |
| `postRequest<T>(endpoint, data, options?)`  | `Promise<AxiosResponse<T>>`    |
| `putRequest<T>(endpoint, data, options?)`   | `Promise<AxiosResponse<T>>`    |
| `patchRequest<T>(endpoint, data, options?)` | `Promise<AxiosResponse<T>>`    |
| `deleteRequest<T>(endpoint, options?)`      | `Promise<AxiosResponse<T>>`    |
| `downloadRequest(endpoint, options?)`       | `Promise<AxiosResponse<Blob>>` |
| `previewRequest(endpoint, options?)`        | `Promise<AxiosResponse<Blob>>` |

### Middleware Registration

| Method                                       | Returns                | Notes                                                                                      |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `registerRequestMiddleware(fn, opts?)`       | `UnregisterMiddleware` | Auto-guarded by default; pass `{guard: false}` to register the raw body (throws propagate) |
| `registerResponseMiddleware(fn, opts?)`      | `UnregisterMiddleware` | Auto-guarded by default; pass `{guard: false}` to register the raw body (throws propagate) |
| `registerResponseErrorMiddleware(fn, opts?)` | `UnregisterMiddleware` | Auto-guarded by default; pass `{guard: false}` to register the raw body (throws propagate) |

`opts` type: `RegisterMiddlewareOptions` = `{ guard?: boolean }` (default `guard: true`).

### Middleware Guard

| Export                          | Type                                                      | Description                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guarded(fn, onError?)`         | `<T>(fn: (arg: T) => void, onError?) => (arg: T) => void` | Wraps a middleware body so a throw is caught, reported, and swallowed instead of corrupting the interceptor chain. Applied automatically by `register*Middleware` since 0.6.0; exported for the `{guard: false}` + manual-wrap case. See [Middleware guarding](#middleware-guarding-default-on-since-0-6-0-adr-0037). |
| `GuardedMiddlewareErrorHandler` | `(error: unknown) => void`                                | Handler type for `guarded`'s optional second argument and `createHttpService`'s `onMiddlewareError` option; defaults to a loud `console.error`. Must not re-throw.                                                                                                                                                    |
