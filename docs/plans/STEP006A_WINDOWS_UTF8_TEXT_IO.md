# STEP006A — WINDOWS UTF8 TEXT IO

## 목적

Windows Python 3.12의 실제 `pnpm acceptance:step006`에서 발생한 locale-dependent text decoding 실패를 수정한다. STEP006 ledger 구현과 live process는 실행되기 전에 acceptance runner가 UTF-8 JSON evidence를 Windows 기본 cp949로 읽다가 중단됐다. OpenRill 저장소의 모든 텍스트 파일은 UTF-8로 고정하고, Python `Path.read_text`와 `Path.write_text` 호출은 운영체제 locale에 의존하지 않도록 encoding을 반드시 명시한다.

## 기준선

- Input: Windows-live-accepted `STEP005_SQLITE_STATE_AND_MIGRATION_FOUNDATION` 위의 packaged `STEP006_CONVERSATION_AND_EVENT_LEDGER` version `0.6.0-step006`
- Failure environment: Windows, Python `3.12`, Node `24.18.0`, pnpm `11.15.1`
- Output: `STEP006A_WINDOWS_UTF8_TEXT_IO`, version `0.6.1-step006a`
- STEP006 제품 코드 변경: 없음

## 실패 증거

실제 Windows 실행은 다음 위치에서 중단됐다.

```text
reference/openclaw/EVIDENCE_INDEX.json
UnicodeDecodeError: 'cp949' codec can't decode byte 0xed in position 73
```

파일의 position 73부터 시작하는 바이트는 UTF-8 한국어 문장 `패키지 이름은 openclaw이다.`의 시작이다. 동일 파일은 `encoding="utf-8"`로 정상 파싱되며 evidence count는 104이다.

## 원인

`scripts/run_step006_acceptance.py`가 다음과 같이 encoding을 생략했다.

```python
path.read_text()
```

Python `Path.read_text()`는 encoding 생략 시 `locale.getencoding()`에 의존한다. 해당 Windows 환경에서는 cp949가 선택됐다. STEP001C가 child-process output을 binary capture 후 UTF-8로 해석하도록 고쳤지만, STEP006에서 repository file text IO에 같은 원칙을 적용하지 않았다.

STEP002~STEP005 수용 러너는 이미 `read_text(encoding="utf-8")`와 `write_text(..., encoding="utf-8")`를 사용했다. STEP006 runner만 이 저장소 규칙에서 이탈했다.

## 구현 범위

1. `scripts/run_step006_acceptance.py`
   - 모든 repository text read를 UTF-8 helper로 통일한다.
   - acceptance report write에 `encoding="utf-8"`을 명시한다.
   - JSON, Markdown, TypeScript, SQL, package manifest를 동일 규칙으로 읽는다.
2. `scripts/run_step006a_acceptance.py`
   - 실제 cp949 position 73 실패를 재현한다.
   - 같은 evidence file을 UTF-8로 읽어 104개 evidence와 한국어 statement를 검증한다.
   - Python AST로 `scripts/*.py`의 모든 `Path.read_text`/`Path.write_text` 호출에 explicit encoding이 존재하는지 검사한다.
   - STEP006 전체 88/88 회귀를 실행한다.
3. 문서와 패키징
   - UTF-8 text IO 계약, ADR, Windows 실패 기록을 추가한다.
   - current package version과 manifest verifier를 STEP006A로 정렬한다.

## 공개 계약

```text
repository text encoding        UTF-8
Python repository text read     explicit encoding="utf-8"
Python repository text write    explicit encoding="utf-8"
child process output            binary capture → UTF-8 replacement decode
Windows ACP / locale            not a contract
binary files                    read_bytes / write_bytes
```

- `.json`, `.md`, `.ts`, `.mjs`, `.sql`, `.yaml`, `.txt`의 repository source는 UTF-8이다.
- Windows cp949, UTF-8 mode, console code page는 correctness 전제조건이 아니다.
- binary payload에는 text decoder를 적용하지 않는다.
- `errors="replace"`는 controlled child-process diagnostic output에만 허용하며 repository source parsing에는 사용하지 않는다.

## 상태 전이

```text
STEP006_DETERMINISTIC_PASS
  → WINDOWS_PYTHON_CP949_SELECTED
  → EVIDENCE_JSON_DECODE_ABORTED
  → EXPLICIT_REPOSITORY_UTF8_IO
  → AST_REGRESSION_GATE
  → STEP006_REGRESSION_88_OF_88
  → STEP006A_ACCEPTED
```

Conversation, Run, Attempt, Event, Projection, Host recovery 상태 전이는 변경하지 않는다.

## 실패 및 복구

- active Python script에 encoding 없는 `read_text` 또는 `write_text`가 있으면 실패한다.
- evidence JSON이 UTF-8로 파싱되지 않으면 실패한다.
- cp949 실패 증거의 position/byte가 실제 보고와 다르면 실패한다.
- STEP006 전체 88/88 회귀가 통과하지 않으면 STEP006A를 수용하지 않는다.
- locale 독립성을 위해 Windows code page 변경이나 `chcp 65001`을 요구하지 않는다.

## Acceptance

- 25개 package version `0.6.1-step006a` 정렬
- STEP006 runner explicit UTF-8 reads/writes
- active Python scripts AST text-IO scan
- reported cp949 failure at position 73 / byte `0xed` reproduction
- UTF-8 evidence 104/104 and Korean statement parse
- STEP006 full regression 88/88
- runtime/database/protected payload zero
- Windows CRLF launcher
- deterministic manifest and fresh-ZIP rerun

Windows command:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step006a
```

## 패키징 산출물

- version `0.6.1-step006a`
- `scripts/run_step006a_acceptance.py`
- `scripts/sh_run_step006a_acceptance.cmd`
- `scripts/sh_run_step006a_acceptance.sh`
- `scripts/package_step006a.py`
- `docs/testing/PYTHON_UTF8_TEXT_IO.md`
- `docs/adrs/ADR-0022-EXPLICIT_UTF8_REPOSITORY_TEXT_IO.md`
- `reference/validation/STEP006_WINDOWS_DEFAULT_TEXT_DECODING_FAILURE.md`
- `reference/validation/STEP006A_ACCEPTANCE_REPORT.txt`
- deterministic ZIP and SHA-256

## 제외

- Conversation/Event ledger schema 변경
- Local Protocol operation 변경
- Host lifecycle 변경
- model/provider/tool/approval 구현
- Python UTF-8 mode를 사용자 환경에 강제
- Windows system locale 또는 console code page 변경
- binary file encoding 정책 변경

## 완료 선언

STEP006A는 Windows locale과 무관하게 STEP006 acceptance가 repository UTF-8 text를 읽고 쓸 수 있으며, 이 규칙이 활성 Python 스크립트 전체에 자동 검증될 때 완료된다.
