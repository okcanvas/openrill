# Artifact Contract

Artifact는 메시지 attachment가 아니라 Run 결과물이다.

필드:

- artifactId, runId, kind, displayName
- logicalPath, storagePath 또는 externalUri
- mediaType, byteSize, sha256
- createdAt, producerToolCallId
- retentionClass

Workspace 파일을 모두 Artifact로 복사하지 않는다. 사용자가 받을 결과 또는 evidence로 명시된 항목만 등록한다.
