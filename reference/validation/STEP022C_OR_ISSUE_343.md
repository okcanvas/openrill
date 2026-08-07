# OR-ISSUE-343 — Mattermost Extension activation initially required a circular runtime and port construction

## Observed problem

The runtime required a Host connector port, while registration required an adapter whose methods were expected to call the runtime.

## Correction

The Extension registers a closed delegate first, receives the Host port, constructs the runtime, and only then starts it. The delegate exposes bounded STARTING behavior until construction completes.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
