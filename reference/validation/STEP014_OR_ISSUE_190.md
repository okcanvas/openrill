# OR-ISSUE-190 — Raw child transcript rendered in Control UI

## Evidence

The supplied Windows STEP014DR8 aggregate reached the deterministic UI privacy assertion after:

- Control UI ready state;
- delegation navigation click;
- at least three rendered delegation rows;
- exactly one depth-2 row.

It then failed:

```text
AssertionError [ERR_ASSERTION]: Raw child transcript
true !== false
```

## Classification

`OPTIONAL_UI / PRODUCT_PRIVACY`

## Impact

The delegation runtime and graph are not invalidated. The privacy-safe Control UI claim is not
accepted until the raw marker is removed or transformed at its owning projection boundary.

## Decision

Retain as visible backlog. It does not block STEP015A. No browser correction STEP is created.

## Human work duration

`NOT_RECORDED`
