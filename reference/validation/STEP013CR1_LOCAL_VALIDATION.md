# STEP013CR1 Local Validation

## Identity

```text
STEP013CR1_RESTART_ATTEMPT_POINTER_AND_TYPED_RECOVERY_DIAGNOSTICS
version=0.13.10-step013cr1
schema=11
baseline=STEP013B3
retained_feature=STEP013C
```

## Deterministic results

```text
source/version alignment:       PASS (27 manifests / 26 sources / 3 Host literals)
workspace lock alignment:       PASS (27 importers / 67 dependencies)
workspace module links:         PASS (64 edges / 26 materialized)
workspace build:                PASS
focused Browser/Automation:     79/79 PASS
canonical serial suite:        323/323 PASS
canonical unit files:               58
canonical skipped:                   0
architecture:                  26 packages / 64 edges / 112 sources
exports:                       26/26 PASS
package manifest:             926/926 changed=0
```

The restart fixture proves:

```text
attempt 1 RUNNING
→ recovery marks attempt 1 ABORTED/HOST_RESTART
→ current_attempt_id remains attempt 1 for execution preflight
→ real executeAgentRun creates attempt 2
→ same Agent Run completes
```

The typed diagnostic fixture proves:

```text
ConversationError(RUN_STATE_INVALID)
→ AUTOMATION_CONVERSATION_RUN_STATE_INVALID
```

## Local aggregate

```text
STEP013CR1_RESTART_ATTEMPT_POINTER_AND_TYPED_RECOVERY_DIAGNOSTICS checks=139/140 state=FAILED schema=11 baseline=STEP013B3 retained_feature=STEP013C adapter=PLAYWRIGHT_CORE tools=15 automation_browser=AUTONOMOUS ledger=ACTION_EVIDENCE recovery=RESUME_AND_REOPEN attempt_pointer=ABORTED_RETAINED diagnostics=TYPED_AND_PRESERVED reporter=TAP process_count=0 chromium_orphan=0
```

The only failed stage is `browser-live`. The local environment lacks exact `playwright-core 1.62.0`; the Browser operation is durably recorded as `FAILED/BROWSER_LAUNCH_FAILED`. No Browser launch, crash/restart live success, or Windows acceptance is claimed locally.

The local prerequisite failure diagnostic is metadata-only and does not print conversation messages or raw Tool input.

## Deterministic package and fresh extraction

Two independent source packages were byte-identical before final documentation sealing.

A clean extraction was validated after re-materializing workspace links inside the fresh root:

```text
package manifest:             926/926 changed=0
source/version alignment:      PASS
workspace lock alignment:      PASS
workspace module links:        PASS
workspace build:               PASS
focused Browser/Automation:    79/79 PASS
canonical serial suite:       323/323 PASS
architecture:                 26 packages / 64 edges / 112 sources
exports:                       26/26 PASS
```

The final sealed ZIP is rechecked from a second fresh extraction after this document is included.
