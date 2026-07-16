# @script-development/fs-http

Framework-agnostic HTTP service factory with middleware architecture.

## Installation

```bash
npm install @script-development/fs-http
```

## Usage

```typescript
import {createHttpService} from '@script-development/fs-http';

const http = createHttpService('https://api.example.com', {withCredentials: true, smartCredentials: true});

// Standard requests
const response = await http.getRequest<User[]>('/users');
await http.postRequest('/users', {name: 'Alice'});

// Middleware
const unregister = http.registerRequestMiddleware((request) => {
    request.headers.set('X-Custom', 'value');
});

// Later: clean up
unregister();
```

## API

### `createHttpService(baseURL, options?)`

Creates a new HTTP service instance.

**Options:**

- `headers` — Additional default headers
- `withCredentials` — Send cookies cross-origin (default: `true`)
- `withXSRFToken` — Include XSRF token header (default: `false`)
- `smartCredentials` — Auto-toggle `withCredentials` based on request host matching base URL host (default: `false`)
- `timeout` — Request timeout in milliseconds (default: `30000`). Pass `0` to disable; pass any positive number to override.
- `onMiddlewareError` — Handler (`GuardedMiddlewareErrorHandler`) for a throw from any auto-guarded middleware on this service (default: a loud `console.error`). Must not re-throw.

### Timeout

Per **Doctrine #8 library-author extension** (war-room CLAUDE.md, 2026-04-22), the factory applies a **30000ms default timeout** with `timeout: 0` opt-out and per-request override. See [the docs site Timeout section](https://packages.script.nl/packages/http#timeout) for the full surface contract.

### Authentication & XSRF

For Laravel Sanctum SPA consumers, `withXSRFToken: true` is required to avoid HTTP 419 (CSRF mismatch) on state-changing requests; mocked transports do not surface this. See [the docs site Authentication & XSRF section](https://packages.script.nl/packages/http#authentication-xsrf) for the full discussion (including stateless / non-Sanctum guidance).

### Request Methods

- `getRequest<T>(endpoint, options?)` — GET request
- `postRequest<T>(endpoint, data, options?)` — POST request
- `putRequest<T>(endpoint, data, options?)` — PUT request
- `patchRequest<T>(endpoint, data, options?)` — PATCH request
- `deleteRequest<T>(endpoint, options?)` — DELETE request
- `downloadRequest(endpoint, options?)` — GET as `AxiosResponse<Blob>` for save-to-disk (browser-only)
- `previewRequest(endpoint, options?)` — GET as `AxiosResponse<Blob>` for inline-display (browser-only)

### Middleware

Every registered middleware body is wrapped in `guarded()` **by default** (ADR-0037, since 0.6.0) so a side-effect throw cannot reject a resolved 200 nor mask the real API error. Pass `{guard: false}` as the second argument to register the raw body unguarded (throws propagate). Route the loud signal via `createHttpService(url, {onMiddlewareError})`.

- `registerRequestMiddleware(fn, opts?)` — Returns unregister function
- `registerResponseMiddleware(fn, opts?)` — Returns unregister function
- `registerResponseErrorMiddleware(fn, opts?)` — Returns unregister function
- `guarded(fn, onError?)` — Manual middleware-body guard; still exported for the `{guard: false}` + manual-wrap case

#### Middleware contract

The behaviours below are the full middleware contract — pinned by `tests/middleware-contract.spec.ts` (and the guard-by-default suite in `tests/http.spec.ts`), so a regression fails CI. Written against fs-http **0.6.0** (guard-by-default, ADR-0037).

- **Guarded by default; opt out per call.** Every registered body is wrapped in `guarded()` internally, so a **synchronous** throw is loud-swallowed (`onMiddlewareError` / `console.error`) and cannot reject a resolved 200 nor mask the real API error. Register with `{guard: false}` to run the raw body unguarded — then a sync throw propagates: it rejects the request on the success paths, and on the error path it replaces (masks) the original `AxiosError`.
- **Sync-only, fire-and-forget.** The interceptor loops run each middleware synchronously and are **never `await`ed**. A middleware body that returns a Promise is not awaited — a never-resolving body does not block response delivery, and post-`await` work in an async body races the caller's continuation. Keep middleware bodies synchronous; treat any async work as detached side-channel work.
- **`guarded()` catches synchronous throws only — NOT async rejections.** Because the loop does not await and `guarded()`'s `try`/`catch` is synchronous, a rejected Promise returned by an async-bodied middleware is **not** caught by the guard and does **not** reach `onMiddlewareError`; it surfaces as an unhandled promise rejection (unchanged by ADR-0037). This is the one failure mode guard-by-default does not close — another reason to keep bodies synchronous.
- **FIFO execution order.** Middleware runs in registration order, deterministically, for both the request and the response paths.
- **Per-instance scoping.** Each `createHttpService(...)` owns independent middleware stacks. A middleware registered on service A never fires for service B. Pass one service instance around to share a stack; create multiple to isolate them.
- **Registration is not idempotent.** Registering the same function reference twice fires it twice per request/response. Each registration returns its own `unregister` — call each to remove that registration; one `unregister()` removes only its own copy.
- **Mutation is visible down the chain; response objects are not reused.** All middleware on one response receive the same response object, so a mutation from an earlier middleware is visible to a later one. Axios constructs a fresh response object per request, so a mutation on one response does not bleed into the next.

### Utilities

- `isAxiosError<T>(error)` — Type-safe axios error check
