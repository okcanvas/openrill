# STEP014A failure prevention audit

## OR-ISSUE-122

- configured budget ceilings must not reject observed overshoot evidence;
- migration 012 has no usage-versus-ceiling CHECK;
- kernel/service persist actual usage and emit typed total-token/time failures.

## OR-ISSUE-123

- turn counts are per-attempt values;
- Run-wide and exclusion aggregates use SUM;
- restart attempts cannot reset or under-count the cumulative turn budget.

## Baseline and handoff gates

- `config/current-accepted-baseline.json` owns STEP013CR2 `163/163` and exact SHA;
- current package identity independently owns STEP014A/0.14.0;
- root continuation documents contain both identities;
- OpenClaw audit contains exact archive and file hashes;
- no public delegation Tool/Protocol surface is added.

## OR-ISSUE-124 through OR-ISSUE-126

- historical tests own retained behavior, not current release identity;
- legacy execution budget shapes are normalized before SQLite;
- durable deadlines and Kernel checks share one clock domain.

## OR-ISSUE-127 and OR-ISSUE-128

- acceptance source predicates derive the actual Tool Runtime source inventory rather than assuming a filename;
- every statically consumed source path must exist;
- canonical unit files are sorted and expanded before direct subprocess execution;
- no shell wildcard semantics are part of the deterministic aggregate contract.
