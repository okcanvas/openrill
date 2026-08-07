$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try { & node "testbeds/mattermost/scripts/testbed.mjs" up; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & node "testbeds/mattermost/scripts/testbed.mjs" bootstrap; exit $LASTEXITCODE }
finally { Pop-Location }
