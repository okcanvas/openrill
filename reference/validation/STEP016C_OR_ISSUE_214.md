# OR-ISSUE-214 — Authorized Conversation history was misclassified as prompt leakage

## First evidence

The second real Windows STEP016C live run completed setup, Host start, two-turn execution, discovery, durable persistence, explicit Host stop and cleanup. The child then failed only at `AssertionError: redaction`. The aggregate ended `90/91 FAILED`; the live stage took 13.657 seconds rather than timing out.

## Direct cause

The fixture combined `ask`, `conversation list`, and `conversation show` output into one visibility string and required both prompts to be absent. This contradicted the Product contract: `conversation show <id>` deliberately exposes the durable user/assistant message history requested by the authenticated local user. `prompt=STDIN_ONLY` constrains input transport; it does not prohibit an explicit history command from returning stored prompts.

## Correction

The H2 Harness separates three independent assertions:

1. the DPAPI API key is absent from every transient and history output;
2. prompts are not echoed by setup, ask-result, list, status, stop, or Host startup output;
3. prompts are present in the explicitly requested `conversation show` history.

Product version `0.16.3-step016c` and State schema 15 do not change.
