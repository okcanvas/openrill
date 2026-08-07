# Integrated Mattermost Live Testbed

This directory is part of the OpenRill STEP022C source package. It is not a separate project and never requires a second OpenRill path.

From the OpenRill root on Windows CMD:

```cmd
start-and-run-step022c-live.cmd
```

From PowerShell:

```powershell
.\start-and-run-step022c-live.ps1
```

The root wrapper performs `pnpm install --frozen-lockfile`, starts a real local Mattermost Team Edition + PostgreSQL testbed, seeds two distinct users/team/channel in memory, injects the required STEP022C environment variables, and runs the unchanged `pnpm acceptance:step022c:live`.

Mattermost binds only to `127.0.0.1`. Session tokens are never written to a file or printed. `stop` preserves volumes; `reset` deletes only the Docker testbed volumes.
