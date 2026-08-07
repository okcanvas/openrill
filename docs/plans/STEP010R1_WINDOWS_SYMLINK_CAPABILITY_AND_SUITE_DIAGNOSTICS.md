# STEP010R1 — WINDOWS SYMLINK CAPABILITY AND SUITE DIAGNOSTICS

## 목적

STEP010의 실제 Windows `246/247` 실패를 코드와 TAP 의미로 확정하고, 관리자 권한에 의존하지 않는 Skill symlink escape fixture와 정확한 aggregate failure evidence를 제공한다.

## 기준선

```text
Input packaged baseline:
  STEP010_SKILL_DISCOVERY_AND_RUN_SNAPSHOT
  version=0.10.0-step010
  deterministic/fresh-ZIP=247/247 PASSED
  Windows=246/247 FAILED

Output packaged baseline:
  STEP010R1_WINDOWS_SYMLINK_CAPABILITY_AND_SUITE_DIAGNOSTICS
  version=0.10.1-step010r1
  schema=7
```

이 수정은 Skill 제품 계약이나 schema를 변경하지 않는다. STEP010A Control UI framework selection은 STEP010R1 Windows 수용 뒤에만 시작한다.

## Windows 실패 증거

```text
pnpm acceptance:step010
[FAIL] build-unit-architecture-exports :: suite_pass
STEP010_SKILL_DISCOVERY_AND_RUN_SNAPSHOT checks=246/247 state=FAILED
```

나머지 246개 gate와 STEP006~STEP010 live fixture는 통과했다.

## 코드 확인

1. Skill unit test는 Windows file symlink `EPERM`을 `t.skip()`으로 처리했다.
2. Node TAP skip은 exit 0을 유지하지만 pass count를 줄인다.
3. acceptance는 exact `# pass 106`을 요구했다.
4. failure detail은 full predicate가 아니라 process exit `ok`만 확인해 actual TAP output을 숨겼다.

## 구현 범위

- Windows에서는 directory junction, POSIX에서는 directory symlink를 생성한다.
- 외부 directory 내부 resource를 manifest가 참조하게 하여 실제 realpath escape를 검증한다.
- `t.skip()` 경로를 제거한다.
- full suite contract에 `# skipped 0`을 추가한다.
- `suite_contract_ok`를 outcome/detail의 단일 기준으로 사용한다.
- STEP010 전체 acceptance와 모든 live regression을 유지한다.

## 공개 계약

제품 API, protocol, SQLite schema, Tool/Skill manifest 계약은 변경하지 않는다.

Release identity만 다음으로 증가한다.

```text
STEP010R1_WINDOWS_SYMLINK_CAPABILITY_AND_SUITE_DIAGNOSTICS
version=0.10.1-step010r1
```

## 상태 전이

```text
STEP010 deterministic accepted
→ STEP010 Windows aggregate 246/247
→ code-confirmed fixture/diagnostic defects
→ STEP010R1 deterministic acceptance
→ fresh-ZIP acceptance
→ Windows live rerun pending
```

## 실패 및 복구

- junction/directory symlink가 생성되지 않으면 test를 skip하지 않고 정확한 filesystem error로 실패한다.
- suite process exit 0이어도 marker/count가 다르면 실제 TAP tail을 보존한다.
- STEP010 기능 회귀가 하나라도 실패하면 STEP010R1을 수용하지 않는다.

## Acceptance

- root/workspace version alignment
- repair source contract static gates
- focused Skill tests `10/10`, skipped 0
- full STEP010 regression `247/247`
- unit/build/architecture/export `106/106`, skipped 0
- issue registry/detail/recurrence gates
- deterministic package manifest
- byte-identical double ZIP
- final fresh-ZIP acceptance
- forbidden runtime/protected/credential payload zero

## 반복 방지 기록

```text
OR-ISSUE-030 Windows file symlink capability-dependent skip
OR-ISSUE-031 aggregate suite predicate diagnostic masking
```

각 이슈는 Registry row, 상세 실패 문서, 자동 recurrence gate를 갖는다.

## 패키징 산출물

```text
openrill-step010r1-windows-symlink-capability-suite-diagnostics-v1.zip
openrill-step010r1-windows-symlink-capability-suite-diagnostics-v1.zip.sha256.txt
reference/validation/STEP010R1_ACCEPTANCE_REPORT.txt
```

## 제외

- Skill 제품 기능 변경
- schema 8
- UI framework 선택
- Windows Developer Mode 또는 관리자 권한 강제
- 정상 skip을 무조건 pass로 계산하는 느슨한 aggregate 조건

## 완료 선언

source와 fresh ZIP에서 STEP010R1 acceptance, STEP010 전체 regression, manifest verification, deterministic package audit가 모두 통과해야 packaged deterministic baseline으로 선언한다. Windows live acceptance는 사용자의 실제 Windows 출력 이후에만 선언한다.
