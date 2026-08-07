# OR-ISSUE-322 — Connector migration referenced nonexistent workspace and Run tables

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

The first schema draft guessed a `workspaces` table and a `runs` table. The actual state schema has no workspace table and the canonical Run table is `agent_runs`.

## Correction

Remove the workspace foreign key and reference `agent_runs`. Migration tests open a fresh schema 25 database.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
