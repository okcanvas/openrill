# OR-ISSUE-263 — Historical STEP020D governance prohibited its own package-script read

## First observation

The first combined STEP020D/STEP020E governance run failed inside the retained STEP020D historical test although all STEP020E Product tests passed.

## Exact contradiction

The historical test correctly reads `package.json` to verify the immutable STEP020D package entrypoints, but a later broad assertion rejected any occurrence of that same read expression in the test source.

## Classification

Validation governance / historical ownership overreach. No Product behavior failed.

## Correction

The self-referential prohibition was removed. STEP020D continues to own its exact immutable runner identity, Live Harness identity, and retained package-script mappings without attempting to ban legitimate historical evidence reads.

## Recurrence gate

Historical governance may stop owning mutable current identity, but it must not prohibit the reads required to verify its own immutable package entrypoints.
