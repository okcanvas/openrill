# OpenRill Config Assets

- `schema/openrill-config-v1.schema.json`: 문서·도구용 closed schema 표현이다. Runtime의 authoritative validator는 `@openrill/config`이다.
- `examples/minimal.agent.yaml`: `openrill config init`과 같은 최소 설정이다.
- `examples/provider.agent.yaml`: Secret 값 대신 `secretRef`를 사용하는 예다.
- `examples/include.agent.yaml`: config root 내부 include 예다.

OpenRill STEP003은 전체 YAML 언어가 아니라 문서화된 안전 subset만 지원한다. anchor, alias, tag, merge key, multi-document, block scalar는 거부한다.
