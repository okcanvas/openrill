# OR-ISSUE-352 — Broadcast and embedded post identities were trusted independently

## Observed problem

A forged event could present one channel or user in broadcast metadata and another inside the embedded post.

## Correction

Normalization rejects channel, user, and team identity mismatches before a binding or Run can be created.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
