# STEP016A — Local Setup, Doctor, and Windows DPAPI Secret Foundation

## Identity

```text
step=STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION
version=0.16.0-step016a
state_schema=15
accepted_product_baseline=STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT
accepted_checks=WINDOWS_DOCKER_64/64
accepted_sha256=1990b189166a2547e0ae5aa81479591914b302e816bb088fd56e4a44f9ffd4db
browser=NOT_IN_SCOPE
windows_dpapi_live=PENDING
```

## Why this STEP exists

Mattermost and its real API/event environment are not available. Building a speculative Connector
SDK before an actual connector contract would reverse the correct dependency direction. STEP016A
therefore improves OpenRill as a usable local Agent product without inventing an external system.

The inspected code gap was concrete:

- config schema accepted `SecretReference.kind=os`;
- `resolveSecretReference()` always threw that the OS provider was not implemented;
- CLI only offered lifecycle and whole-config commands;
- users had to hand-edit YAML, place secrets in environment/file references, and diagnose workspace
  or Docker readiness themselves.

## Product scope

### `openrill setup`

Creates one complete local profile:

- canonical existing workspace and access mode;
- one OpenAI Responses model profile;
- API key stored through Windows DPAPI CurrentUser;
- Host or Docker Process backend;
- explicit Docker fallback, mount mode, and network mode;
- atomic config write with optimistic source revision;
- previous OS secret restoration if config commit or verification fails;
- no literal API-key command-line option.

Interactive setup delegates masked input to PowerShell `Read-Host -AsSecureString`. Automation may
use `--api-key-stdin`; the secret is carried on stdin and never argv or YAML.

### `openrill doctor`

Returns independent readiness checks for:

- config source and recovery mode;
- configured model profiles;
- each secret reference and OS provider availability;
- canonical workspace roots and access modes;
- explicit Host non-sandboxed execution or Docker daemon doctor.

Doctor does not call a paid model endpoint and does not use a browser.

### Windows DPAPI provider

- `System.Security.Cryptography.ProtectedData`;
- `DataProtectionScope.CurrentUser`;
- encrypted blob under the profile config root;
- key-derived bounded filename;
- atomic temporary-file replacement;
- plaintext supplied through stdin or `SecureString`, never argv;
- bounded PowerShell command execution;
- fail-closed on unsupported platforms.

## Explicit exclusions

- no Mattermost or Connector SDK;
- no background service installation;
- no model API billing/connectivity request;
- no browser automation;
- no State schema change;
- no cross-platform macOS Keychain or Linux Secret Service implementation in STEP016A.

## Validation profiles

Development and package profiles verify source/build, focused setup/doctor/DPAPI tests, affected
CLI/config regression, canonical, architecture, exports, manifest, deterministic ZIP, and fresh
extraction. A separate Windows live command verifies real DPAPI storage and resolution without
calling an external model.

## Time ledger

```text
started_at=2026-08-05T06:09:00+09:00
ended_at=2026-08-05T07:05:28+09:00
human_work_minutes=NOT_RECORDED
automated_run_seconds=68.350
```

## Failure assets discovered while closing STEP016A

- OR-ISSUE-204: retained STEP015A governance froze the mutable current Product baseline at STEP014;
- OR-ISSUE-205: a candidate HANDOFF rewrite temporarily omitted retained OR-ISSUE-190/191 visibility.

Both are Harness/documentation defects. Neither changes STEP016A Product version or State schema.
