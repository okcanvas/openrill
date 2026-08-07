# Adopt / Adapt / Defer / Reject

| 영역 | 판단 | 이유 |
|---|---|---|
| 단계형 Host lifecycle | ADOPT principle | race와 복구 경계를 명확히 함 |
| protocol negotiation/schema | ADAPT | 개념 채택, wire 계약은 새로 작성 |
| SQLite authoritative state | ADOPT principle | 로컬 복구와 진단에 적합 |
| session_nodes/window schema | REJECT contract | OpenClaw 고유 역사와 기능이 과다 |
| append-only event/idempotency | ADOPT principle | crash/replay 증거에 필요 |
| exec approval manager | ADAPT | binding/consume를 OpenRill 모델로 재작성 |
| SKILL.md loader | REJECT compatibility | clone 인상과 계약 종속을 피함 |
| skill precedence/snapshot | ADOPT principle | 실행 재현성에 필요 |
| cron durable scheduler | ADAPT | 초기 schedule type 축소 |
| 광범위 plugin API | DEFER/REDUCE | 초기 안정성·보안에 과도 |
| durable connector ingress | ADOPT after MVP | Mattermost reliability에 필요 |
| mobile nodes/pairing | DEFER | 로컬 핵심과 무관 |
| native multi-platform apps | DEFER | browser UI로 먼저 검증 |
| Skill workshop/self-modification | REJECT MVP | 보안·복잡도 과다 |
