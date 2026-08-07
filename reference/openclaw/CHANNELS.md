# Channels

관찰: durable ingress queue의 enqueue/claim과 독립 Mattermost monitor가 존재한다: `[OC-CHANNEL-001] src/channels/message/ingress-queue.ts:573`~`[OC-CHANNEL-003] extensions/mattermost/src/mattermost/monitor.ts:63`.

채택: event key, lane ordering, lease, stale recovery, delivery receipt.

변경: Local MVP 이후 Mattermost 한 개만 구현하고 공통 Connector contract를 먼저 확정한다.
