# OR-ISSUE-172 — Historical checkpoint exact-object freeze

## Symptom
The retained STEP013C checkpoint test rejected the additive `errorCode:null` metadata even though the original checkpoint identity and values were unchanged.

## Cause
The historical test used exact object equality for an extensible durable metadata projection.

## Correction
The retained expectation includes the bounded scalar field. Tool arguments, Tool output, and private messages remain absent from the checkpoint event.

## Gate
Successful Tool checkpoints persist `errorCode:null`; typed failures persist an allow-listed code only.
