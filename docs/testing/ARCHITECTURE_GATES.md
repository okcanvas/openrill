# Architecture Gates

- `packages/protocol`은 Node fs/net/db를 import하지 않는다.
- `agent-kernel`은 HTTP server와 Vue를 import하지 않는다.
- `connectors`는 internal runner function을 import하지 않는다.
- `tool-runtime`은 UI state를 import하지 않는다.
- `apps/agent-web`은 SQLite 파일을 직접 열지 않는다.
- production package에서 `openclaw` import를 금지한다.
- generated schema와 source schema drift를 검사한다.
- migration은 append-only이며 checksum drift를 검사한다.
