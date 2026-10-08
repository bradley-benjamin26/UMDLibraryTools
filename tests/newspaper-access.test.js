const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { console, URL };
context.window = context;
vm.createContext(context);
context.document = { addEventListener() {}, getElementById() { return null; } };
["toolbarCore.js", "toolbarNewspapers.js"].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
});
const toolbar = context.UMDLibraryToolbar;

assert.equal(toolbar.findNewspaperAccess("www.nytimes.com").title, "The New York Times");
assert.equal(toolbar.findNewspaperAccess("NYTIMES.COM").title, "The New York Times");
assert.equal(toolbar.findNewspaperAccess("www.wsj.com").title, "The Wall Street Journal");
assert.equal(toolbar.findNewspaperAccess("notnytimes.com"), null, "suffix must match on a dot boundary");
assert.equal(toolbar.findNewspaperAccess("example.com"), null);
assert.equal(toolbar.findNewspaperAccess(""), null);

const url = new URL(toolbar.getNewspaperCatalogUrl(toolbar.findNewspaperAccess("nytimes.com")));
assert.equal(url.searchParams.get("docid"), "alma9963810551008238");
assert.equal(url.searchParams.get("vid"), "01USMAI_UMCP:UMCP");

const seen = new Set();
toolbar.NEWSPAPER_ACCESS.forEach((entry) => {
  assert.match(entry.mmsId, /^\d+$/);
  entry.hosts.forEach((host) => {
    assert.ok(!seen.has(host), `duplicate host ${host}`);
    seen.add(host);
  });
});

console.log("newspaper access checks passed");
