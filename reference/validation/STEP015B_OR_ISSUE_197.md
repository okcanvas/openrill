# OR-ISSUE-197 — Backend-routed workspace-root cwd lost canonical dot normalization

## Discovery

The STEP015B focused Product-path test used the actual `HostExecutionBackend` through
`ProcessManager.backendRouting` at the workspace root.

The run failed before process spawn:

```text
PROCESS_BACKEND_EXEC_FAILED
workspace path must be a non-empty string of at most 4096 characters
```

## Direct cause

`WorkspaceCatalog.resolve(workspaceId, ".")` correctly represents the workspace root with an empty
canonical relative path. The legacy Process path used the resolved absolute path directly. The new backend
path forwarded that empty relative path as `BackendExecInput.cwd`.

`HostExecutionBackend` performs a second workspace-confinement resolution, where an empty user path is
invalid. Docker happened to tolerate the empty value by mapping it to `/workspace`, so a fake-Docker-only
test would not have detected the Host Product regression.

## Classification

```text
owner=PRODUCT_INTEGRATION
severity=BLOCKING_FOR_STEP015B_SOURCE_ACCEPTANCE
first_detected=STEP015B_FOCUSED_PRODUCT_ROUTE
browser_related=NO
```

## Correction

`ProcessManager` now normalizes the canonical root-relative empty path to `.` before invoking every
execution backend:

```text
cwd: cwd.relativePath || "."
```

The durable ledger continues to retain the canonical empty `cwdRelative` representation; only the backend
invocation contract receives `.`.

## Recurrence prevention

`tests/unit/process-docker-backend-step015b.test.mjs` must execute the actual Host backend through the
Product `ProcessManager` route at workspace root and assert:

- successful execution;
- `backend=HOST`;
- `sandboxed=false`;
- durable `backendKind=HOST`.

A provider abstraction is not accepted based only on fake-provider or Docker-plan tests. Every provider
selected by the Product router must have at least one real focused route test.
