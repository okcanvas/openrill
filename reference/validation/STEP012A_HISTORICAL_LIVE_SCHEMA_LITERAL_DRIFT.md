# STEP012A Historical Live Schema Literal Drift

## 실제 증상

Nested STEP011에서 canonical suite inventory 수정 후 다음 실제 회귀가 드러났다.

```text
[FAIL] step010-skill-live-regression
Error: schema mismatch: {"schemaVersion":8}
at scripts/run-step010-live.mjs
```

STEP012A migration은 정상적으로 schema 8을 생성했고 state identity도 8이었다. 실패한 것은 Skill 기능이 아니라 historical live fixture의 assertion이었다.

## 코드로 확정한 원인

현재 package에서 regression으로 재사용되는 다음 파일이 current State owner를 참조하지 않았다.

```text
scripts/run-step008-live.mjs
scripts/run-step009-live.mjs
scripts/run-step010-live.mjs
```

각 파일은 SQLite identity를 `schemaVersion !== 7`로 검사하고 success marker에도 `schema=7`을 직접 기록했다. OR-ISSUE-012와 OR-ISSUE-015는 migration/unit fixture의 schema-derived expectation을 강화했지만 shared live scripts를 repository-wide로 검사하지 않았다.

## 영향

- schema를 올린 정상 package에서 이전 기능 live regression이 허위 실패한다.
- marker가 실제 database identity와 다르게 schema 7을 주장할 수 있다.
- schema migration 이후 browser/skill regression의 실제 제품 결함을 보기 전에 validation literal에서 중단된다.

## 수정

세 shared live fixture가 다음 built owner를 import한다.

```js
import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";
```

Identity assertion과 success marker 모두 같은 상수를 사용한다. STEP012A current value는 8이다.

## 자동 recurrence-prevention gate

- 세 live fixture 모두 owner constant import 필요
- `schemaVersion !== 7`, `schemaVersion === 7`, marker `schema=7` 금지
- identity assertion과 marker에서 `OPENRILL_STATE_SCHEMA_VERSION` 사용 필요
- nested STEP011에서 actual STEP010 skill live regression 실행

이 이슈는 `OR-ISSUE-057`로 등록한다.
