# Maintenance Retention Contract

## Ownership

The Agent Host owns periodic retention orchestration. Task and Task Flow maintenance services own retention scheduling for their ledgers. The State retention repository owns candidate ordering, protection inspection, lease state, sweep continuation, tombstones, and physical deletion. Connector transports do not own retention.

## Scheduling versus reconciliation

Retention scheduling is not lifecycle reconciliation. `TaskMaintenanceService.scheduleRetention()` and `TaskFlowMaintenanceService.scheduleRetention()` may only stamp missing cleanup deadlines on already-terminal, structurally safe rows. Periodic retention must not mark Tasks LOST, replay Flow cancellation, or make controller decisions.

## Candidate ordering and continuation

Expired candidates are ordered by `(cleanupAfter, entityKind, entityId)`. Manual preview/prune exposes an opaque workspace-bound continuation cursor. Periodic sweeps persist the same tuple under `maintenance_sweep_state` and advance it with revision-CAS so protected prefixes cannot permanently starve later eligible rows across intervals or Host restart. End-of-scan resets the persisted cursor to the beginning for the next pass.

## Durable ownership

Physical prune requires an unexpired `maintenance_leases` owner/token lease for `retention:<workspaceId>`. Lease ownership is checked again in the same SQLite transaction immediately before each prune. A lost lease stops before unowned work and returns continuation after the last committed candidate.

## Fail-closed protection

A due timestamp alone never authorizes deletion. Immediately before delete, the repository re-reads the entity and protects it when any live or unresolved dependency exists.

Task protections include an active owning Run, active child Task, active Task Flow, actionable completion delivery, active Goal Step, or OPEN blocker.

Task Flow protections include an active child Task, actionable completion delivery, or any immutable Goal execution reference.

Connector delivery protections include non-safe terminal status, OPEN dead letter, or a DELIVERED row without a durable provider receipt. UNCERTAIN/DEAD history is not automatically pruned.

## Tombstone-before-delete

Each successful prune first inserts a minimal tombstone containing identity, terminal status, source reference, terminal/cleanup/prune times and a SHA-256 metadata hash. Raw Task text, Connector payload, receipt body, errors and secrets are not copied. Tombstone insertion and root deletion occur in one transaction. Tombstone identity collision aborts the transaction.

## Public protocol

- `maintenance.retention.preview` is read-only and never schedules or deletes.
- `maintenance.retention.prune` is explicit apply and may schedule missing retention before pruning.
- `maintenance.retention.tombstones` exposes only the closed tombstone projection.

All inputs are closed, bounded, workspace-scoped and cursor-bound.

## Periodic Host lifecycle

Maintenance is Host-owned, overlap-protected, starts after startup recovery, runs on a bounded interval, and clears its timer before database close. `maintenanceAutoArm=false` exists for historical/isolated test ownership; Product default is enabled unless config disables maintenance.
