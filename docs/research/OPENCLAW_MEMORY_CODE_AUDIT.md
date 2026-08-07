# OpenClaw Memory Code Audit for OpenRill STEP018A

## Source-derived design rules

OpenClaw's source establishes several useful rules:

1. **No hidden memory.** `docs/concepts/memory.md` states that durable memory is written to explicit workspace files; the model remembers only persisted material.
2. **Search before exact read.** `extensions/memory-core/src/prompt-section.ts` instructs the model to use memory search before memory get and to read only the needed lines.
3. **Bounded retrieval.** `extensions/memory-core/src/tools.ts` and shared tool helpers bound result counts, snippets and reads rather than injecting the entire archive.
4. **Provenance matters.** Memory tool results and citation tests preserve the origin path/line so a result can be checked.
5. **Scope is a security boundary.** Cross-agent/session visibility tests explicitly verify which memory sources can be searched.
6. **Lexical fallback is a real mode.** The builtin manager contains FTS-only behavior and tests; vector search is an enhancement, not a prerequisite for useful recall.
7. **Memory is not policy enforcement.** OpenClaw documentation separates remembered context from approvals, sandboxing and scheduled work.

## Adopted in STEP018A

- explicit durable records in OpenRill State;
- workspace scope enforced in every repository query;
- `memory.search` before `memory.get` guidance;
- bounded search count, excerpt and exact read;
- source Conversation/Run provenance;
- SQLite FTS5 lexical retrieval with no paid embedding dependency;
- explicit `remember` and explicit `forget`;
- credential/private-key rejection;
- restart persistence and typed unavailable/not-found errors.

## Deliberately deferred

The following OpenClaw capabilities are not claimed by STEP018A:

- embedding providers and hybrid vector/keyword retrieval;
- Markdown `USER.md`, `MEMORY.md`, daily-note and Dream Diary layers;
- dreaming/consolidation and automatic promotion;
- QMD, Honcho, LanceDB and memory-wiki plugins;
- automatic capture from arbitrary transcripts;
- cross-agent memory sharing;
- imported Codex/Claude/Hermes memory;
- time decay, MMR reranking and query expansion.

These are later candidates only after the explicit memory boundary is accepted and benchmarked.

## OpenRill-specific divergence

OpenRill stores memory in the existing durable SQLite ledger rather than Markdown. This preserves transactionality, profile/workspace isolation, Run provenance, restart recovery and explicit soft deletion. It also avoids treating memory as authorization: approvals and execution confinement remain separate OpenRill subsystems.
