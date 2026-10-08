(() => {
  "use strict";

  // Wikipedia citation links.
  //
  // Wikipedia's citation templates emit a COinS metadata span (class "Z3988")
  // next to every <cite>. Its title attribute is an OpenURL key/value string
  // that carries the ISBN, DOI, and titles, so no page scraping is needed.
  // For each book or journal citation we add a link into UMD Discover, built
  // from the best identifier available. No network requests are made.

  const CATALOG = {
    baseUrl: "https://usmai-umcp.primo.exlibrisgroup.com/discovery/search",
    vid: "01USMAI_UMCP:UMCP",
    lang: "en",
    queryPrefix: "any,contains,"
  };

  const LINK_CLASS = "umcp-reference-link";
  const COINS_SELECTOR = "span.Z3988[title]";

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  // Turn a COinS title attribute into the fields we use. Returns null when the
  // citation is not a book or journal article (for example a plain web page).
  function parseCoins(coinsTitle) {
    const params = new URLSearchParams(String(coinsTitle || ""));
    const format = params.get("rft_val_fmt") || "";
    const genre = params.get("rft.genre") || "";
    const isBookish = /:book$/.test(format) || genre === "book" || genre === "bookitem";
    const isArticle = /:journal$/.test(format) && genre !== "unknown";

    const doiId = params.getAll("rft_id").find((id) => /^info:doi\//i.test(id));
    const doi = doiId ? doiId.replace(/^info:doi\//i, "") : "";
    const isbn = clean(params.get("rft.isbn")).replace(/[^0-9Xx-]/g, "");

    if (!isBookish && !isArticle && !doi && !isbn) return null;

    return {
      isbn,
      doi,
      bookTitle: clean(params.get("rft.btitle")),
      articleTitle: clean(params.get("rft.atitle")),
      journalTitle: clean(params.get("rft.jtitle")),
      authorLast: clean(params.get("rft.aulast"))
    };
  }

  // Pick the search terms most likely to find this exact source: identifiers
  // first, then titles. Returns "" when nothing searchable is available.
  function buildSearchTerms(ref) {
    if (!ref) return "";
    if (ref.isbn) return ref.isbn;
    if (ref.doi) return ref.doi;
    if (ref.articleTitle && !ref.bookTitle) return ref.articleTitle;
    // For a book chapter the catalog holds the whole book, not the chapter.
    if (ref.bookTitle) return clean(`${ref.bookTitle} ${ref.authorLast}`);
    return ref.articleTitle || ref.journalTitle;
  }

  function buildCatalogUrl(terms) {
    const url = new URL(CATALOG.baseUrl);
    url.searchParams.set("vid", CATALOG.vid);
    url.searchParams.set("lang", CATALOG.lang);
    url.searchParams.set("query", `${CATALOG.queryPrefix}${terms}`);
    return url.toString();
  }

  function createLink(ref, terms) {
    const link = document.createElement("a");
    link.className = LINK_CLASS;
    link.href = buildCatalogUrl(terms);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Find in UMD Library";
    const label = ref.articleTitle || ref.bookTitle || ref.journalTitle || terms;
    link.setAttribute("aria-label", `Find "${label}" in UMD Library (opens in a new tab)`);
    return link;
  }

  function annotateCitations(root) {
    (root || document).querySelectorAll(COINS_SELECTOR).forEach((span) => {
      if (span.dataset.umcpRefChecked === "true") return;
      span.dataset.umcpRefChecked = "true";

      const ref = parseCoins(span.getAttribute("title"));
      const terms = buildSearchTerms(ref);
      if (!terms) return;

      span.insertAdjacentElement("afterend", createLink(ref, terms));
    });
  }

  globalThis.UMCPReferenceLinks = { parseCoins, buildSearchTerms, buildCatalogUrl };

  if (typeof document === "undefined" || !document.documentElement) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => annotateCitations(), { once: true });
  } else {
    annotateCitations();
  }
})();
