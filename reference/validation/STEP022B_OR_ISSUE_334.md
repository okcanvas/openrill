# OR-ISSUE-334 — STEP022B governance invented repository and lifecycle source tokens

The first STEP022B governance draft expected `ConnectorRepository`, a literal `deliveryStatus: "UNCERTAIN"`, and a shortened connector registration message. Actual code uses `StateConnectorRepository`, a ternary status projection, and the exact phrase `connector capability must register an adapter with the Host`.

The governance assertions were corrected to the actual source without modifying Product code. This prevents validation from forcing cosmetic implementation changes.
