# OpenRill Product Identity

## 공식 식별자

| 항목 | 값 |
|---|---|
| 공식 프로젝트명 | `OpenRill` |
| 저장소명 | `openrill` |
| CLI 명령 | `openrill` |
| npm package scope | `@openrill/*` |
| 기본 설정 파일 | `openrill.yaml` |
| 환경변수 prefix | `OPENRILL_` |
| Windows data root | `%LOCALAPPDATA%\OpenRill\<profile>` |
| Windows config root | `%APPDATA%\OpenRill\<profile>` |
| Unix data root | `${XDG_DATA_HOME:-~/.local/share}/openrill/<profile>` |
| Unix config root | `${XDG_CONFIG_HOME:-~/.config}/openrill/<profile>` |

## 제품 설명

OpenRill은 사용자 PC에서 독립 실행되는 local-first 자율형 에이전트다. 대화, 모델 실행, Tool 호출, 승인, 자동화, Artifact와 복구 가능한 로컬 상태를 하나의 Host에서 제공한다.

## 별도 제품과 참조 프로젝트

- `OKCanvas Agent Runtime`: 조직·서버·분산 실행용 별도 제품이다. OpenRill의 필수 런타임이 아니다.
- `OpenClaw`: OpenRill의 코드 의존성이나 호환 대상이 아니라, 문제·불변조건·장애 시나리오를 분석하는 참조 프로젝트다.

## 명칭 불변조건

- 사용자에게 노출되는 로컬 제품명은 항상 `OpenRill`이다.
- CLI, package, config, data path, protocol 문서에 이전 임시 명칭을 노출하지 않는다.
- 서버 제품명 `OKCanvas Agent Runtime`은 변경하지 않는다.
- `OpenRill Runtime` 또는 `OpenRill Agent Runtime`이라는 별도 서버 제품을 암시하지 않는다.
