# STEP011R3 Vue runtime compiler and CSP mismatch

## Exact symptom

The real Windows Chromium evidence reached the complete document with Vue `3.5.40` and all expected JavaScript resources loaded, but the Control UI never mounted:

```text
appShell=false
connection=null
EvalError: Evaluating a string as JavaScript violates Content Security Policy
at Function (<anonymous>)
at .../vendor/vue.global.prod.js
```

The active policy intentionally omitted `'unsafe-eval'`.

## Code-confirmed root cause

`apps/agent-web/src/browser-app.ts` supplied a runtime `template:` string to `createApp`, while `scripts/vendor-vue-runtime.mjs` packaged `package/dist/vue.global.prod.js`. The full global build compiles runtime templates and the observed compiler path constructed a JavaScript function. `services/agent-host/src/control-server.ts` correctly denied that operation under the strict `script-src` policy.

## Impact

All static assets, bootstrap, and Vue itself could load successfully while the application root remained unmounted. Adding `'unsafe-eval'` would hide the mismatch by weakening the browser security boundary.

## Fix

- Replace the component `template:` contract with a TypeScript render function using Vue `h`.
- Package `package/dist/vue.runtime.global.prod.js` instead of the compiler-bearing full global build.
- Keep the current CSP without `'unsafe-eval'`.
- Verify the compiled browser module can produce an app-shell render tree using a runtime-only Vue fixture.

## Detailed evidence

The Windows evidence showed `readyState=complete`, `vueVersion=3.5.40`, successful loads for Vue, browser-app, protocol, and projection modules, and a single runtime exception originating at `Function (<anonymous>)` in the full Vue build. Source inspection then found the exact `template:` and `vue.global.prod.js` pairing.

## Recurrence-prevention gate

STEP011/STEP011R4 acceptance requires all of the following:

```text
browser-app.ts contains no template: contract
browser-app.ts contains no eval/new Function
browser-app.ts returns an h()-based render function
HTML and vendor lock use vue.runtime.global.prod.js
CSP contains no unsafe-eval
runtime-only fake Vue mount produces data-testid=app-shell
actual Chromium reaches CONNECTED
```
