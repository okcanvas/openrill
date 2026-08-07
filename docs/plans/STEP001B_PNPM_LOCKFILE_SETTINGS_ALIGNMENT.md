# STEP001B — pnpm Lockfile Settings Alignment

## 목적

Windows의 실제 pnpm `11.15.1`이 보고한 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`를 파일 근거로 해결한다. STEP001A의 null importer 수정은 유지하고, workspace의 effective install setting과 lockfile에 기록된 setting을 동일하게 만든다.

## Reference Evidence

- OpenRill STEP001A `pnpm-workspace.yaml`에는 `autoInstallPeers`가 없다.
- OpenRill STEP001A `pnpm-lock.yaml`에는 `settings.autoInstallPeers: false`가 기록되어 있다.
- pnpm 공식 설정 문서에서 `autoInstallPeers`의 default는 `true`다.
- OpenClaw 원본 `pnpm-lock.yaml`은 `settings.autoInstallPeers: true`이며, 원본 `pnpm-workspace.yaml`은 해당 기본값을 변경하지 않는다.
- pnpm `--frozen-lockfile`은 현재 install setting과 lockfile setting이 다르면 설치를 거부한다.

## 실패 증거

Windows live 환경:

```text
Node.js       v24.18.0
npm           11.16.0
Corepack      0.35.0
pnpm          11.15.1
```

실패 결과:

```text
pnpm install --frozen-lockfile
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
The current "settings.autoInstallPeers" configuration doesn't match the value found in the lockfile
```

## 원인

STEP001A의 두 파일은 다음과 같이 불일치했다.

```yaml
# pnpm-workspace.yaml
# autoInstallPeers key 없음 → effective true
```

```yaml
# pnpm-lock.yaml
settings:
  autoInstallPeers: false
```

따라서 pnpm은 frozen install에서 lockfile을 현재 workspace 설정의 결과로 인정할 수 없다.

## 구현 범위

- `pnpm-workspace.yaml`에 `autoInstallPeers: true`를 명시한다.
- `pnpm-lock.yaml`의 `settings.autoInstallPeers`를 `true`로 정렬한다.
- 암묵적 default가 아니라 source-controlled workspace policy로 고정한다.
- STEP001 acceptance가 workspace/lockfile setting 일치를 검사하게 한다.
- STEP001B 전용 acceptance와 Windows/POSIX launcher를 추가한다.
- root 및 24개 workspace 버전을 `0.1.2-step001b`로 정규화한다.
- README, HANDOFF, VALIDATION에 두 번째 Windows 실패 증거를 보존한다.

## 공개 계약

```text
pnpm = 11.15.1
autoInstallPeers = true
lockfile.settings.autoInstallPeers = true
```

`autoInstallPeers` 정책을 변경하려면 workspace config와 lockfile을 같은 pnpm 버전으로 함께 갱신해야 한다.

## 상태 전이

```text
STEP001A_DETERMINISTIC_ACCEPTED
  → WINDOWS_FROZEN_INSTALL_SETTINGS_MISMATCH
  → STEP001B_SETTINGS_ALIGNED
  → WINDOWS_FROZEN_INSTALL_PENDING
```

## 실패 및 복구

- workspace와 lockfile 값 불일치: deterministic acceptance 실패
- key 누락: deterministic acceptance 실패
- pnpm version drift: packageManager gate 실패
- install이 lockfile을 변경: frozen-install acceptance 실패

## Acceptance

정적·결정적 수용:

```bash
python scripts/run_step001b_acceptance.py
```

필수 조건:

- STEP001 regression 통과
- STEP001A null-importer regression 통과
- workspace `autoInstallPeers: true` 정확히 1개
- lockfile `settings.autoInstallPeers: true` 정확히 1개
- `autoInstallPeers: false` 0개
- root와 모든 workspace version 일치
- OpenClaw 제품 dependency/source copy 0

Windows live 수용:

```cmd
node --version
corepack --version
pnpm --version
pnpm install --frozen-lockfile
pnpm acceptance:step001b
```

두 명령이 모두 통과해야 STEP002를 시작한다.

## 패키징 산출물

- `openrill-step001b-pnpm-settings-alignment-v1.zip`
- matching SHA-256 file
- regenerated `PACKAGE_MANIFEST.json`
- STEP001B acceptance report

## 제외

- pnpm `11.18.0` 업그레이드
- external dependency 버전 변경
- peer dependency 정책의 추가 강화
- Host lifecycle
- SQLite, WebSocket, UI Runtime
