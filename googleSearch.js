(() => {
  "use strict";

  // Google Search / Google Scholar catalog integration.
  //
  // High-level flow:
  // 1. Detect whether the current page is a standard Google Search page or a
  //    Google Scholar results page.
  // 2. Read the current search query from the page URL.
  // 3. Skip clearly non-library searches so the panel appears only when likely
  //    to help.
  // 4. Run a short sequence of Alma SRU queries from most precise to broadest.
  // 5. Render up to five catalog results with print and online availability.
  // 6. Re-run the process when Google updates the page dynamically.

  // Core configuration for catalog lookups and UI behavior.
  const CONFIG = {
    debug: false,
    maxResults: 5,
    processDelayMs: 350,
    sruBaseUrl: "https://usmai-umcp.alma.exlibrisgroup.com/view/sru/01USMAI_UMCP",
    sruVersion: "1.2",
    sruRecordSchema: "marcxml",
    catalog: {
      baseUrl: "https://usmai-umcp.primo.exlibrisgroup.com/discovery/search",
      fixedParams: {
        vid: "01USMAI_UMCP:UMCP",
        lang: "en"
      },
      queryPrefix: "any,contains,"
    },
    heuristics: {
      maxQueryWords: 8,
      maxScholarWords: 15,
      minUsefulWords: 2,
      keywordCandidateLimit: 5
    }
  };

  // Google and Google Scholar mount points. Google changes its DOM often, so we
  // keep a small list of fallbacks for each page type.
  const SELECTORS = {
    google: {
      primaryMount: "#search",
      fallbackMounts: ["#center_col", "#rso", "#rcnt", "main"]
    },
    scholar: {
      primaryMount: "#gs_res_ccl_mid",
      fallbackMounts: ["#gs_res_ccl", "#gs_bdy_ccl", "#gs_bdy", "main"]
    }
  };

  // CSS class names used by the injected panel. Centralizing them keeps the JS
  // and CSS aligned and makes future refactors safer.
  const CLASSES = {
    panel: "umcp-google-catalog-panel",
    header: "umcp-google-catalog-panel__header",
    title: "umcp-google-catalog-panel__title",
    subtitle: "umcp-google-catalog-panel__subtitle",
    summary: "umcp-google-catalog-panel__summary",
    actions: "umcp-google-catalog-panel__actions",
    actionLink: "umcp-google-catalog-panel__action-link",
    toggleButton: "umcp-google-catalog-panel__toggle-button",
    body: "umcp-google-catalog-panel__body",
    status: "umcp-google-catalog-panel__status",
    badgeRow: "umcp-google-catalog-panel__badge-row",
    badge: "umcp-google-catalog-panel__badge",
    badgeGood: "is-good",
    badgeMuted: "is-muted",
    list: "umcp-google-catalog-panel__list",
    item: "umcp-google-catalog-panel__item",
    itemTitle: "umcp-google-catalog-panel__item-title",
    meta: "umcp-google-catalog-panel__meta",
    metaLine: "umcp-google-catalog-panel__meta-line",
    label: "umcp-google-catalog-panel__label",
    value: "umcp-google-catalog-panel__value",
    availability: "umcp-google-catalog-panel__availability",
    availabilityAvailable: "is-available",
    availabilityUnavailable: "is-unavailable",
    availabilityUnknown: "is-unknown",
    links: "umcp-google-catalog-panel__links",
    resultLink: "umcp-google-catalog-panel__result-link",
    srOnly: "umcp-google-catalog-panel__sr-only"
  };

  // Stable IDs used for accessibility relationships.
  const IDS = {
    panelTitle: "umcp-google-catalog-panel-title",
    panelBody: "umcp-google-catalog-panel-body",
    liveRegion: "umcp-google-catalog-live-region"
  };

  // User-facing status copy shown in the panel.
  const STATUS = {
    loading: "Searching the library catalog…",
    noQuery: "No Google or Google Scholar query found.",
    skipped: "This search does not look like a likely catalog search.",
    noResults: "No catalog matches found for this search.",
    error: "Library search failed.",
    resultsLoaded: (count) => `Loaded ${count} catalog result${count === 1 ? "" : "s"}.`
  };

  // Common words that usually add noise when a Google query is turned into a
  // library search.
  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "at", "be", "best", "book", "books", "for", "from", "how", "i",
    "in", "is", "me", "my", "near", "of", "on", "or", "pdf", "the", "to", "what", "where",
    "with", "youtube", "reddit", "amazon", "free", "download", "online", "review", "reviews"
  ]);

  // Cache both completed and in-flight lookups so repeated renders for the same
  // query do not trigger duplicate SRU traffic.
  const queryCache = new Map();

  // Keep transient runtime state together so it is easier to reason about page
  // transitions, debouncing, and stale async work.
  const runtimeState = {
    processTimer: null,
    lastUrl: "",
    lastRenderedQuery: "",
    lastRenderedSource: "",
    activeRequestToken: 0,
    historyListenersInstalled: false
  };

  // Lightweight debug logger used only when CONFIG.debug is enabled.
  function debugLog(...args) {
    if (CONFIG.debug) {
      console.log("[UMCP Google Catalog]", ...args);
    }
  }

  // Normalize whitespace so extracted values are easier to compare and display.
  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  // Escape user-visible text before injecting it into innerHTML fragments.
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Escape values interpolated into SRU CQL queries.
  function escapeCqlTerm(value) {
    return normalizeText(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // Detect standard Google search results pages.
  function isGoogleSearchPage() {
    return location.hostname.includes("google.") &&
      !/^scholar\.google\./i.test(location.hostname) &&
      location.pathname === "/search";
  }

  // Detect Google Scholar search results pages.
  function isGoogleScholarPage() {
    return /^scholar\.google\./i.test(location.hostname) && location.pathname === "/scholar";
  }

  // Read the current page type and query from the URL.
  function getSearchContext() {
    try {
      const url = new URL(location.href);
      const query = normalizeText(url.searchParams.get("q"));

      if (isGoogleScholarPage()) {
        return {
          sourceType: "scholar",
          pageLabel: "Google Scholar",
          query
        };
      }

      if (isGoogleSearchPage()) {
        return {
          sourceType: "google",
          pageLabel: "Google Search",
          query
        };
      }
    } catch {
      // Fall through to an empty context.
    }

    return {
      sourceType: "",
      pageLabel: "",
      query: ""
    };
  }

  // Strip obvious search-operator noise so the same Google query becomes a
  // cleaner library query.
  function sanitizeQuery(rawQuery) {
    const withoutOperators = normalizeText(rawQuery)
      .replace(/\b(site|filetype|intitle|inurl|cache|related):\S+/gi, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[?!]+/g, " ")
      .replace(/\s*[-–—]\s*(pdf|epub|kindle|summary|analysis|sparknotes)\b/gi, " ")
      .replace(/\b(edition|ed\.?|hardcover|paperback)\b/gi, " ");

    const maxWords = isGoogleScholarPage()
      ? CONFIG.heuristics.maxScholarWords
      : CONFIG.heuristics.maxQueryWords;

    const cleaned = normalizeText(withoutOperators);
    const words = cleaned.split(" ").filter(Boolean).slice(0, maxWords);
    return normalizeText(words.join(" "));
  }

  // Break a query into normalized tokens for heuristic checks.
  function tokenizeQuery(query) {
    return sanitizeQuery(query)
      .split(" ")
      .map((token) => token.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase())
      .filter(Boolean);
  }

  // Keep only tokens that are useful for broad matching.
  function getUsefulTokens(query) {
    return tokenizeQuery(query).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  }

  // Decide whether the current Google query is likely to be useful as a catalog
  // search. This avoids noisy results on clearly non-library web searches.
  function shouldSearchCatalog(query, context = {}) {
    const cleaned = sanitizeQuery(query);
    if (!cleaned) {
      return false;
    }

    const obviousNonCatalogPatterns = [
      /\b(weather|map|maps|news|youtube|reddit|instagram|tiktok|facebook|twitter|x\.com)\b/i,
      /\bnear me\b/i,
      /\bzip code\b/i,
      /\blive score\b/i,
      /\bflight status\b/i,
      /\brestaurant\b/i,
      /\bopen now\b/i,
      /\bjobs?\b/i,
      /\brecipe\b/i,
      /\bmenu\b/i,
      /\bmovie times?\b/i
    ];

    if (obviousNonCatalogPatterns.some((pattern) => pattern.test(cleaned))) {
      return false;
    }

    const tokens = tokenizeQuery(cleaned);
    const maxTokens = context.sourceType === "scholar"
      ? CONFIG.heuristics.maxScholarWords
      : CONFIG.heuristics.maxQueryWords;

    if (tokens.length === 0 || tokens.length > maxTokens) {
      return false;
    }

    // Scholar searches are much more likely to be article- or citation-oriented,
    // so we allow them through with lighter filtering.
    if (context.sourceType === "scholar") {
      return true;
    }

    const usefulTokens = getUsefulTokens(cleaned);
    if (usefulTokens.length >= CONFIG.heuristics.minUsefulWords) {
      return true;
    }

    return /^".+"$/.test(cleaned) || cleaned.split(" ").length <= 3;
  }

  // Apply the fixed Primo parameters used by every catalog link.
  function applyCatalogDefaults(url) {
    Object.entries(CONFIG.catalog.fixedParams || {}).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }

  // Build a catalog link from a title/author pair. This is used for per-record
  // "Open in catalog" links.
  function buildCatalogSearchUrl(title, author) {
    const terms = normalizeText([title, author].filter(Boolean).join(" "));
    const url = new URL(CONFIG.catalog.baseUrl);
    applyCatalogDefaults(url);
    url.searchParams.set("query", `${CONFIG.catalog.queryPrefix}${terms}`);
    return url.toString();
  }

  // Build a broader catalog link from the page query. This is used by the panel
  // header action so users can jump into the full Primo interface.
  function buildFullCatalogSearchUrl(query) {
    const url = new URL(CONFIG.catalog.baseUrl);
    applyCatalogDefaults(url);
    url.searchParams.set("query", `${CONFIG.catalog.queryPrefix}${sanitizeQuery(query)}`);
    return url.toString();
  }

  // Build a full Alma SRU request URL from a CQL query string.
  function buildSruUrl(cqlQuery) {
    const url = new URL(CONFIG.sruBaseUrl);
    url.searchParams.set("version", CONFIG.sruVersion);
    url.searchParams.set("operation", "searchRetrieve");
    url.searchParams.set("recordSchema", CONFIG.sruRecordSchema);
    url.searchParams.set("maximumRecords", String(CONFIG.maxResults));
    url.searchParams.set("query", cqlQuery);
    return url.toString();
  }

  // Turn one Google query into a short list of progressively broader SRU
  // strategies. We stop at the first candidate that returns records.
  function buildCandidateQueries(query) {
    const cleaned = sanitizeQuery(query);
    const usefulTokens = getUsefulTokens(cleaned).slice(0, CONFIG.heuristics.keywordCandidateLimit);
    const escapedPhrase = escapeCqlTerm(cleaned);
    const quotedPhraseMatch = cleaned.match(/"([^"]+)"/);
    const candidates = [];

    if (quotedPhraseMatch?.[1]) {
      candidates.push({
        label: "quoted title phrase",
        summary: `Tried exact phrase: “${quotedPhraseMatch[1]}”`,
        cql: `alma.title="${escapeCqlTerm(quotedPhraseMatch[1])}"`
      });
    }

    candidates.push({
      label: "title phrase",
      summary: `Matched title phrase: “${cleaned}”`,
      cql: `alma.title="${escapedPhrase}"`
    });

    if (usefulTokens.length >= 2) {
      candidates.push({
        label: "title keywords",
        summary: `Matched title keywords: ${usefulTokens.join(", ")}`,
        cql: usefulTokens.map((token) => `alma.title="${escapeCqlTerm(token)}"`).join(" and ")
      });
    }

    if (usefulTokens.length >= 2) {
      candidates.push({
        label: "any-field keywords",
        summary: `Matched keywords anywhere: ${usefulTokens.join(", ")}`,
        cql: usefulTokens.map((token) => `alma.any="${escapeCqlTerm(token)}"`).join(" and ")
      });
    }

    if (usefulTokens.length >= 1) {
      candidates.push({
        label: "creator + title mix",
        summary: `Matched likely creator/title terms: ${usefulTokens.join(", ")}`,
        cql: usefulTokens
          .map((token, index) => (
            index === usefulTokens.length - 1
              ? `alma.creator="${escapeCqlTerm(token)}"`
              : `alma.title="${escapeCqlTerm(token)}"`
          ))
          .join(" and ")
      });
    }

    return candidates;
  }

  // Ensure a hidden live region exists for announcing dynamic status changes to
  // assistive technologies.
  function ensureLiveRegion() {
    let liveRegion = document.getElementById(IDS.liveRegion);
    if (liveRegion) {
      return liveRegion;
    }

    liveRegion = document.createElement("div");
    liveRegion.id = IDS.liveRegion;
    liveRegion.className = CLASSES.srOnly;
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    document.body.appendChild(liveRegion);
    return liveRegion;
  }

  // Announce a short status message in the live region.
  function announce(message) {
    const liveRegion = ensureLiveRegion();
    liveRegion.textContent = "";
    window.setTimeout(() => {
      liveRegion.textContent = message;
    }, 40);
  }

  // Update the panel's visible status line and aria-busy state.
  function setPanelStatus(panel, message, { busy = false } = {}) {
    panel.setAttribute("aria-busy", String(busy));
    const status = panel.querySelector(`.${CLASSES.status}`);
    if (status) {
      status.textContent = message;
    }
  }

  // Update the optional summary line that explains which search strategy worked.
  function setPanelSummary(panel, message) {
    const summary = panel.querySelector(`.${CLASSES.summary}`);
    if (summary) {
      summary.textContent = message || "";
      summary.hidden = !message;
    }
  }

  // Remove existing results before rendering a new set.
  function clearResults(panel) {
    const list = panel.querySelector(`.${CLASSES.list}`);
    if (list) {
      list.replaceChildren();
    }
  }

  // Treat a few common Alma availability values as affirmative.
  function isAvailableStatus(value) {
    return ["available", "available now", "item in place", "online access available"].includes(value);
  }

  // Convert raw Alma status strings into user-facing availability copy and a CSS
  // modifier class.
  function prettifyAvailability(rawStatusValues, labels = {}) {
    const normalizedValues = rawStatusValues
      .map((value) => normalizeText(value).toLowerCase())
      .filter(Boolean);

    if (normalizedValues.some(isAvailableStatus)) {
      return {
        text: labels.availableText || "Available",
        modifierClass: CLASSES.availabilityAvailable,
        isAvailable: true,
        hasStatusValues: normalizedValues.length > 0
      };
    }

    if (normalizedValues.length > 0) {
      const first = normalizedValues[0]
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

      const looksUnavailable =
        normalizedValues[0].includes("not") ||
        normalizedValues[0].includes("unavailable") ||
        normalizedValues[0].includes("checked out");

      return {
        text: looksUnavailable ? (labels.unavailableText || "Not available") : first,
        modifierClass: CLASSES.availabilityUnavailable,
        isAvailable: false,
        hasStatusValues: true
      };
    }

    return {
      text: labels.unknownText || "Availability unknown",
      modifierClass: CLASSES.availabilityUnknown,
      isAvailable: false,
      hasStatusValues: false
    };
  }

  // Return all MARC datafields for a given tag.
  function getMarcDatafields(recordNode, tag) {
    return Array.from(recordNode.querySelectorAll(`datafield[tag="${tag}"]`));
  }

  // Return all values for one MARC subfield code.
  function getMarcSubfieldValues(fieldNode, code) {
    return Array.from(fieldNode.querySelectorAll(`subfield[code="${code}"]`))
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean);
  }

  // Return the first non-empty MARC value across the supplied codes.
  function getFirstMarcValue(recordNode, tag, codes) {
    const fields = getMarcDatafields(recordNode, tag);

    for (const field of fields) {
      for (const code of codes) {
        const value = getMarcSubfieldValues(field, code)[0];
        if (value) {
          return value;
        }
      }
    }

    return "";
  }

  // Some MARC fields, especially title, are more readable when multiple
  // subfields from the same field are combined.
  function getJoinedMarcValue(recordNode, tag, codes) {
    const field = getMarcDatafields(recordNode, tag)[0];
    if (!field) {
      return "";
    }

    return normalizeText(
      codes
        .flatMap((code) => getMarcSubfieldValues(field, code))
        .join(" ")
    );
  }

  // Parse either print (AVA) or electronic (AVE) availability fields and keep
  // their status values, locations, and call numbers together.
  function parseMarcAvailability(recordNode, tag, labels) {
    const fields = getMarcDatafields(recordNode, tag);
    const statuses = [];
    const locations = new Set();
    const callNumbers = new Set();

    for (const field of fields) {
      getMarcSubfieldValues(field, "e").forEach((value) => statuses.push(value));
      getMarcSubfieldValues(field, "b").forEach((value) => locations.add(value));
      getMarcSubfieldValues(field, "j").forEach((value) => callNumbers.add(value));
      getMarcSubfieldValues(field, "d").forEach((value) => callNumbers.add(value));
    }

    return {
      ...prettifyAvailability(statuses, labels),
      rawStatuses: statuses,
      locations: Array.from(locations),
      callNumbers: Array.from(callNumbers)
    };
  }

  // Combine print and online availability into the single summary line shown in
  // each result card.
  function summarizeCombinedAvailability(printAvailability, onlineAvailability) {
    if (onlineAvailability.isAvailable) {
      return {
        text: printAvailability.isAvailable ? "Print and online available" : "Online available",
        modifierClass: CLASSES.availabilityAvailable
      };
    }

    if (printAvailability.isAvailable) {
      return {
        text: "Print available",
        modifierClass: CLASSES.availabilityAvailable
      };
    }

    if (printAvailability.hasStatusValues || onlineAvailability.hasStatusValues) {
      return {
        text: "No available version found",
        modifierClass: CLASSES.availabilityUnavailable
      };
    }

    return {
      text: "Availability unknown",
      modifierClass: CLASSES.availabilityUnknown
    };
  }

  // Convert one MARC record into the smaller result object used by the UI.
  function recordToResult(recordNode) {
    const title =
      getJoinedMarcValue(recordNode, "245", ["a", "b"]) ||
      getFirstMarcValue(recordNode, "246", ["a"]) ||
      "Untitled record";

    const author =
      getFirstMarcValue(recordNode, "100", ["a"]) ||
      getFirstMarcValue(recordNode, "110", ["a"]) ||
      getFirstMarcValue(recordNode, "700", ["a"]);

    const year =
      getFirstMarcValue(recordNode, "260", ["c"]) ||
      getFirstMarcValue(recordNode, "264", ["c"]) ||
      getFirstMarcValue(recordNode, "008", ["a"]);

    const isbn = getFirstMarcValue(recordNode, "020", ["a"]);

    const printAvailability = parseMarcAvailability(recordNode, "AVA", {
      availableText: "Print available",
      unavailableText: "Print not available",
      unknownText: "Print availability unknown"
    });

    const onlineAvailability = parseMarcAvailability(recordNode, "AVE", {
      availableText: "Online available",
      unavailableText: "Online not available",
      unknownText: "Online availability unknown"
    });

    return {
      title: normalizeText(title.replace(/[\s\/:;,.]+$/, "")),
      author,
      year,
      isbn,
      printAvailability,
      onlineAvailability,
      overallAvailability: summarizeCombinedAvailability(printAvailability, onlineAvailability)
    };
  }

  // Parse an SRU response and either return result objects or throw a clear
  // error when Alma reports a diagnostic.
  function parseSruResponse(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, "text/xml");
    const diagnostic = xml.querySelector("diagnostics diagnostic message, diagnostic message");
    if (diagnostic) {
      throw new Error(normalizeText(diagnostic.textContent) || "SRU diagnostic returned.");
    }

    const numberOfRecords = Number.parseInt(xml.querySelector("numberOfRecords")?.textContent || "0", 10);
    if (!numberOfRecords) {
      return [];
    }

    return Array.from(xml.querySelectorAll("recordData record, recordData > record"))
      .map((node) => recordToResult(node))
      .slice(0, CONFIG.maxResults);
  }

  // Run the candidate SRU searches from most precise to broadest and cache the
  // first successful payload for the normalized query.
  async function fetchCatalogResults(query) {
    const normalizedQuery = sanitizeQuery(query);
    const cacheKey = normalizedQuery.toLowerCase();

    if (queryCache.has(cacheKey)) {
      return queryCache.get(cacheKey);
    }

    const fetchPromise = (async () => {
      const candidates = buildCandidateQueries(normalizedQuery);
      let lastError = null;

      for (const candidate of candidates) {
        const url = buildSruUrl(candidate.cql);
        debugLog("Trying SRU candidate", candidate, url);

        try {
          const response = await fetch(url, {
            method: "GET",
            credentials: "omit"
          });

          if (!response.ok) {
            throw new Error(`SRU request failed with status ${response.status}`);
          }

          const xmlText = await response.text();
          const results = parseSruResponse(xmlText);

          if (results.length > 0) {
            return {
              results,
              candidate
            };
          }
        } catch (error) {
          lastError = error;
          debugLog("SRU candidate failed", candidate, error);
        }
      }

      if (lastError) {
        throw lastError;
      }

      return {
        results: [],
        candidate: null
      };
    })();

    queryCache.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  // Create screen-reader text that warns when a link opens a new tab.
  function createNewTabHint() {
    const hint = document.createElement("span");
    hint.className = CLASSES.srOnly;
    hint.textContent = "opens in a new tab";
    return hint;
  }

  // Create a consistent external link used by both panel actions and result
  // links.
  function createActionLink(text, href, className = CLASSES.actionLink) {
    const link = document.createElement("a");
    link.className = className;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    link.appendChild(document.createTextNode(" "));
    link.appendChild(createNewTabHint());
    link.setAttribute("aria-label", `${text} (opens in a new tab)`);
    return link;
  }

  // Show or hide the results body while keeping the header action row visible.
  function setPanelCollapsed(panel, collapsed) {
    panel.dataset.collapsed = collapsed ? "true" : "false";

    const body = panel.querySelector(`.${CLASSES.body}`);
    if (body) {
      body.hidden = collapsed;
      body.setAttribute("aria-hidden", String(collapsed));
      body.style.display = collapsed ? "none" : "block";
    }

    const toggleButton = panel.querySelector(`.${CLASSES.toggleButton}`);
    if (toggleButton) {
      toggleButton.textContent = collapsed ? "Show results" : "Hide results";
      toggleButton.setAttribute("aria-expanded", String(!collapsed));
      toggleButton.setAttribute("aria-label", collapsed ? "Show library results" : "Hide library results");
    }
  }

  // Create the header toggle button for collapsing the panel body.
  function createToggleButton(panel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = CLASSES.toggleButton;
    button.setAttribute("aria-controls", IDS.panelBody);
    button.addEventListener("click", () => {
      const shouldCollapse = panel.dataset.collapsed !== "true";
      setPanelCollapsed(panel, shouldCollapse);
      announce(shouldCollapse ? "Library results hidden." : "Library results shown.");
    });
    return button;
  }

  // The panel is unique per page, so a simple class lookup is enough.
  function getPanel() {
    return document.querySelector(`.${CLASSES.panel}`);
  }

  // Choose the best mount point for the current page type.
  function getMountPoint(sourceType) {
    const sourceSelectors = SELECTORS[sourceType] || SELECTORS.google;
    const primaryMount = document.querySelector(sourceSelectors.primaryMount);
    if (primaryMount) {
      return primaryMount;
    }

    for (const selector of sourceSelectors.fallbackMounts) {
      const node = document.querySelector(selector);
      if (node) {
        return node;
      }
    }

    return null;
  }

  // Create one visual availability badge.
  function createBadge(text, modifierClass = "") {
    const badge = document.createElement("span");
    badge.className = `${CLASSES.badge} ${modifierClass}`.trim();
    badge.textContent = text;
    return badge;
  }

  // Build only the badges that add useful information. Unknown print
  // availability is intentionally suppressed to reduce noise, and duplicate
  // labels are prevented.
  function getFormatAvailabilityBadges(result) {
    const badges = [];
    const seen = new Set();

    const maybeAddBadge = (availability) => {
      if (!availability.hasStatusValues) {
        return;
      }

      const key = `${availability.text}|${availability.modifierClass}`;
      if (seen.has(key)) {
        return;
      }

      badges.push(createBadge(availability.text, availability.modifierClass));
      seen.add(key);
    };

    maybeAddBadge(result.printAvailability);
    maybeAddBadge(result.onlineAvailability);

    return badges;
  }

  // Create the panel if needed, then update its page-specific labels and links.
  function ensurePanel(context) {
    const mountPoint = getMountPoint(context.sourceType);
    if (!mountPoint) {
      return null;
    }

    const panelKey = `${context.sourceType}:${normalizeText(context.query).toLowerCase()}`;
    let panel = getPanel();

    if (!panel) {
      panel = document.createElement("section");
      panel.className = CLASSES.panel;
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-labelledby", IDS.panelTitle);
      panel.innerHTML = `
        <div class="${CLASSES.header}">
          <div>
            <h2 id="${IDS.panelTitle}" class="${CLASSES.title}">UMD Library Catalog Top Results</h2>
            <p class="${CLASSES.subtitle}"><span data-umcp-source-label></span> matches for <strong></strong></p>
          </div>
          <div class="${CLASSES.actions}"></div>
        </div>
        <div id="${IDS.panelBody}" class="${CLASSES.body}">
          <p class="${CLASSES.summary}" hidden></p>
          <p class="${CLASSES.status}" aria-live="polite"></p>
          <ol class="${CLASSES.list}"></ol>
        </div>
      `;

      const actions = panel.querySelector(`.${CLASSES.actions}`);
      if (actions) {
        actions.appendChild(
          createActionLink("Search full catalog", buildFullCatalogSearchUrl(context.query), CLASSES.actionLink)
        );
        actions.appendChild(createToggleButton(panel));
      }
    }

    panel.dataset.queryKey = panelKey;
    panel.dataset.sourceType = context.sourceType;

    if (!mountPoint.contains(panel)) {
      mountPoint.prepend(panel);
    }

    const sourceLabel = panel.querySelector("[data-umcp-source-label]");
    if (sourceLabel) {
      sourceLabel.textContent = context.pageLabel;
    }

    const queryNode = panel.querySelector(`.${CLASSES.subtitle} strong`);
    if (queryNode) {
      queryNode.textContent = context.query;
    }

    const fullCatalogLink = panel.querySelector(`.${CLASSES.actionLink}`);
    if (fullCatalogLink) {
      fullCatalogLink.href = buildFullCatalogSearchUrl(context.query);
      fullCatalogLink.setAttribute("aria-label", `Search full catalog for ${context.query} (opens in a new tab)`);
    }

    setPanelCollapsed(panel, panel.dataset.collapsed === "true");
    return panel;
  }

  // Create one label/value line in the result metadata block.
  function createMetaLine(label, value) {
    const row = document.createElement("div");
    row.className = CLASSES.metaLine;

    const labelNode = document.createElement("p");
    labelNode.className = CLASSES.label;
    labelNode.textContent = `${label}:`;

    const valueNode = document.createElement("p");
    valueNode.className = CLASSES.value;
    valueNode.innerHTML = escapeHtml(value);

    row.append(labelNode, valueNode);
    return row;
  }

  // Create a single result card from one parsed catalog record.
  function createResultItem(result) {
    const item = document.createElement("li");
    item.className = CLASSES.item;

    const title = document.createElement("h3");
    title.className = CLASSES.itemTitle;
    title.textContent = result.title;
    item.appendChild(title);

    const formatBadges = getFormatAvailabilityBadges(result);
    if (formatBadges.length > 0) {
      const badgeRow = document.createElement("div");
      badgeRow.className = CLASSES.badgeRow;
      formatBadges.forEach((badge) => badgeRow.appendChild(badge));
      item.appendChild(badgeRow);
    }

    const meta = document.createElement("div");
    meta.className = CLASSES.meta;

    if (result.author) {
      meta.appendChild(createMetaLine("Author", result.author));
    }

    if (result.year) {
      meta.appendChild(createMetaLine("Year", result.year));
    }

    if (result.isbn) {
      meta.appendChild(createMetaLine("ISBN", result.isbn));
    }

    if (result.printAvailability.locations.length > 0) {
      meta.appendChild(createMetaLine("Location", result.printAvailability.locations.join("; ")));
    }

    if (result.printAvailability.callNumbers.length > 0) {
      meta.appendChild(createMetaLine("Call number", result.printAvailability.callNumbers.join("; ")));
    }

    if (result.onlineAvailability.hasStatusValues) {
      meta.appendChild(createMetaLine("Online version", result.onlineAvailability.text));
    }

    item.appendChild(meta);

    const availability = document.createElement("p");
    availability.className = `${CLASSES.availability} ${result.overallAvailability.modifierClass}`.trim();
    availability.textContent = `Availability: ${result.overallAvailability.text}`;
    item.appendChild(availability);

    const links = document.createElement("div");
    links.className = CLASSES.links;
    links.appendChild(
      createActionLink("Open in catalog", buildCatalogSearchUrl(result.title, result.author), CLASSES.resultLink)
    );
    item.appendChild(links);

    return item;
  }

  // Render the final result list and status copy into the panel.
  function renderResults(panel, payload, context) {
    clearResults(panel);

    const list = panel.querySelector(`.${CLASSES.list}`);
    if (!list) {
      return;
    }

    if (!payload.results.length) {
      setPanelSummary(panel, "");
      setPanelStatus(panel, STATUS.noResults, { busy: false });
      announce(STATUS.noResults);
      return;
    }

    const fragment = document.createDocumentFragment();
    payload.results.forEach((result) => {
      fragment.appendChild(createResultItem(result));
    });
    list.appendChild(fragment);

    setPanelStatus(panel, STATUS.resultsLoaded(payload.results.length), { busy: false });
    setPanelSummary(
      panel,
      payload.candidate?.summary ||
        `Showing top ${payload.results.length} matches for “${context.query}” from ${context.pageLabel}.`
    );
    announce(STATUS.resultsLoaded(payload.results.length));
  }

  // Main orchestration entry point for the current page state.
  async function processPage() {
    const context = getSearchContext();
    if (!context.sourceType) {
      return;
    }

    const { query, sourceType } = context;
    const currentUrl = location.href;

    if (!query) {
      const panel = getPanel();
      if (panel) {
        clearResults(panel);
        setPanelSummary(panel, "");
        setPanelStatus(panel, STATUS.noQuery, { busy: false });
      }

      runtimeState.lastRenderedQuery = "";
      runtimeState.lastRenderedSource = "";
      runtimeState.lastUrl = currentUrl;
      return;
    }

    if (
      currentUrl === runtimeState.lastUrl &&
      runtimeState.lastRenderedQuery === query &&
      runtimeState.lastRenderedSource === sourceType
    ) {
      return;
    }

    runtimeState.lastUrl = currentUrl;
    runtimeState.lastRenderedQuery = query;
    runtimeState.lastRenderedSource = sourceType;

    const panel = ensurePanel(context);
    if (!panel) {
      return;
    }

    clearResults(panel);

    if (!shouldSearchCatalog(query, context)) {
      setPanelSummary(panel, "");
      setPanelStatus(panel, STATUS.skipped, { busy: false });
      announce(STATUS.skipped);
      return;
    }

    const requestToken = ++runtimeState.activeRequestToken;
    setPanelStatus(panel, STATUS.loading, { busy: true });
    setPanelSummary(panel, "");

    try {
      const payload = await fetchCatalogResults(query);
      if (requestToken !== runtimeState.activeRequestToken) {
        return;
      }

      renderResults(panel, payload, context);
    } catch (error) {
      debugLog("Search catalog lookup failed", error);

      if (requestToken !== runtimeState.activeRequestToken) {
        return;
      }

      clearResults(panel);
      setPanelSummary(panel, "");
      setPanelStatus(panel, STATUS.error, { busy: false });
      announce(STATUS.error);
    }
  }

  // Debounce repeated mutation bursts so we do not re-process the page too often.
  function scheduleProcess() {
    window.clearTimeout(runtimeState.processTimer);
    runtimeState.processTimer = window.setTimeout(() => {
      processPage().catch((error) => debugLog("processPage failed", error));
    }, CONFIG.processDelayMs);
  }

  // Google updates results with client-side navigation, so we listen to History
  // API changes in addition to DOM mutations.
  function installHistoryListeners() {
    if (runtimeState.historyListenersInstalled) {
      return;
    }

    runtimeState.historyListenersInstalled = true;

    const wrapHistoryMethod = (methodName) => {
      const original = history[methodName];
      if (typeof original !== "function") {
        return;
      }

      history[methodName] = function wrappedHistoryMethod(...args) {
        const result = original.apply(this, args);
        scheduleProcess();
        return result;
      };
    };

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
    window.addEventListener("popstate", scheduleProcess, { passive: true });
  }

  // Initialize once the DOM is ready, then keep watching for dynamic page
  // updates that require a fresh panel render.
  function init() {
    if (!getSearchContext().sourceType) {
      return;
    }

    ensureLiveRegion();
    installHistoryListeners();
    processPage().catch((error) => debugLog("Initial process failed", error));

    const observer = new MutationObserver(() => {
      scheduleProcess();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  // Run immediately if the DOM is already ready, otherwise wait for it.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();