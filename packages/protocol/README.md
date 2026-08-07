# @openrill/protocol

Wire schema/version/codegen. Node filesystem and database dependencies are forbidden.

STEP014D retains all prior closed operations and adds exactly:

```text
delegation.list
delegation.get
delegation.cancel
```

`delegation.list` is bounded to 200 rows and accepts at most one graph anchor. `get` and `cancel` accept only `delegationId`. Public outputs contain bounded relation/status/budget/usage/Artifact/event metadata and never raw task, transcript, reasoning, Tool/provider/event payload. Authorization, repository mutation, subtree cleanup and notices remain Host responsibilities.
