# @script-development/fs-theme

## Unreleased

### Patch Changes

- **Published object-shape type aliases are now declared as `interface` (WR-1633).** Runtime is unchanged. An `interface` has no implicit index signature, so a converted type is no longer assignable to `Record<string, unknown>` without one (0 consumers measured across 64,338 fleet files). Declaration merging becomes possible, which is additive.

## 0.1.1 — 2026-06-01

### Patch Changes

- Provenance attestation — republish through the OIDC/provenance pipeline. The `0.1.0` release predates the `NPM_CONFIG_PROVENANCE` workflow hardening, so consumers pinning `^0.1.0` resolved to provenance-unattested releases. This patch carries no functional change; its sole purpose is to re-publish through the now-provenance-enabled pipeline so the published artifact ships an SLSA attestation.
