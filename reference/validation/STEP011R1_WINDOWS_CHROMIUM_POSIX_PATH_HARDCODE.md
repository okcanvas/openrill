# STEP011R1 Windows Chromium POSIX path hardcode

## 실제 증상

Windows에서 다음 명령을 실행했다.

```text
pnpm acceptance:step011r1
```

Exact Vue 3.5.40 공급 검증, focused cleanup tests, canonical suite와 STEP010 Skill regression은 통과했다. Nested real browser fixture만 다음과 같이 실패했다.

```text
[FAIL] step011-real-chromium-live
Error: Chromium exited -4058:
    at launchBrowser (.../scripts/run-step011-live.mjs:194:42)
STEP011_CONTROL_UI_VERTICAL_SLICE checks=194/195 state=FAILED
STEP011R1_WINDOWS_SQLITE_WAL_CLEANUP_AND_FAILURE_PRESERVATION checks=142/143 state=FAILED
```

Chromium stdout/stderr detail은 비어 있었다.

## 코드로 확인한 정확한 원인

실패한 `launchBrowser()`는 executable을 다음처럼 고정했다.

```js
spawn("/usr/bin/chromium", [...])
```

`/usr/bin/chromium`은 POSIX 전용 경로다. Windows 실행에서도 같은 literal을 사용했으므로 실제 설치된 Chrome, Edge 또는 Chromium을 탐색하지 않았다. Windows process creation이 실패했고 child의 exit 상태가 `-4058`로 관측됐다.

이 실패는 Vue, Control UI, CDP 조작 또는 SQLite cleanup의 기능 실패가 아니다. Chromium 프로세스가 시작되기 전 executable 선택 단계에서 종료됐다.

## 영향

- real Chromium vertical slice가 시작되지 않는다.
- Windows에 Chrome/Edge가 정상 설치되어 있어도 사용할 수 없다.
- Linux 개발 환경의 우연한 `/usr/bin/chromium` 존재에 acceptance가 결합된다.
- `OPENRILL_CHROMIUM_EXECUTABLE` 같은 명시적 운영자 override가 없다.

## 수정

`chromium-executable.mjs`가 다음 순서로 executable을 결정한다.

1. `OPENRILL_CHROMIUM_EXECUTABLE`
2. `PATH`의 Chrome/Edge/Chromium 명령
3. Windows system/user standard locations
4. macOS application locations
5. POSIX standard locations

Windows 후보에는 다음을 포함한다.

```text
Google Chrome chrome.exe
Microsoft Edge msedge.exe
Chromium chrome.exe
```

경로 조립은 host-native default가 아니라 target platform별 `path.win32`/`path.posix`를 사용한다.

## 자동 재발 방지

- Windows override 우선순위 unit test
- Windows PATH/system/user location inventory test
- Chrome 부재 시 Edge 선택 test
- POSIX `/usr/bin/chromium` compatibility test
- browser missing stable error-code test
- live runner의 literal `spawn("/usr/bin/chromium")` zero gate
- STEP011 exact Vue + real Chromium full regression
