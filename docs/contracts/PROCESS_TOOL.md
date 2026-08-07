# Process Tool Contract

## 공개 Tool

OpenRill은 정확히 네 개의 process Tool을 제공한다.

```text
process.run
process.list
process.tail
process.cancel
```

## Command authority

`process.run`은 두 형식을 명시적으로 구분한다.

- `argv`: `executable`과 `args[]`를 shell 해석 없이 직접 실행한다.
- `shell`: 플랫폼 shell을 명시적으로 선택해 `script`를 실행한다.

Model이 임의의 Host cwd를 선택할 수 없다. `cwd`는 현재 Run의 `workspaceId` 내부 root-relative directory로 해석되고 realpath confinement를 다시 검사한다.

## Environment

프로세스 환경은 빈 환경에서 시작한다. 호출자가 명시한 `inherit[]` 이름과 `SecretRef`만 point-of-use로 해석한다. Secret 실제 값은 ApprovalRequest, continuation, Tool ledger, process ledger, public summary에 저장하지 않는다.

## Lifecycle

```text
STARTING → RUNNING → EXITED
                  ↘ FAILED_TO_START
                  ↘ CANCELLED
Host ownership loss → ORPHANED
```

foreground 결과는 bounded stdout/stderr tail과 exit 상태를 반환한다. background 결과는 durable `processId`를 반환하며 `process.list`, `process.tail`, `process.cancel`로 후속 제어한다.

## 영속성

`process_records`는 command display, workspace-relative cwd, mode, status, pid, private stdout/stderr path, exit code/signal을 기록한다. stdout/stderr file은 profile state root 아래 Product-owned private directory에 저장한다.

## 불변조건

- PROMPT 결정 전에는 process record와 child process가 존재하지 않는다.
- 승인 consume transaction에 성공한 호출만 process를 시작한다.
- 동일 ApprovalRequest는 한 번만 consume된다.
- cancellation 이후 child exit event가 `CANCELLED`를 `EXITED`로 덮지 않는다.
- Host 재시작 시 Product가 소유권을 잃은 active record는 `ORPHANED`가 된다.
