# ADR-0035 — Fair-share default delegation reservations

## Decision
Default child budgets are derived from at most four parent active-child lanes. Leaf children receive the lane share. Children that are explicitly allowed to delegate receive a bounded uplift sufficient for one nested child and a resume turn. Explicit Tool arguments continue to override defaults and are checked transactionally against remaining parent capacity.

## Rationale
A declared active-child limit is not useful when one default child reserves most of the parent turn/model budget. The previous `4/6/8` default made the second root child fail after the first model turn. Fair-share defaults preserve bounded fan-out while keeping durable reservation enforcement authoritative.

## Safety
The change does not increase parent authority or total budget. It only changes default reservation sizes. Scope, depth, active-child, total-child, deadline, and exact remaining-capacity checks remain fail-closed.
