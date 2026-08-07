# ADR-0002: Clean Reference Redesign

- Status: Accepted for planning baseline
- Date: 2026-08-01

## Decision

OpenClaw는 문제와 불변조건의 증거로만 사용하고 코드·wire·schema 호환을 하지 않는다.

## Consequences

- 이후 STEP의 파일·계약·수용 기준은 이 결정을 위반할 수 없다.
- 변경하려면 새 ADR이 이 ADR을 supersede해야 한다.

## Reference

OpenClaw의 해당 문제 해결은 `/reference/openclaw`에 기록하지만, 이 결정의 계약은 OpenRill이 독립 소유한다.
