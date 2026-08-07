# STEP010 Windows File Symlink Skip Failure

## Exact symptom

실제 Windows 명령 `pnpm acceptance:step010`은 247개 중 정확히 `build-unit-architecture-exports` 한 건만 실패했고 최종 결과는 다음과 같았다.

```text
[FAIL] build-unit-architecture-exports :: suite_pass
STEP010_SKILL_DISCOVERY_AND_RUN_SNAPSHOT checks=246/247 state=FAILED schema=7 skills=DISCOVERED snapshot=IMMUTABLE
```

동일 실행에서 STEP006~STEP010 live fixture, schema 7, Skill snapshot, package identity, secret/payload cleanup은 모두 통과했다.

## Code-confirmed root cause

`tests/unit/skills-step010.test.mjs`의 `resource symlink escape is rejected` fixture는 파일 symlink 생성을 사용했다. Windows가 파일 symlink 권한을 제공하지 않아 `EPERM`을 반환하면 fixture가 `t.skip()`으로 정상 종료했다. Node TAP은 이 경우 process exit 0을 유지하지만 summary를 `pass = total - skipped`로 출력한다.

STEP010 acceptance는 suite exit 0과 `# tests 106`, `# pass 106`, `# fail 0`을 동시에 요구했다. 따라서 제품/회귀 suite가 성공해도 Windows capability skip 한 건이 있으면 `# pass 105`, `# skipped 1`이 되어 aggregate gate만 실패했다.

## Impact

- Windows 관리자 권한 또는 Developer Mode 여부가 acceptance 결과를 바꿨다.
- 실제 Skill symlink escape 구현 결함과 테스트 fixture capability 부족을 구분하지 못했다.
- deterministic source/fresh-ZIP 결과만으로 Windows 수용을 선언할 수 없었다.

## Fix

파일 symlink fixture를 제거하고, 외부 directory를 가리키는 link를 사용하도록 변경했다.

```text
Windows: directory junction
POSIX:   directory symlink
```

manifest resource는 `resources/escape/outside.md`를 참조한다. Windows junction은 일반 사용자 환경에서 생성 가능하며, 실제 `realpath` 기반 Skill source escape 차단을 동일하게 검증한다. capability 부족을 `skip`으로 숨기지 않는다.

## Detailed evidence

수정 전 source:

```text
symlink(outsideFile, resourceLink, "file")
EPERM → t.skip(...)
```

수정 후 source:

```text
symlink(outsideDirectory, resourceLink, process.platform === "win32" ? "junction" : "dir")
```

Node TAP의 skip 의미도 별도 최소 fixture에서 확인했다. skip은 exit code 0이지만 `# pass`를 감소시키고 `# skipped`를 증가시킨다.

## Recurrence-prevention gate

STEP010R1 acceptance는 다음을 모두 검사한다.

- Skill symlink fixture에 `t.skip`이 없음
- Windows branch가 `junction`을 사용
- POSIX branch가 directory symlink를 사용
- focused Skill unit test가 `10/10`, skipped 0
- 전체 suite가 `106/106`, skipped 0
- 실제 STEP010 전체 회귀가 통과
