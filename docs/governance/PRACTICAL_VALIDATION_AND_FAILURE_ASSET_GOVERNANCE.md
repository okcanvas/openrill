# Practical Validation and Failure Asset Governance

## Decision

OpenRill no longer treats every validation layer as one indivisible PASS/FAIL gate.
A Product feature is accepted from evidence owned by that feature. Optional UI automation,
packaging, and acceptance-harness failures are recorded independently and do not silently
invalidate an already-proven Product core.

## Independent status dimensions

Every current STEP and handoff must report these dimensions separately:

1. `PRODUCT_CORE` — domain/runtime behavior introduced by the STEP.
2. `INTEGRATION` — real provider, database, process, Docker, or connector boundary required by the feature.
3. `OPTIONAL_UI` — browser rendering and interaction when UI is not the STEP's primary Product value.
4. `HARNESS` — runner, fixture, transport, reporter, timeout, cleanup, and evidence machinery.
5. `PACKAGE` — source manifest, fresh extraction, deterministic ZIP, and release identity.

A failure in one dimension blocks only that dimension unless the STEP plan explicitly proves
that the Product cannot function without it.

## Validation profiles

### Development profile

Run only:

- changed-package build/typecheck;
- focused unit tests;
- directly affected integration tests;
- one stable smoke contract.

### Package-candidate profile

Run once per packaged candidate:

- source/version and workspace dependency checks;
- full compile;
- focused feature tests;
- canonical unit suite once;
- architecture and exports;
- manifest before/after packaging;
- fresh extraction verification.

### Live profile

Run only the external boundary required by the Product feature. Examples:

- real OpenAI for provider delegation;
- real Docker daemon for Docker sandbox execution;
- real database for migration/transaction behavior.

### Browser profile

Browser automation is required only when browser behavior is the Product change or when a
security/permission/rendering claim cannot be proved below the browser boundary. Browser
failure must not block a non-UI runtime STEP.

## Stop-loss rule

For one failure class:

1. inspect and record the direct cause;
2. make one bounded correction;
3. rerun only the affected profile;
4. if the same class fails again, stop creating corrective Product STEP suffixes;
5. classify the failure as Product, Integration, Environment, or Harness;
6. redesign or backlog the owning layer before further work.

A runner, fixture, Chromium lifecycle, reporter, or package diagnostic correction does not
increase the Product STEP number unless it changes Product behavior.

## Failure asset record

Every material failure record must contain:

- first observed STEP and evidence file;
- exact symptom and directly inspected cause;
- owner dimension;
- Product impact and whether it blocks promotion;
- same-class prior issue links;
- failed prevention mechanism, when recurrence occurred;
- correction or backlog decision;
- measured execution duration when present in evidence;
- human work duration, or the literal value `NOT_RECORDED` when no reliable ledger exists.

A repeated failure class is not filed as unrelated new work. It is recorded as a failure of the
previous recurrence-prevention mechanism.

## Time accounting

Beginning with STEP015A, each handoff records:

```text
started_at=<timestamp or NOT_RECORDED>
ended_at=<timestamp or NOT_RECORDED>
human_work_minutes=<number or NOT_RECORDED>
automated_run_seconds=<number or NOT_RECORDED>
```

Elapsed values must come from an explicit timer or machine evidence. Conversation timestamps,
memory, or estimates must not be represented as actual work time.

## STEP014 application

The supplied Windows STEP014DR8 evidence proves:

- real external-model parallel delegation stage passed;
- deterministic Control UI reached `startupPhase=READY`;
- delegation navigation was clicked;
- at least three delegation rows rendered;
- exactly one depth-2 row rendered;
- the failure then occurred because `Raw child transcript` appeared;
- Chromium cleanup additionally reported an orphan process.

Therefore:

- STEP014 delegation Product core is accepted;
- raw transcript display remains an unresolved Control UI/privacy issue;
- Chromium orphan remains a Harness issue;
- neither issue justifies another STEP014DR Product correction loop;
- STEP015 proceeds without browser acceptance.
