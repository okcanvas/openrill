# OR-ISSUE-093 — STEP013B1 latest accepted baseline historical test freeze

## Exact command and symptom

```text
node scripts/run-step001-suite.mjs
```

The canonical suite failed `current root documents own the current release and latest accepted baseline while historical evidence stays dedicated`. The test required every mutable root document to continue claiming STEP012DR4 `180/180` and its ZIP SHA after STEP013AR4 had been Windows accepted `190/190`.

## Code-confirmed root cause

A test created for historical baseline ownership froze the then-current accepted identity as a permanent mutable-root assertion. It correctly separated dedicated older evidence, but did not separate that immutable history from the replaceable `latest accepted baseline` slot.

## Impact

Correct promotion of STEP013AR4 was rejected, encouraging stale root documentation and contradicting the uploaded accepted ZIP/report evidence.

## Fix

Mutable root documents now own the current candidate and latest accepted STEP013AR4 identity. Dedicated STEP012DR4, STEP012CR1, STEP012BR1, and STEP011R8 evidence checks remain unchanged and continue to preserve history.

## Recurrence-prevention gates

- current release identity is derived from `PACKAGE_MANIFEST.json`;
- latest accepted identity is updated only in the mutable-root ownership assertion;
- prior accepted releases remain asserted in dedicated evidence files;
- future promotion must update current root ownership without deleting historical evidence.
