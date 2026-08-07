# Mattermost Testbed Operations

All commands below are run from the OpenRill repository root. There is no external Testbed directory and no `OpenRillRoot` argument.

## One-command real STEP022C Live

CMD:

```cmd
start-and-run-step022c-live.cmd
```

PowerShell:

```powershell
.\start-and-run-step022c-live.ps1
```

The wrapper runs `pnpm install --frozen-lockfile` first, then starts/seeds the integrated Docker testbed and invokes `pnpm acceptance:step022c:live` in the same root.

## Start and seed only

```cmd
start-mattermost-testbed.cmd
```

or PowerShell:

```powershell
.\start-mattermost-testbed.ps1
```

## Status

```cmd
node testbeds\mattermost\scripts\testbed.mjs status
```

## Stop without deleting data

```cmd
stop-mattermost-testbed.cmd
```

## Full reset

```cmd
reset-mattermost-testbed.cmd
```

`reset` deletes only Docker volumes owned by Compose project `openrill-step022c-testbed`. It does not delete OpenRill source or runtime state.

## Port or local credential override

Copy `testbeds\mattermost\.env.example` to `testbeds\mattermost\.env` and edit only local testbed values. The generated tokens remain process-memory only.

## Failure diagnosis

```cmd
docker compose -p openrill-step022c-testbed -f testbeds\mattermost\docker-compose.yml ps
docker compose -p openrill-step022c-testbed -f testbeds\mattermost\docker-compose.yml logs --tail 200 mattermost
docker compose -p openrill-step022c-testbed -f testbeds\mattermost\docker-compose.yml logs --tail 200 postgres
```

If credentials are changed after the users already exist, run the reset command before retrying. Bootstrap fails closed rather than taking over an account with unknown credentials.
