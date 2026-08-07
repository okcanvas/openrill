# OR-ISSUE-244 — Exact replay could attempt to reschedule a terminal child Run

## Failure

The initial runtime invoked `scheduleRun()` after every exact child request replay. Once the durable Run had completed, a replay could ask the coordinator to start a terminal Run instead of only returning its stable identity.

## Correction

The runtime schedules only durable Runs whose current status is `CREATED` or `RUNNING`. Replays of `COMPLETED`, `FAILED`, `CANCELLED`, or waiting Runs return the existing Run and Task with `scheduled=false`.

## Gate

The runtime test proves completed replay does not call the scheduler, and the Host restart test replays a completed child and observes the same Run/Task IDs with `scheduled=false`.
