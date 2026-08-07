# STEP022CR2 — Integrated Mattermost Testbed Single-Root Bootstrap

## Classification

Validation/support corrective only. STEP022C Product runtime behavior and schema 25 are unchanged.

## Problem proven from packaged code

The prior STEP022CR1 Testbed ZIP was a second independent project root. Its `start-and-run-step022c-live.ps1` required a mandatory `-OpenRillRoot` argument. That contract conflicted with the actual working directory `D:\NODE_AGENTS\okcanvas-openrill` and caused the operator to be told to create/use a directory that did not exist. The PowerShell-only entrypoint also caused a CMD prompt to interpret the backtick continuation incorrectly.

## Correction

- Embed the real Mattermost testbed under `testbeds/mattermost/` in the full OpenRill ZIP.
- Keep STEP022C Product identity `0.24.0-step022c` and state schema 25 unchanged.
- Add root `start-and-run-step022c-live.cmd` for CMD and `.ps1` for PowerShell.
- Derive OpenRill root from the checked-in runner location; accept no external root path argument.
- Run `pnpm install --frozen-lockfile` in that same root before Live.
- Pin the testbed to the verified exact Mattermost Team Edition Docker tag `11.7.7` and PostgreSQL `18-alpine`.
- Preserve localhost-only bind, named volumes, two distinct users, process-memory-only tokens, and the unchanged STEP022C real Live gate.

## Non-goals

No Product runtime semantic change, no fake Mattermost, no bypass of STEP022C Windows Live, no automatic promotion, no remote Docker host support, no production Mattermost deployment claim.
