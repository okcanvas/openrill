$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try { & node "testbeds/mattermost/scripts/testbed.mjs" reset; exit $LASTEXITCODE }
finally { Pop-Location }
