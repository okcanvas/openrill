# STEP013A OpenClaw Browser reference audit

## Reference artifact

```text
artifact=openclaw-main.zip
sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
role=REFERENCE_ANSWER_SHEET_NOT_PRODUCT_DEPENDENCY
```

OpenClaw source is inspected as an implementation reference. OpenRill does not import, vendor, or depend on the OpenClaw product.

## Exact reference files

| OpenClaw file | SHA-256 | Contract inspected |
|---|---|---|
| `extensions/browser/src/browser/runtime-lifecycle.ts` | `ff05731045d75a5c72f00d508eba85f78722e99816583025c9effd6bd687cd56` | invalidate actors before async drain; profile/tab cleanup; shutdown error preservation |
| `extensions/browser/src/browser/server-context.lifecycle.ts` | `234d6e522fd68ae28c4268d8c572ed8ba1deade6cad2abcce91cb83253e49c44` | serialized destructive transitions and generation leases |
| `extensions/browser/src/browser/session-tab-cleanup.ts` | `169f06c6592d07b2f3d4fe4fbbef8aa862253dd4a0ac7513d7f4a1590b0ceb72` | bounded idle cleanup and ownership-aware retirement |
| `extensions/browser/src/browser/session-tab-registry.ts` | `1cb92a72f47bed4d333c2721ad542926014cc5356c8c1e9d048f3827bcabc378` | session-scoped tab ownership |
| `extensions/browser/src/browser/navigation-guard.ts` | `337b547ab0fa0a1e3f28402e124ff8b287b03c78004575d4a8ad23b243425b00` | credential rejection, explicit scheme allowlist, private-network and redirect/final URL checks |
| `extensions/browser/src/browser/config.ts` | `61c0c0ef6fd56c7933c8e7200d940ab41046e9078b8c71fca1d465e3ffcd5074` | closed defaults, timeouts, limits and profile policy materialization |
| `extensions/browser/src/browser/constants.ts` | `1ffee8534b0b021f37a77fbb086e38afed0d9f0034343086919fc94b086bc920` | bounded runtime defaults |

## Adopted into OpenRill STEP013A

- destructive close marks the runtime closing before the first await;
- single-flight Browser launch;
- generation invalidation after Browser disconnect;
- Run-owned isolated contexts and bounded pages;
- idle session sweep;
- popup and download denial at the runtime boundary;
- requested URL and final URL policy validation;
- credential-bearing URL rejection without echoing the credential;
- all cleanup actors are attempted and the first cleanup error is preserved;
- Host waits for Browser drain before SQLite closure.

## Deliberate OpenRill differences

- no OpenClaw control HTTP server, extension relay, Gateway proxy, browser profile import, persistent profile, Chrome MCP, or CDP route surface;
- no direct OpenClaw source import or dependency;
- no public Browser Tool in STEP013A;
- no Playwright package binding in STEP013A; a provider-neutral injected driver owns executable-specific behavior;
- no durable Browser session/page ledger or state migration in STEP013A;
- OpenRill ownership is `workspaceId + conversationId + runId + attemptId`, not OpenClaw plugin session identity;
- private-network access is denied by default and local deterministic fixtures require an explicit hostname allowlist.

## Next ownership

STEP013B may bind a concrete Playwright adapter and public Browser Tools only after the STEP013A lifecycle, policy, shutdown, and version-alignment gates are accepted.
