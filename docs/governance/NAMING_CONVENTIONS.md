# OpenRill Naming Conventions

## 공개 이름

- 제품: `OpenRill`
- CLI: `openrill`
- package scope: `@openrill/*`
- environment prefix: `OPENRILL_`
- config file: `openrill.yaml`

## 코드 이름

공개 package는 역할 중심의 짧은 이름을 사용한다.

| 저장소 영역 | 예정 package |
|---|---|
| `apps/agent-cli` | `@openrill/cli` |
| `apps/agent-web` | `@openrill/web` |
| `services/agent-host` | `@openrill/host` |
| `packages/protocol` | `@openrill/protocol` |
| `packages/agent-kernel` | `@openrill/kernel` |
| `packages/tool-runtime` | `@openrill/tool-runtime` |
| `packages/skills` | `@openrill/skills` |
| `packages/extension-sdk` | `@openrill/extension-sdk` |

## 금지

- 이전 임시 로컬 제품명, CLI 또는 package scope 재도입
- OpenClaw의 package, RPC, config 이름을 alias로 노출
- `OKCanvas Agent Runtime`을 OpenRill 내부 모듈명으로 사용
- 역할이 다른 package에 `core`, `common`, `utils` 같은 포괄 이름을 무분별하게 사용

## 변경 절차

공개 식별자 변경은 새 ADR, migration 계획, CLI/config/data-path 호환 정책과 release acceptance가 모두 준비된 경우에만 허용한다.
