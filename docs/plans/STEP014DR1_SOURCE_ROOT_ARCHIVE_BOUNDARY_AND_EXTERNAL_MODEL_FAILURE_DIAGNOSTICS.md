# STEP014DR1 — Source Root Archive Boundary and External Model Failure Diagnostics

```text
version=0.14.4-step014dr1
schema=14
baseline=STEP013CR2
retained_feature=STEP014D
```

## Triggering Windows evidence

STEP014D returned `114/117`. Two failures were exact-manifest failures caused by a copied STEP013CR2 ZIP in the source root. The external-model stage failed before any delegation existed and exposed only root status `FAILED`, so the internal typed cause is unknown and must not be guessed.

## Scope

1. Keep exact package-manifest accounting and add an actionable archive-free source-root preflight.
2. Preserve privacy-safe durable Run diagnostics before the live fixture removes its temporary profile.
3. Keep STEP014D Protocol, UI, cancellation, model prompt and Chromium flow byte-equivalent except for diagnostics wiring and current release identity.
4. Retain schema 14 and all STEP014A-D Tools/operations.

## Diagnostic contract

Allowed:
- Run status/recovery/current attempt/last event sequence;
- attempt status, terminal/recovery reason, provider/model identity and numeric usage;
- model invocation request/turn/status/typed error and token counts;
- latest event type/sequence/attempt identity;
- delegation depth/status;
- hidden failure message length and SHA-256.

Forbidden:
- API key, authorization headers, cookies;
- prompt, conversation messages, child task, transcript or reasoning;
- Tool arguments/results and event payload;
- raw provider response or failure message.

## Non-goals

The corrective step does not guess or repair the still-unknown external-model failure. The next Windows run must supply the typed diagnostic. No schema, Tool, Protocol or UI surface is added.
