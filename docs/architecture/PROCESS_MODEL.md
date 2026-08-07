# Process Model

## 제품 프로세스

STEP002의 OpenRill은 하나의 foreground Host process다.

```text
openrill.mjs
  → @openrill/cli
    → @openrill/config profile paths
    → @openrill/host lifecycle
      → host.lock
      → authenticated loopback lifecycle HTTP
      → host.json
```

`openrill start`와 `openrill run`은 같은 foreground 동작이다. background process spawn, respawn, OS service 설치는 없다.

## process ownership

- CLI: runtime guard, argv, profile, signal registration, user output
- Host: lock, listener, readiness, lifecycle endpoint, cleanup
- Config: profile와 filesystem path
- Protocol: token-free lifecycle payload type

## single instance

profile별 한 Host만 허용한다. 동일 profile lock owner는 `instanceId`로 구분한다. active endpoint가 동일 identity를 증명하면 second start를 거부한다. PID dead는 자동 회수하고, PID alive이나 identity 확인이 불가능하면 fail closed한다.

## 참조와 차이

OpenClaw의 in-process restart, external supervisor, dual lock과 OS별 command verification은 분석했지만 STEP002에는 포함하지 않는다. 필요한 장애 증거와 background lifecycle이 생기는 STEP019에서 다시 검토한다.
