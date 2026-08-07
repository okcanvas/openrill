# Startup and Shutdown

## STEP002 현재 구현

`STARTING → LISTENING → READY → STOPPING → STOPPED`, 실패는 `FAILED`다.

1. profile과 canonical paths 해석
2. runtime directory 준비
3. profile owner lock 획득
4. control handler가 부착된 HTTP server 생성
5. loopback listen
6. private metadata를 `LISTENING`으로 기록
7. 필수 startup work 완료 후 `READY`

Shutdown은 admission을 닫고 server를 close한 뒤 metadata를 제거하고, lock file의 `instanceId`가 자기 owner일 때만 lock을 제거한다.

## 불변조건

- lock 획득 전 listener를 열지 않는다.
- request handler를 server 생성 시점에 붙이고 난 뒤 listen한다.
- port-open과 READY를 동일하게 취급하지 않는다.
- non-loopback bind를 거부한다.
- startup 실패는 metadata와 owner lock을 rollback한다.
- close는 여러 번 호출되어도 하나의 Promise만 실행한다.
- control token은 public status에 포함하지 않는다.

## 이후 단계

STEP003에서 versioned local protocol을 추가하고, STEP004에서 SQLite open/migration을 READY 전 필수 단계로 삽입한다. Agent work drain과 DB checkpoint는 해당 기능이 존재하는 단계에서 추가한다.
