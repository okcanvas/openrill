# STEP014DR7 — Live Acceptance Transport and Lifecycle Closure Audit

## Identity

```text
STEP014DR7_LIVE_ACCEPTANCE_TRANSPORT_AND_LIFECYCLE_CLOSURE_AUDIT
version=0.14.10-step014dr7
schema=14
baseline=STEP013CR2
retained_feature=STEP014D
```

## Why this corrective step exists

The real Windows STEP014DR6 run passed 264/265 checks. The real OpenAI parallel delegation stage passed. The only failure occurred in the deterministic nested Control UI stage inside Node's internal `undici` HTTP parser:

```text
AssertionError: assert(!this.paused)
```

Code inspection showed the fixture fetched the Control UI module, asserted only `status === 200`, and never consumed the response body before Chromium/Host cleanup. The product delegation runtime, schema, Protocol, Tool surface and UI tree were not the failing boundaries.

## Scope

STEP014DR7 freezes product behavior and closes the live-acceptance transport/lifecycle layer:

- one bounded loopback HTTP client for live fixtures;
- complete response-body consumption before cleanup;
- per-request timeout and byte limit;
- `Accept-Encoding: identity`, `Connection: close`, and no shared Agent;
- request start/end markers with path, status, bytes and elapsed time;
- source audit of HTTP, Host, Chromium and temporary-root cleanup ordering;
- retained real OpenAI parallel stage;
- retained deterministic nested Protocol/Chromium stage.

## Explicit non-goals

- no migration or schema change;
- no change to `agent.spawn` or `agent.wait`;
- no change to delegation budgets or scheduling;
- no Protocol operation change;
- no Control UI product change;
- no OpenAI adapter change.

## Audited live fixture inventory

| Fixture | HTTP | WebSocket | Host | Chromium | Cleanup owner |
|---|---:|---:|---:|---:|---|
| STEP011 Control UI | DevTools target | CDP/Protocol | child process | yes | bounded child/server/tree cleanup |
| STEP012D Automation UI | bootstrap, DevTools target, Vue static | CDP/Protocol | child process | yes | bounded child/server/tree cleanup |
| STEP014D delegated UI | bootstrap, index, module, DevTools target | Protocol/CDP | in-process Host | yes | browser → protocol → Host → root |
| STEP014DR6 external model | bootstrap | Protocol | in-process Host | no | protocol → Host → root |
| STEP014DR6 deterministic nested UI | bootstrap, index, module, DevTools target | Protocol/CDP | in-process Host | yes | browser → protocol → Host → root |
| Vue static verifier | runtime and lock | no | caller-owned | no | complete response consumption |

## Acceptance closure

The Windows closure requires:

1. static lifecycle audit PASS;
2. bounded loopback helper tests PASS;
3. all retained focused and canonical tests PASS;
4. actual external-model parallel delegation PASS;
5. deterministic nested Control UI Chromium rendering PASS;
6. `chromium_orphan=0`;
7. package manifest unchanged before and after live stages.

## Canonical and socket closure

The closure audit additionally requires:

- timeout/oversize HTTP failures settle after request close and leave zero server sockets;
- each canonical unit file runs in a separate Node child with its own timeout and TAP summary;
- batch boundaries own ordering and aggregate progress only;
- current live scripts resolve retained fixture imports and publish the exact current client version.
