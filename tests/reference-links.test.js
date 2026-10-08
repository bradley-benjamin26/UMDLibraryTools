const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { console, URL, URLSearchParams, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "referenceLinks.js"), "utf8"), context);
const RL = context.UMCPReferenceLinks;

// Real COinS strings taken from en.wikipedia.org/wiki/Moby-Dick.
const book = "ctx_ver=Z39.88-2004&rft_val_fmt=info%3Aofi%2Ffmt%3Akev%3Amtx%3Abook&rft.genre=book&rft.btitle=The+Oxford+Dictionary+of+Literary+Terms&rft.place=Oxford&rft.pages=363&rft.edition=4th&rft.pub=Oxford+University+Press&rft.date=2015&rft.isbn=978-0-19-871544-3&rft.aulast=Baldick&rft.aufirst=Chris";
const articleDoi = "ctx_ver=Z39.88-2004&rft_val_fmt=info%3Aofi%2Ffmt%3Akev%3Amtx%3Ajournal&rft.genre=article&rft.jtitle=College+Literature&rft.atitle=Fast-Fish+and+Loose-Fish&rft.volume=32&rft.issn=0093-3139&rft_id=info%3Adoi%2F10.1353%2Flit.2005.0011&rft.aulast=Lamb";
const articleNoDoi = "ctx_ver=Z39.88-2004&rft_val_fmt=info%3Aofi%2Ffmt%3Akev%3Amtx%3Ajournal&rft.genre=article&rft.jtitle=Smithsonian+Magazine&rft.atitle=Herman+Melville%27s+Great+American+Novel&rft_id=https%3A%2F%2Fwww.smithsonianmag.com%2Fx";
const chapter = "ctx_ver=Z39.88-2004&rft_val_fmt=info%3Aofi%2Ffmt%3Akev%3Amtx%3Abook&rft.genre=bookitem&rft.atitle=Melville+and+Moby-Dick&rft.btitle=Melville%3A+a+Collection+of+Critical+Essays&rft.pub=Spectrum&rft.aulast=Hayford";
const unknownWeb = "ctx_ver=Z39.88-2004&rft.genre=unknown&rft.atitle=A+Web+Page&rft_id=https%3A%2F%2Fexample.com%2F";

assert.equal(RL.buildSearchTerms(RL.parseCoins(book)), "978-0-19-871544-3", "ISBN wins over title");
assert.equal(RL.buildSearchTerms(RL.parseCoins(articleDoi)), "10.1353/lit.2005.0011", "DOI is decoded and used");
assert.equal(RL.buildSearchTerms(RL.parseCoins(articleNoDoi)), "Herman Melville's Great American Novel", "article title fallback");
assert.equal(RL.buildSearchTerms(RL.parseCoins(chapter)), "Melville: a Collection of Critical Essays Hayford", "chapter searches its parent book");
assert.equal(RL.parseCoins(unknownWeb), null, "plain web citations are skipped");
assert.equal(RL.parseCoins(""), null);
assert.equal(RL.buildSearchTerms(null), "");

const url = new URL(RL.buildCatalogUrl("978-0-19-871544-3"));
assert.equal(url.searchParams.get("vid"), "01USMAI_UMCP:UMCP");
assert.equal(url.searchParams.get("query"), "any,contains,978-0-19-871544-3");

console.log("reference link checks passed");
