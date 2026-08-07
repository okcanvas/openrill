# OR-ISSUE-398 — Historical STEP022B Host fixture compatibility expired at the next Product version

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: historical fixture compatibility / current Host version ownership
- Failure: `tests/unit/connector-host-step022b.test.mjs` created a fixture Extension with `maxExclusive: 0.24.0`. Once the current Host advanced to `0.25.0-step023a`, the Extension was correctly rejected as incompatible, so `connector.account.list` returned an empty list even though STEP023A retention had not deleted Connector accounts.
- Correction: the historical fixture now declares only the minimum Host version it actually requires. Dedicated Extension compatibility tests continue to own incompatible-version rejection.
- Product impact: none. No Connector account, maintenance, Extension runtime, or Product runtime semantics changed.
- Recurrence rule: historical integration fixtures must not encode a short-lived upper Host-version bound unless that upper-bound rejection is the behavior under test.
