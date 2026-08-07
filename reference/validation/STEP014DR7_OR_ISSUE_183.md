# OR-ISSUE-183 — STEP014DR7 live Protocol clients retained a copied DR6 version literal

## Symptom

The external-model and deterministic UI live scripts identified themselves as `0.14.9-step014dr7` while the current package version is `0.14.10-step014dr7`.

## Root cause

The DR7 scripts were derived from DR6 and the client identity suffix was updated without aligning the numeric version to the current release owner.

## Correction

Both DR7 `LocalProtocolClient` instances now publish the exact current package version `0.14.10-step014dr7`.

## Recurrence gate

STEP014DR7 boundaries derive the current root version and require both current live clients to contain that exact identity while rejecting the stale mixed version.
