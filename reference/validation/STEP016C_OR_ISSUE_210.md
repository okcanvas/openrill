# OR-ISSUE-210 — Package manifest verifier current identity drift

## First observed
STEP016C package-candidate aggregate.

## Evidence
```text
OPENRILL_PACKAGE_MANIFEST_FAIL declared=1265 actual=1265 missing=0 extra=0 changed=0 identity=OpenRill:STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT:0.16.3-step016c
```

## Direct cause
The generator, root package and source identity had advanced to STEP016C, but `scripts/verify_package_manifest.py` still required STEP016B. The historical manifest fixture was already dynamic and was not the cause.

## Classification
Package Harness/current identity alignment. No Product runtime impact.

## Correction
Align the verifier to STEP016C and require current governance to cross-check generator, verifier, root package and generated manifest identity.
