# ADR-0007: Append Only Run Event Ledger

- Status: Accepted for planning baseline
- Date: 2026-08-01

## Decision

실행 증거는 append-only Run Event로 남기고 projection을 재구성 가능하게 한다.

## Consequences

- 이후 STEP의 파일·계약·수용 기준은 이 결정을 위반할 수 없다.
- 변경하려면 새 ADR이 이 ADR을 supersede해야 한다.

## Reference

OpenClaw의 해당 문제 해결은 `/reference/openclaw`에 기록하지만, 이 결정의 계약은 OpenRill이 독립 소유한다.
