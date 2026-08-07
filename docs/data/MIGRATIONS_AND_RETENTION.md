# Migrations and Retention

- migration은 정수 version과 checksum을 가진다.
- 이미 적용된 migration 파일 checksum 변경은 실패한다.
- destructive rewrite는 explicit maintenance command에서만 수행한다.
- stream delta와 verbose progress는 bounded retention 대상이다.
- final messages, Tool terminal result, Approval decision, Artifact metadata는 기본 보존한다.
- vacuum/compact는 Host maintenance lock에서 수행한다.
