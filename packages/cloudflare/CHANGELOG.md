# @script-development/fs-cloudflare

## Unreleased

### Patch Changes

- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.

## 0.1.1

### Patch Changes

- First version published through the CI lane (OIDC Trusted Publishing, provenance attestation). No source change: `0.1.0` was bootstrapped out-of-band with a token because Trusted Publishing cannot create a package name, so it carries no provenance. This release is the positive control that the Trusted Publisher grant works.

## 0.1.0

### Minor Changes

- 7cdcead: Add fs-cloudflare package — Express-compatible middleware gating inbound traffic to Cloudflare's egress ranges, with a tested range-refresh script and threat-model documentation.
