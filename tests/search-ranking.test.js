const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { console, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "searchIntelligence.js"), "utf8"), context);
const SI = context.UMCPSearchIntelligence;

assert.ok(SI.titleSimilarity("Python for Data Analysis", "Python for data analysis : data wrangling with pandas") >= 0.8, "subtitle still matches");
assert.ok(SI.titleSimilarity("Data", "Data Science from Scratch and More") < 0.5, "short title must not match by containment");
assert.ok(SI.titleSimilarity("Moby Dick", "Pride and Prejudice") < 0.2);

const results = [
  { title: "Statistics made simple", author: "Zed, Al", overallAvailability: { text: "x" } },
  { title: "Python for data analysis", author: "McKinney, Wes", id: "print" },
  { title: "Python for Data Analysis.", author: "McKinney, Wes.", id: "online" }
];
const ranked = SI.rankAndDedupeResults(results, "python for data analysis mckinney", {
  availabilityRank: (r) => (r.id === "online" ? 3 : r.id === "print" ? 2 : 0)
});
assert.equal(ranked.length, 2, "duplicate editions collapse");
assert.equal(ranked[0].id, "online", "most available copy wins and ranks first");
assert.ok(ranked[0].matchScore > ranked[1].matchScore);
assert.equal(SI.findDoi("https://doi.org/10.1177/00472875241289565."), "10.1177/00472875241289565");

console.log("search ranking checks passed");
