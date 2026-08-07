# STEP002 — CLI_AND_LOCAL_HOST_LIFECYCLE

## 목적

OpenRill의 첫 실제 장기 실행 프로세스를 만든다. `openrill start|run`은 foreground local Host를 실행하고, `status|stop`은 profile의 private metadata와 인증된 loopback lifecycle endpoint를 사용한다.

## 기준선

- 이전 packaged baseline: `STEP001D_WINDOWS_CLI_ENTRYPOINT_CANONICALIZATION`
- 이전 Windows live: `ACCEPTED`, STEP001 259/259, STEP001A 18/18, STEP001B 25/25, STEP001C 35/35, STEP001D 35/35
- STEP002 version: `0.2.0-step002`

## Reference Evidence

- `[OC-GW-001] src/cli/gateway-cli/run-loop.ts:118` — lifecycle run loop가 별도 composition boundary다.
- `[OC-GW-012] src/infra/gateway-lock.ts:30` — lock payload가 PID 외 identity와 생성 시각을 보존한다.
- `[OC-GW-013] src/infra/gateway-lock.ts:236` — stale 판단이 owner 생존성과 age를 구분한다.
- `[OC-GW-015] src/cli/gateway-cli/run-loop.ts:150` — lock을 server보다 먼저 획득한다.
- `[OC-GW-016] src/cli/gateway-cli/run-loop.ts:154` — listener와 close handle 사이 startup race가 존재한다.
- `[OC-GW-017] src/gateway/server-start.ts:178` — startup 실패 시 rollback close를 실행한다.
- `[OC-GW-018] src/gateway/server-start.ts:187` — 정상 시작 후 close handler가 shutdown을 소유한다.

## OpenClaw 문제 분석

OpenClaw의 lock과 run loop는 multi-role lock, config/state dual lock, OS별 process command inspection, PID start-time, restart, update handoff, supervisor까지 처리한다. 이는 성숙 제품에는 필요하지만 OpenRill의 첫 local Host에는 과도하다. STEP002는 실제 불변조건만 유지하고 restart/supervisor/DB/Agent 기능을 열지 않는다.

## 구현 범위

### `@openrill/config`

- profile 이름 canonicalization
- Windows/Unix data·config root 해석
- `OPENRILL_DATA_ROOT`, `OPENRILL_CONFIG_ROOT` 명시적 override
- runtime path, `host.lock`, `host.json` 경로 소유

### `@openrill/protocol`

- `HostLifecycleState`
- token이 제거된 `HostStatusPayload`
- `HostStopPayload`

### `@openrill/host`

- atomic profile lock
- owner identity와 owner-only release
- dead PID 자동 회수
- active control identity 확인
- 확인 불가능 live lock fail closed
- age-gated `--force`
- handler attach 이후 listen
- `STARTING → LISTENING → READY`
- startup rollback
- idempotent `STOPPING → STOPPED`
- authenticated lifecycle status/stop

### `@openrill/cli`

- `start`, `run`, `status`, `stop`, `help`, `version`
- foreground-only 실행
- SIGINT/SIGTERM 단일 shutdown 경로
- stable JSON/human output
- lifecycle-specific exit codes

## 공개 계약

### CLI

```text
openrill start [--profile <name>] [--bind 127.0.0.1|::1] [--port <0..65535>] [--force] [--json]
openrill run   # start alias
openrill status [--profile <name>] [--json]
openrill stop [--profile <name>] [--timeout-ms <ms>] [--json]
```

`start/run`은 foreground다. `--background`는 거부하며 OS service는 STEP019 전까지 없다.

### 기본값

- profile: `default`
- bind: `127.0.0.1`
- port: `47117`
- port `0`: OS ephemeral port
- stop timeout: `5000ms`

### exit codes

| code | 의미 |
|---:|---|
| 0 | command success / Host clean stop |
| 2 | CLI usage error |
| 3 | status: Host stopped |
| 4 | control endpoint unreachable 또는 stop timeout |
| 10 | invalid profile |
| 11 | active 또는 안전하게 확인할 수 없는 lock |
| 12 | Host startup failure |

### private files

```text
<dataRoot>/<profile>/runtime/host.lock
<dataRoot>/<profile>/runtime/host.json
```

`host.json`의 control token은 wire status와 CLI 출력에 노출하지 않는다.

### lifecycle endpoint

- `GET /lifecycle/status`
- `POST /lifecycle/stop`
- `Authorization: Bearer <profile-private-token>` 필수
- 다른 path는 404
- token mismatch는 401

이는 STEP003 public local protocol이 아니라 STEP002 private lifecycle control이다.

## 상태 전이

```text
STARTING
  ├─ lock conflict → FAILED
  ├─ listen failure → FAILED + rollback
  └─ listen success → LISTENING
LISTENING
  ├─ readiness complete → READY
  └─ stop/signal/failure → STOPPING
READY
  └─ stop/signal → STOPPING
STOPPING
  └─ listener close + metadata remove + owner lock release → STOPPED
```

`listen` 성공과 `READY`는 동일하지 않다.

## 실패 및 복구

- dead PID lock: 자동 회수
- 동일 instance control probe 성공: `HOST_ALREADY_RUNNING`
- PID alive, identity 확인 실패: `HOST_LOCK_UNVERIFIED`
- 오래된 unverified lock: 사용자가 확인 후 `--force`
- port conflict: metadata와 owner lock 제거, listener orphan 0
- stop 두 번: 두 번째는 `ALREADY_STOPPED`, exit 0
- SIGINT와 SIGTERM 동시 도착: 첫 요청만 close 시작
- lock release: 현재 파일의 `instanceId`가 owner와 같을 때만 삭제

## Acceptance

### contract/unit

- profile path traversal와 Windows reserved name 차단
- Windows/Unix root 계약
- loopback bind only
- `LISTENING` 관찰 후 `READY`
- 동일 profile 단일 instance
- 다른 profile 동시 실행
- dead lock 자동 recovery
- live unverified lock fail closed
- explicit force recovery
- port conflict rollback
- signal shutdown idempotency
- stop idempotency

### process integration

실제 별도 Node process에서:

1. `start --port 0 --json`
2. READY payload 확인
3. `status --json`으로 같은 instance 확인
4. `stop --json`
5. foreground process exit 0
6. 두 번째 stop이 `ALREADY_STOPPED`

### regression

- STEP001~STEP001D 전체 회귀
- 24 workspace build/export/architecture
- OpenClaw evidence 재검증
- package manifest 재실행 안정성

## 패키징 산출물

- `openrill-step002-cli-local-host-lifecycle-v1.zip`
- SHA-256 sidecar
- `STEP002_ACCEPTANCE_REPORT.txt`
- `PACKAGE_MANIFEST.json`
- `PROJECT_TREE.txt`

## 제외

- SQLite와 migration
- Agent/Tool/Approval 실행
- WebSocket public protocol
- Control UI
- background daemon, Scheduled Task, launchd, systemd
- respawn/restart/update handoff
- non-loopback bind

## 완료 선언

Deterministic acceptance `97/97`와 fresh-ZIP acceptance를 통과하고, 실제 Windows에서 `pnpm acceptance:step002` 결과가 제공된 뒤에만 Windows live accepted로 선언한다.
