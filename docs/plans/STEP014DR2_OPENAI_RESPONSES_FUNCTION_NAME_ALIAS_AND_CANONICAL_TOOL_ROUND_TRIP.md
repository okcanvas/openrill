# STEP014DR2 — OpenAI Responses Function Name Alias and Canonical Tool Round Trip

```text
version=0.14.5-step014dr2
schema=14
baseline=STEP013CR2
retained_feature=STEP014D
```

## Triggering Windows evidence

STEP014DR1 passed source-root, manifest, build, focused, canonical, architecture and export stages. The external-model stage failed on the first model invocation with `MODEL_INVALID_REQUEST`, zero token usage, zero Tool calls and no delegation rows.

## Code-confirmed cause

The OpenAI adapter sent OpenRill dotted canonical Tool names directly as provider function names. This violates the provider function-name grammar. The failure occurred before `agent.spawn`, matching the invalid first request.

## Scope

1. Keep canonical names such as `agent.spawn` everywhere inside OpenRill.
2. Project deterministic provider-safe aliases only inside `model-openai-responses`.
3. Use the same alias for Tool definitions and historical function-call input items.
4. Translate streamed provider function calls back to canonical names before Kernel dispatch.
5. Fail closed on alias collision or an unknown provider-returned alias.
6. Retain schema 14, STEP014A-D delegation behavior, Protocol, Control UI, diagnostics and archive boundary.

## Non-goals

No Tool, Protocol, schema, UI, prompt, model selection or delegation policy is added. This step does not mask future provider errors; STEP014DR1 diagnostics remain active.
