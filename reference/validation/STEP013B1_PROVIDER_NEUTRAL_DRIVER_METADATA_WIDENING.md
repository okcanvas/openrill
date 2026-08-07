# OR-ISSUE-090 — STEP013B1 provider-neutral driver metadata widening

## Exact command and symptom

During the first STEP013B1 TypeScript build:

```text
tsc -b tsconfig.build.json --pretty false
```

Host composition failed with the equivalent compiler diagnostic:

```text
TS2339: Property 'executable' does not exist on type 'BrowserDriver'.
```

The failing expression attempted to read adapter-owned executable-resolution metadata after the concrete Playwright driver had already been assigned to a variable typed as the provider-neutral `BrowserDriver` interface.

## Code-confirmed root cause

`BrowserDriver` intentionally exposes only runtime launch/dispose behavior. `PlaywrightBrowserDriver.executable` is concrete-adapter metadata and is not part of the provider-neutral contract. The first composition draft widened the value too early and then accessed `.executable` through the widened interface.

## Impact

- the workspace did not compile;
- adding Playwright metadata to `BrowserDriver` would have leaked adapter-specific policy into `browser-runtime`;
- such leakage would make future providers implement a Playwright-shaped field with no neutral meaning.

## Fix

Host startup now keeps the newly created value in a concrete local named `defaultBrowserDriver`, reads `defaultBrowserDriver.executable.executablePath`, and only then assigns it to the provider-neutral `resolvedBrowserDriver` variable.

## Recurrence-prevention gates

- static test requires concrete creation before the metadata read;
- static test rejects `resolvedBrowserDriver.executable`;
- `browser-runtime` remains free of Playwright dependencies;
- full TypeScript project build is mandatory before acceptance.
