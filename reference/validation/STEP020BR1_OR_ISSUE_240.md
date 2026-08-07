# OR-ISSUE-240 — Workspace-only Task Flow ownership admitted cross-Conversation Tasks

## Failure
STEP020B stored `workspaceId` and `controllerId` but no owner key. A Flow could link Tasks from different Conversations inside the same Workspace.

## Correction
Schema 20 persists `ownerKey`, currently the owning Conversation ID. Creation validates the Conversation and Workspace; all reads and mutations require the owner; Task admission requires `task.conversationId === flow.ownerKey`. Legacy mixed/unlinked Flow rows are isolated.

## Gate
`task-flow-owner-scope-step020br1.test.mjs` proves cross-owner admission and access fail closed.
