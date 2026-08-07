# OpenClaw Workspace and File Tool Evidence

## 목적

STEP008 구현 전에 OpenClaw 원본 코드에서 workspace authority, 파일 Tool 등록, mutation serialization, bounded read, exact replacement 경계를 확인한 기록이다. OpenRill은 해당 코드를 복사하거나 의존하지 않으며, 관찰된 문제 경계만 독립 계약으로 재구성한다.

## 확인한 경계

### Workspace confinement

`src/agents/agent-tools.ts`는 `apply_patch`를 기본적으로 workspace-contained로 두며, workspace-only 정책일 때 read/write/edit Tool을 root guard로 감싼다. 이 근거는 OpenRill에서도 절대 경로를 Model에 노출하는 방식 대신 등록된 workspace ID와 root-relative path만 허용해야 함을 지지한다.

### Mutation serialization

`src/agents/sessions/tools/file-mutation-queue.ts`는 동일 real file mutation을 직렬화한다. OpenRill STEP008은 단일 파일 write/patch를 optimistic revision 확인과 atomic replacement로 닫으며, 동일 Tool call replay는 STEP007 Kernel 계약을 그대로 사용한다.

### Bounded read

`src/agents/sessions/tools/read.ts`는 byte/line truncation 상한을 명시적으로 사용한다. OpenRill은 read/search 결과에 별도 byte, line, file, match budget을 적용하고 잘린 전체 결과는 private Artifact로 보존한다.

### Exact patch

`src/agents/sessions/tools/edit.ts`는 exact original text와 non-overlap을 요구한다. OpenRill `workspace.patch`는 각 replacement가 정확히 하나와 일치하거나 `replaceAll=true`일 때 하나 이상 일치해야 하며, 하나라도 실패하면 파일을 변경하지 않는다.

## OpenRill 채택/배제

채택:

- workspace ID와 root-relative path
- root confinement 및 symlink/junction escape 거부
- bounded read/search
- exact replacement
- mutation 직렬성과 동시성 충돌을 명시적으로 다루는 원칙

배제:

- OpenClaw source import 또는 package dependency
- 임의 absolute path 입력
- Model이 host path를 직접 선택하는 방식
- Shell/exec/process Tool
- sandbox backend 설정과 OpenClaw Tool policy 구현

## Evidence IDs

```text
OC-FILE-001 .. OC-FILE-005
```
