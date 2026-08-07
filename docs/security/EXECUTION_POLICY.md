# Execution Policy

평가 입력:

- Tool risk class
- caller surface(local UI, automation, connector)
- workspace policy
- conversation grants
- normalized command/path/network target
- backend(host/sandbox)
- user presence

평가 순서:

`hard deny → workspace boundary → tool policy → session grant → prompt default`

hard deny는 사용자 승인으로도 우회할 수 없다. 예: Workspace 밖 삭제, Secret store raw export, Host 관리 파일 overwrite.
