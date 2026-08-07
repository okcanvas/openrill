# STEP012AR1 Windows Live Accepted

## Exact command

```cmd
cd /d D:\NODE_AGENTS\okcanvas-openrill
pnpm install --frozen-lockfile
pnpm acceptance:step012ar1
```

## Exact accepted marker

```text
STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS checks=163/163 state=PASSED schema=8 reports=ARTIFACT_ISOLATED manifest=PRE_POST_VERIFIED diagnostics=CHANGED_PATHS feature=STEP012A schedules=AT_INTERVAL_CRON timezone=IANA dst=SKIP_GAP_REPEAT_INSTANT config_runtime=SEPARATED run_identity=UNIQUE browser_regression=CHROMIUM
```

## Accepted artifact

```text
file=openrill-step012ar1-acceptance-report-immutability-manifest-diagnostics-v1.zip
sha256=1f038edc3c21bf9ddff233fc079df80dd18289231d30045c84595e8ec0c6e257
state=WINDOWS_LIVE_ACCEPTED
schema=8
```

The accepted ZIP is immutable. STEP012B consumes its schema-8 Automation domain, schedule, persistence, report-isolation, and manifest-diagnostic contracts without modifying the accepted artifact.
