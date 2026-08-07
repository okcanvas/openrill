# STEP014 Acceptance Closure Audit

## Audit conclusion

The repeated corrective loop had two different classes of failures:

1. product/provider defects, closed in DR2–DR4;
2. acceptance-fixture defects, including static path drift, stochastic model-choice coupling, and now an unread loopback HTTP response body.

The STEP014DR6 Windows evidence proves the product-side external-model parallel delegation stage passed. The remaining deterministic UI failure occurred before product assertions in Node's internal HTTP parser.

## Exact DR6 failure mechanism

The deterministic fixture performed:

```text
GET /assets/web/browser-app.js
assert status === 200
(do not consume body)
start Chromium / enter cleanup
```

A response stream remained paused/unconsumed. When the socket ended, Node 24.18.0's `undici` parser asserted `!this.paused`.

## Closure implementation

`scripts/live-loopback-http.mjs` now owns live loopback requests. It uses `node:http`, not global `fetch`, and guarantees:

- loopback host allow-list;
- URL credential rejection;
- request timeout;
- maximum body bytes;
- full body drain;
- early-close and aborted-response detection;
- no shared Agent;
- identity content encoding;
- connection close;
- privacy-safe start/end diagnostics.

The following paths now use the common client:

```text
scripts/run-step011-live.mjs
scripts/run-step012d-live.mjs
scripts/run-step014d-live.mjs
scripts/run-step014dr6-external-model-live.mjs
scripts/run-step014dr6-deterministic-nested-ui-live.mjs
scripts/live-vue-static.mjs
```

## Lifecycle audit

`scripts/check_live_acceptance_lifecycle.py` verifies:

- no direct Node `fetch()` remains in audited live fixtures;
- deterministic module bytes are consumed;
- in-process Host fixtures close Host before deleting the root;
- Chromium fixtures own executable discovery and bounded close/orphan handling;
- request start/end evidence is machine-readable.

## Local evidence

After the change, the deterministic fixture produced PASS markers for bootstrap, index, module, and Chromium DevTools `/json/list`, then reached the expected local managed-Chromium loopback rendering limitation. The prior `undici` assertion did not recur.

## Additional closure findings

The audit also found and closed five recurrence paths after the initial transport correction:

- timeout/oversize errors were returned before request sockets became quiescent;
- multi-file Node test batches still shared open handles and global state;
- the current deterministic live script referred to a nonexistent renamed seed fixture;
- both current live Protocol clients retained a copied mixed release version;
- canonical completion evidence needed one timeout/TAP owner per repository-relative file.

Canonical batching now controls only ordering and progress. Every one of the 84 sorted test files runs in an independent Node child. The final source canonical result is `463/463`, skipped 0.

## STEP014DR8 correction to the DR7 local interpretation

The real Windows DR7 run supplied after this audit changes the diagnosis of the remaining deterministic UI failure. It reached Chromium successfully but timed out at `delegation-nav:false`; the external-model parallel stage passed.

Code inspection proves the direct acceptance bootstrap defect:

- `apps/agent-web/public/index.html` imports `/vendor/vue.runtime.global.prod.js`;
- the archive correctly excludes generated `public/vendor` files;
- `scripts/workspace-runner.mjs` materializes the runtime only from `OPENRILL_VUE_RUNTIME_VENDOR_DIR`;
- the DR7 aggregate runner did not acquire Vue and did not pass that variable into `focused-build`;
- the DR7 browser fixture did not verify the served Vue runtime or preserve navigation/page/network failure evidence.

Accordingly, the earlier description of a managed-Chromium loopback rendering limitation is not the root cause of the user's Windows failure. DR8 records this recurrence as OR-ISSUE-184 and OR-ISSUE-185, restores exact Vue materialization, verifies served bootstrap assets, handles `Page.navigate.errorText`, waits for `startupPhase=READY`, and requires empty bounded browser evidence before accepting the rendered delegation tree.


DR8's own canonical and lifecycle review additionally closed:

- OR-ISSUE-186: retained DR7 test ownership of the mutable current version;
- OR-ISSUE-187: Chromium cleanup ownership before `launch()` returns;
- OR-ISSUE-188: lifecycle audit omission of current DR8 fixtures;
- OR-ISSUE-189: final outer cleanup failure suppression.

The current exact source totals are static `317/317`, focused `137/137`, canonical `467/467` across 85 isolated files, skipped 0. Windows promotion remains pending for the exact Vue acquisition/vendor-aware build and the two live stages; the full success target is `358/358`.
