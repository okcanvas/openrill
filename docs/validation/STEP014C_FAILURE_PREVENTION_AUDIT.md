# STEP014C failure-prevention audit

Covered failure classes:

- completed child usage omitted from parent total budgets;
- active capacity inferred from mutable delegation status;
- reserved maxima charged instead of actual usage;
- duplicate reservation release or duplicate parent charge;
- nested Tool scope escalation;
- depth-3 creation under the default depth-2 envelope;
- parent cancellation leaving descendant approval/process/Browser/Run resources alive;
- child deadline without terminal delivery;
- Host restart losing a terminal child result;
- Host restart leaving runnable child Runs unscheduled;
- waiting child incorrectly rescheduled while waiting on a grandchild;
- SQL join ambiguity between delegation and Run status;
- historical STEP014B schema ownership freezing current schema 13.

Automated owners:

```text
tests/unit/delegation-nested-recovery-step014c.test.mjs
tests/unit/delegation-nested-recovery-boundaries-step014c.test.mjs
```
