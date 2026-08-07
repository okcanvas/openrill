# STEP010A Schema Owner File Assertion

## Exact symptom

The first STEP010A deterministic acceptance finished `246/247 FAILED`. Every framework, fixture, suite, live regression, security and cleanup gate passed; only this static check failed:

```text
[FAIL] schema-version-seven
```

## Code-confirmed root cause

`run_step010a_acceptance.py` searched for the literal definition in:

```text
packages/state/src/index.ts
```

That file re-exports `OPENRILL_STATE_SCHEMA_VERSION`. The actual owner and literal definition are in:

```text
packages/state/src/migrations.ts
export const OPENRILL_STATE_SCHEMA_VERSION = 7 as const;
```

The acceptance therefore required an implementation detail that the package correctly does not duplicate in its public barrel.

## Impact

- A correct schema-7 package was rejected.
- Copying the literal into `index.ts` would have created duplicate ownership and future drift.
- Similar static gates could inspect a re-export rather than the canonical owner and encourage bad code structure.

## Fix

The schema check now reads `packages/state/src/migrations.ts`, verifies the exact owner declaration, and separately verifies that `index.ts` re-exports the symbol.

## Detailed evidence

Before the fix:

```text
schema owner declaration exists in migrations.ts
index.ts re-export exists
acceptance inspects index.ts literal
result=FAIL
```

After the fix:

```text
schema-owner-version-seven=PASS
schema-public-export=PASS
```

No product source or schema was changed.

## Recurrence-prevention gate

STEP010A acceptance requires both:

- exact schema constant declaration in `packages/state/src/migrations.ts`
- public re-export in `packages/state/src/index.ts`

It must not require duplicate literal declarations in barrel files.
