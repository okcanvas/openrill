# OR-ISSUE-168 — Default child reservation contradicted parallel fan-out

## Symptom
Windows STEP014DR3 completed the root and one child, but the second `agent.spawn` returned `isError=true`; no second direct child or grandchild existed.

## Code-confirmed cause
Root defaults are `8/10/16` turns/model/tool. After one model turn, one previous default child reserved `4/6/8`, leaving only `3/3/8`; the second default child requested `4/6/8` and could not fit.

## Correction
Default reservations use bounded fair-share lanes. Leaf and nested defaults are independently sized, while explicit budgets remain authoritative.

## Gate
A root with one model turn and two Tool calls must create one leaf child and one nested child; the nested child must create one grandchild with default budgets.
