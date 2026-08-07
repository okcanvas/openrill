# Config Contract

## Source and state separation

| Artifact | Location | Authority |
|---|---|---|
| source | `<configRoot>/agent.yaml` | 사용자 작성 설정 |
| materialized | `<dataRoot>/config/materialized.json` | 현재 검증된 runtime projection |
| last-known-good | `<dataRoot>/config/last-known-good.json` | parse/schema 손상 복구 기준 |
| mutation journal | `<dataRoot>/config/journal/*.json` | 값 없는 변경 metadata |
| mutation lock | `<dataRoot>/config/config.mutation.lock` | profile 단일 writer |
| file secrets | `<configRoot>/secrets/` | point-of-use secret file root |

## V1 root

```text
version, include, host, modelProviders, workspaces,
execution, skills, automation, ui
```

모든 object는 closed schema다. 알 수 없는 key는 경고가 아니라 오류다.

## YAML subset

지원:

- 2-space indentation mapping
- sequence
- string/number/boolean/null scalar
- JSON 문법의 flow array/object
- `#` comment

거부:

- tab indentation
- anchor/alias/tag/merge key
- block scalar
- multi-document marker/directive
- duplicate key
- `yes/no/on/off` ambiguous boolean

## Include

- root `include`만 지원한다.
- string 또는 string array다.
- owner file 기준 상대 경로만 허용한다.
- config root 밖 lexical path와 symlink realpath를 모두 거부한다.
- 기본 제한: depth 8, file 32, source graph 512 KiB.
- include 순서대로 deep merge하고, owner source가 마지막으로 override한다.
- array는 merge하지 않고 후속 값이 교체한다.

## Validation and materialization

처리 순서:

```text
read → parse → include graph resolve → future-version guard
→ closed schema validate → defaults → secret availability inspect
→ canonical JSON → snapshot/LKG persist
```

기본 materialized 값:

- host bind `127.0.0.1`, port `47117`
- execution approval mode `ask`, process timeout `120000`, approval timeout `120000`
- automation disabled
- UI auto-open disabled

## Execution timeouts

```yaml
execution:
  approvalMode: ask
  defaultTimeoutMs: 120000
  approvalTimeoutMs: 120000
```

- `defaultTimeoutMs`는 `process.run` 입력이 자체 `timeoutMs`를 생략했을 때의 foreground child 실행 제한이다.
- `approvalTimeoutMs`는 pending approval의 operator decision TTL이다.
- 두 값은 독립적으로 materialize되고 Host에서 각각 ProcessManager와 ApprovalService에 전달된다.
- 기존 source가 `approvalTimeoutMs`를 생략하면 120000을 사용한다.

## Revisions

- `sourceRevision`: config root 내부 전체 source graph의 상대 경로+raw content SHA-256
- invalid source recovery 시: 현재 root raw SHA-256
- `materializedRevision`: key-sorted canonical materialized JSON SHA-256

write는 `expectedRevision`과 현재 source graph revision이 다르면 `CONFIG_REVISION_CONFLICT`다.

## Atomic mutation

```text
mutation lock
→ current revision check
→ candidate source parse/include/schema preflight
→ temp file mode 0600
→ file fsync
→ rename
→ directory fsync best effort
→ disk reload and snapshot promotion
→ value-free journal append
→ lock owner release
```

post-commit reload가 실패하면 이전 source를 복원하고 실패한다.

## Recovery

- source missing: built-in defaults, `recovery=DEFAULTS`
- valid source: `recovery=SOURCE`
- parse/schema failure + valid LKG: `recovery=LAST_KNOWN_GOOD`
- include escape/cycle/limit: fail closed
- unsupported future version: fail closed

## CLI

```text
openrill config path
openrill config init
openrill config validate
openrill config show
```

`show`는 SecretRef key를 `<redacted>`로 치환한다. 실제 config 객체나 Secret 값은 출력하지 않는다.
