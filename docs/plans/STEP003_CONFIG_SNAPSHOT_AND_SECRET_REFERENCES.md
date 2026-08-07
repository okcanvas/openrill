# STEP003 — CONFIG_SNAPSHOT_AND_SECRET_REFERENCES

## 목적

Windows-live-accepted STEP002B Host 위에 OpenRill 고유의 source config, closed validation, include graph, materialized snapshot, last-known-good recovery, optimistic atomic write와 SecretRef 경계를 구현한다.

이 단계의 목적은 설정 항목을 많이 만드는 것이 아니다. 앞으로 Provider, Workspace, Tool, Skill, Automation이 의존할 **작고 결정적이며 복구 가능한 설정 커널**을 먼저 닫는 것이다.

## 기준선

- Input: `STEP002B_CROSS_PLATFORM_PROFILE_PATH_SEMANTICS`, version `0.2.2-step002b`, Windows live accepted
- Output: `STEP003_CONFIG_SNAPSHOT_AND_SECRET_REFERENCES`, version `0.3.0-step003`
- Node: `>=22.16.0 <23 || >=24.0.0`
- pnpm: `11.15.1`
- TypeScript: `6.0.3`
- UI framework: `DEFERRED`

## Reference Evidence

- `[OC-CONFIG-001] src/config/io.factory.ts:21` — config IO context/factory
- `[OC-CONFIG-002] src/config/io.load.ts:34` — load orchestration
- `[OC-CONFIG-003] src/config/io.write.ts:100` — dedicated write boundary
- `[OC-CONFIG-004] src/config/includes.ts:561` — guarded includes
- `[OC-CONFIG-005] src/config/env-substitution.ts:201` — explicit reference syntax and missing diagnostics
- `[OC-CONFIG-006] src/config/future-version-guard.ts:1` — future version guard
- `[OC-CONFIG-007] src/config/io.write-safety.ts:12` — base snapshot currentness check
- `[OC-CONFIG-008] src/config/io.write.ts:419` — atomic replacement boundary
- `[OC-CONFIG-009] src/config/io.observe-recovery.ts:228` — separate last-known-good path
- `[OC-CONFIG-010] src/secrets/ref-contract.ts:131` — complete SecretRef grammar validation
- `[OC-CONFIG-011] src/config/redact-snapshot.ts:411` — snapshot redaction
- `[OC-CONFIG-012] src/config/backup-rotation.ts:151` — backup maintenance boundary

OpenClaw evidence 전체는 현재 `94/94`로 원본 ZIP과 재검증한다.

## OpenClaw 문제 분석

OpenClaw가 해결한 문제는 실제 제품에서 필요하다.

- source와 runtime config 분리
- include ownership과 escape 방지
- write 중 외부 변경 충돌
- atomic commit과 rollback
- corrupt/clobbered config 복구
- future version의 destructive downgrade 방지
- SecretRef와 redaction
- audit와 backup

그러나 OpenClaw config core에는 JSON5, comment preservation, plugin/channel dynamic schema, legacy migration, env placeholder restore, runtime refresh rollback, suspicious size-drop recovery, Nix write guard 등이 누적되어 있다. OpenRill STEP003은 그 이유를 참고하지만 v1에 필요한 최소 계약만 구현한다.

## 구현 범위

### packages/config

신규 production source:

- `errors.ts`: typed error code와 issue
- `types.ts`: source/materialized/snapshot/journal/SecretRef 계약
- `yaml-subset.ts`: 안전한 closed YAML subset parser/stringifier
- `schema.ts`: v1 closed validator와 defaults
- `canonical.ts`: stable JSON, SHA-256, deep merge, changed paths
- `includes.ts`: bounded include graph와 containment
- `secrets.ts`: env/file point-of-use resolve, availability, redaction
- `io.ts`: load, LKG, atomic write, mutation lock, journal
- `index.ts`: profile path와 config API export

### config assets

- `config/schema/openrill-config-v1.schema.json`
- `config/examples/minimal.agent.yaml`
- `config/examples/provider.agent.yaml`
- `config/examples/include.agent.yaml`
- `config/examples/shared.yaml`

### CLI

- `openrill config path`
- `openrill config init`
- `openrill config validate`
- `openrill config show`

Host start/run은 CLI override가 없으면 materialized `host.bind/port`를 사용한다. config source missing은 built-in defaults로 시작한다. parse/schema 손상은 valid LKG가 있으면 그 snapshot으로 시작한다. include/future-version 위반은 startup을 차단한다.

## 파일·영속성 구조

```text
<configRoot>/agent.yaml
<configRoot>/agent.yaml.previous
<configRoot>/secrets/**

<dataRoot>/config/materialized.json
<dataRoot>/config/last-known-good.json
<dataRoot>/config/config.mutation.lock
<dataRoot>/config/journal/<timestamp>-<revision>.json
```

source config와 runtime-derived state를 물리적으로 분리한다. runtime lock/metadata는 기존 `<dataRoot>/runtime/`에 유지한다.

## YAML 계약

OpenRill은 외부 YAML Runtime dependency 없이 독립 safe subset을 소유한다.

지원:

- two-space mapping/sequence
- quoted/plain scalar
- number, `true`, `false`, `null`
- JSON syntax flow collection
- comments

거부:

- tabs
- anchors, aliases, tags, merge keys
- block scalar
- document directives/markers
- duplicate keys
- ambiguous YAML 1.1 booleans

이 결정은 전체 YAML 호환성보다 공급망 최소화, 결정성, 공격 표면 축소를 우선한다.

## Include 계약

- `include`는 root key다.
- owner source 기준 상대 path만 허용한다.
- absolute path와 `../` lexical escape를 거부한다.
- `realpath`가 config root 밖이면 symlink escape로 거부한다.
- cycle은 real path stack으로 검출한다.
- duplicate include는 한 번만 materialize한다.
- 기본 제한은 depth 8, file 32, total 512 KiB다.
- include 순서대로 deep merge 후 owner가 override한다.
- object는 recursive merge, array/scalar는 replace다.

include escape/cycle/limit은 user intent나 policy 위반이므로 LKG 자동 복구하지 않는다.

## Schema 계약

root key:

```text
version
include
host
modelProviders
workspaces
execution
skills
automation
ui
```

- 모든 object는 `additionalProperties=false` 의미다.
- version은 정확히 `1`이다.
- future version은 `CONFIG_FUTURE_VERSION`으로 fail closed한다.
- host는 loopback-only다.
- Provider Secret field는 literal string이 아니라 SecretRef object만 허용한다.
- workspace ID는 고유해야 한다.
- default approval mode는 `ask`다.

## SecretRef 계약

```ts
{ kind: "env" | "file" | "os", key: string }
```

- env: environment variable name grammar
- file: `<configRoot>/secrets` 아래 containment grammar
- os: contract reserved, concrete adapter deferred
- config load는 availability만 검사한다.
- 실제 값 resolve는 `resolveSecretReference` 호출 시점에만 수행한다.
- snapshot/LKG는 reference를 보존하지만 값은 보존하지 않는다.
- redacted snapshot은 key를 `<redacted>`로 바꾼다.
- journal은 reference key조차 기록하지 않는다.

## Revision 계약

- valid source graph revision: relative file path와 raw content의 stable SHA-256
- invalid root recovery revision: 현재 root raw SHA-256
- materialized revision: key-sorted canonical JSON SHA-256

include file가 바뀌어도 source graph revision이 바뀐다.

## Atomic write

1. profile config mutation lock을 `wx`로 획득한다.
2. dead PID lock만 자동 회수한다.
3. current source graph revision을 읽는다.
4. `expectedRevision`과 다르면 commit 전 실패한다.
5. candidate file을 config root에 작성한다.
6. candidate parse/include/schema/secret availability preflight를 수행한다.
7. 기존 source를 `.previous`에 best-effort 보존한다.
8. temp source를 mode 0600으로 write+fsync한다.
9. rename으로 commit한다.
10. directory fsync를 best effort 수행한다.
11. committed disk source를 다시 load한다.
12. materialized와 LKG를 atomic write한다.
13. value-free journal을 append한다.
14. owner가 일치할 때 mutation lock을 해제한다.

post-commit verification 실패 시 이전 source를 복원한다.

## 상태 전이

```text
SOURCE_MISSING → DEFAULTS
SOURCE_VALID → SOURCE + SNAPSHOT_PROMOTED
SOURCE_PARSE_INVALID + LKG → LAST_KNOWN_GOOD
SOURCE_SCHEMA_INVALID + LKG → LAST_KNOWN_GOOD
SOURCE_PARSE_INVALID - LKG → FAILED
INCLUDE_POLICY_INVALID → FAILED
FUTURE_VERSION → FAILED
WRITE_EXPECTED_MATCH → COMMITTED → VERIFIED → JOURNALED
WRITE_EXPECTED_MISMATCH → CONFLICT
WRITE_LOCKED → BUSY
```

## 실패 및 복구

- parse와 schema issues는 path/code/message로 보존한다.
- LKG 자체가 schema/hash 검증에 실패하면 사용하지 않는다.
- missing Secret은 전체 config invalid가 아니라 Provider unavailable 상태다.
- literal Secret은 schema invalid다.
- journal/diagnostic에 actual Secret 값이 있으면 acceptance 실패다.
- source missing일 때 자동 파일 생성하지 않는다. `config init`만 명시적으로 생성한다.
- `config init`은 source가 있으면 exit `21`로 닫힌다.
- generic config failure CLI exit는 `20`이다.

## Acceptance

### Unit

- real YAML source parse
- anchor/ambiguous boolean/duplicate key reject
- unknown key reject
- literal Secret reject
- future version reject
- include merge/containment/cycle/depth
- atomic snapshot/LKG write
- secret value absence in snapshot/LKG/journal
- optimistic write conflict
- corrupt source LKG recovery
- include/future fail closed despite LKG
- missing Secret status and point-of-use resolution
- config CLI init/validate/show/duplicate init

### Build/architecture

- all 24 workspaces compile
- 29 unit tests pass
- architecture graph cycle zero
- package exports pass
- web framework remains deferred

### Live process

- `config init`
- `config validate`
- `config show --json` redacted
- config host `port: 0` applied by foreground Host
- authenticated stop and cleanup

### Regression

- STEP002B 60/60
- STEP002A 58/58
- STEP002 97/97
- STEP001 family invariants

## 패키징 산출물

- source and docs
- `STEP003_ACCEPTANCE_REPORT.txt`
- OpenClaw evidence `94/94`
- deterministic package manifest
- fresh ZIP extraction acceptance
- post-rerun manifest equality
- ZIP SHA-256

## 제외

- full YAML 1.2 implementation
- OS keychain adapter
- encrypted secret store
- remote config synchronization
- plugin-defined config schema
- hot reload and public config protocol
- schema migration from future/legacy versions
- SQLite config state
- UI config editor

## 완료 선언

다음 조건이 모두 충족되어야 한다.

- STEP003 deterministic acceptance PASS
- previous regressions PASS
- package manifest PASS
- fresh ZIP acceptance PASS
- Secret/runtime/database/protected user payload zero in package
- Windows 실제 로그 전에는 Windows live accepted로 선언하지 않음
