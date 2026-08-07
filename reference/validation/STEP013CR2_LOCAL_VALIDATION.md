# STEP013CR2 Local Validation

```text
step=STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT
version=0.13.11-step013cr2
schema=11
baseline=STEP013B3
```

## Deterministic results

```text
source/version: PASS (27 manifests / 26 sources / 3 Host literals)
workspace lock: PASS (27 importers / 67 dependencies)
workspace module links: PASS (64 edges / 26 materialized)
build: PASS
focused Browser/Automation/assertion: 86/86 PASS
canonical serial: 330/330 PASS
unit files: 59
skipped: 0
architecture: PASS (26 packages / 64 edges / 112 sources)
exports: 26/26 PASS
package manifest before final documentation seal: 942/942 PASS
```

The current container does not have exact `playwright-core 1.62.0`; therefore the real two-Host Browser live stage cannot be accepted locally. The local aggregate must fail only that prerequisite while retaining the exact adapter diagnostic. Windows live acceptance is required for promotion.

## Acceptance inventory

```text
static acceptance contracts: 140/140 PASS
external stages excluding real Browser: 22/22 PASS
real Browser stage: FAILED locally before launch because Browser dependency is unavailable
local contract total: 162/163
expected Windows total: 163/163
```

The full Windows marker remains pending. No local Browser launch, crash/restart success, or Chromium-live acceptance is claimed.

## Deterministic package and fresh extraction

```text
packaged source files: 943
two independent packages: byte-identical
fresh ZIP package manifest: 942/942 PASS
fresh ZIP source/version: PASS
fresh ZIP lock/module links: PASS
fresh ZIP build: PASS
fresh ZIP focused: 86/86 PASS
fresh ZIP canonical: 330/330 PASS
fresh ZIP architecture: 26/64/112 PASS
fresh ZIP exports: 26/26 PASS
```
