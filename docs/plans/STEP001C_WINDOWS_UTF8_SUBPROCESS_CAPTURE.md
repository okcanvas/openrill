# STEP001C — Windows UTF-8 Subprocess Capture

## 목적

Windows 한국어 로캘(cp949)에서 STEP001 회귀 수용 러너가 Node.js의 UTF-8 출력을 운영체제 기본 인코딩으로 디코딩해 중단되는 결함을 제거한다. 명령 성공 여부와 실제 출력 검증이 로캘에 의존하지 않도록 모든 중첩 수용 러너의 subprocess 출력 경계를 하나로 통합한다.

## Reference Evidence

- `scripts/run_step001_acceptance.py`, `run_step001a_acceptance.py`, `run_step001b_acceptance.py`는 모두 `subprocess.run(..., text=True)`를 사용했다.
- Python에서 `text=True`이고 `encoding`을 지정하지 않으면 부모 프로세스의 locale encoding으로 stdout을 디코딩한다.
- Windows live traceback은 `C:\Python312\Lib\subprocess.py`의 `stdout.read()` 중 cp949가 byte `0xe2`를 디코딩하지 못해 발생했다.
- 실패 위치는 STEP001 suite 자식 프로세스의 stdout capture이며, Node/TypeScript/architecture 검사 자체의 실패가 아니다.
- UTF-8 문자열 `✓`의 첫 byte는 `0xe2`이며 cp949 strict decode로 동일한 `UnicodeDecodeError`를 재현할 수 있다.

## 실패 증거

```text
UnicodeDecodeError: 'cp949' codec can't decode byte 0xe2 in position 371
step001-regression = FAILED
step001a-regression = FAILED
STEP001B ... state=FAILED
```

같은 실행에서 STEP001B의 lockfile/settings 자체 검사는 모두 통과했으며 실패는 nested regression 출력 수집에서만 발생했다.

## 원인

기존 구현은 child output을 bytes로 보존하지 않고 다음처럼 locale text mode로 즉시 변환했다.

```python
subprocess.run(..., text=True, stdout=subprocess.PIPE)
```

Node.js와 OpenRill이 출력한 UTF-8 byte stream을 Windows cp949 decoder가 읽으면서 예외가 발생했다. 따라서 제품 코드, pnpm lockfile, Node 버전이 원인이 아니다.

## 구현 범위

- `scripts/subprocess_utf8.py`에 단일 child-process 실행 경계를 추가한다.
- stdout/stderr를 `text=False` binary mode로 결합 수집한다.
- 수집한 bytes를 UTF-8로 명시적으로 디코딩하고, 잘못된 byte는 replacement character로 보존해 수용 러너 자체가 중단되지 않게 한다.
- Python child에도 `PYTHONUTF8=1`, `PYTHONIOENCODING=utf-8`을 전달한다.
- STEP001, STEP001A, STEP001B의 duplicated subprocess wrapper를 공통 helper로 교체한다.
- UTF-8 check mark round-trip과 cp949 실패 재현을 STEP001C acceptance에 포함한다.
- root 및 24개 workspace 버전을 `0.1.3-step001c`로 정규화한다.

## 공개 계약

```text
controlled child stdout/stderr capture = bytes
primary output encoding               = UTF-8
decode failure policy                 = replacement, never runner crash
Python child I/O                       = UTF-8 forced
Windows locale                         = acceptance semantics에 영향 없음
```

## 상태 전이

```text
STEP001B_SETTINGS_ALIGNED
  → WINDOWS_FROZEN_INSTALL_PASSED
  → WINDOWS_ACCEPTANCE_CP949_DECODE_FAILED
  → STEP001C_UTF8_CAPTURE_FIXED
  → WINDOWS_ACCEPTANCE_RERUN_PENDING
```

## 실패 및 복구

- child command exit code non-zero: 기존처럼 해당 회귀 gate 실패로 기록한다.
- UTF-8이 아닌 byte 포함: replacement character로 출력 증거를 보존하고 return code 판정을 계속한다.
- helper를 우회해 `text=True`를 다시 추가: STEP001C static gate 실패
- Windows live rerun 실패: STEP002 진입 금지

## Acceptance

정적·결정적 수용:

```bash
python scripts/run_step001c_acceptance.py
```

필수 조건:

- Node child의 `✓ UTF-8 subprocess`가 손실 없이 round-trip
- cp949 strict decode 실패 재현
- 세 기존 acceptance runner에 `text=True` 0개
- STEP001, STEP001A, STEP001B regression 모두 통과
- package manifest와 fresh ZIP 검증 통과

Windows live 수용:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step001c
```

## 패키징 산출물

- `openrill-step001c-windows-utf8-subprocess-v1.zip`
- matching SHA-256 file
- regenerated `PACKAGE_MANIFEST.json`
- STEP001C acceptance report

## 제외

- Node, pnpm, TypeScript 버전 변경
- PowerShell code-page 전역 변경
- Windows system locale 변경
- Host lifecycle, SQLite, WebSocket, UI Runtime 구현
