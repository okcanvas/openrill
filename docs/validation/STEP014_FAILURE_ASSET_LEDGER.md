# STEP014 Failure Asset Ledger

## Evidence authority

- Source baseline: STEP014DR8 ZIP.
- Supplied Windows evidence: `reference/validation/STEP014DR8_WINDOWS_357_OF_358_EVIDENCE.txt`.
- Exact final aggregate: `357/358`, state `FAILED`.
- Machine stage elapsed values present in the supplied log: 45 values totaling `201.484` seconds.
- Reliable total human work duration: `NOT_RECORDED`.

The absence of a human-work ledger is itself tracked as OR-ISSUE-193. No total hour estimate is
promoted to factual evidence.

## Product evidence retained from the failed aggregate

The aggregate failure does not erase successful evidence:

- exact Vue acquisition, re-extraction, byte verification and build: PASS;
- focused STEP014 contracts: PASS;
- canonical suite: PASS;
- architecture and exports: PASS;
- real external-model parallel delegation: PASS;
- deterministic browser reached ready state and delegation route;
- delegation tree rendered at least three rows and exactly one depth-2 row.

The deterministic fixture source proves the privacy assertion is executed only after ready,
navigation click, tree rendering, row count, and depth-2 assertions.

## Remaining failures

| Issue | Dimension | Direct evidence | Product effect | Promotion effect |
|---|---|---|---|---|
| OR-ISSUE-190 | OPTIONAL_UI / Product privacy | `Raw child transcript`: `true !== false` after tree rendering | Control UI exposes a prohibited marker | Blocks only the privacy-safe Control UI claim |
| OR-ISSUE-191 | HARNESS | `OPENRILL_STEP014DR8_CHROMIUM_ORPHAN:11420` | No delegation runtime effect | Does not block STEP014 Product core |
| OR-ISSUE-192 | GOVERNANCE | DR1–DR8 repeatedly coupled Product acceptance to fixture/transport/browser corrections | Product roadmap stalled behind acceptance machinery | Replaced by independent status dimensions and stop-loss rule |
| OR-ISSUE-193 | GOVERNANCE / EVIDENCE | no reliable STEP014 human-work ledger | Cost cannot be measured or compared | Requires explicit time ledger from STEP015A onward |

## Historical issue assets

STEP014 issue records OR-ISSUE-140 through OR-ISSUE-189 remain retained in the Engineering
Issue Registry and their individual evidence documents. They are not deleted when STEP014 core
is accepted.

Observed repeated classes include:

- historical tests freezing mutable current identity;
- browser/static-entrypoint/bootstrap ownership drift;
- live fixture transport and process-lifecycle ownership drift;
- stochastic model behavior being used as a deterministic acceptance predicate;
- diagnostics collapsing direct causes into later timeout symptoms.

The governance conclusion is not that these records are useless. The records are assets, but the
prior operating method failed because recording an issue did not prevent the same class from
blocking the Product repeatedly.

## Closure decision

```text
STEP014_PRODUCT_CORE=ACCEPTED
STEP014_EXTERNAL_MODEL_PARALLEL=ACCEPTED
STEP014_DETERMINISTIC_NESTED_TREE=ACCEPTED
STEP014_CONTROL_UI_PRIVACY=KNOWN_ISSUE_OR_ISSUE_190
STEP014_CHROMIUM_HARNESS=KNOWN_ISSUE_OR_ISSUE_191
STEP014_BROWSER_ACCEPTANCE=NON_BLOCKING
NEXT=STEP015A
```
