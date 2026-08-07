# STEP011 Post-Acceptance Baseline Document Closure Gap

## Issue

```text
OR-ISSUE-055
POST_ACCEPTANCE_BASELINE_DOCUMENT_CLOSURE_GAP
```

## Exact symptom

The immutable STEP011R8 ZIP was created before the Windows run. After the exact `198/198 PASSED` marker, that ZIP still contained candidate-state documents that named STEP010AR1 as the official baseline and described STEP011R8 as pending.

## Code/process-confirmed root cause

Packaging and Windows validation were separate operations, but the repository had no post-acceptance closure workflow. Updating the already-tested ZIP would have changed its SHA and produced an artifact that Windows had not validated. Leaving the documents untouched preserved artifact integrity but left the next conversation without an authoritative promoted baseline inside the source package.

## Impact

- another conversation could incorrectly continue from STEP010AR1;
- accepted and candidate states could be confused;
- modifying the accepted ZIP after validation could falsely claim Windows evidence for different bytes;
- Issue Registry and next-step planning could drift from the exact accepted artifact.

## Fix

1. Preserve the exact accepted ZIP and SHA immutably.
2. Create a separate closure bundle containing the exact marker, baseline promotion, failure audit, and next-step plan.
3. Start the next STEP from the immutable accepted source and merge closure state into the new source tree.
4. Store the previous accepted artifact name and SHA in the new validation documents.
5. Reject stale `pending/candidate` baseline wording for the previous STEP in current baseline documents.

## Evidence

```text
accepted_step=STEP011R8_APPROVAL_CREATION_NOTICE_AND_UI_LIST_REFRESH
accepted_checks=198/198
accepted_sha256=c1d7805ac2f1598085aa800755efe4c0fe8ec143a93c028907e226bbd6b116be
next_source=STEP012A_AUTOMATION_DOMAIN_AND_PERSISTENCE_FOUNDATION
```

## Automated recurrence-prevention gate

STEP012A acceptance verifies all of the following:

- current baseline documents name STEP011R8 as Windows-live accepted;
- the exact accepted ZIP SHA appears in the accepted evidence document;
- current baseline documents do not describe STEP011R8 as pending or as the current candidate;
- OR-ISSUE-055, this detailed document, and the post-acceptance gate all exist;
- current package identity is separate from the previous accepted artifact identity.
