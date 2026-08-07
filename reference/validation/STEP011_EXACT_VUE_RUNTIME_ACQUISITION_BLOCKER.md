# STEP011 exact Vue runtime acquisition blocker

## Status

This is an environment blocker, not a closed Engineering Issue and not evidence of a Product root cause.

## Required immutable input

```text
package=vue
version=3.5.40
url=https://registry.npmjs.org/vue/-/vue-3.5.40.tgz
integrity=sha512-+8PJ4SJXdn/cHGImF4CKdxlWHIN5Dkt7DoufRREM6h6uVCx2m7QxgcEQmmzyOK8A9mcafg7sFbJFYsdFVubTig==
```

## Observed environment evidence

- direct container DNS could not resolve `registry.npmjs.org`;
- the available internal npm repository returned `404` for `vue@3.5.40`;
- Chromium did not obtain the public unpkg resource within the bounded request window;
- no exact Vue 3.5.40 tarball or runtime was found in the repository, package cache or uploaded-file sources.

No different Vue version, unrelated project bundle, hand-written substitute or mocked runtime was accepted.

## Implemented acquisition contract

`scripts/vendor-vue-runtime.mjs` accepts either `--download` or `--archive`. It verifies the npm SHA-512, bounded archive size, exact package name/version, exact regular-file tar entries, runtime size/version and MIT license before producing the temporary production vendor root.

`pnpm acceptance:step011` uses `OPENRILL_VUE_ARCHIVE` when present and otherwise performs the bounded verified download. The production build copies only the verified runtime, license and lock from `OPENRILL_VUE_RUNTIME_VENDOR_DIR`.

## Current acceptance evidence

```text
STEP011_CONTROL_UI_VERTICAL_SLICE checks=183/195 state=FAILED schema=7 framework=VUE_3 browser=CHROMIUM
```

The 12 failures are exactly:

1. runtime acquisition;
2. ten derived runtime/archive/hash/license/re-extraction checks;
3. the real Chromium vertical slice, which is intentionally not run without the verified runtime.

The full serial build/unit/architecture/export suite passed `127/127` across 22 unit files with skipped 0, and the STEP010 Skill live regression passed.

## Resolution command

Online Windows environment:

```cmd
pnpm acceptance:step011
```

Pre-fetched tarball:

```cmd
set OPENRILL_VUE_ARCHIVE=D:\path\vue-3.5.40.tgz
pnpm acceptance:step011
```

STEP011 must remain unaccepted until the final marker reports `state=PASSED` and `browser=CHROMIUM`.
