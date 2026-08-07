# OpenClaw Gateway Lifecycle — STEP002 Focused Audit

## 확인한 실제 경계

- `runGatewayLoop`가 server보다 먼저 `acquireGatewayLock`을 호출한다: `[OC-GW-001]`, `[OC-GW-015]`.
- lock payload는 PID만 저장하지 않고 owner ID, 생성 시각, config/state identity, 선택적 process start time을 저장한다: `[OC-GW-012]`.
- stale 판정은 PID 생존, process start identity, command line, lock age를 조합하고 확인 불가능한 owner는 보수적으로 처리한다: `[OC-GW-013]`.
- server startup은 bootstrap, runtime state, lifecycle, core, post-attach로 분리되며 startup 실패 시 전용 rollback close를 호출한다: `[OC-GW-003]`~`[OC-GW-007]`, `[OC-GW-017]`.
- listener가 준비된 시점과 close handle 반환 사이에 signal이 도착하는 race를 별도 상태로 보존한다: `[OC-GW-016]`.
- 정상 시작 후에는 하나의 close handler가 역순 shutdown을 소유한다: `[OC-GW-018]`.

## OpenClaw에서 확인한 문제와 비용

- config lock과 state lock, role별 coordinator, PID start-time, OS별 command-line 검사까지 한 lock subsystem에 누적되어 있다.
- in-process restart, external supervisor, launchd, update handoff가 하나의 run loop에 함께 존재한다.
- long-running production history 때문에 lock 확인 불능 상황의 OS별 보수 정책과 migration compatibility가 복잡하다.
- listener ready와 전체 product ready가 다르므로 단순 port-open health check만으로 lifecycle을 판단할 수 없다.

## OpenRill STEP002의 재설계

채택:

- profile별 single writer lock
- random instance identity
- authenticated loopback control probe
- listener와 product readiness 분리
- startup failure rollback
- idempotent close와 owner 확인 후 lock 제거

단순화:

- foreground Host만 지원하고 respawn/supervisor/update restart는 제외한다.
- lock authority는 `profile/runtime/host.lock` 하나로 제한한다.
- control endpoint가 동일 `instanceId`를 반환하면 active owner로 확정한다.
- PID dead는 자동 회수하고, PID alive이나 control identity를 확인할 수 없으면 fail closed한다.
- `--force`는 일정 age를 지난 확인 불가능 lock에만 명시적으로 적용한다.

보류:

- PID process-start identity와 OS별 command-line ownership 검증
- Windows Scheduled Task와 background service
- restart handoff와 drain-aware update
- DB checkpoint 및 active Agent Run drain

이 보류 항목들은 STEP019 또는 실제 장애 증거가 생긴 단계에서 추가한다.
