# OR-ISSUE-259 — Active STEP020E worktree disappeared during execution

## First observation

The temporary STEP020E work directory vanished after focused Host validation while the immutable STEP020D baseline ZIP remained available.

## Classification

Execution environment / ephemeral worktree persistence. No Product state or accepted baseline was modified.

## Correction

The worktree was reconstructed from the immutable STEP020D ZIP. Every STEP020E source change was reapplied from the code-derived change inventory, compared against the baseline, rebuilt, and all focused tests were rerun. Earlier passes were not treated as evidence for the reconstructed tree.

## Recurrence gate

A disappeared worktree must be restored only from an immutable accepted ZIP; reconstructed source requires a fresh diff, clean build, and focused/full acceptance before packaging.
