# OR-ISSUE-182 — Current deterministic UI fixture imported a nonexistent copied seed module

## Symptom

The first complete STEP014DR7 aggregate reached `deterministic-nested-control-ui-live` and failed immediately with `ERR_MODULE_NOT_FOUND` for `scripts/step014dr7-deterministic-nested-fixture.mjs`.

## Root cause

The current live script was copied from DR6 and its import was renamed to a presumed DR7 fixture, but no DR7 fixture existed. The deterministic schema-14 graph seed is retained product evidence owned by the existing DR6 fixture and did not require a copy.

## Correction

STEP014DR7 imports the retained `scripts/step014dr6-deterministic-nested-fixture.mjs` explicitly. The current boundary gate requires the retained module to exist and rejects references to an invented DR7 copy.

## Recurrence gate

The current live script must resolve every relative import, use the retained deterministic seed owner, and the acceptance required-file inventory must include both the live script and retained fixture.
