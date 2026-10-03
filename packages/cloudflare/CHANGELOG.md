# @script-development/fs-cloudflare

## 0.2.0 — 2026-10-03

### Minor Changes

- **A request without the client-IP header is now refused by default (behaviour change, WR-1342).** In `'header'` mode a missing header used to pass, on the reading that the request never crossed the edge proxy. A proxy that stopped writing the header, or a gate pointed at a header the proxy never writes, looked exactly the same, so the gate admitted every request and said nothing. The default is now `missingHeader: 'deny'`. Apps whose private-network callers must reach gated paths opt back in with `missingHeader: 'allow'`. Platform health probes stay covered by `exemptPaths`.
- **New `onMissingHeader(req)` option.** It is called for every `'header'`-mode request without the header, under either policy and before the policy applies, so the case reaches your logs instead of passing or failing in silence (ADR-0048). Exempt paths are never reported. A reporter that throws admits nothing: the error propagates instead of `next()` being called.
- **`header`, `source` and `missingHeader` are validated when the gate is built (breaking for any non-default `header`).** `header` is typed `CloudflareGateHeader` and accepts only `'fly-client-ip'`, matched case-insensitively: a header joins the set only when an edge proxy is documented to overwrite it on every request, because a client-suppliable header is a bypass. An unknown value of any of the three throws at construction. Previously a mistyped header admitted everything, and a `source` other than exactly `'socket'` silently selected the fail-open header mode. New exported types: `CloudflareGateHeader`, `CloudflareGateMissingHeader`.

### Patch Changes

- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.

## 0.1.1

### Patch Changes

- First version published through the CI lane (OIDC Trusted Publishing, provenance attestation). No source change: `0.1.0` was bootstrapped out-of-band with a token because Trusted Publishing cannot create a package name, so it carries no provenance. This release is the positive control that the Trusted Publisher grant works.

## 0.1.0

### Minor Changes

- 7cdcead: Add fs-cloudflare package — Express-compatible middleware gating inbound traffic to Cloudflare's egress ranges, with a tested range-refresh script and threat-model documentation.
