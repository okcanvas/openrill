# STEP000 — REFERENCE_AUDIT_AND_CLEAN_REDESIGN_BASELINE

## 목적

실제 OpenClaw 코드 증거와 독립 프로젝트 설계를 고정한다.

## Reference Evidence

- `[OC-ID-001] package.json:2` — 패키지 이름은 openclaw이다.
- `[OC-GW-002] src/gateway/server-start.ts:101` — Gateway 서버 시작이 별도 진입점으로 분리되어 있다.
- `[OC-TEST-001] src/gateway/server-import-boundary.test.ts:91` — Gateway facade/import boundary를 테스트한다.

## 구현 범위

- `reference/openclaw/**`
- `docs/**`
- `root *.md`
- `scripts/run_step000_acceptance.py`

## 선행조건

- 업로드된 `openclaw-main.zip`의 SHA-256과 package version이 고정되어 있어야 한다.
- 압축 해제 소스는 읽기 전용 참조이며 OpenRill 저장소 바깥에 둔다.
- 제품 source 파일은 아직 존재하지 않아야 한다.

## 구현 상세

1. 소스 전체 파일 수와 최상위 영역별 inventory를 생성한다.
2. CLI→Gateway→Protocol→Agent→Tool→State의 실제 호출 경로를 코드 라인으로 기록한다.
3. Config, Approval, Skill, Automation, Plugin, Sandbox, Channel, UI, Ops, Test 영역을 별도 reference 문서로 분리한다.
4. 각 관찰을 `id/path/line/needle/excerpt/statement` 형식의 evidence 항목으로 고정한다.
5. 참조에서 채택·변형·연기·거절할 결정을 표로 만든다.
6. OpenRill 독립 protocol/data/skill/extension/UI 계약을 문서화한다.
7. STEP001~020의 순서, 입력 기준선, 수용 조건과 제외 범위를 고정한다.

## 공개 계약과 불변조건

- `SOURCE_MANIFEST.json`: source archive, SHA-256, package metadata, file inventory.
- `EVIDENCE_INDEX.json`: source line을 재현할 수 있는 관찰 증거.
- `EVIDENCE_VERIFICATION_REPORT.json`: 모든 증거가 실제 source와 일치했는지 기록.
- `CLEAN_REDESIGN_RULES.md`: 복사·호환·명칭 재사용 금지 경계.

## 상태·영속성 영향

- 제품 DB나 Runtime state를 만들지 않는다.
- 현재 단계의 authoritative state는 문서, source manifest, evidence index, acceptance 결과다.

## 실패·복구 의미

- 증거 line/excerpt 불일치 시 패키징을 중지한다.
- OpenClaw runtime dependency 또는 production source 복사가 발견되면 실패한다.
- 서버용 OKCanvas Agent Runtime과 로컬 Agent의 경계가 모호하면 실패한다.

## Acceptance

- source SHA/version 일치
- 75개 evidence의 path/line/excerpt 전부 일치
- 루트 필수 문서 존재
- 21개 STEP 문서 존재 및 필수 heading 포함
- Markdown 상대 링크 0건 누락
- OpenClaw dependency 0개
- 제품 source 복사 0개

기존 요약 gate:

- 필수 문서/증거 검증
- source hash 검증
- OpenClaw 의존/복사 금지 검증

## 산출물

- `/reference/openclaw` 정적 분석 기록
- `/docs` 제품·아키텍처·계약·보안·운영·테스트 문서
- 루트 governance/handoff/roadmap 문서
- STEP000 deterministic acceptance runner

## 패키징 조건

- 이전 STEP 회귀 gate 통과
- source manifest와 생성 ZIP SHA-256 기록
- `HANDOFF.md`, `PLANS.md`, `VALIDATION.md` 갱신
- protected user payload, API key, Secret, runtime DB가 패키지에 포함되지 않음
- Windows live가 필요한 단계는 실제 Windows 로그 없이는 live accepted로 선언하지 않음

## 제외

- 제품 코드 구현

## 완료 선언

모든 Acceptance와 regression이 통과한 뒤에만 `STEP000_..._PASS`를 선언한다. 정적 분석이나 mocked smoke만으로 live acceptance를 선언하지 않는다.
