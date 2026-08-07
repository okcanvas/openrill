# UI State and Reconnect

- UI state는 authoritative DB가 아니다.
- connect `accepted` snapshot의 `stateRevision`과 각 notice sequence를 저장한다.
- gap이 발견되면 `run.events.since` 또는 snapshot reload를 요청한다.
- optimistic UI는 user message submission id로 reconcile한다.
- approval resolve는 pending 표시 후 server result로만 terminal 처리한다.
- stale bundle/protocol mismatch는 강제 reload 안내를 표시한다.
