# STEP020ER2 — Windows completion LIVE marker contract alignment

## Scope

Correct only the acceptance evidence contract exposed by the actual STEP020ER1 Windows result. No completion-delivery, Local Protocol retry, State schema, Task, Flow, Run, or Host lifecycle Product behavior changes.

## Contract

1. `config/step020er2-live-marker-contract.json` is the single mutable source for current STEP, version, schema, Harness identity and semantic marker fields.
2. The Windows live runner renders its final marker from that contract.
3. The aggregate runner parses exactly one current marker and compares key/value fields structurally.
4. Field order is not contractual.
5. Missing, extra, duplicate or changed fields fail with an explicit diff.
6. `queue` and `migration` are mandatory and tested.
7. STEP020E completion semantics and STEP020ER1 bounded transport retry remain unchanged.

## Deferred

Autonomous Plan execution, physical prune, periodic/distributed sweeping, Browser LIVE, external model and real Connector remain deferred.
