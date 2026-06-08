# @script-development/fs-translation

## 0.1.1 — 2026-06-01

### Patch Changes

- Provenance attestation — republish through the OIDC/provenance pipeline. The `0.1.0` release predates the `NPM_CONFIG_PROVENANCE` workflow hardening, so consumers pinning `^0.1.0` resolved to provenance-unattested releases. This patch carries no functional change; its sole purpose is to re-publish through the now-provenance-enabled pipeline so the published artifact ships an SLSA attestation.
