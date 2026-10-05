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

const plan = SI.buildSearchPlan("lord of the rings and catholicism", { sourceType: "google" });
assert.ok(plan.candidates.length > 0);
assert.ok(plan.candidates.every((c) => !c.cql.includes("alma.any=")), "alma.any is rejected by the SRU endpoint");
assert.ok(plan.candidates.some((c) => c.cql.includes("alma.all_for_ui=")), "keyword route uses alma.all_for_ui");
console.log("search plan index checks passed");

const auto = SI.analyzeQuery("lord of the rings and catholicism", { sourceType: "google" });
assert.equal(auto.searchIntent, "subject", "'X and Y' topic queries default to subject");
assert.equal(auto.intentOverridden, false);
assert.equal(SI.analyzeQuery("war and peace", { sourceType: "google" }).searchIntent, "known-item", "short titles stay known-item");
const forced = SI.buildSearchPlan("lord of the rings and catholicism", { sourceType: "google", intentOverride: "known-item" });
assert.equal(forced.analysis.searchIntent, "known-item");
assert.equal(forced.analysis.detectedIntent, "subject");
assert.equal(forced.analysis.intentOverridden, true);
assert.equal(SI.analyzeQuery("anything", { intentOverride: "bogus" }).intentOverridden, false, "unknown overrides are ignored");
console.log("search intent checks passed");

const subjectPlan = SI.buildSearchPlan("lord of the rings and catholicism", { sourceType: "google" });
assert.equal(subjectPlan.analysis.searchIntent, "subject");
assert.ok(subjectPlan.candidates.every((c) => !/alma\.subject=/.test(c.cql)), "alma.subject (singular) matches the whole catalog");
assert.ok(subjectPlan.candidates[0].cql.includes('alma.subjects="catholic*"'), "word stems are truncated");
assert.ok(subjectPlan.candidates.length > 4, "relaxed routes follow the strict one");
const keywordPlan = SI.buildSearchPlan("lord of the rings and catholicism", { sourceType: "google", intentOverride: "keyword" });
assert.ok(keywordPlan.candidates[0].cql.includes('alma.all_for_ui="catholic*"'));
assert.ok(keywordPlan.candidates.length >= 4, "keyword adds leave-one-out routes");
assert.ok(!keywordPlan.candidates.some((c) => c.routeType === "title"), "keyword intent skips the exact title phrase");

const tiered = SI.rankAndDedupeResults([
  { title: "Loose match about rings", author: "A", routeTier: 2 },
  { title: "Tolkien and Catholicism", author: "B", routeTier: 0 }
], "tolkien catholicism", { tiered: true });
assert.equal(tiered[0].title, "Tolkien and Catholicism", "stricter routes rank first");
console.log("broad search plan checks passed");
