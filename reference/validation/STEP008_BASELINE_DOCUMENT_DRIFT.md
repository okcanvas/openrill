# STEP008 Baseline Document Drift

## Issue

`OR-ISSUE-013`

## Exact symptom

The freshly extracted STEP007 package was internally inconsistent after the user completed the real Windows run:

```text
STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER
checks=112/112
state=PASSED
```

However, the packaged documents still stated:

```text
HANDOFF.md: Windows STEP007 acceptance: PENDING
README.md: Windows live acceptance is pending
README.md: STEP006A Windows live: PENDING
README.md: Unit tests: 65/65
README.md: OpenClaw evidence: 104/104
```

The source package therefore could not be treated as a complete handoff without the external conversation.

## Code-confirmed root cause

`README.md`, `HANDOFF.md`, `PLANS.md`, `ROADMAP.md`, and `VALIDATION.md` were manually updated and no acceptance gate compared their current baseline, version, schema, previous Windows acceptance, and next STEP. STEP007 acceptance checked plan headings and implementation contracts, but did not check baseline-document coherence.

## Impact

- A new conversation reading only the ZIP would incorrectly rerun an already accepted Windows gate.
- Old test/evidence counts could be mistaken for the current package inventory.
- The documented next STEP depended on external chat history instead of packaged state.

## Fix

STEP008 rewrites the baseline documents from one consistent state:

```text
current packaged baseline = STEP008_WORKSPACE_AND_FILE_TOOLS
version = 0.8.0-step008
previous Windows-live baseline = STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER
STEP008 Windows live = PENDING
next = STEP009_PROCESS_TOOL_AND_APPROVAL_RESUME
```

## Recurrence-prevention gate

`run_step008_acceptance.py` checks all five baseline documents for the same STEP, version, schema, previous Windows-live baseline, current Windows status, and next STEP. It also rejects stale `STEP007 ... PENDING` statements in active baseline sections.
