# Failure and Recovery

| 실패 | 저장 상태 | 재시작 처리 |
|---|---|---|
| 모델 stream 중 종료 | Run attempt와 마지막 event sequence | Run을 `interrupted`; 자동 재개하지 않음 |
| Tool 실행 전 종료 | pending Tool Call | 실행되지 않은 것으로 유지 |
| Tool 실행 중 종료 | started event, process identity | process probe 후 finished/orphaned 결정 |
| Tool 성공 후 DB 저장 전 종료 | execution receipt 없음 | 동일 Tool 자동 재실행 금지, 사용자 확인 필요 |
| 승인 대기 중 종료 | durable approval | 만료 전 재표시 |
| schedule timer 유실 | nextRunAt/runtime state | 시작 시 due job scan/catch-up policy |
| config 손상 | source/LKG/journal | 자동 recovery는 안전한 경우만, doctor에 보고 |
| DB integrity 실패 | backup metadata | Host ready 거부, repair/restore 안내 |

복구는 “그럴듯한 추정”이 아니라 기록된 event와 외부 process probe로만 결정한다.

| Parent waiting for child | `run_delegation_waits=WAITING_DELEGATION`, graph/event rows | classify parent `CREATED/RESUMABLE`; STEP014B owns terminal result delivery |
| Provider reports usage above budget | exact observed usage and typed terminal reason | preserve evidence; do not let SQLite ceiling CHECK mask the budget error |
| Run restarts into a new attempt | per-attempt usage rows | SUM cumulative turns/tokens/model/Tool usage across attempts |
