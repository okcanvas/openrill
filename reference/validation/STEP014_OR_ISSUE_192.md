# OR-ISSUE-192 — Product acceptance over-coupled to acceptance machinery

## Evidence

STEP014DR1 through STEP014DR8 repeatedly added Product-versioned corrective candidates for
archive placement, provider naming, stream identity, defaults, diagnostics, entrypoint discovery,
stochastic predicates, HTTP transport, canonical runner isolation, Vue materialization, and
Chromium lifecycle/evidence.

The final Windows run proved real delegation behavior while still failing the aggregate because
an optional UI privacy assertion and Chromium cleanup shared one blocking stage.

## Classification

`GOVERNANCE / VALIDATION_DESIGN`

## Failed prevention mechanism

Issue documents and recurrence gates existed, but the operating model continued to combine
Product, UI, Harness, and Package status into one aggregate. Recording failures therefore did not
prevent the same ownership classes from blocking Product progress.

## Prevention

`docs/governance/PRACTICAL_VALIDATION_AND_FAILURE_ASSET_GOVERNANCE.md` establishes independent
status dimensions, profile-based validation, and a one-correction stop-loss rule.
