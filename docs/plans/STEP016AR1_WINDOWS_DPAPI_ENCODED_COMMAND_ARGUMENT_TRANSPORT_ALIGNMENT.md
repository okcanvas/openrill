# STEP016AR1 — Windows DPAPI Encoded-Command Argument Transport Alignment

```text
step=STEP016AR1_WINDOWS_DPAPI_ENCODED_COMMAND_ARGUMENT_TRANSPORT_ALIGNMENT
version=0.16.1-step016ar1
state_schema=15
baseline=STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT
retained_feature=STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION
```

## Trigger

The first real Windows STEP016A aggregate passed 63/64 and failed only
`windows-dpapi-live`. `openrill setup` returned exit 32 before DPAPI storage.

## Direct correction

The provider no longer appends operation/path after string `-Command`. It sends one UTF-16LE
`-EncodedCommand` as the final PowerShell argument, supplies only non-secret operation/path/prompt
metadata through the child environment, and keeps the API key exclusively on stdin or masked
`Read-Host -AsSecureString` input.

Failure messages now retain bounded exit code, signal, timeout, and PowerShell stderr evidence while
never including the secret input.

## Scope

No schema, setup flow, doctor behavior, model network, browser, Connector, or Docker Product behavior; no Mattermost or Connector SDK
changes. Windows DPAPI CurrentUser live is the only promotion gate.

## Validation

Development: zero-dist build, STEP016A setup/doctor tests, STEP016AR1 transport tests, affected CLI/config.
Package candidate: canonical, architecture, exports, manifest, deterministic ZIP, fresh extraction.
Windows promotion: `pnpm acceptance:step016ar1:live`.

```text
human_work_minutes=NOT_RECORDED
browser=NOT_RUN
model_network=NOT_RUN
```

## Harness H1 after Windows attempt 1

The corrected DPAPI Product path passed its real Windows fixture 12/12, but the aggregate invoked the
retained STEP016A fixture and rejected its historical marker. OR-ISSUE-207 corrects only the current
live entrypoint and marker identity. Product version `0.16.1-step016ar1` and schema 15 remain fixed;
no STEP016AR2 is created.
