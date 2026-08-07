# OR-ISSUE-341 — Adopted Connector Run was not scheduled into the Agent coordinator

## Observed problem

Connector ingress reached ADOPTED and created a durable Run, but STEP022B had no Host callback that scheduled that Run. The Run could remain CREATED indefinitely until a later generic restart scan.

## Correction

ConnectorAdapterRegistry now reports every adopted Run to a Host-owned callback. Agent Host schedules it immediately and publishes a bounded connector.run.admitted notice; the actual Host vertical test proves completion.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
