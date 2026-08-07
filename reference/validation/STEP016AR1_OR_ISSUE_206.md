# OR-ISSUE-206 — Windows PowerShell DPAPI argument transport mismatch

## Evidence

The first real Windows STEP016A run passed every source/package stage and failed only
`windows-dpapi-live` at 63/64. `openrill setup` returned exit 32 with
`Windows DPAPI secret storage failed` before any config commit.

## Direct cause

`WindowsDpapiSecretProvider` invoked Windows PowerShell as:

```text
powershell.exe ... -Command <multiline-script> <operation> <path>
```

The implementation expected the values following `-Command` to appear in PowerShell `$args`.
Windows PowerShell treats the values following a string `-Command` as part of the command to execute,
so the script's `$args[0]` and `$args[1]` contract was invalid. The script therefore failed before
`ProtectedData.Protect` could run.

## Correction

- use UTF-16LE `-EncodedCommand` as the final PowerShell argument;
- pass only non-secret operation/path/prompt metadata through the child process environment;
- keep the secret exclusively on stdin or `Read-Host -AsSecureString`;
- preserve bounded exit code, signal, timeout, and stderr evidence without including secret input;
- reject any recurrence that appends operational arguments after `-Command` or `-EncodedCommand`.

## Classification

Product integration defect in the Windows DPAPI provider, not a Harness failure. One bounded
corrective release is therefore permitted under the stop-loss rule.
