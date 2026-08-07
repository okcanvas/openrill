# OR-ISSUE-243 — Protocol state payload shadowed the State database dependency

## Failure

The first protocol test for `taskFlow.create` returned `INTERNAL_ERROR`. `TaskFlowControllerRuntimeFactory.bind()` spread the whole protocol input over factory options. The public business field named `state` therefore replaced the internal `OpenRillStateDatabase` object, causing `this.#state.transaction is not a function`.

## Correction

The factory copies only `workspaceId`, `ownerKey`, and `controllerId` from the binding input. All runtime dependencies remain sourced exclusively from factory construction options.

## Gate

`task-flow-controller-protocol-step020c.test.mjs` creates a Flow with a non-empty business `state` payload through the public operation and completes the controller lifecycle.
