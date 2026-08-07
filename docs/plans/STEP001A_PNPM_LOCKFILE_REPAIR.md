# STEP001A — pnpm Lockfile Repair

## 목적

STEP001의 repository/toolchain 구조는 유지하면서, Windows의 실제 pnpm `11.15.1`이 `--frozen-lockfile`로 읽을 수 없는 수동 생성 lockfile을 수정한다. 이 단계는 새 기능을 추가하지 않고 설치 재현성만 복구한다.

## Reference Evidence

- OpenClaw `pnpm-lock.yaml`은 dependency가 없는 workspace importer를 `path: {}`로 기록한다.
- OpenRill STEP001 lockfile은 `packages/protocol:`만 기록해 YAML loader에서 해당 importer가 `null`이 되었다.
- pnpm은 importer 객체의 `dependencies`를 읽는 과정에서 `null`을 만나 설치를 중단했다.

## 실패 증거

Windows live 실행 환경:

```text
Node.js       v24.18.0
npm           11.16.0
Corepack      0.35.0
pnpm          11.15.1
pnpm path     C:\Program Files\nodejs\pnpm.CMD
```

실패 명령과 결과:

```text
pnpm install --frozen-lockfile
[ERR_PNPM_BROKEN_LOCKFILE]
Cannot read properties of null (reading 'dependencies')
```

Node/Corepack/pnpm 실행 자체는 정상이며 실패는 프로젝트 lockfile parsing 단계에서 발생했다.

## 원인

STEP001의 `pnpm-lock.yaml`에서 dependency가 없는 `packages/protocol` importer가 다음처럼 작성되었다.

```yaml
packages/protocol:
```

YAML에서 이 값은 빈 객체가 아니라 `null`이다. pnpm lockfile importer는 객체여야 하므로 다음 형식이어야 한다.

```yaml
packages/protocol: {}
```

기존 deterministic gate는 importer heading의 존재만 정규식으로 검사해 값이 `null`인지 확인하지 못했다.

## 구현 범위

- `packages/protocol` importer를 명시적 빈 객체로 수정한다.
- STEP001 acceptance가 dependency 없는 workspace에 대해 `{}` importer를 요구하게 한다.
- `packages/protocol:` bare-null 회귀를 별도 검사한다.
- external package snapshot 세 항목의 존재를 검사한다.
- STEP001A 전용 deterministic acceptance와 Windows launcher를 추가한다.
- package baseline을 `0.1.1-step001a`로 정규화한다.
- 문서와 handoff에 실제 Windows 실패 증거를 보존한다.

## Acceptance

정적·결정적 수용:

```bash
python scripts/run_step001a_acceptance.py
```

필수 결과:

- STEP001 regression 전체 통과
- `packages/protocol: {}` 정확히 1개
- `packages/protocol:` bare-null 0개
- lockfile snapshots 세 항목 존재
- OpenClaw 제품 의존성 0개
- Host listener/runtime DB side effect 0개

Windows live 수용:

```cmd
node --version
corepack --version
pnpm --version
pnpm install --frozen-lockfile
pnpm acceptance:step001a
```

`pnpm install --frozen-lockfile`과 STEP001A acceptance가 모두 통과해야 STEP002를 시작한다.

## 제외

- pnpm `11.18.0` 업그레이드
- dependency 버전 변경
- Host lifecycle 구현
- SQLite 생성
- WebSocket listener
- UI framework 선택
