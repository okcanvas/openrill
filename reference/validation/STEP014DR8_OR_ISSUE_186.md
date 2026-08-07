# OR-ISSUE-186 — Historical STEP014DR7 boundary test froze mutable current release identity

## Symptom

The first STEP014DR8 canonical run stopped at `tests/unit/step014dr7-boundaries.test.mjs`. The retained DR7 test required the mutable root `package.json` version to equal `0.14.10-step014dr7`, so the valid DR8 version `0.14.11-step014dr8` was rejected.

## Direct cause

The historical test mixed two different ownership domains:

- immutable DR7 evidence: retained acceptance/package scripts, DR7 plan and DR7 live client identities;
- mutable current-release identity: root `package.json.version`.

The first domain belongs to the historical DR7 test. The second belongs only to the current source/version and package-manifest gates. This repeats the same ownership class already recorded by OR-ISSUE-102, OR-ISSUE-124, OR-ISSUE-159 and OR-ISSUE-167.

## Correction

The DR7 boundary test now verifies the retained DR7 acceptance/package entrypoints and the immutable DR7 plan version, explicitly rejects DR7 as the current root version, and continues to verify the unchanged STEP013CR2 accepted baseline.

## Recurrence prevention

- historical STEP tests may assert their own immutable plan/report/script identities;
- historical STEP tests must not assert an exact mutable root package version;
- the current release alone owns exact package/source/Host/manifest version alignment;
- canonical validation must execute every retained historical boundary test after each release cut.
