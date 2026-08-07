# OR-ISSUE-241 — Task Flow accepted new child Tasks after cancellation request

## Failure
STEP020B `linkTask()` rejected terminal Flows but did not inspect `cancelRequestedAt`, allowing the cancellation target set to grow after cancellation intent was durable.

## Correction
A new Task link is rejected once cancellation is requested. An exact replay of an already persisted link remains idempotent and does not increment revision.

## Gate
`task-flow-owner-scope-step020br1.test.mjs` proves new admission fails and exact replay remains stable.
