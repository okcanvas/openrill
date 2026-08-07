# OR-ISSUE-135 — Child completion and wait registration race

## Symptom
A child could become terminal after `agent.wait` first checked the result but before wait insertion, causing `RUN_STATE_INVALID` instead of returning the terminal result.

## Root cause
The Tool used a read-then-register sequence across separate transactions.

## Correction
If wait registration observes a terminal-state conflict, `agent.wait` re-reads the terminal result. An active registration remains durable; a completed child returns immediately without pausing.

## Gate
Terminal-immediate and durable-wait integration tests cover both sides of the race.
