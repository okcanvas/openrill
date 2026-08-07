# OR-ISSUE-293 — Delivery failure path referenced transaction-local binding

| Field | Value |
|---|---|
| First observed | STEP021B implementation and validation |
| Classification | Static correctness / exception scope |
| Direct cause | dispatcher catch path used a variable defined only inside the transaction callback |
| Correction | failure path reloads durable delivery state outside transaction scope |
| Product impact | prevented before candidate acceptance |
| Recurrence gate | STEP021B focused Product and validation governance |
