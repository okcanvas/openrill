# STEP022CR3 Local Source Package Acceptance

- Corrective: `STEP022CR3_WINDOWS_CMD_ENTRYPOINT_BYTE_CONTRACT_CLOSURE`.
- Product retained: `STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE` / `0.24.0-step022c` / schema 25.
- Purpose: close the Windows root CMD byte/content packaging gap without changing Product runtime semantics.

## Final local staged evidence

- CR3 focused byte/governance regression: `5/5 PASSED`.
- STEP022C focused Mattermost: `24/24 PASSED`.
- Retained STEP022B/STEP022A/STEP021BR2 Product: `61/61 PASSED`.
- Affected Config/Protocol/Host: `23/23 PASSED`.
- Governance: `244/244 PASSED`.
- Canonical: `185 files`, `962/962 PASSED`, failures `0`, skipped `0`.
- Architecture: `37 packages / 99 edges / 186 sources`.
- Exports: `37/37 PASSED`.
- Workspace lock: `38 importers / 102 dependencies`.
- Workspace module links: `99 edges / 37 materialized`.

The container tool has an outer single-call duration cap shorter than the complete canonical aggregate. Therefore STEP022C's unchanged aggregate could not emit its one-process final `32/32` marker in this packaging environment. The exact same stages were executed separately, and the complete canonical sorted file set passed 185/185 files with 962/962 tests. No Windows Mattermost Live success is claimed here.

## CMD byte contract

- `start-and-run-step022c-live.cmd`: ASCII, CRLF-only, non-empty.
- It changes to `%~dp0`, verifies `pnpm`, directly runs `call pnpm install --frozen-lockfile`, then `call pnpm mattermost:testbed:live`.
- It contains no `OpenRillRoot` argument and no PowerShell dependency.
- Start/stop/reset CMD helpers obey the same ASCII/CRLF/same-root contract.
- `scripts/package_step022cr3.py` validates the source bytes and reopens the produced ZIP to validate the packaged bytes before returning success.

## Recorded failures

- `OR-ISSUE-372`: CMD packaged bytes were not previously treated as executable evidence.
- `OR-ISSUE-373`: recurrence gate initially omitted the linked issue identifier.
- `OR-ISSUE-374`: historical STEP022CR2 test froze the PowerShell wrapper implementation.
- `OR-ISSUE-375`: overlapping acceptance cleanup invalidated an orphan canonical process after an outer timeout.

## Promotion

- Docker/Mattermost real Windows Live: `NOT_RUN` in the packaging environment.
- STEP022C Windows real-Mattermost live: `PENDING`.
- Official Product baseline remains `STEP021BR2` until the real Windows gate passes.
