# @openrill/automation

STEP012C owns the durable Automation domain and scheduler kernel:

- schema-9 AutomationJob/AutomationRun repository integration;
- at/interval/cron calculation with IANA timezone and DST contracts;
- transactional due materialization, one-owner claim, renewable lease, restart recovery, and bounded catch-up;
- durable manual `requestKey` replay identity;
- owner/nonexpired-lease guarded AgentRun prebinding;
- async executor abort and shutdown quiescence;
- framework-neutral executor interface consumed by Host production composition.

The package does not import Local Protocol, Conversation services, model adapters, or Control UI. STEP012C Host composition supplies the production Conversation Run executor. STEP012D owns Automation UI.
