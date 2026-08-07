# STEP023A — Periodic Maintenance, Physical Retention and Prune

```text
STEP=STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE
VERSION=0.25.0-step023a
STATE_SCHEMA=26
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
MATTERMOST_CONNECTOR=PREPARING_LIVE_PENDING_NON_BLOCKING
```

## Goal

Close the long-running storage lifecycle for durable Task, Task Flow and safe Connector-delivery history without creating a second executor and without allowing retention to mutate active workflow semantics.

## Scope

- schema-26 Connector cleanup deadline, maintenance lease, durable sweep cursor and minimal tombstone tables;
- retention scheduling separated from Task/Flow reconciliation;
- bounded deterministic preview/apply pagination;
- Host-owned periodic sweep with durable ownership and restart continuation;
- physical cascade prune only after current reference protection re-check;
- closed Local Protocol preview/prune/tombstone operations;
- explicit protection for active Runs, children, Flows, Goal references, blockers, completion deliveries, uncertain Connector deliveries and missing receipts;
- tombstone-before-delete and collision fail-closed semantics.

## Non-goals

This step does not prune Conversation/Run/Attempt history directly, compact SQLite pages, run VACUUM, delete Artifact blobs, provide database backup/quarantine/restore, or promote the deferred Mattermost Connector. Those remain later work. STEP023B owns backup/quarantine/repair.

## Acceptance

Local acceptance must include workspace build, STEP023A focused tests, retained Task/Flow/Goal/Connector regression, affected Config/Protocol/Host regression, cumulative governance, full canonical tests, architecture, exports and final manifest. Windows live must use a real local state database and inject restart/lease/cursor cases; it requires no external service.
