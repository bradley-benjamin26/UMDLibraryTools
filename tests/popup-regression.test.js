const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createStorage(initial = {}) {
  const state = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return state.has(key) ? state.get(key) : null;
    },
    setItem(key, value) {
      state.set(key, String(value));
    },
    removeItem(key) {
      state.delete(key);
    },
    clear() {
      state.clear();
    },
    snapshot() {
      return Object.fromEntries(state.entries());
    }
  };
}

function loadPopupContext(options = {}) {
  const sessionStorage = createStorage(options.sessionStorage || {});
  const localStorage = createStorage(options.localStorage || {});
  const listeners = new Map();
  const elements = {
    pageStatus: { textContent: "" },
    proxyButton: {
      disabled: false,
      textContent: "",
      setAttribute() {},
      addEventListener(type, handler) {
        listeners.set(type, handler);
      }
    },
    proxyMessage: { textContent: "" }
  };

  const context = {
    console,
    URL,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Map,
    Set,
    Promise,
    Math,
    Date,
    sessionStorage,
    localStorage,
    window: null,
    document: {
      referrer: options.referrer || "",
      getElementById(id) {
        return elements[id] || null;
      }
    },
    chrome: options.chrome || {
      tabs: {
        query: async () => [{ id: 1, url: options.currentUrl || "https://example.com/article" }],
        update: async () => {},
        reload: async () => {}
      }
    }
  };

  context.window = context;
  context.window.sessionStorage = sessionStorage;
  context.window.localStorage = localStorage;
  context.window.document = context.document;
  context.window.chrome = context.chrome;
  context.globalThis = context;

  const code = fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8");
  vm.createContext(context);
  vm.runInContext(code, context);

  return { context, sessionStorage, localStorage, elements, listeners };
}

function run() {
  const proxyTarget = "https://journals.sagepub.com/doi/10.1177/00472875241289565";

  {
    const { context, localStorage } = loadPopupContext({
      sessionStorage: {},
      localStorage: {
        "umcp-library-proxy-last-target": JSON.stringify(proxyTarget)
      },
      currentUrl: "https://proxy-um.researchport.umd.edu/menu"
    });

    assert.equal(context.getStoredProxyTarget(), proxyTarget, "localStorage fallback should restore the proxy target");
    assert.equal(context.resolvePopupProxyTarget("https://proxy-um.researchport.umd.edu/menu"), proxyTarget, "proxy menu pages should reuse the stored target");
    assert.ok(localStorage.snapshot()["umcp-library-proxy-last-target"], "stored proxy target should remain persisted");
  }

  {
    const { context, localStorage } = loadPopupContext({});

    context.writeSkippedHosts(["Example.com", "sub.example.com", "example.com"]);
    assert.deepEqual(JSON.parse(localStorage.getItem("umcp-library-skip-hosts")), ["example.com", "sub.example.com"], "skip hosts should persist in normalized form");
    assert.equal(context.isHostSkipped("example.com"), true, "exact host should be skipped");
    assert.equal(context.isHostSkipped("www.example.com"), true, "subdomains should inherit the skip state");

    context.removeHostFromSkipList("example.com");
    assert.deepEqual(JSON.parse(localStorage.getItem("umcp-library-skip-hosts")), ["sub.example.com"], "removing a host should clear matching skip entries without dropping unrelated entries");
  }

  console.log("popup regression checks passed");
}

run();