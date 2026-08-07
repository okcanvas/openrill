$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try {
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if (-not $pnpm) { throw "OPENRILL_PNPM_REQUIRED" }
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & pnpm mattermost:testbed:live
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
