(() => {
  "use strict";

  // Amazon-specific catalog integration.
  //
  // High-level flow:
  // 1. Detect whether the current Amazon page is a search page or a product page.
  // 2. Extract the strongest available metadata (ISBN first, then title/author).
  // 3. Try a short series of Alma SRU queries from most precise to broadest.
  // 4. Render up to five catalog results with print/online availability.
  // 5. Re-run the process when Amazon changes the page dynamically.

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
      minUsefulWords: 2
    }
  };

  // Amazon DOM selectors. These are centralized so future site changes are
  // easier to fix in one place.
  const SELECTORS = {
    searchMounts: ["#search", "[data-component-type='s-search-results']", ".s-main-slot", "main"],
    productMounts: ["#centerCol", "#ppd", "#dp-container", "#dp", "main"],
    productTitle: ["#productTitle", "#ebooksProductTitle", "#title #productTitle"],
    productAuthor: ["#bylineInfo", ".author a.a-link-normal", ".contributorNameID", "#brand"],
    detailSections: [
      "#detailBullets_feature_div",
      "#detailBulletsWrapper_feature_div",
      "#prodDetails",
      "#bookDescription_feature_div",
      "#detailBulletsWrapper_feature_div ul",
      "#rpi-attribute-book_details-isbn13 .a-size-base",
      "#rpi-attribute-book_details-isbn10 .a-size-base"
    ],
    breadcrumbLinks: [
      "#wayfinding-breadcrumbs_feature_div a",
      "#nav-subnav a",
      "#searchDropdownBox"
    ]
  };

  // CSS class names used by the injected Amazon panel.
  const CLASSES = {
    panel: "umcp-amazon-catalog-panel",
    header: "umcp-amazon-catalog-panel__header",
    title: "umcp-amazon-catalog-panel__title",
    subtitle: "umcp-amazon-catalog-panel__subtitle",
    summary: "umcp-amazon-catalog-panel__summary",
    actions: "umcp-amazon-catalog-panel__actions",
    actionLink: "umcp-amazon-catalog-panel__action-link",
    toggleButton: "umcp-amazon-catalog-panel__toggle-button",
    body: "umcp-amazon-catalog-panel__body",
    status: "umcp-amazon-catalog-panel__status",
    badgeRow: "umcp-amazon-catalog-panel__badge-row",
    badge: "umcp-amazon-catalog-panel__badge",
    badgeGood: "is-good",
    badgeMuted: "is-muted",
    list: "umcp-amazon-catalog-panel__list",
    item: "umcp-amazon-catalog-panel__item",
    itemTitle: "umcp-amazon-catalog-panel__item-title",
    meta: "umcp-amazon-catalog-panel__meta",
    metaLine: "umcp-amazon-catalog-panel__meta-line",
    label: "umcp-amazon-catalog-panel__label",
    value: "umcp-amazon-catalog-panel__value",
    availability: "umcp-amazon-catalog-panel__availability",
    availabilityAvailable: "is-available",
    availabilityUnavailable: "is-unavailable",
    availabilityUnknown: "is-unknown",
    links: "umcp-amazon-catalog-panel__links",
    resultLink: "umcp-amazon-catalog-panel__result-link",
    srOnly: "umcp-amazon-catalog-panel__sr-only"
  };

  // Stable IDs used for accessibility relationships.
  const IDS = {
    panelTitle: "umcp-amazon-catalog-panel-title",
    panelBody: "umcp-amazon-catalog-panel-body",
    liveRegion: "umcp-amazon-catalog-live-region"
  };

  // User-facing status copy shown in the panel.
  const STATUS = {
    loading: "Searching the library catalog…",
    noQuery: "No Amazon title or search query found.",
    skipped: "This Amazon page does not look like a likely catalog search.",
    noResults: "No catalog matches found for this Amazon page.",
    error: "Library search failed.",
    resultsLoaded: (count) => `Loaded ${count} catalog result${count === 1 ? "" : "s"}.`
  };

  // Common words that add noise to SRU keyword matching.
  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "at", "be", "best", "book", "books", "edition", "for", "from",
    "hardcover", "how", "i", "in", "is", "kindle", "me", "my", "near", "of", "on", "or",
    "paperback", "review", "reviews", "series", "the", "to", "volume", "what", "where", "with"
  ]);

  // Cache completed and in-flight SRU lookups so repeated renders for the same
  // Amazon query or product do not trigger duplicate network requests.
  const queryCache = new Map();

  // Keep transient runtime state in one object so it is easier to reason about
  // navigation changes, debouncing, and stale async responses.
  const runtimeState = {
    processTimer: null,
    lastUrl: "",
    lastRenderedQuery: "",
    activeRequestToken: 0,
    historyListenersInstalled: false
  };

  // Lightweight debug logger that can be enabled during development.
  function debugLog(...args) {
    if (CONFIG.debug) {
      console.log("[UMCP Amazon Catalog]", ...args);
    }
  }

  // Normalize whitespace so extracted Amazon metadata is easier to compare.
  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  // Strip non-ISBN characters and normalize a trailing X.
  function normalizeIsbn(value) {
    return (value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  }

  // Treat only ISBN-10 and ISBN-13 values as strong identifiers.
  function hasUsableIsbn(isbn) {
    return typeof isbn === "string" && (isbn.length === 10 || isbn.length === 13);
  }

  // Prefer a product title over a search query when generating fallback searches.
  function getPrimaryQuery(context) {
    return sanitizeQuery(context?.title || context?.query || context?.isbn || "");
  }

  // Determine whether the current page exposes enough metadata to attempt a search.
  function hasSearchableContext(context) {
    return Boolean(context?.query || context?.title || context?.isbn);
  }

  // Escape user-visible text before inserting it into innerHTML fragments.
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Escape values that will be interpolated into SRU CQL queries.
  function escapeCqlTerm(value) {
    return normalizeText(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // Restrict the feature to Amazon hosts only.
  function isAmazonDomain() {
    return /(^|\.)amazon\./i.test(location.hostname);
  }

  // Detect standard Amazon search results pages.
  function isAmazonSearchPage() {
    return isAmazonDomain() && (location.pathname === "/s" || location.search.includes("k="));
  }

  // Detect product detail pages where we may be able to extract title/author/ISBN.
  function isAmazonProductPage() {
    return isAmazonDomain() && (/\/dp\//.test(location.pathname) || /\/gp\/product\//.test(location.pathname));
  }

  // Read and normalize a search parameter from the current page URL.
  function getSearchParam(name) {
    try {
      return normalizeText(new URL(location.href).searchParams.get(name));
    } catch {
      return "";
    }
  }

  // Return the first non-empty text value from a selector list.
  function getFirstMatchingText(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = normalizeText(node?.textContent || "");
      if (text) {
        return text;
      }
    }
    return "";
  }

  // Capture breadcrumb/category context as a weak signal for whether a page is book-like.
  function getAmazonBreadcrumbText() {
    return SELECTORS.breadcrumbLinks
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean)
      .join(" | ");
  }

  // Scan common Amazon detail areas for an ISBN-13 or ISBN-10.
  function extractAmazonIsbn() {
    const texts = SELECTORS.detailSections
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean);

    const combined = texts.join(" | ");
    if (!combined) {
      return "";
    }

    const isbn13Match = combined.match(/ISBN-13\s*[:\u200e\u200f-]*\s*((?:97[89][0-9\-\s]{10,}))\b/i);
    if (isbn13Match?.[1]) {
      return normalizeIsbn(isbn13Match[1]);
    }

    const isbn10Match = combined.match(/ISBN-10\s*[:\u200e\u200f-]*\s*(([0-9Xx][0-9Xx\-\s]{8,}))\b/i);
    if (isbn10Match?.[1]) {
      return normalizeIsbn(isbn10Match[1]);
    }

    return "";
  }

  // Remove Amazon-specific author/byline noise before building catalog queries.
  function cleanAmazonAuthor(authorText) {
    return normalizeText(authorText)
      .replace(/^by\s+/i, "")
      .replace(/\s*\([^)]*author page\)$/i, "")
      .replace(/\s*Brand:\s*/i, "")
      .replace(/\s*Visit the .*? Store$/i, "")
      .replace(/\s*Format:.*$/i, "")
      .trim();
  }

  // Build a normalized context object from either a search page or a product page.
  function getAmazonContext() {
    if (isAmazonSearchPage()) {
      const searchQuery = getSearchParam("k");
      if (searchQuery) {
        const department = getSearchParam("i");
        return {
          sourceType: "search",
          pageLabel: "Amazon search",
          query: searchQuery,
          title: "",
          author: "",
          isbn: normalizeIsbn(searchQuery),
          department
        };
      }
    }

    if (isAmazonProductPage()) {
      const title = getFirstMatchingText(SELECTORS.productTitle);
      const author = cleanAmazonAuthor(getFirstMatchingText(SELECTORS.productAuthor));
      const isbn = extractAmazonIsbn();
      const query = normalizeText([title, author].filter(Boolean).join(" "));
      return {
        sourceType: "product",
        pageLabel: "Amazon item",
        query,
        title,
        author,
        isbn,
        department: ""
      };
    }

    return {
      sourceType: "",
      pageLabel: "",
      query: "",
      title: "",
      author: "",
      isbn: "",
      department: ""
    };
  }

  // Remove obvious Amazon retail noise so the remaining query behaves better in SRU.
  function sanitizeQuery(rawQuery) {
    const withoutRetailNoise = normalizeText(rawQuery)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[?!]+/g, " ")
      .replace(/\b(?:kindle edition|kindle|hardcover|paperback|spiral-bound|board book|mass market paperback|loose leaf|audio cd|audible audiobook)\b/gi, " ")
      .replace(/\b(?:used|new|prime|deal|sale|coupon|bundle|pack of \d+)\b/gi, " ")
      .replace(/\b(?:author page|store)\b/gi, " ")
      .replace(/\s*[-–—]\s*(?:illustrated|abridged|unabridged|updated|revised|annotated)\b/gi, " ");

    const words = normalizeText(withoutRetailNoise)
      .split(" ")
      .filter(Boolean)
      .slice(0, CONFIG.heuristics.maxQueryWords);

    return normalizeText(words.join(" "));
  }

  // Tokenize a query for heuristics and fallback SRU strategies.
  function tokenizeQuery(query) {
    return sanitizeQuery(query)
      .split(" ")
      .map((token) => token.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase())
      .filter(Boolean);
  }

  // Filter tokens down to the ones most likely to help catalog matching.
  function getUsefulTokens(query) {
    return tokenizeQuery(query).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  }

  // Decide whether the current Amazon page looks like a reasonable catalog search.
  function shouldSearchCatalog(context) {
    if (!context) {
      return false;
    }

    if (hasUsableIsbn(context.isbn)) {
      return true;
    }

    const query = getPrimaryQuery(context);
    if (!query) {
      return false;
    }

    const obviousNonBookSignals = [
      /\b(?:gift card|headphones|iphone|laptop|charger|case|monitor|desk|keyboard|mouse|toaster|vacuum)\b/i,
      /\b(?:women|men|kids|baby|clothing|shoes|jewelry|beauty|grocery|pet supplies)\b/i,
      /\b(?:amazon basics|lego|funko|playstation|xbox|nintendo)\b/i
    ];

    if (obviousNonBookSignals.some((pattern) => pattern.test(query))) {
      return false;
    }

    const usefulTokens = getUsefulTokens(query);
    if (usefulTokens.length >= CONFIG.heuristics.minUsefulWords) {
      return true;
    }

    return query.split(" ").length <= 3;
  }

  // Build a Primo link for a specific result.
  function buildCatalogSearchUrl(title, author) {
    const terms = normalizeText([title, author].filter(Boolean).join(" "));
    const url = new URL(CONFIG.catalog.baseUrl);

    Object.entries(CONFIG.catalog.fixedParams || {}).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });

    url.searchParams.set("query", `${CONFIG.catalog.queryPrefix}${terms}`);
    return url.toString();
  }

  // Build a broader Primo search link for the current Amazon context.
  function buildFullCatalogSearchUrl(query) {
    const url = new URL(CONFIG.catalog.baseUrl);

    Object.entries(CONFIG.catalog.fixedParams || {}).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });

    url.searchParams.set("query", `${CONFIG.catalog.queryPrefix}${sanitizeQuery(query)}`);
    return url.toString();
  }

  // Compose the Alma SRU request URL for one candidate strategy.
  function buildSruUrl(cqlQuery) {
    const url = new URL(CONFIG.sruBaseUrl);
    url.searchParams.set("version", CONFIG.sruVersion);
    url.searchParams.set("operation", "searchRetrieve");
    url.searchParams.set("recordSchema", CONFIG.sruRecordSchema);
    url.searchParams.set("maximumRecords", String(CONFIG.maxResults));
    url.searchParams.set("query", cqlQuery);
    return url.toString();
  }

  // Try more precise queries first, then gradually broaden the search.
  function buildCandidateQueries(context) {
    const query = getPrimaryQuery(context);
    const usefulTokens = getUsefulTokens(query).slice(0, 5);
    const candidates = [];

    if (hasUsableIsbn(context.isbn)) {
      candidates.push({
        label: "isbn",
        summary: `Matched ISBN ${context.isbn}`,
        cql: `alma.isbn="${escapeCqlTerm(context.isbn)}"`
      });
    }

    if (context.title) {
      candidates.push({
        label: "title phrase",
        summary: `Matched title phrase: “${context.title}”`,
        cql: `alma.title="${escapeCqlTerm(context.title)}"`
      });
    }

    if (context.title && context.author) {
      candidates.push({
        label: "title and author",
        summary: `Matched title + author: “${context.title}” and ${context.author}`,
        cql: `alma.title="${escapeCqlTerm(context.title)}" and alma.creator="${escapeCqlTerm(context.author)}"`
      });
    }

    if (query) {
      candidates.push({
        label: "title phrase from query",
        summary: `Matched query phrase: “${query}”`,
        cql: `alma.title="${escapeCqlTerm(query)}"`
      });
    }

    if (usefulTokens.length >= 2) {
      candidates.push({
        label: "title keywords",
        summary: `Matched title keywords: ${usefulTokens.join(", ")}`,
        cql: usefulTokens.map((token) => `alma.title="${escapeCqlTerm(token)}"`).join(" and ")
      });
    }

    if (usefulTokens.length >= 1) {
      candidates.push({
        label: "any keywords",
        summary: `Matched broader keywords: ${usefulTokens.join(", ")}`,
        cql: usefulTokens.map((token) => `alma.any="${escapeCqlTerm(token)}"`).join(" and ")
      });
    }

    return candidates.filter((candidate, index, array) => {
      return candidate.cql && array.findIndex((entry) => entry.cql === candidate.cql) === index;
    });
  }

  // Ensure there is a single live region for announcing dynamic updates.
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

  // Announce meaningful panel updates for screen reader users.
  function announce(message) {
    const liveRegion = ensureLiveRegion();
    liveRegion.textContent = "";
    window.setTimeout(() => {
      liveRegion.textContent = message;
    }, 40);
  }

  // Add hidden copy so external links announce that they open in a new tab.
  function createNewTabHint() {
    const hint = document.createElement("span");
    hint.className = CLASSES.srOnly;
    hint.textContent = " (opens in a new tab)";
    return hint;
  }

  // Create a consistently configured action link.
  function createActionLink(label, href, className = CLASSES.actionLink) {
    const link = document.createElement("a");
    link.className = className;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    link.setAttribute("aria-label", `${label} (opens in a new tab)`);
    link.appendChild(createNewTabHint());
    return link;
  }

  // Create the show/hide toggle for the panel body.
  function createToggleButton(panel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = CLASSES.toggleButton;
    button.setAttribute("aria-controls", IDS.panelBody);
    button.addEventListener("click", () => {
      const isCollapsed = panel.dataset.collapsed === "true";
      setPanelCollapsed(panel, !isCollapsed);
    });
    setPanelCollapsed(panel, panel.dataset.collapsed === "true");
    return button;
  }

  // Collapse or expand the results body without removing the panel from the page.
  function setPanelCollapsed(panel, collapsed) {
    panel.dataset.collapsed = collapsed ? "true" : "false";

    const body = panel.querySelector(`#${IDS.panelBody}`);
    if (body) {
      body.hidden = collapsed;
      body.setAttribute("aria-hidden", collapsed ? "true" : "false");
    }

    const toggleButton = panel.querySelector(`.${CLASSES.toggleButton}`);
    if (toggleButton) {
      toggleButton.textContent = collapsed ? "Show results" : "Hide results";
      toggleButton.setAttribute("aria-expanded", String(!collapsed));
      toggleButton.setAttribute("aria-label", collapsed ? "Show library results" : "Hide library results");
    }
  }

  // Retrieve the single injected Amazon panel if it already exists.
  function getPanel() {
    return document.querySelector(`.${CLASSES.panel}`);
  }

  // Create one availability badge.
  function createBadge(text, modifierClass = "") {
    const badge = document.createElement("span");
    badge.className = `${CLASSES.badge} ${modifierClass}`.trim();
    badge.textContent = text;
    return badge;
  }

  // Create a stable signature for the current Amazon page context.
  function getContextKey(context) {
    return normalizeText([
      context?.sourceType,
      context?.query,
      context?.title,
      context?.author,
      context?.isbn
    ].join("::")).toLowerCase();
  }

  // Choose the best Amazon DOM container for inserting the panel.
  function getMountPoint(context) {
    const selectors = context?.sourceType === "product" ? SELECTORS.productMounts : SELECTORS.searchMounts;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  // Create the panel once, then update it in place on later rerenders.
  function ensurePanel(context) {
    const mountPoint = getMountPoint(context);
    if (!mountPoint) {
      return null;
    }

    const contextKey = getContextKey(context);
    const existing = getPanel();
    const panel = existing || document.createElement("section");

    if (!existing) {
      panel.className = CLASSES.panel;
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-labelledby", IDS.panelTitle);
      panel.innerHTML = `
        <div class="${CLASSES.header}">
          <div>
            <h2 id="${IDS.panelTitle}" class="${CLASSES.title}">UMD Library Catalog Top Results</h2>
            <p class="${CLASSES.subtitle}">Matches for <strong></strong></p>
          </div>
          <div class="${CLASSES.actions}"></div>
        </div>
        <div id="${IDS.panelBody}" class="${CLASSES.body}">
          <p class="${CLASSES.summary}" hidden></p>
          <p class="${CLASSES.status}" aria-live="polite"></p>
          <ol class="${CLASSES.list}"></ol>
        </div>
      `;
      mountPoint.prepend(panel);
    }

    if (panel.dataset.contextKey !== contextKey) {
      panel.dataset.contextKey = contextKey;
      panel.dataset.collapsed = "false";
    }

    const subtitleStrong = panel.querySelector(`.${CLASSES.subtitle} strong`);
    if (subtitleStrong) {
      subtitleStrong.textContent = context.title || context.query;
    }

    const summary = panel.querySelector(`.${CLASSES.summary}`);
    if (summary) {
      summary.hidden = true;
      summary.textContent = "";
    }

    const actions = panel.querySelector(`.${CLASSES.actions}`);
    if (actions) {
      actions.replaceChildren(
        createActionLink("Search full catalog", buildFullCatalogSearchUrl(context.query || context.title || "")),
        createToggleButton(panel)
      );
    }

    setPanelCollapsed(panel, panel.dataset.collapsed === "true");
    return panel;
  }

  // Update the visible loading/status text and aria-busy state together.
  function setPanelStatus(panel, message, { busy = false } = {}) {
    panel.setAttribute("aria-busy", busy ? "true" : "false");
    const status = panel.querySelector(`.${CLASSES.status}`);
    if (status) {
      status.textContent = message;
    }
  }

  // Show or hide the summary line beneath the panel heading.
  function setPanelSummary(panel, message) {
    const summary = panel.querySelector(`.${CLASSES.summary}`);
    if (!summary) {
      return;
    }

    summary.textContent = message || "";
    summary.hidden = !message;
  }

  // Remove any previously rendered result items.
  function clearResults(panel) {
    const list = panel.querySelector(`.${CLASSES.list}`);
    if (list) {
      list.innerHTML = "";
    }
  }

  // Clear prior results and update the panel state in one place.
  function resetPanel(panel, { status = "", summary = "", busy = false } = {}) {
    clearResults(panel);
    setPanelSummary(panel, summary);
    setPanelStatus(panel, status, { busy });
  }

  // Interpret Alma availability strings conservatively.
  function isAvailableStatus(value) {
    return value === "available" || (value.includes("available") && !value.includes("not"));
  }

  // Convert raw AVA/AVE status values into UI-friendly text and classes.
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
      return {
        text: labels.unavailableText || "Not available",
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

  // Read one MARC holdings tag (AVA for print, AVE for online) from a record.
  function getAvailabilityState(recordNode, tag, labels = {}) {
    const fields = getDataFields(recordNode, tag);
    const baseState = prettifyAvailability(
      getDataFieldSubfieldValues(recordNode, tag, "e"),
      labels
    );

    return {
      ...baseState,
      hasField: fields.length > 0,
      rawFields: fields
    };
  }

  // Collapse format-specific availability into one primary summary line.
  function summarizeAvailability(printAvailability, electronicAvailability) {
    if (electronicAvailability.isAvailable) {
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

    if (printAvailability.hasStatusValues || electronicAvailability.hasStatusValues) {
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

  // Namespace-safe XML helpers.
  // SRU/MARC XML often uses namespaces, so localName-based matching is safer
  // than hard-coding prefixed selectors.
  function getChildrenByLocalName(parent, localName) {
    return Array.from(parent?.children || []).filter((node) => node.localName === localName);
  }

  function getFirstChildByLocalName(parent, localName) {
    return getChildrenByLocalName(parent, localName)[0] || null;
  }

  function getTextContent(node) {
    return normalizeText(node?.textContent || "");
  }

  function getControlField(recordNode, tag) {
    const field = getChildrenByLocalName(recordNode, "controlfield")
      .find((node) => node.getAttribute("tag") === tag);
    return getTextContent(field);
  }

  function getDataFields(recordNode, tag) {
    return getChildrenByLocalName(recordNode, "datafield")
      .filter((node) => node.getAttribute("tag") === tag);
  }

  function getSubfieldValues(fieldNode, code) {
    return getChildrenByLocalName(fieldNode, "subfield")
      .filter((node) => node.getAttribute("code") === code)
      .map(getTextContent)
      .filter(Boolean);
  }

  function getDataFieldSubfieldValues(recordNode, tag, code) {
    return getDataFields(recordNode, tag).flatMap((fieldNode) => getSubfieldValues(fieldNode, code));
  }

  // Combine MARC subfields into a single human-readable string.
  function getDataFieldCombinedValue(recordNode, tag, codes) {
    const field = getDataFields(recordNode, tag)[0];
    if (!field) {
      return "";
    }

    return codes
      .flatMap((code) => getSubfieldValues(field, code))
      .map((value) => value.replace(/[\s\/,;:]+$/g, ""))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  // Extract print location and call number details from AVA fields when present.
  function extractHoldingsSummary(recordNode) {
    const avaFields = getDataFields(recordNode, "AVA");
    const locations = new Set();
    const callNumbers = new Set();

    avaFields.forEach((fieldNode) => {
      getSubfieldValues(fieldNode, "b").forEach((value) => locations.add(value));
      getSubfieldValues(fieldNode, "j").forEach((value) => callNumbers.add(value));
      getSubfieldValues(fieldNode, "d").forEach((value) => callNumbers.add(value));
    });

    return {
      location: Array.from(locations).join("; "),
      callNumber: Array.from(callNumbers).join("; ")
    };
  }

  // Prefer publication year from common MARC fields.
  function getPublicationYear(recordNode) {
    const candidates = [
      getDataFieldCombinedValue(recordNode, "264", ["c"]),
      getDataFieldCombinedValue(recordNode, "260", ["c"]),
      getDataFieldCombinedValue(recordNode, "362", ["a"]),
      getDataFieldCombinedValue(recordNode, "008", ["a"])
    ].filter(Boolean);

    for (const value of candidates) {
      const yearMatch = value.match(/(1[5-9]\d{2}|20\d{2}|21\d{2})/);
      if (yearMatch) {
        return yearMatch[1];
      }
    }

    const fixedField = getControlField(recordNode, "008");
    if (fixedField && fixedField.length >= 11) {
      const fixedYear = fixedField.slice(7, 11);
      if (/^(1[5-9]\d{2}|20\d{2}|21\d{2})$/.test(fixedYear)) {
        return fixedYear;
      }
    }

    return "";
  }

  // Convert one SRU MARC record into the smaller object used by the UI.
  function buildResult(recordNode) {
    const title =
      getDataFieldCombinedValue(recordNode, "245", ["a", "b"]) ||
      getDataFieldCombinedValue(recordNode, "246", ["a", "b"]) ||
      getDataFieldCombinedValue(recordNode, "130", ["a"]);

    const author =
      getDataFieldCombinedValue(recordNode, "100", ["a"]) ||
      getDataFieldCombinedValue(recordNode, "110", ["a"]) ||
      getDataFieldCombinedValue(recordNode, "111", ["a"]) ||
      getDataFieldCombinedValue(recordNode, "700", ["a"]);

    const printAvailability = getAvailabilityState(recordNode, "AVA", {
      availableText: "Print available",
      unavailableText: "Print not available",
      unknownText: "Print availability unknown"
    });
    const electronicAvailability = getAvailabilityState(recordNode, "AVE", {
      availableText: "Online available",
      unavailableText: "Online not available",
      unknownText: "Online availability unknown"
    });
    const availability = summarizeAvailability(printAvailability, electronicAvailability);
    const holdings = extractHoldingsSummary(recordNode);
    const mmsId = getControlField(recordNode, "001");

    return {
      mmsId,
      title: title || "Untitled record",
      author,
      year: getPublicationYear(recordNode),
      isbn: getDataFieldCombinedValue(recordNode, "020", ["a"]),
      location: holdings.location,
      callNumber: holdings.callNumber,
      availabilityText: availability.text,
      availabilityClass: availability.modifierClass,
      hasPrintHoldings: printAvailability.hasField,
      printHasStatusValues: printAvailability.hasStatusValues,
      printAvailabilityText: printAvailability.text,
      printAvailabilityClass: printAvailability.modifierClass,
      hasElectronicVersion: electronicAvailability.hasField,
      electronicHasStatusValues: electronicAvailability.hasStatusValues,
      electronicAvailabilityText: electronicAvailability.text,
      electronicAvailabilityClass: electronicAvailability.modifierClass,
      catalogUrl: buildCatalogSearchUrl(title, author)
    };
  }

  // Parse the SRU XML response and surface any Alma diagnostics as errors.
  function parseSruResponse(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    const parserError = xml.querySelector("parsererror");
    if (parserError) {
      throw new Error("Unable to parse SRU response.");
    }

    const diagnostic = xml.querySelector("diagnostic message, diagnostics diagnostic message");
    if (diagnostic) {
      throw new Error(getTextContent(diagnostic) || "SRU diagnostic returned.");
    }

    const numberOfRecords = Number.parseInt(getTextContent(xml.querySelector("numberOfRecords")), 10) || 0;
    const recordsParent = xml.querySelector("records");
    const records = recordsParent ? getChildrenByLocalName(recordsParent, "record") : [];

    return {
      numberOfRecords,
      records: records.map(buildResult).filter((record) => normalizeText(record.title))
    };
  }

  // Run candidate SRU searches until one yields usable catalog matches.
  async function fetchSruResults(context) {
    const queryLabel = getPrimaryQuery(context);
    const cacheKey = normalizeText([getContextKey(context), queryLabel].join("::")).toLowerCase();
    if (queryCache.has(cacheKey)) {
      return queryCache.get(cacheKey);
    }

    const promise = (async () => {
      let lastError = null;
      const candidates = buildCandidateQueries(context);

      for (const candidate of candidates) {
        try {
          const sruUrl = buildSruUrl(candidate.cql);
          debugLog("Amazon SRU request", candidate, sruUrl);

          const response = await fetch(sruUrl, {
            method: "GET",
            credentials: "omit",
            cache: "default"
          });

          if (!response.ok) {
            throw new Error(`SRU request failed with status ${response.status}`);
          }

          const xmlText = await response.text();
          const payload = parseSruResponse(xmlText);

          if (payload.numberOfRecords > 0 && payload.records.length > 0) {
            return {
              strategy: candidate,
              records: payload.records.slice(0, CONFIG.maxResults)
            };
          }
        } catch (error) {
          lastError = error;
          debugLog("Amazon SRU candidate failed", candidate, error);
        }
      }

      if (lastError) {
        throw lastError;
      }

      return {
        strategy: null,
        records: []
      };
    })();

    queryCache.set(cacheKey, promise);
    return promise;
  }

  // Render one metadata row inside a definition list.
  function createMetaRow(label, value) {
    const wrapper = document.createElement("div");
    wrapper.className = CLASSES.metaLine;

    const dt = document.createElement("dt");
    dt.className = CLASSES.label;
    dt.textContent = label;

    const dd = document.createElement("dd");
    dd.className = CLASSES.value;
    dd.textContent = value || "—";

    wrapper.append(dt, dd);
    return wrapper;
  }

  // Render only the format badges that add value beyond the main summary line.
  function getFormatAvailabilityBadges(result) {
    const badges = [];

    if (
      result.hasPrintHoldings &&
      result.printHasStatusValues &&
      result.printAvailabilityText &&
      !/unknown/i.test(result.printAvailabilityText) &&
      result.printAvailabilityText !== result.availabilityText
    ) {
      badges.push(
        createBadge(
          result.printAvailabilityText,
          result.printAvailabilityClass === CLASSES.availabilityAvailable
            ? CLASSES.availabilityAvailable
            : CLASSES.availabilityUnavailable
        )
      );
    }

    if (
      result.hasElectronicVersion &&
      result.electronicHasStatusValues &&
      result.electronicAvailabilityText &&
      !/unknown/i.test(result.electronicAvailabilityText) &&
      !badges.some((badge) => badge.textContent === result.electronicAvailabilityText)
    ) {
      badges.push(
        createBadge(
          result.electronicAvailabilityText,
          result.electronicAvailabilityClass === CLASSES.availabilityAvailable
            ? CLASSES.availabilityAvailable
            : CLASSES.availabilityUnavailable
        )
      );
    }

    return badges;
  }

  // Build the UI for one catalog result.
  function createResultItem(result) {
    const item = document.createElement("li");
    item.className = CLASSES.item;

    const itemTitle = document.createElement("h3");
    itemTitle.className = CLASSES.itemTitle;
    itemTitle.textContent = result.title;
    item.appendChild(itemTitle);

    const formatBadges = getFormatAvailabilityBadges(result);
    if (formatBadges.length) {
      const badgeRow = document.createElement("div");
      badgeRow.className = CLASSES.badgeRow;
      formatBadges.forEach((badge) => badgeRow.appendChild(badge));
      item.appendChild(badgeRow);
    }

    const meta = document.createElement("dl");
    meta.className = CLASSES.meta;
    meta.appendChild(createMetaRow("Author", result.author));
    if (result.year) {
      meta.appendChild(createMetaRow("Year", result.year));
    }
    if (result.isbn) {
      meta.appendChild(createMetaRow("ISBN", result.isbn));
    }
    if (result.location) {
      meta.appendChild(createMetaRow("Location", result.location));
    }
    if (result.callNumber) {
      meta.appendChild(createMetaRow("Call number", result.callNumber));
    }
    if (result.electronicHasStatusValues) {
      meta.appendChild(createMetaRow("Online version", result.electronicAvailabilityText));
    }
    item.appendChild(meta);

    const availability = document.createElement("p");
    availability.className = `${CLASSES.availability} ${result.availabilityClass}`;
    availability.innerHTML = `<span class="${CLASSES.label}">Availability:</span> <span class="${CLASSES.value}">${escapeHtml(result.availabilityText)}</span>`;
    item.appendChild(availability);

    const links = document.createElement("div");
    links.className = CLASSES.links;
    links.appendChild(createActionLink("Open in catalog", result.catalogUrl, CLASSES.resultLink));
    item.appendChild(links);

    return item;
  }

  // Replace the results list with fresh content for the current Amazon page.
  function renderResults(panel, query, payload) {
    clearResults(panel);
    setPanelSummary(panel, payload.strategy?.summary || `Showing top ${payload.records.length} matches for “${query}”.`);

    const list = panel.querySelector(`.${CLASSES.list}`);
    if (!list) {
      return;
    }

    payload.records.forEach((result) => {
      list.appendChild(createResultItem(result));
    });

    setPanelStatus(panel, STATUS.resultsLoaded(payload.records.length), { busy: false });
  }

  // Drive the end-to-end lookup/render flow for the current context.
  async function renderCatalogPanel(context) {
    const panel = ensurePanel(context);
    if (!panel) {
      return;
    }

    const requestToken = ++runtimeState.activeRequestToken;
    resetPanel(panel, { status: STATUS.loading, summary: "", busy: true });

    try {
      const payload = await fetchSruResults(context);

      if (requestToken !== runtimeState.activeRequestToken) {
        return;
      }

      if (payload.records.length === 0) {
        setPanelStatus(panel, STATUS.noResults, { busy: false });
        announce(STATUS.noResults);
        return;
      }

      renderResults(panel, context.query || context.title || context.isbn || "", payload);
      panel.setAttribute("aria-busy", "false");
      announce(STATUS.resultsLoaded(payload.records.length));
    } catch (error) {
      debugLog("Amazon catalog rendering failed", error);
      if (requestToken !== runtimeState.activeRequestToken) {
        return;
      }
      resetPanel(panel, { status: STATUS.error });
      announce(STATUS.error);
    }
  }

  // Main page-processing entry point. It is intentionally cheap when nothing changed.
  async function processPage() {
    if (!isAmazonDomain()) {
      return;
    }

    const context = getAmazonContext();
    const currentUrl = location.href;
    const currentQueryKey = getContextKey(context);

    if (!hasSearchableContext(context)) {
      const panel = getPanel();
      if (panel) {
        resetPanel(panel, { status: STATUS.noQuery });
      }
      runtimeState.lastUrl = currentUrl;
      runtimeState.lastRenderedQuery = currentQueryKey;
      return;
    }

    if (currentUrl === runtimeState.lastUrl && currentQueryKey === runtimeState.lastRenderedQuery) {
      return;
    }

    const panel = ensurePanel(context);
    if (!panel) {
      runtimeState.lastUrl = currentUrl;
      runtimeState.lastRenderedQuery = currentQueryKey;
      return;
    }

    if (!shouldSearchCatalog(context)) {
      resetPanel(panel, {
        status: STATUS.skipped,
        summary: getAmazonBreadcrumbText()
      });
      runtimeState.lastUrl = currentUrl;
      runtimeState.lastRenderedQuery = currentQueryKey;
      return;
    }

    runtimeState.lastUrl = currentUrl;
    runtimeState.lastRenderedQuery = currentQueryKey;
    await renderCatalogPanel(context);
  }

  // Debounce frequent DOM mutations and SPA-style navigation updates.
  function scheduleProcess() {
    window.clearTimeout(runtimeState.processTimer);
    runtimeState.processTimer = window.setTimeout(() => {
      processPage().catch((error) => debugLog("Amazon processing error", error));
    }, CONFIG.processDelayMs);
  }

  // Amazon uses client-side navigation in places, so patch history events once.
  function installHistoryListeners() {
    if (runtimeState.historyListenersInstalled) {
      return;
    }

    runtimeState.historyListenersInstalled = true;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushStatePatched(...args) {
      const result = originalPushState.apply(this, args);
      scheduleProcess();
      return result;
    };

    history.replaceState = function replaceStatePatched(...args) {
      const result = originalReplaceState.apply(this, args);
      scheduleProcess();
      return result;
    };

    window.addEventListener("popstate", scheduleProcess, { passive: true });
    window.addEventListener("hashchange", scheduleProcess, { passive: true });
  }

  // Kick off the feature and add observers/listeners that keep it fresh.
  function init() {
    if (!isAmazonDomain()) {
      return;
    }

    ensureLiveRegion();
    installHistoryListeners();
    processPage().catch((error) => debugLog("Amazon init error", error));

    const observer = new MutationObserver(() => {
      scheduleProcess();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener("load", scheduleProcess, { passive: true, once: true });
    window.setTimeout(scheduleProcess, 500);
    window.setTimeout(scheduleProcess, 1500);
    window.setTimeout(scheduleProcess, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();