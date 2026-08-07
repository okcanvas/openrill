# STEP013 — BROWSER_TOOL

## 목적

Playwright browser lifecycle과 안전한 action Tool을 구현한다.

## Reference Evidence

- `[OC-SANDBOX-001] src/agents/sandbox/backend-handle.types.ts:59` — sandbox backend handle 계약이 별도 타입이다.

## 구현 범위

- `packages/browser-runtime`
- `packages/tools-browser`

## 선행조건

- Tool/Approval/Artifact와 Automation Run이 안정적이다.
- Playwright/browser binary 설치 정책을 명시한다.

## 구현 상세

1. browser process manager와 context/page handle registry를 구현한다.
2. navigate/snapshot/click/type/select/download/screenshot/close Tool을 typed action으로 제공한다.
3. URL scheme/host/network policy와 download 경로 confinement를 적용한다.
4. DOM/accessible snapshot을 size budget에 맞춰 Artifact로 저장한다.
5. action target은 ephemeral selector가 아니라 snapshot reference와 검증 가능한 locator를 사용한다.
6. cancellation과 Host shutdown에서 browser/context/page를 정리한다.

## 공개 계약과 불변조건

- Browser session은 conversation/run 소유권과 idle timeout을 가진다.
- navigation request/response에는 requested URL과 final URL을 기록한다.
- download는 Workspace 밖 임의 path를 허용하지 않고 Artifact reference로 반환한다.

## 상태·영속성 영향

- browser session metadata와 action events를 저장하되 cookie/secret은 정책 없이 영속화하지 않는다.

## 실패·복구 의미

- blocked URL, popup, download, timeout, detached target을 구분한다.
- 브라우저 crash 후 기존 handle을 재사용하지 않는다.
- snapshot 변경으로 target이 달라지면 action을 거부하고 재관찰을 요구한다.

## Acceptance

- launch/reuse/idle close
- navigation allow/deny
- redirect final URL
- snapshot artifact
- click/type/select
- stale target
- download artifact
- screenshot
- cancel action
- browser crash recovery
- shutdown cleanup
- automation-triggered browser run

기존 요약 gate:

- launch/reuse/close
- navigation policy
- snapshot
- click/type
- download artifact
- cancel

## 산출물

- browser runtime/tool packages
- local deterministic web fixture
- autonomous local Agent MVP gate
- STEP013 acceptance

## 패키징 조건

- 이전 STEP 회귀 gate 통과
- source manifest와 생성 ZIP SHA-256 기록
- `HANDOFF.md`, `PLANS.md`, `VALIDATION.md` 갱신
- protected user payload, API key, Secret, runtime DB가 패키지에 포함되지 않음
- Windows live가 필요한 단계는 실제 Windows 로그 없이는 live accepted로 선언하지 않음

## 제외

- browser extension relay
- remote browser node

## 완료 선언

모든 Acceptance와 regression이 통과한 뒤에만 `STEP013_..._PASS`를 선언한다. 정적 분석이나 mocked smoke만으로 live acceptance를 선언하지 않는다.
