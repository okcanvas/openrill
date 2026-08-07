# STEP014DR8 Failure Prevention Audit

## Audited failure

Windows STEP014DR7 returned 319/320. The real OpenAI stage passed. The deterministic UI stage failed before Vue mount because the aggregate runner omitted the exact Vue acquisition/vendor-aware build chain previously established by STEP012DR2.

## Prevented recurrence classes

### Generated static dependency omitted from aggregate build

The aggregate owns exact Vue acquisition, independent re-extraction, byte/hash verification and vendor-aware build. A plain build without the acquired vendor root cannot satisfy the DR8 source gate.

### Browser selector timeout hides bootstrap failure

The deterministic UI stage verifies runtime and lock over the actual Host HTTP path before Chromium. CDP evidence captures navigation, network, console, runtime and bounded page state. UI readiness requires both `startupPhase=READY` and the expected navigation control.

### Historical corrective contract silently dropped

OR-ISSUE-184 explicitly links this recurrence to OR-ISSUE-074. The current recurrence gate checks both the historical rule and its current aggregate ownership.

### Historical boundary test freezes the next release

OR-ISSUE-186 removes exact mutable root-version ownership from the retained DR7 boundary test. Historical tests retain their own scripts and plan evidence; current source/version and manifest gates alone own the mutable current identity.

### Browser launch fails before outer ownership transfer

OR-ISSUE-187 makes `launch()` own partial Chromium cleanup from the moment of spawn. DevTools, CDP, evidence-enable and navigation failures now close the process locally before the original error is returned.

### Lifecycle audit omits the current fixture family

OR-ISSUE-188 extends the machine audit from retained DR6 exemplars to the actual DR8 external and deterministic live clients. The audit now fails if current HTTP, Host or Chromium ownership drifts.

### Final cleanup failure is hidden

OR-ISSUE-189 removes `.catch(() => undefined)` suppression from the final resource owner. Body failure and every cleanup failure are preserved together, while cleanup-only failure independently fails acceptance.

## Product boundary

Schema 14, migrations, `agent.spawn`, `agent.wait`, delegation graph/budget/recovery, Protocol operations, OpenAI adapter and Control UI product source remain unchanged except package version identity.
