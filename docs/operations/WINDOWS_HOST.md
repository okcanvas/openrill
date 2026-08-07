# Windows Host Operations

## STEP002 foreground Host

```cmd
openrill start --profile default
openrill status --profile default
openrill stop --profile default
```

- data root: `%LOCALAPPDATA%\OpenRill\<profile>`
- config root: `%APPDATA%\OpenRill\<profile>`
- lifecycle files: `<dataRoot>\runtime\host.lock`, `host.json`
- Ctrl+C는 SIGINT shutdown coordinator로 들어간다.
- `status`와 `stop`은 `host.json`의 private token으로 loopback endpoint를 인증한다.

Node 또는 pnpm이 실행되는 터미널과 별개로, Host가 실행 중인 콘솔을 닫으면 비정상 종료가 될 수 있다. 다음 start/status가 dead PID lock을 정리한다.

## STEP019

Scheduled Task 설치/삭제, login start, update handoff, absolute Node/CLI path, service drift audit는 STEP019 범위다. STEP002의 `start`는 background service를 가장하지 않는다.
