# OR-ISSUE-095 — STEP013B1 adapter launch cause diagnostic masking

## Exact command and symptom

The local aggregate reached the concrete Browser stage:

```text
python scripts/run_step013b1_acceptance.py
```

All static, build, focused, canonical, and manifest stages passed. `browser-live` failed because this environment did not contain `playwright-core`, but the visible Tool error was only:

```text
BROWSER_LAUNCH_FAILED: browser launch failed
```

The adapter’s actual code and actionable message, `OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE` and the frozen-install instruction, were present in the cause chain but absent from Tool output and runtime failure evidence.

## Code-confirmed root cause

`BrowserRuntime.#ensureBrowser()` correctly normalized provider-specific failures to the provider-neutral `BROWSER_LAUNCH_FAILED` code, but replaced the message with a constant string. `registerBrowserTools()` intentionally exposes only BrowserRuntime error code/message, so the nested adapter cause was discarded at the public diagnostic boundary.

## Impact

Operators could not distinguish missing `playwright-core`, executable launch failure, or another adapter fault. The acceptance report identified the failing stage but not the code-confirmed prerequisite, increasing the risk of an incorrect fix.

## Fix

BrowserRuntime keeps the neutral `BROWSER_LAUNCH_FAILED` code while deriving bounded detail from an `Error` and optional string `code`. The public message and runtime event now include the adapter code and message, while the original error remains the cause.

## Recurrence-prevention gates

- a fake adapter throws `OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE`;
- `browser.open` must return neutral code `BROWSER_LAUNCH_FAILED`;
- the public message must retain the adapter code and frozen-install instruction;
- provider-neutral packages still do not import adapter error classes;
- real live failure evidence must identify its actual adapter prerequisite.
