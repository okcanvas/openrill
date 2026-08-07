import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserSourceUrl = new URL("../../apps/agent-web/src/browser-app.ts", import.meta.url);
const browserBuildUrl = new URL("../../apps/agent-web/dist/browser-app.js", import.meta.url);
const htmlUrl = new URL("../../apps/agent-web/public/index.html", import.meta.url);
const vendorUrl = new URL("../../scripts/vendor-vue-runtime.mjs", import.meta.url);
const serverUrl = new URL("../../services/agent-host/src/control-server.ts", import.meta.url);

async function source(url) { return await readFile(url, "utf8"); }

test("Control UI uses a render function and contains no runtime template contract", async () => {
  const browser = await source(browserSourceUrl);
  assert.match(browser, /const \{ createApp, ref, shallowRef, reactive, computed, onMounted, onBeforeUnmount, h \} = vue/);
  assert.match(browser, /return \(\) => h\("div", \{ class: "app-shell"/);
  assert.doesNotMatch(browser, /\btemplate\s*:/);
  assert.doesNotMatch(browser, /new Function|\beval\s*\(/);
});

test("packaged browser selects the Vue runtime-only global build and keeps strict CSP", async () => {
  const [html, vendor, server] = await Promise.all([source(htmlUrl), source(vendorUrl), source(serverUrl)]);
  assert.match(html, /\/vendor\/vue\.runtime\.global\.prod\.js/);
  assert.doesNotMatch(html, /\/vendor\/vue\.global\.prod\.js/);
  assert.match(vendor, /package\/dist\/vue\.runtime\.global\.prod\.js/);
  assert.match(vendor, /runtimeFile: "vue\.runtime\.global\.prod\.js"/);
  assert.doesNotMatch(server, /unsafe-eval/);
  assert.match(server, /script-src 'self' 'sha256-/);
});

test("explicit favicon prevents the browser's implicit favicon.ico 404 diagnostic", async () => {
  const html = await source(htmlUrl);
  assert.match(html, /<link rel="icon" href="\/assets\/favicon\.svg" type="image\/svg\+xml">/);
  assert.equal((await readFile(new URL("../../apps/agent-web/public/assets/favicon.svg", import.meta.url))).length > 100, true);
});

test("runtime-only Vue setup returns a render tree containing the app shell", async () => {
  const originals = {
    window: globalThis.window,
    location: globalThis.location,
    localStorage: globalThis.localStorage,
  };
  let root;
  const vue = {
    version: "3.5.40",
    createApp(component) {
      return {
        mount() {
          const render = component.setup();
          assert.equal(typeof render, "function");
          root = render();
        },
      };
    },
    ref(value) { return { value }; },
    shallowRef(value) { return { value }; },
    reactive(value) { return value; },
    computed(getter) { return { get value() { return getter(); } }; },
    onMounted() {},
    onBeforeUnmount() {},
    h(type, props = null, children = undefined) { return { type, props, children }; },
  };
  const storage = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { Vue: vue } });
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: { hash: "#/conversations", protocol: "http:", host: "127.0.0.1" } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
  } });
  try {
    await import(`${browserBuildUrl.href}?step011r4=${Date.now()}`);
    assert.equal(root?.type, "div");
    assert.equal(root?.props?.["data-testid"], "app-shell");
    assert.equal(root?.props?.["data-framework"], "vue-3");
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
  }
});
