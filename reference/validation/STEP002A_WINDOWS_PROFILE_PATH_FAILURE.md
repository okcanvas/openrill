# STEP002A Windows Profile Path Failure

## Environment

- Windows
- Node.js `24.18.0`
- pnpm `11.15.1`
- command: `pnpm acceptance:step002a`

## Passed before failure

- frozen install
- TypeScript 6 explicit Node type checks
- workspace build
- 18 of 19 unit tests
- Host live process
- CLI version/help/status
- loopback and background-mode guards

## Exact failing assertion

```text
Test: Windows and Unix profile roots follow the OpenRill identity contract
actual:   D:\home\test\.local\share\openrill\alpha\runtime
expected: /home/test/.local/share/openrill/alpha/runtime
```

## Code diagnosis

`packages/config/src/index.ts` selected Unix roots from the supplied `platform: "linux"`, then assembled them with the host-native `node:path.resolve`. On Windows, `/home/test/...` was interpreted under the active Windows drive.

## Required correction

Select `node:path.win32` or `node:path.posix` from the requested target platform and use that selected implementation for the complete path graph.
