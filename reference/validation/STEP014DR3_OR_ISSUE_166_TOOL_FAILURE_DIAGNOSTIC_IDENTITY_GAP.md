# OR-ISSUE-166 — Tool failure diagnostic identity gap

## Symptom
The durable event ledger already contained `tool.started` names, but the live diagnostic projected only event types. Exact Tool failure identity had to be reconstructed from a hidden-message hash.

## Correction
Diagnostics now project only sequence, event type, Tool name, Tool-call id and `isError`. Arguments, results, event payloads and conversation content remain excluded.
