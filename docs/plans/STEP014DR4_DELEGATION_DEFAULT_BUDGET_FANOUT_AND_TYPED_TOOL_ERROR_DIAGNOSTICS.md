# STEP014DR4 — Delegation Default-Budget Fan-out and Typed Tool Error Diagnostics

## Identity
- version: `0.14.7-step014dr4`
- schema: 14 unchanged
- accepted baseline: STEP013CR2
- retained product: STEP014D + STEP014DR1 + STEP014DR2 + STEP014DR3

## Windows evidence
STEP014DR3 proved the OpenAI alias and stream identity corrections: the root Run completed, `agent.spawn` and `agent.wait` round-tripped canonically, attempt 1 paused as `WAITING_DELEGATION`, attempt 2 completed, and one depth-1 child completed. Acceptance still failed because only one direct child existed and no depth-2 grandchild was created. The second `agent.spawn` completed with `isError=true`.

## Code-confirmed capacity contradiction
The root default budget is turns/model/tool = `8/10/16`. After the first model request, the root has used one turn and one model call. The previous default child reservation was `4/6/8`. One child therefore leaves only `3/3/8` before the second Tool call; a second default child requests `4/6/8` and cannot fit. This contradicts the advertised bounded parallel fan-out surface.

## Correction
- derive default child reservations from bounded fair-share lanes;
- use smaller leaf defaults and a bounded nested-child uplift;
- preserve explicit caller budgets as authoritative;
- prove two root children plus one depth-2 grandchild fit the default root envelope;
- persist an allow-listed typed Tool error code in `tool.completed` and checkpoint events;
- expose the typed code in privacy-safe live diagnostics without Tool arguments/results;
- stop live polling once the root is terminal and all existing children are terminal, then run structural assertions immediately.

## Exclusions
No schema, Protocol, UI, canonical Tool name, provider alias, stream identity, Browser, or accepted-baseline change.
