# STEP000A — OPENRILL_PRODUCT_IDENTITY_NORMALIZATION

## 목적

구현 시작 전에 로컬 제품의 공식 명칭과 모든 공개 식별자를 `OpenRill`로 고정하고, 별도 서버 제품과 참조 프로젝트의 명칭 경계를 보존한다.

## Reference Evidence

- `[OC-ID-001] package.json:2` — 참조 프로젝트는 자체 package identity를 명확히 소유한다.
- `[OC-CLI-001] openclaw.mjs:11` — CLI launcher가 지원 Node 런타임 하한을 직접 검사한다.
- `[OC-CONFIG-001] src/config/io.factory.ts:21` — 설정 IO를 context/factory 경계로 캡슐화한다.

## 구현 범위

- 루트 `*.md`, `package.json`, `PACKAGE_MANIFEST.json`
- `docs/product/PRODUCT_IDENTITY.md`
- `docs/governance/NAMING_CONVENTIONS.md`
- `docs/adrs/ADR-0013-OPENRILL_PRODUCT_IDENTITY.md`
- 모든 계획·계약·운영 문서의 로컬 제품 식별자
- STEP000A deterministic acceptance와 패키징 산출물

## 선행조건

- STEP000 reference evidence 75/75가 실제 OpenClaw source와 일치해야 한다.
- 제품 source, 사용자 config, runtime DB가 아직 없어 compatibility migration이 필요하지 않아야 한다.
- 별도 서버 제품명은 `OKCanvas Agent Runtime`으로 확정되어 있어야 한다.

## 구현 상세

1. 공식 제품명, repository, CLI, package scope, config, 환경변수와 OS별 data/config root를 고정한다.
2. 로컬 제품을 가리키는 이전 임시 명칭을 모든 문서와 placeholder package에서 제거한다.
3. 서버 제품명 `OKCanvas Agent Runtime`과 참조명 `OpenClaw`는 변경하지 않는다.
4. package별 예정 공개 이름을 `@openrill/*` namespace로 문서화한다.
5. 이름 변경을 별도 ADR로 기록하고 STEP001의 입력 기준선을 갱신한다.
6. source evidence JSON의 path/line/excerpt는 수정하지 않고 다시 검증한다.

## 공개 계약과 불변조건

- Product: `OpenRill`
- Repository/CLI: `openrill`
- npm scope: `@openrill/*`
- Config: `openrill.yaml`
- Environment: `OPENRILL_*`
- Server product: `OKCanvas Agent Runtime`
- Reference project: `OpenClaw`

## 상태·영속성 영향

- 제품 DB와 runtime state는 만들지 않는다.
- 아직 배포된 CLI/config/data가 없으므로 이전 식별자 alias나 migration을 만들지 않는다.
- authoritative identity는 `PRODUCT_IDENTITY.md`, ADR-0013과 package manifest다.

## 실패·복구 의미

- 로컬 제품 문맥에 이전 임시 CLI/package/data-path 식별자가 남으면 실패한다.
- `OKCanvas Agent Runtime`이 변경되거나 OpenRill 내부 runtime 이름으로 오인되면 실패한다.
- OpenClaw evidence가 수정되거나 75/75 재검증에 실패하면 패키징을 중지한다.

## Acceptance

- README와 package manifest의 공식 프로젝트명은 `OpenRill`
- root package name은 `openrill`
- CLI/package/config/env/data-path 식별자 계약 존재
- 금지된 이전 로컬 제품 CLI와 package scope 0건
- `OKCanvas Agent Runtime` 분리 문서 유지
- OpenClaw dependency와 product source copy 0건
- reference evidence 75/75 재검증
- STEP000~STEP020과 STEP000A 계획 문서 필수 heading 통과
- Markdown 상대 링크 누락 0건

## 산출물

- OpenRill 공식 identity 문서와 ADR
- 정규화된 `/docs`, `/reference`, 루트 문서
- STEP000A acceptance report
- OpenRill 이름의 결정적 ZIP과 SHA-256

## 패키징 조건

- STEP000A deterministic gate 통과
- reference evidence verification 75/75 통과
- package manifest의 모든 파일 SHA-256 재생성
- protected payload, Secret, runtime DB, source copy 0개

## 제외

- STEP001 production repository/toolchain 구현
- 기존 사용자 설치 migration 및 alias
- domain, trademark, GitHub organization 가용성 확정

## 완료 선언

모든 Acceptance와 reference regression이 통과한 뒤에만 `STEP000A_OPENRILL_PRODUCT_IDENTITY_NORMALIZATION_PASS`를 선언한다.
