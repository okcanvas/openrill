# STEP014DR7 Local Deterministic Validation

## Candidate

```text
STEP014DR7_LIVE_ACCEPTANCE_TRANSPORT_AND_LIFECYCLE_CLOSURE_AUDIT
version=0.14.10-step014dr7
schema=14
baseline=STEP013CR2
```

## Acceptance-closure findings

The audit closed the live-fixture layer rather than changing product delegation behavior:

- all audited Node loopback requests use `scripts/live-loopback-http.mjs`;
- responses are bounded and fully consumed;
- timeout and oversized-body failures wait for request close and leave zero test-server sockets;
- HTTP request start/end evidence is emitted per request;
- Host, Protocol, Chromium and temporary-root cleanup ownership is source-audited;
- Browser waits execute the predicate at least once;
- canonical validation runs every sorted unit file in an independent Node child with a file-specific timeout and TAP summary;
- the deterministic nested UI live stage imports the retained schema-14 DR6 seed owner;
- both DR7 live Protocol clients publish the exact current version.

## Source aggregate

```text
checks=318/320
state=FAILED
only failures:
  external-model-parallel-live: OPENAI_API_KEY absent
  deterministic-nested-control-ui-live: managed Chromium does not render the loopback page

static contracts=283/283
focused=133/133
canonical=463/463
unit files=84
skipped=0
architecture=27 packages / 67 edges / 116 sources
exports=27/27
source/version=28 manifests / 27 sources / 3 Host literals
lock=28 importers / 70 dependencies
workspace links=67 edges / 27 materialized, root_owned=true
package manifest=1148/1148
```

The deterministic UI stage locally passes schema-14 graph seeding, Host startup, Protocol list projection, index fetch, module fetch with complete drain, and Chromium DevTools discovery. It stops at the known managed-Chromium loopback page rendering restriction. The prior `undici assert(!this.paused)`, missing fixture import, and stale client identity do not recur.

## Windows expectation

```text
checks=320/320
state=PASSED
```

Windows must provide a valid `OPENAI_API_KEY`, explicit `OPENRILL_STEP014D_MODEL`, and a Chromium executable allowed to load the loopback Host page. ## Final fresh-ZIP evidence

The sealed candidate is extracted into a new root with no packaged `dist`, `.artifacts`, or `node_modules`. Root-owned workspace links are rebuilt for that root. The exact fresh source then passes:

```text
package manifest=1148/1148
source/version=28/27/3
workspace lock=28/70
workspace links=67/27, root_owned=true
source-root archive boundary=PASS
zero-dist build=PASS
focused=133/133
canonical=463/463 across 84 isolated files
skipped=0
architecture=27/67/116
exports=27/27
packaged files including manifest=1149
```

The deterministic two-pack must be byte-identical. No product or documentation file is changed after the final two-pack and exact fresh-root verification.
