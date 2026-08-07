# STEP013B1A Focused Test Reporter Failure Prevention Audit

## Boundaries

- TAP summary를 파싱하는 acceptance command는 반드시 `--test-reporter=tap`을 직접 소유한다.
- platform-default reporter 문자열을 성공 계약으로 사용하지 않는다.
- child exit 0만으로 통과시키지 않고 tests=pass, fail/cancelled/skipped=0을 함께 검증한다.
- standalone CLI fixture는 inherited `NODE_TEST_CONTEXT`를 제거한다.

## Owned commands

```text
focused-test-reporter
focused-browser-observation
focused-browser-adapter-boundaries
focused-browser-runtime
focused-browser-boundaries
canonical-suite (canonical runner owns TAP)
```

## Automated gates

- current and predecessor runner command literals
- temp-file standalone TAP execution
- OR-ISSUE-096/097 evidence presence
- full canonical serial suite
- source/fresh package manifest equality

## Exclusions

This audit does not relax Browser live validation and does not convert a failed aggregate into an accepted baseline. A fresh Windows STEP013B1A run remains mandatory.
