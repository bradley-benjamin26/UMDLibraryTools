const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadToolbar(metaByName = {}) {
  const context = {
    console, URL, JSON, String, Number, Boolean, Array, Map, Set, Promise, Math, Date, Blob, RegExp,
    navigator: { userAgent: "test" },
    chrome: { runtime: { getURL: () => "" }, storage: { sync: {
      get: (key, cb) => cb({ "umcp-library-crossref-email": "stored@umd.edu" }),
      set: (items, cb) => cb(), remove: (key, cb) => cb() } } },
    setTimeout, clearTimeout,
    fetch: async () => ({ ok: false, status: 404, headers: { get: () => "" }, json: async () => ({}) })
  };
  context.document = {
    title: "Page title - Publisher",
    body: { innerText: "Some Journal, Vol. 9 No. 2 Published 1999", querySelectorAll: () => [] },
    documentElement: {},
    querySelector: () => null,
    querySelectorAll(selector) {
      const names = Array.from(selector.matchAll(/name="([^"]+)"/g)).map((m) => m[1]);
      return names.flatMap((n) => [].concat(metaByName[n] || [])).map((value) => ({
        getAttribute: (k) => (k === "content" ? value : null), content: value
      }));
    }
  };
  context.document.querySelector = (selector) => {
    const name = (selector.match(/name="([^"]+)"/) || [])[1];
    const value = [].concat(metaByName[name] || [])[0];
    return value ? { getAttribute: (k) => (k === "content" ? value : null), content: value } : null;
  };
  context.window = context;
  context.window.location = { hostname: "example.org", href: "https://example.org/a" };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["toolbarCore.js", "toolbarSettings.js", "toolbarCite.js", "toolbarIntegrity.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  return context.window.UMDLibraryToolbar;
}

const one = [{ firstName: "Jane", lastName: "Smith" }];
const two = one.concat([{ firstName: "John", lastName: "Doe" }]);
const three = two.concat([{ firstName: "Ann", lastName: "Lee" }]);

const toolbar = loadToolbar();
assert.equal(toolbar.formatAuthorList(one, "mla"), "Smith, Jane");
assert.equal(toolbar.formatAuthorList(two, "mla"), "Smith, Jane, and John Doe");
assert.equal(toolbar.formatAuthorList(three, "mla"), "Smith, Jane, et al.");
assert.equal(toolbar.formatAuthorList(three, "chicago"), "Smith, Jane, John Doe, and Ann Lee");
assert.equal(toolbar.formatAuthorList(two, "apa"), "Smith, J., & Doe, J.");

const apa = {
  title: "A study", authors: one, journal: "Journal of Things", volume: "9", issue: "2",
  pages: "1-10", year: "2020", doi: "10.1/x", url: "https://example.org/a"
};
toolbar.getPublicationMetadata = () => apa;
assert.ok(!toolbar.buildCitationText("apa").includes(".."), "APA must not double the period after initials");
assert.ok(toolbar.buildCitationText("apa").startsWith("Smith, J. (2020)."));
assert.ok(toolbar.buildCitationText("mla").startsWith("Smith, Jane. \"A study.\""));
assert.ok(toolbar.buildCitationText("chicago").startsWith("Smith, Jane. \"A study.\""));

const meta = loadToolbar({
  citation_title: "Real title", citation_journal_title: "Real Journal", citation_volume: "3",
  citation_publication_date: "2021/05/01", citation_firstpage: "5", citation_lastpage: "9"
}).getPublicationMetadata();
assert.equal(meta.title, "Real title", "citation_title beats document.title");
assert.equal(meta.journal, "Real Journal", "citation_journal_title beats scraped page text");
assert.equal(meta.volume, "3");
assert.match(meta.year, /^2021/, "citation date beats scraped year");
assert.equal(meta.pages, "5-9");

const retracted = toolbar.parseCrossrefIntegrityStatus({
  message: { title: ["T"], "updated-by": [{ type: "retraction", source: "retraction-watch", updated: { "date-time": "2023-04-05T00:00:00Z" } }] }
});
assert.equal(retracted.alerts[0].type, "retraction");
assert.match(retracted.alerts[0].detail, /2023-04-05/);
assert.equal(toolbar.parseCrossrefIntegrityStatus({ message: { "updated-by": [{ type: "correction" }] } }).alerts[0].type, "correction");
assert.equal(toolbar.parseCrossrefIntegrityStatus({ message: { title: ["T"] } }).alerts.length, 0);

assert.ok(!toolbar.buildCrossrefUrl("/works/10.1%2Fx").includes("bbradle1"), "no hardcoded personal email");

assert.ok(toolbar.isValidEmail("a@b.co") && !toolbar.isValidEmail("nope"));
(async () => {
  await toolbar.loadUserEmail();
  assert.equal(toolbar.userEmail, "stored@umd.edu");
  assert.ok(toolbar.buildCrossrefUrl("/works").includes("mailto=stored%40umd.edu"), "saved email is sent to Crossref");
  await toolbar.saveUserEmail("");
  assert.ok(!toolbar.buildCrossrefUrl("/works").includes("mailto"));
  console.log("settings email checks passed");
})();

console.log("citation and integrity checks passed");
