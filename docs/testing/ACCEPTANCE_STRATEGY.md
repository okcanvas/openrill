# Acceptance Strategy

OpenRill validation is profile-based and ownership-aware.

## Status dimensions

1. **Product Core** — domain/runtime behavior introduced by the STEP.
2. **Required Integration** — external boundary without which that Product behavior is not real.
3. **Optional UI** — browser behavior when UI is not the STEP's primary value.
4. **Harness** — runner, fixture, timeout, reporter, cleanup, and evidence machinery.
5. **Package** — source identity, manifest, fresh extraction, and deterministic archive.

These dimensions are reported independently. A Harness failure does not automatically invalidate
Product evidence.

## Profiles

### Development
- changed-package build/typecheck;
- focused unit tests;
- affected integration tests;
- one stable smoke contract.

### Package candidate
- source/version and workspace checks;
- full compile once;
- focused feature tests;
- canonical unit suite once;
- architecture and exports;
- package manifest before/after;
- fresh extraction verification.

### Live
Only the external boundary required by the STEP: OpenAI, Docker, database, connector, or another
explicit dependency.

### Browser
Only browser-owned Product work or security/permission/rendering claims that cannot be validated
below the browser boundary.

## Stop-loss

One direct-cause correction is allowed per failure class. Same-class recurrence stops the
corrective Product STEP loop and triggers ownership reclassification or validation redesign.

The complete governance contract is
`docs/governance/PRACTICAL_VALIDATION_AND_FAILURE_ASSET_GOVERNANCE.md`.
