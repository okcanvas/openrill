# OR-ISSUE-112 — Durable evidence raw-text duplication

## Near-miss

The first ledger adapter revision copied bounded in-memory console/page-error events directly into the new persistent evidence table. Those strings may contain application secrets even when network URLs are redacted.

## Correction

The dedicated Browser evidence ledger stores text/stack/failure strings only as SHA-256 plus original length. Network URLs are independently sanitized again at persistence time.

## Scope

This correction governs the new dedicated ledger. Existing conversation Tool-result persistence remains the Agent execution record and is not silently rewritten by STEP013C.

## Gate

The ledger test inserts `hello`, verifies it is absent from persisted JSON, and verifies the expected digest/length shape. Static gates require `durableEvidencePayload` and persistence URL redaction.
