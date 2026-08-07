$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try { & node "testbeds/mattermost/scripts/testbed.mjs" down; exit $LASTEXITCODE }
finally { Pop-Location }
