# Product Boundary

## OpenRill이 소유한다

- 로컬 Host 설치/실행
- 로컬 Conversation과 Run
- 모델 Provider adapter
- 로컬 Workspace/Tool/Skill
- 사용자 승인
- 자동화
- 브라우저 UI/CLI
- 로컬 진단·백업

## OKCanvas Agent Runtime이 소유한다

- 조직 tenant와 identity
- 분산 Run queue/worker
- 중앙 정책/감사
- 조직 Artifact/Evaluation
- 서버 Sandbox pool
- 다중 사용자 quota/billing

## 연결 원칙

연결은 선택적이다. 향후 `Remote Runtime Connector`를 통해 Run을 위임할 수 있으나, 로컬 데이터 모델과 서버 데이터 모델을 동일하게 강제하지 않는다. Connector가 명시적 mapping을 소유한다.
