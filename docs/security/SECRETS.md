# Secrets

## Contract

Secret은 source config에서 다음 reference로만 표현한다.

```yaml
apiKey:
  kind: env
  key: OPENAI_API_KEY
```

종류:

- `env`: 실행 시 process environment에서 해석
- `file`: `<configRoot>/secrets/<key>`에서 실행 시 해석
- `os`: 계약만 예약, STEP003 concrete adapter 없음

## Invariants

- literal Secret 문자열은 closed schema가 거부한다.
- materialized snapshot/LKG에는 reference만 저장하고 실제 값은 저장하지 않는다.
- redacted snapshot은 reference key도 `<redacted>`로 치환한다.
- mutation journal에는 config 값과 reference key를 기록하지 않고 changed path와 hash만 기록한다.
- env/file Secret은 Provider/Tool 실행 직전 최소 scope에서만 resolve한다.
- file Secret path는 secrets root containment를 검사하고 `.`/`..` traversal segment를 거부한다.
- missing Secret은 config parse 실패가 아니다. availability status와 warning으로 반환하며, 해당 Provider 사용 시 fail fast한다.
- OS keychain adapter는 별도 threat model과 platform acceptance 없이 추가하지 않는다.
