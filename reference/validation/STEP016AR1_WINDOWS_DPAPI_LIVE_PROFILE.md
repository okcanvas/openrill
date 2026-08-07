# STEP016AR1 Windows DPAPI Live Profile

Run from a fresh extraction on Windows under the same interactive user that will own the secret:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step016ar1:live
```

Required evidence: 69/69 aggregate PASS, DPAPI CurrentUser round-trip, reference-only config, doctor
READY, duplicate protection, plaintext absence, cleanup quiescence, browser NOT_RUN, model network
NOT_RUN. A failure must retain bounded PowerShell exit/timeout/signal/stderr evidence without the API
key.
