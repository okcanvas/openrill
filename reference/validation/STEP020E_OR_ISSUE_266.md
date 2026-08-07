# OR-ISSUE-266 — Plan governance used case-sensitive prose instead of a semantic contract

## First observation

STEP020E governance rejected the plan because it searched for lowercase `existing Run coordinator` while the document states `Existing Run coordinator`.

## Classification

Validation governance / prose case sensitivity. The architecture decision and Product execution path were unchanged.

## Correction

The assertion now accepts the semantic phrase independent of initial capitalization while retaining the substantive requirements that autonomous Goal Plan execution is deferred and Flow outcomes remain controller-owned.

## Recurrence gate

Documentation governance is case-insensitive where capitalization has no contract meaning and remains strict only on the underlying architectural decision.
