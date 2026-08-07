# OR-ISSUE-122 — budget overshoot evidence blocked by SQLite ceiling CHECK

## Symptom

The Agent Kernel correctly detected a turn reporting 7 total tokens against a 6-token Run ceiling, but persistence failed first with a SQLite CHECK violation.

## Code cause

Migration 012 initially required `used_input_tokens + used_output_tokens <= max_total_tokens` and analogous usage/limit checks. Configured ceilings and observed provider usage were treated as the same invariant.

## Impact

The real typed terminal reason `AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED` could be masked and the actual usage evidence lost.

## Correction

Usage columns require only non-negative values. Service/kernel boundaries enforce ceilings after persisting actual usage. A focused fixture requires an envelope with `used=7`, `max=6`, and the typed terminal reason.
