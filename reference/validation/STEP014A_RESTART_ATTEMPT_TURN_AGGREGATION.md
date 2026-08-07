# OR-ISSUE-123 — restart attempt turn aggregation used MAX instead of SUM

## Symptom

Two attempts with one completed turn each aggregated to one Run turn.

## Code cause

`aggregateRunUsage()` and `aggregateRunUsageExcluding()` used `MAX(used_turns)` while token/model/tool counters used `SUM`.

## Impact

A restarted Run could receive more turns than its durable ceiling and its budget envelope under-reported actual work.

## Correction

Turn usage is summed across attempts. A focused fixture inserts two attempts with one turn each and requires aggregate turns `2` with all other counters summed exactly.
