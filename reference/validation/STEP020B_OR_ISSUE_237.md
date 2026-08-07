# STEP020B OR-ISSUE-237 — Task Flow workspace foreign key exceeded the accepted ownership boundary

## Observation

The first Task Flow lifecycle test failed while inserting a Flow for configured workspace `alpha` because migration 019 referenced `workspace_registrations`, but the accepted Conversation and Task path does not create or require that row.

## Direct cause

The initial migration guessed that durable Flow ownership must be enforced through a physical foreign key to `workspace_registrations`. This was stronger than the existing runtime contract, where configured workspace IDs are authorized by Product services and Conversation provenance is valid without that registration table.

## Correction

The unrelated foreign key was removed from `task_flows.workspace_id`. `TaskFlowService` retains explicit configured-workspace authorization, and linked Tasks must have the same workspace as the Flow.

## Recurrence prevention

- New durable records must use the same workspace ownership preconditions as the accepted domain they extend.
- A physical foreign key may not introduce a new mandatory registration workflow without code evidence and a migration plan.
- Focused tests create a valid Conversation/Task/Flow using only the accepted configured workspace path.
- Cross-workspace Task links still fail closed at the service boundary.
