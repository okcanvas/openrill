# STEP010A UI Framework Architecture Decision Drift

## Exact symptom

After `@openrill/web` changed its public selection from `DEFERRED` to `VUE_3`, `scripts/check_architecture.py` still emitted:

```text
ui_framework=DEFERRED
```

The architecture gate could therefore report a stale framework decision while all dependency checks passed.

## Code-confirmed root cause

The final architecture marker was a literal string:

```python
f"... ui_framework=DEFERRED"
```

It did not read either the public web contract or a canonical decision configuration.

## Impact

- Architecture output could disagree with the Accepted ADR and package public contract.
- A later framework change could appear accepted while automation continued reporting the old decision.
- ZIP-only handoff would contain two competing current states.

## Fix

STEP010A adds `config/ui-framework.json` as the canonical selection record. The architecture checker reads that file and emits its `selection`. Acceptance also checks equality among:

- `config/ui-framework.json`
- `apps/agent-web/src/index.ts`
- accepted ADR
- decision matrix
- architecture marker

## Detailed evidence

The repaired command emits:

```text
OPENRILL_ARCHITECTURE_PASS ... ui_framework=VUE_3
```

The package still has no Vue production dependency; the config separately records that production runtime introduction belongs to STEP011.

## Recurrence-prevention gate

STEP010A acceptance requires:

- no hardcoded `ui_framework=DEFERRED` marker
- architecture checker reads `config/ui-framework.json`
- config selection equals `VUE_3`
- public web contract equals `VUE_3`
- accepted ADR points to Vue 3
- production package dependency remains absent until STEP011
