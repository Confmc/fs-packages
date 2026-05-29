# @script-development/fs-http

## 0.4.0 — 2026-05-15

### Breaking Changes

- **Removed:** `streamRequest` from the public API. The function had **zero realized consumers** across the war-room fleet (Engineer + Sapper M3 + Liaison M3 grep convergence) and had accumulated four library-invariant violations on its option-honoring surface — all sharing the same root cause: streamRequest was a parallel transport built directly on native `fetch`, bypassing the option-honoring discipline that the axios-routed methods inherit from `axios.create()`:
    - `headers` — service-wide `options?.headers` silently dropped (Surveyor M3 F-1).
    - `withXSRFToken` — cookie read + `X-XSRF-TOKEN` emitted unconditionally, ignoring the config (enforcement queue #64 / queue #22 stream portion).
    - `timeout` — Doctrine #8 silently bypassed; no timeout enforcement of any kind on the streaming path (Surveyor M3 F-2; overlaps queue #62 AbortSignal absence).
- Closes enforcement queue #64 and the streamRequest portion of queue #22 in one structural stroke; supersedes PR #86 (which attempted to harden queue #64 in-place before the M3 evidence converged for removal).

### Replacement guidance

If a future streaming use case emerges in a consumer territory, prefer either:

1. **axios with `responseType: 'stream'`** via the standard `getRequest` / `postRequest` methods — inherits all `HttpServiceOptions` (headers, withCredentials, withXSRFToken, smartCredentials, timeout) and the per-call `AxiosRequestConfig` override surface for free.
2. **A deliberate `createStreamHttpService` factory** designed against the option-honoring matrix codified in fs-packages `CLAUDE.md` § Conventions (see "Transport-surface discipline"). Such a factory must enumerate every `HttpServiceOptions` field on day one with a corresponding test pinning each cell as HONORED or N/A-by-construction.

The Surveyor M3 field report (`reports/fs-packages/field/2026-05-15-surveyor-library-config-honor-surface-audit.md`) carries the full matrix verdict and is the precedent record for the structural decision.

## 0.3.0 — 2026-04-30

### Breaking Changes

- **`downloadRequest` no longer touches the DOM.** Signature changes from `(endpoint, documentName, type?) → Promise<AxiosResponse>` to `(endpoint, options?) → Promise<AxiosResponse<Blob>>`. The browser download dance (`Blob` construction, `<a>` element, `link.click`, object URL lifecycle) moves to consumer code. Use `triggerDownload(blob, filename)` from `@script-development/fs-helpers` ≥ 0.1.2 to reproduce the prior behavior in one call.
- **`previewRequest` no longer touches the DOM.** Signature changes from `(endpoint) → Promise<string>` (object URL) to `(endpoint, options?) → Promise<AxiosResponse<Blob>>` (response with the raw Blob). Consumers manage object-URL lifecycle: `URL.createObjectURL(response.data)` to render and `URL.revokeObjectURL(...)` on cleanup.
- **Removed:** `HEADERS_TO_TYPE` map (was used internally to resolve OOXML to xlsx). Consumers that need MIME mapping can supply their own table; the prior table was a one-entry lookup that did not earn its place in transport-layer code.

### Why

`fs-http` should be HTTP transport. Coupling to `Blob`, `document.createElement`, and `URL.createObjectURL`/`revokeObjectURL` made every consumer's tests responsible for stubbing browser globals — fragile under formatters (oxfmt collapsed `function () { return obj }` into arrow-functions, breaking constructor-mock patterns across kendo and ublgenie in April 2026), exposed to vitest 4's class-mock requirement, and a coupling smell between library and test environment. Closes [#59](https://github.com/script-development/fs-packages/issues/59).

### Migration

```ts
// before (0.2.x)
await http.downloadRequest('/files/123/download', 'report.pdf');

// after (0.3.x)
import {triggerDownload} from '@script-development/fs-helpers';
const {data} = await http.downloadRequest('/files/123/download');
triggerDownload(data, 'report.pdf');
```

```ts
// before (0.2.x)
const blobUrl = await http.previewRequest('/files/123/preview');

// after (0.3.x)
const {data} = await http.previewRequest('/files/123/preview');
const blobUrl = URL.createObjectURL(data);
// remember to revoke on cleanup: URL.revokeObjectURL(blobUrl)
```

## 0.2.0 — 2026-04-30

### Minor Changes

- **fs-http**: Adds `timeout?: number` to `HttpServiceOptions` with a 30000ms default. Pass `timeout: 0` to disable (consumer accepts Doctrine #8 responsibility). Behavior change: previously-unset timeouts no longer hang indefinitely. Closes 3-spy convergent finding 2026-04-30.

## 0.1.0

### Minor Changes

- Initial release of @script-development/fs-http — framework-agnostic HTTP service factory with middleware architecture, based on proven patterns from BIO and kendo territories.
