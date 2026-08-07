# Inventory

| 영역 | 파일 수 |
|---|---:|
| `src` | 12,833 |
| `packages` | 827 |
| `extensions` | 8,826 |
| `skills` | 75 |
| `ui` | 2,034 |
| `apps` | 2,080 |
| `test` | 819 |
| `docs` | 851 |
| `total` | 30,307 |

주요 구조:

- root CLI wrapper + TypeScript entry
- `src/gateway`, `src/agents`, `src/auto-reply`, `src/config`, `src/state`
- `packages/gateway-protocol`, `packages/agent-core`, 기타 public/internal package
- 다수 extension과 bundled skill
- Lit 기반 Control UI
- Android/iOS/macOS/Linux app source
- unit/integration/e2e/performance/platform test

이 규모는 전체 기능 동등성 구현을 첫 목표로 삼으면 안 된다는 직접 근거다.
