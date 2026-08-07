# STEP020BR1 Task Flow Owner Scope and Cancel Admission Closure

## Scope
- persist Conversation-scoped `ownerKey`;
- require the owner Conversation to exist in the same Workspace;
- filter/read/mutate Flow by Workspace plus owner;
- reject same-Workspace cross-Conversation Task links;
- reject new links after `cancelRequestedAt`;
- preserve exact existing-link replay;
- add Task-to-Flow reverse projection;
- migrate schema 19 rows without deletion.

## Explicit policy
The registry attachment primitive may retain an already terminal Task when it has the same owner. This supports durable historical grouping. A future bound controller runtime must create active child Tasks through its own admission path.

## Deferred
Bound controller runtime, autonomous Plan-to-Task execution, LOST reconciliation, notification/delivery, retention, distributed workers, external model, browser live and real connector remain deferred.
