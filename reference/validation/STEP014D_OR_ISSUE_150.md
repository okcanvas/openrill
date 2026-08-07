# OR-ISSUE-150 — Creation-time ordering was not a parent-child tree

## Symptom and code-confirmed cause

A flat delegation list sorted by creation time can interleave siblings and descendants and does not express the durable graph.

## Correction

Control UI computes roots from child-run membership and traverses children where `parentRunId` equals the parent's `childRunId`, with a seen set and depth indentation.

## Recurrence gate

STEP014D UI boundary tests require relation-based preorder, depth markers and bounded detail fields.
