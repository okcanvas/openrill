# OR-ISSUE-126 — durable deadline and Kernel clock used different domains

## Symptom

Recovery and Automation regression Runs created with a deterministic Conversation clock immediately failed `AGENT_TIME_BUDGET_EXCEEDED`, although no configured time had elapsed.

## Cause

The durable `deadline_at` was computed through `ConversationService`'s injected clock while Agent Kernel compared it with process-global `Date.now()`.

## Correction

Conversation Service exposes its owned clock through `currentTime()`. Agent Kernel uses an explicit `options.now` override or that Conversation clock for both deadline fallback and enforcement. A deterministic 100ms clock fixture proves a 10ms envelope does not expire merely because wall-clock epoch differs.
