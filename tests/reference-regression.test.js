const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createDocumentStub() {
  return {
    body: {
      innerText: "",
      querySelectorAll() {
        return [];
      }
    },
    documentElement: {
      querySelectorAll() {
        return [];
      }
    },
    head: {
      appendChild() {}
    },
    createElement(tagName) {
      return {
        tagName,
        style: {},
        className: "",
        textContent: "",
        value: "",
        rows: 0,
        placeholder: "",
        setAttribute() {},
        appendChild() {},
        addEventListener() {},
        remove() {},
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        }
      };
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    }
  };
}

function loadToolbar(fetchImpl) {
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
    Blob,
    document: createDocumentStub(),
    window: null,
    navigator: { userAgent: "test" },
    fetch: typeof fetchImpl === "function"
      ? fetchImpl
      : async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: { get: () => "application/json" },
          json: async () => ({ message: {} })
        }),
    chrome: { runtime: { getURL: () => "" } },
    setTimeout,
    clearTimeout
  };

  context.window = context;
  context.window.document = context.document;
  context.globalThis = context;

  const coreCode = fs.readFileSync(path.join(__dirname, "..", "toolbarCore.js"), "utf8");
  const integrityCode = fs.readFileSync(path.join(__dirname, "..", "toolbarIntegrity.js"), "utf8");
  vm.createContext(context);
  vm.runInContext(coreCode, context);
  vm.runInContext(integrityCode, context);

  return context.window.UMDLibraryToolbar;
}

async function run() {
  const toolbar = loadToolbar();

  const noisyReferenceText = [
    "Kapoor, P., Balaji, M. S., & Maity, M. (2026). Game on: Enhancing customer engagement through influencers’ gamified messages. Journal of Business Research, 164, 113987. https://doi.org/10.1177/00472875241289565",
    "Miller, J. H. (2004). Placing literature in nineteenth-century British psychology. Journal of the History of the Behavioral Sciences, 40(3), 233-255."
  ].join("\n\n");

  const entries = toolbar.splitReferenceEntries(noisyReferenceText);
  assert.equal(entries.length, 2, "should split two references from a blank-line separated block");

  const first = entries[0];
  assert.equal(first.year, "2026", "should preserve the publication year");
  assert.equal(first.doi, "10.1177/00472875241289565", "should extract the DOI from a full DOI URL");
  assert.match(first.title, /Game on: Enhancing customer engagement/i, "should preserve the article title");
  assert.match(first.toDisplayString(), /DOI: 10\.1177\/00472875241289565$/, "display text should include the DOI");

  const second = entries[1];
  assert.equal(second.year, "2004", "should preserve the year on a non-DOI citation");
  assert.match(second.title, /Placing literature in nineteenth-century British psychology/i, "should keep the JSTOR-style title");

  const displayText = toolbar.formatReferenceTextForDisplay(noisyReferenceText);
  assert.match(displayText, /^1\. /m, "formatted output should number entries");
  assert.match(displayText, /2\. /m, "formatted output should include both entries");

  const report = await toolbar.evaluateReferencesText(noisyReferenceText, () => {});
  assert.equal(report.fileName, "reference-integrity-report.txt", "should return the report filename");
  assert.match(report.report, /Game on: Enhancing customer engagement/i, "report should contain the parsed reference text");
  assert.match(report.report, /The Crossref evaluation failed for this reference\./i, "report should surface Crossref failures in the default offline harness");

  const noisyJstORText = "Kapoor, P., Balaji, M. S., & Maity, M. (2026). Game on: Enhancing customer engagement through influencers’ gamified messages. Journal of Business Research, 164, 113987. https://doi.org/10.1177/00472875241289565 Available access Show details Hide details Google Scholar";
  assert.equal(toolbar.stripReferenceNoise(noisyJstORText), "Kapoor, P., Balaji, M. S., & Maity, M. (2026). Game on: Enhancing customer engagement through influencers’ gamified messages. Journal of Business Research, 164, 113987. DOI:10.1177/00472875241289565", "should trim page noise around a citation block while preserving DOI text");

  const mockedToolbar = loadToolbar(async (url) => {
    const text = String(url);

    if (text.includes("query.title=Placing+literature+in+nineteenth-century+British+psychology")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => ({ message: { items: [{ DOI: "10.1234/example-doi" }] } })
      };
    }

    if (text.includes("/works/10.1234%2Fexample-doi")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => ({ message: { title: ["Placing literature in nineteenth-century British psychology"], relation: {} } })
      };
    }

    if (text.includes("/works/10.1177%2F00472875241289565")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => ({ message: { title: ["Game on: Enhancing customer engagement through influencers’ gamified messages"], relation: {} } })
      };
    }

    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => "application/json" },
      json: async () => ({ message: {} })
    };
  });

  const successReport = await mockedToolbar.evaluateReferencesText(noisyReferenceText, () => {});
  assert.match(successReport.report, /No integrity issues reported\./i, "report should show a clear Crossref result when mocked responses succeed");
  assert.match(successReport.report, /Placing literature in nineteenth-century British psychology/i, "report should preserve the JSTOR-style citation in the success path");

  console.log("reference regression checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});