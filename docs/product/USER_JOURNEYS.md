# User Journeys

## J1 코드 작업
1. 사용자가 Workspace를 등록한다.
2. Conversation을 생성하고 변경 요청을 입력한다.
3. Agent가 파일을 검색·읽고 계획을 설명한다.
4. 쓰기/명령 정책에 따라 승인한다.
5. Agent가 patch와 test를 실행한다.
6. UI가 diff, test evidence, Artifact를 보여준다.
7. 사용자가 중단하거나 후속 요청을 보낸다.

## J2 장시간 로컬 작업
1. Agent가 background process를 시작한다.
2. process id와 log tail이 Run Event에 기록된다.
3. UI를 닫아도 Host가 상태를 유지한다.
4. 재접속 시 running/finished 상태를 재구성한다.

## J3 예약 작업
1. 사용자가 자연어로 자동화를 만들고 preview를 확인한다.
2. Host가 normalized schedule과 next-run을 저장한다.
3. 재시작 후 다음 실행을 복구한다.
4. 위험 Tool은 자동화에서도 승인 정책을 우회하지 않는다.

## J4 Mattermost 후속 연결
1. Connector가 event id로 inbound를 durable enqueue한다.
2. lane 단위로 순서 있게 claim한다.
3. common inbound request를 Conversation/Run으로 투영한다.
4. outbound delivery와 receipt를 별도 저장한다.
