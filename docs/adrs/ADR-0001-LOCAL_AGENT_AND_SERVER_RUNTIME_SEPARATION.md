# ADR-0001: Local Agent And Server Runtime Separation

- Status: Accepted for planning baseline
- Date: 2026-08-01

## Decision

로컬 Agent는 단독 제품이고 서버 Runtime을 필수 의존하지 않는다. 선택적 Connector만 허용한다.

## Consequences

- 이후 STEP의 파일·계약·수용 기준은 이 결정을 위반할 수 없다.
- 변경하려면 새 ADR이 이 ADR을 supersede해야 한다.

## Reference

OpenClaw의 해당 문제 해결은 `/reference/openclaw`에 기록하지만, 이 결정의 계약은 OpenRill이 독립 소유한다.
