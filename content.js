(() => {
  /**
   * Toggle debug logging in the browser console.
   *
   * When true:
   * - SRU URLs are logged
   * - SRU response metadata is logged
   * - extracted books are logged
   *
   * Recommended:
   * - true while developing/debugging
   * - false for quieter production behavior
   */
  const DEBUG = true;

  /**
   * Centralized CSS selectors used to read the bookstore page.
   *
   * These selectors are tightly coupled to the BNCollege DOM structure.
   * If the bookstore page changes, this is one of the first places to inspect.
   */
  const SELECTORS = {
    mainContainer: ".js-bned-course-material-list-main-container",
    bookBlock: ".bned-item-attributes-notes-wp",
    titleText: ".js-bned-item-name-text",
    author: ".author",
    attributesWrap: ".bned-item-attributes-wp",
    attributeRow: ".bned-item-attribute",
    attributeTitle: ".title",
    attributeValue: ".value"
  };

  /**
   * CSS class names used by the injected UI.
   *
   * Keeping these in one place makes refactoring easier and reduces typo risk.
   */
  const CLASSES = {
    processed: "data-umcp-library-processed",
    srOnly: "umcp-library-sr-only",

    bookPanel: "umcp-library-tools",
    bookPanelTitle: "umcp-library-tools-title",
    metaList: "umcp-library-meta-list",
    metaLine: "umcp-library-meta-line",
    linksWrap: "umcp-library-links",
    link: "umcp-library-link",

    toolbar: "umcp-library-toolbar",
    toolbarTitle: "umcp-library-toolbar-title",
    toolbarActions: "umcp-library-toolbar-actions",
    toolbarButton: "umcp-library-toolbar-button",
    toolbarButtonSecondary: "umcp-library-toolbar-button-secondary",

    summaryPanel: "umcp-library-summary-panel",
    summaryHeader: "umcp-library-summary-header",
    summaryTitle: "umcp-library-summary-title",
    summaryClose: "umcp-library-summary-close",
    summaryEmpty: "umcp-library-summary-empty",
    summaryList: "umcp-library-summary-list",
    summaryItem: "umcp-library-summary-item",
    summaryItemTitle: "umcp-library-summary-item-title",
    summaryItemMeta: "umcp-library-summary-item-meta",
    summaryLinks: "umcp-library-summary-links",
    summaryLink: "umcp-library-summary-link",

    availabilityValue: "umcp-library-availability-value",
    liveRegion: "umcp-library-live-region",
    availabilityLink: "umcp-library-availability-link",
    searchLabel: "umcp-library-search-label",
    availabilityBlock: "umcp-library-availability-block",
    availabilityLabel: "umcp-library-availability-label",
    availabilityText: "umcp-library-availability-text",
  };

  /**
   * Stable DOM IDs used for aria-labelledby and global live region support.
   */
  const IDS = {
    toolbarTitle: "umcp-library-toolbar-title",
    summaryTitle: "umcp-library-summary-title",
    globalLiveRegion: "umcp-library-global-live-region"
  };

  const TOP_TEXTBOOKS_TOOLTIP =
  "Top Textbooks is a UMD Libraries program which provides free access to textbooks for the largest, most common courses.";

  /**
   * User-facing library availability statuses.
   *
   * These are displayed in both:
   * - per-book injected panels
   * - the extracted books summary panel
   */
  const LIBRARY_STATUS = {
    CHECKING: "Checking...",
    AVAILABLE: "Available",
    NOT_AVAILABLE: "Not available",
    NO_MATCH: "No SRU match",
    FAILED: "Lookup failed"
  };

  /**
   * Simple in-memory cache for SRU lookups.
   *
   * Why this exists:
   * - the same book may appear in multiple UI contexts
   *   (per-book panel + summary panel)
   * - we do not want to fetch SRU data repeatedly for the same ISBN
   *
   * Values stored here are Promises, not just final strings.
   * That means multiple consumers can await the same in-flight request.
   */
  const sruCache = new Map();

  /**
   * Debug logger wrapper so console noise can be turned on/off centrally.
   */
  function debugLog(...args) {
    if (DEBUG) {
      console.log("[UMCP Library Checker]", ...args);
    }
  }

  /**
   * Normalize general text content:
   * - collapse repeated whitespace
   * - trim leading/trailing spaces
   *
   * Used for titles, authors, labels, and general cleanup.
   */
  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  /**
   * Normalize an ISBN so it is suitable for searching and caching.
   *
   * Rules:
   * - remove all non-digit / non-X characters
   * - uppercase X if present
   *
   * This helps reduce format variance like:
   * - 978-1-234-56789-0
   * - 9781234567890
   */
  function normalizeIsbn(value) {
    return (value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  }

  /**
   * Encode a string safely for use in a URL query parameter.
   */
  function encodeValue(value) {
    return encodeURIComponent((value || "").trim());
  }

  /**
   * Check whether an element is actually visible in the rendered page.
   *
   * This helps avoid processing hidden or duplicate/inactive bookstore entries.
   */
  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;

    const style = window.getComputedStyle(element);
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (element.offsetParent === null) return false;

    return true;
  }

  /**
   * Build a Primo Top Textbooks ISBN search URL.
   *
   * This remains useful even though SRU availability now uses Alma SRU + ISBN.
   */
  function buildTopTextbookIsbnUrl(isbn) {
    return `https://usmai-umcp.primo.exlibrisgroup.com/discovery/search?query=isbn,contains,${encodeValue(normalizeIsbn(isbn))},AND&tab=TopText&search_scope=TopTextbooks&vid=01USMAI_UMCP:UMCP&mode=advanced&offset=0`;
  }

  /**
   * Build a Primo Top Textbooks title/author search URL.
   */
  function buildTopTextbookTitleAuthorUrl(title, author) {
    return `https://usmai-umcp.primo.exlibrisgroup.com/discovery/search?query=creator,contains,${encodeValue(author)},AND&query=title,contains,${encodeValue(title)},AND&tab=TopText&search_scope=TopTextbooks&vid=01USMAI_UMCP:UMCP&lang=en&mode=advanced&offset=0`;
  }

  /**
   * Build a general Primo search URL.
   *
   * Current strategy:
   * - prefer creator + title
   * - fallback to title only
   * - fallback to author only
   * - fallback to a generic UMCP discovery URL
   *
   * Note:
   * This is intentionally labeled "General Search" in the UI.
   */
  function buildGeneralUrl(title, author) {
    const hasTitle = !!normalizeText(title);
    const hasAuthor = !!normalizeText(author);

    if (hasTitle && hasAuthor) {
      return `https://usmai-umcp.primo.exlibrisgroup.com/discovery/search?vid=01USMAI_UMCP:UMCP&query=creator,contains,${encodeValue(author)},AND&query=title,contains,${encodeValue(title)}`;
    }

    if (hasTitle) {
      return `https://usmai-umcp.primo.exlibrisgroup.com/discovery/search?vid=01USMAI_UMCP:UMCP&query=title,contains,${encodeValue(title)}`;
    }

    if (hasAuthor) {
      return `https://usmai-umcp.primo.exlibrisgroup.com/discovery/search?vid=01USMAI_UMCP:UMCP&query=creator,contains,${encodeValue(author)}`;
    }

    return `https://usmai-umcp.primo.exlibrisgroup.com/discovery/search?vid=01USMAI_UMCP:UMCP`;
  }

  /**
   * Build the Alma SRU URL used for automated library availability lookup.
   *
   * Important:
   * - We use ISBN because it is far more reliable than title/author matching.
   * - The explain response confirmed that "alma.isbn" is supported.
   *
   * Example query:
   *   alma.isbn="9781234567890"
   *
   * Note:
   * This request requires appropriate extension host permissions
   * for the alma.exlibrisgroup.com domain.
   */
  function buildSruIsbnUrl(isbn) {
    const cleanIsbn = normalizeIsbn(isbn);
    const query = `alma.isbn="${cleanIsbn}"`;
    const url = `https://usmai-umcp.alma.exlibrisgroup.com/view/sru/01USMAI_UMCP?version=1.2&operation=searchRetrieve&recordSchema=marcxml&query=${encodeURIComponent(query)}`;

    debugLog("SRU ISBN query:", query);
    debugLog("SRU ISBN URL:", url);

    return url;
  }

  /**
   * Build a Primo full display URL from an Alma MMS ID.
   *
   * This is used when an SRU record is available and we want the availability
   * statement itself to act as a link to the full Primo record.
   */
  function buildPrimoRecordUrl(mmsId) {
    return `https://usmai-umcp.primo.exlibrisgroup.com/discovery/fulldisplay?docid=alma${encodeURIComponent(mmsId)}&context%3DL&vid=01USMAI_UMCP:UMCP&lang=en&search_scope=DN_and_CI&adaptor=Local%20Search%20Engine&tab=Everything`;
  }

  /**
   * Ensure that a hidden global live region exists.
   *
   * Why this exists:
   * - screen readers need a place to hear status updates
   * - we use it for events like:
   *   - "Extracted books list shown"
   *   - "Availability updated for [title]"
   *   - "Opening X tabs"
   *
   * This improves accessibility for dynamically updated content.
   */
  function ensureGlobalLiveRegion() {
    let liveRegion = document.getElementById(IDS.globalLiveRegion);
    if (liveRegion) return liveRegion;

    liveRegion = document.createElement("div");
    liveRegion.id = IDS.globalLiveRegion;
    liveRegion.className = `${CLASSES.srOnly} ${CLASSES.liveRegion}`;
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");

    document.body.appendChild(liveRegion);
    return liveRegion;
  }

  /**
   * Announce a message through the global live region.
   *
   * The short timeout helps ensure repeat announcements are spoken reliably.
   */
  function announceMessage(message) {
    const liveRegion = ensureGlobalLiveRegion();
    liveRegion.textContent = "";
    window.setTimeout(() => {
      liveRegion.textContent = message;
    }, 25);
  }

  /**
   * Create a screen-reader-only hint indicating that a link opens in a new tab.
   *
   * We already use aria-labels for this, but the hidden text adds redundancy
   * and can help with certain screen reader/browser combinations.
   */
  function createNewTabHint() {
    const hint = document.createElement("span");
    hint.className = CLASSES.srOnly;
    hint.textContent = " opens in a new tab";
    return hint;
  }

  /**
   * Create a styled link used in injected UI.
   *
   * Accessibility:
   * - links open in a new tab
   * - aria-label explicitly announces that behavior
   */
  function createLink(label, href, className = CLASSES.link, options = {}) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = className;
    link.textContent = label;
    link.setAttribute("aria-label", `${label} (opens in a new tab)`);

    if (options.title) {
      link.title = options.title;
    }

    link.appendChild(createNewTabHint());

    return link;
  }

  /**
   * Create a definition list container for metadata.
   *
   * We use <dl>/<dt>/<dd> instead of generic divs because the data
   * is structurally "label : value" metadata.
   */
  function createMetaList() {
    const list = document.createElement("dl");
    list.className = CLASSES.metaList;
    return list;
  }

  /**
   * Create one metadata row inside a definition list.
   *
   * Example:
   * - Title: Book Name
   * - ISBN: 978...
   *
   * If options.live is true, the value cell becomes a polite live region.
   * This is used for dynamically updated library availability.
   */
  function createMetaLine(label, value, extraClass = "", options = {}) {
    const row = document.createElement("div");
    row.className = `${CLASSES.metaLine}${extraClass ? ` ${extraClass}` : ""}`;

    const term = document.createElement("dt");
    term.textContent = label;

    const description = document.createElement("dd");
    description.textContent = value || "Not found";

    if (options.live) {
      description.setAttribute("aria-live", "polite");
      description.setAttribute("aria-atomic", "true");
    }

    row.appendChild(term);
    row.appendChild(description);

    return row;
  }

  /**
   * Clean author text extracted from the bookstore page.
   *
   * Example:
   * - "By Shakespeare, William" -> "Shakespeare, William"
   */
  function cleanAuthor(authorText) {
    return normalizeText(authorText).replace(/^By\s+/i, "");
  }

  /**
   * Extract a named attribute value from a bookstore book block.
   *
   * Example supported label lookups:
   * - Edition
   * - Publisher
   * - ISBN 13
   */
  function getAttributeValue(bookBlock, labelText) {
    const rows = bookBlock.querySelectorAll(SELECTORS.attributeRow);

    for (const row of rows) {
      const label = normalizeText(
        row.querySelector(SELECTORS.attributeTitle)?.textContent || ""
      );
      const value = normalizeText(
        row.querySelector(SELECTORS.attributeValue)?.textContent || ""
      );

      if (label.toLowerCase().includes(labelText.toLowerCase())) {
        return value;
      }
    }

    return "";
  }

  /**
   * Extract all relevant metadata for a single bookstore book block.
   *
   * This is the canonical normalization step before building UI or SRU lookups.
   */
  function extractBookData(bookBlock) {
    const title = normalizeText(
      bookBlock.querySelector(SELECTORS.titleText)?.textContent || ""
    );

    const author = cleanAuthor(
      bookBlock.querySelector(SELECTORS.author)?.textContent || ""
    );

    const edition = getAttributeValue(bookBlock, "Edition");
    const publisher = getAttributeValue(bookBlock, "Publisher");
    const isbn = normalizeIsbn(getAttributeValue(bookBlock, "ISBN 13"));

    return {
      title,
      author,
      edition,
      publisher,
      isbn
    };
  }

  /**
   * Determine whether a DOM block appears to represent a real, processable book.
   *
   * Why we filter:
   * - avoid hidden elements
   * - avoid malformed fragments
   * - avoid processing the same block multiple times
   */
  function isEligibleBookBlock(bookBlock, { skipProcessed = false } = {}) {
    if (!(bookBlock instanceof HTMLElement)) return false;
    if (!isVisible(bookBlock)) return false;
    if (skipProcessed && bookBlock.hasAttribute(CLASSES.processed)) return false;

    const titleNode = bookBlock.querySelector(SELECTORS.titleText);
    const attributesWrap = bookBlock.querySelector(SELECTORS.attributesWrap);
    const isbn = getAttributeValue(bookBlock, "ISBN 13");

    if (!titleNode || !attributesWrap) return false;
    if (!normalizeText(titleNode.textContent || "")) return false;
    if (!normalizeText(isbn)) return false;

    return true;
  }

  /**
   * Get all qualifying book blocks from the page.
   *
   * Optional behavior:
   * - skipProcessed: only return blocks we have not injected into yet
   */
  function getBookBlocks({ skipProcessed = false } = {}) {
    return Array.from(document.querySelectorAll(SELECTORS.bookBlock)).filter(block =>
      isEligibleBookBlock(block, { skipProcessed })
    );
  }

  /**
   * Extract all normalized books from the page.
   *
   * Used primarily for:
   * - top summary panel
   * - bulk actions
   */
  function getAllBooks() {
    return getBookBlocks()
      .map(block => ({
        ...extractBookData(block),
        block
      }))
      .filter(book => book.title && book.isbn);
  }

  /**
   * Build a stable cache key for SRU lookups.
   *
   * Prefer ISBN because that is our primary SRU lookup key.
   * If ISBN is unavailable, fallback to title|author.
   */
  function getBookCacheKey(book) {
    const cleanIsbn = normalizeIsbn(book.isbn);
    if (cleanIsbn) return cleanIsbn;
    return `${normalizeText(book.title).toLowerCase()}|${normalizeText(book.author).toLowerCase()}`;
  }

  /**
   * Fetch library availability from Alma SRU using ISBN.
   *
   * SRU logic:
   * - query alma.isbn="{isbn}"
   * - parse returned MARCXML
   * - inspect AVA fields
   * - if any subfield code="e" is "available", treat the item as available
   * - inspect the MARC 001 field for the Alma MMS ID
   *
   * Returned result object:
   * {
   *   status,
   *   mmsId,
   *   recordUrl
   * }
   *
   * Notes:
   * - This uses caching to avoid duplicate requests.
   * - This function returns a Promise<object>.
   */
  async function fetchLibraryAvailability(book) {
    const key = getBookCacheKey(book);

    if (sruCache.has(key)) {
      return sruCache.get(key);
    }

    const promise = (async () => {
      try {
        if (!normalizeText(book.isbn)) {
          debugLog("No ISBN available for SRU lookup:", book);
          return {
            status: LIBRARY_STATUS.NO_MATCH,
            mmsId: null,
            recordUrl: null
          };
        }

        const url = buildSruIsbnUrl(book.isbn);
        const response = await fetch(url);

        debugLog("SRU response status:", response.status, "ISBN:", book.isbn);

        if (!response.ok) {
          throw new Error(`SRU request failed: ${response.status}`);
        }

        const xmlText = await response.text();
        debugLog("SRU response preview:", xmlText.slice(0, 500));

        const xml = new DOMParser().parseFromString(xmlText, "text/xml");

        const parserError = xml.querySelector("parsererror");
        if (parserError) {
          throw new Error("Failed to parse SRU XML response");
        }

        /**
         * Alma SRU may include diagnostics for malformed queries or other issues.
         * This is useful for debugging but does not necessarily mean fatal failure.
         */
        const diagnostics = xml.querySelector("diagnostics diagnostic message");
        if (diagnostics) {
          debugLog("SRU diagnostic:", diagnostics.textContent);
        }

        const numberOfRecordsNode = xml.querySelector("numberOfRecords");
        const numberOfRecords = Number(numberOfRecordsNode?.textContent || "0");

        debugLog("SRU numberOfRecords:", numberOfRecords, "ISBN:", book.isbn);

        if (!numberOfRecords) {
          return {
            status: LIBRARY_STATUS.NO_MATCH,
            mmsId: null,
            recordUrl: null
          };
        }

        const mmsId = normalizeText(
          Array.from(xml.getElementsByTagName("controlfield"))
            .find(node => node.getAttribute("tag") === "001")
            ?.textContent || ""
        );

        /**
         * Availability rule:
         * Search all AVA fields and inspect subfield code="e".
         *
         * Example value:
         *   <subfield code="e">available</subfield>
         */
        const availabilityValues = Array.from(
          xml.querySelectorAll('datafield[tag="AVA"] > subfield[code="e"]')
        ).map(node => normalizeText(node.textContent).toLowerCase());

        debugLog("SRU AVA subfield e values:", availabilityValues, "ISBN:", book.isbn);
        debugLog("SRU MMS ID:", mmsId, "ISBN:", book.isbn);

        if (availabilityValues.some(value => value === "available")) {
          return {
            status: LIBRARY_STATUS.AVAILABLE,
            mmsId: mmsId || null,
            recordUrl: mmsId ? buildPrimoRecordUrl(mmsId) : null
          };
        }

        return {
          status: LIBRARY_STATUS.NOT_AVAILABLE,
          mmsId: mmsId || null,
          recordUrl: mmsId ? buildPrimoRecordUrl(mmsId) : null
        };
      } catch (error) {
        console.error("[UMCP Library Checker] Library availability lookup failed:", error, book);
        return {
          status: LIBRARY_STATUS.FAILED,
          mmsId: null,
          recordUrl: null
        };
      }
    })();

    sruCache.set(key, promise);
    return promise;
  }

  /**
   * Render the availability field.
   *
   * If the book is available and a Primo record URL exists,
   * render "Available" as a link.
   * Otherwise render plain status text.
   */
  function setAvailabilityContent(container, result) {
    if (!container) return;

    container.innerHTML = "";
    container.classList.add(CLASSES.availabilityText);

    if (result.status === LIBRARY_STATUS.AVAILABLE && result.recordUrl) {
      const link = createLink(
      LIBRARY_STATUS.AVAILABLE,
      result.recordUrl,
      `${CLASSES.availabilityLink} ${CLASSES.availabilityText}`
      );
      container.appendChild(link);
      return;
    }

    container.textContent = result.status;
  }

  function createSearchLabel() {
    const label = document.createElement("div");
    label.className = CLASSES.searchLabel;
    label.textContent = "Search UMD Discover";
    return label;
  }

  /**
   * Inject the per-book library panel below the bookstore metadata block.
   *
   * This panel shows:
   * - normalized bibliographic metadata
   * - live-updating library availability
   * - links to Top Textbooks and General Search
   */
  function injectBookPanel(bookBlock, book) {
    if (bookBlock.querySelector(`.${CLASSES.bookPanel}`)) return;

    const panel = document.createElement("section");
    panel.className = CLASSES.bookPanel;
    panel.setAttribute("role", "region");

    /**
     * Use a unique heading id so screen readers can associate the region label.
     */
    const panelTitleId = `umcp-library-book-panel-title-${book.isbn || Math.random().toString(36).slice(2)}`;
    panel.setAttribute("aria-labelledby", panelTitleId);

    /**
     * The panel starts in a busy/loading state until SRU availability resolves.
     */
    panel.setAttribute("aria-busy", "true");

    const heading = document.createElement("h3");
    heading.className = CLASSES.bookPanelTitle;
    heading.id = panelTitleId;
    heading.textContent = "Library Search";
    panel.appendChild(heading);

    const metaList = createMetaList();

    metaList.appendChild(createMetaLine("Title", book.title));
    metaList.appendChild(createMetaLine("Author", book.author || "Not found"));
    metaList.appendChild(createMetaLine("Edition", book.edition || "Not found"));
    metaList.appendChild(createMetaLine("Publisher", book.publisher || "Not found"));
    metaList.appendChild(createMetaLine("ISBN", book.isbn || "Not found"));

    /**
     * Library availability is a live region because it changes asynchronously.
     */
    panel.appendChild(metaList);

    const availabilityLine = createMetaLine(
      "Library Availability",
      LIBRARY_STATUS.CHECKING,
      `${CLASSES.availabilityValue} ${CLASSES.availabilityBlock}`,
      { live: true }
    );

    const availabilityLabel = availabilityLine.querySelector("dt");
      if (availabilityLabel) {
        availabilityLabel.classList.add(CLASSES.availabilityLabel);
      }

    const availabilityValueNode = availabilityLine.querySelector("dd");
      if (availabilityValueNode) {
        availabilityValueNode.classList.add(CLASSES.availabilityText);
      }

    panel.appendChild(availabilityLine);

    const links = document.createElement("div");
    links.className = CLASSES.linksWrap;
    links.setAttribute("aria-label", "Library search links");

    if (book.isbn) {
      links.appendChild(
       createLink(
        "Top Textbooks (ISBN)",
        buildTopTextbookIsbnUrl(book.isbn),
        CLASSES.link,
        { title: TOP_TEXTBOOKS_TOOLTIP }
)
      );
    }

    if (book.title || book.author) {
      links.appendChild(
        createLink(
          "Top Textbooks (Title/Author)",
          buildTopTextbookTitleAuthorUrl(book.title, book.author),
          CLASSES.link,
          { title: TOP_TEXTBOOKS_TOOLTIP }
        )
      );

      links.appendChild(
        createLink(
          "General Search",
          buildGeneralUrl(book.title, book.author)
        )
      );
    }
    panel.appendChild(createSearchLabel());
    panel.appendChild(links);

    /**
     * Insert panel directly after the bookstore attribute area, which is the most
     * natural place visually and contextually.
     */
    const target = bookBlock.querySelector(SELECTORS.attributesWrap) || bookBlock;
    target.insertAdjacentElement("afterend", panel);

    /**
     * Mark this book block as processed to avoid duplicate injections
     * when the page rerenders or the MutationObserver fires again.
     */
    bookBlock.setAttribute(CLASSES.processed, "true");

    updateBookPanelAvailability(panel, book);
  }

  /**
   * Resolve and update the per-book panel's library availability text.
   */
  async function updateBookPanelAvailability(panel, book) {
    const availabilityNode = panel.querySelector(`.${CLASSES.availabilityValue} dd`);
    if (!availabilityNode) return;

    availabilityNode.textContent = LIBRARY_STATUS.CHECKING;

    const result = await fetchLibraryAvailability(book);

    setAvailabilityContent(availabilityNode, result);
    panel.setAttribute("aria-busy", "false");

    announceMessage(`Library availability updated for ${book.title}: ${result.status}`);
  }

  /**
   * Get the top-level BNCollege course materials container.
   *
   * The top toolbar is injected into this container.
   */
  function getMainContainer() {
    return document.querySelector(SELECTORS.mainContainer);
  }

  /**
   * Remove the extracted books summary panel, if it exists.
   *
   * The announce option exists so we can avoid duplicate announcements when
   * re-rendering the panel internally.
   */
  function removeSummaryPanel({ announce = true } = {}) {
    const panel = document.querySelector(`.${CLASSES.summaryPanel}`);
    if (panel) {
      panel.remove();
      if (announce) {
        announceMessage("Extracted books list hidden.");
      }
    }
  }

  /**
   * Create one item in the extracted books summary list.
   *
   * Accessibility:
   * - uses <li> inside an ordered list
   * - uses <h3> heading for item title
   * - uses <dl> for metadata
   * - uses aria-busy while async availability loads
   */
  function createSummaryItem(book, index) {
    const item = document.createElement("li");
    item.className = CLASSES.summaryItem;
    item.setAttribute("aria-busy", "true");

    const itemTitle = document.createElement("h3");
    itemTitle.className = CLASSES.summaryItemTitle;
    itemTitle.textContent = `${index + 1}. ${book.title}`;

    const metaList = createMetaList();
    metaList.classList.add(CLASSES.summaryItemMeta);

    metaList.appendChild(createMetaLine("Author", book.author || "Not found"));
    metaList.appendChild(createMetaLine("Edition", book.edition || "Not found"));
    metaList.appendChild(createMetaLine("Publisher", book.publisher || "Not found"));
    metaList.appendChild(createMetaLine("ISBN", book.isbn || "Not found"));

    const availabilityLine = createMetaLine(
      "Library Availability",
      LIBRARY_STATUS.CHECKING,
      `${CLASSES.availabilityValue} ${CLASSES.availabilityBlock}`,
      { live: true }
    );

    const availabilityLabel = availabilityLine.querySelector("dt");
      if (availabilityLabel) {
        availabilityLabel.classList.add(CLASSES.availabilityLabel);
      }

    const availabilityValueNode = availabilityLine.querySelector("dd");
      if (availabilityValueNode) {
        availabilityValueNode.classList.add(CLASSES.availabilityText);
      }

    metaList.appendChild(availabilityLine);

    const links = document.createElement("div");
    links.className = CLASSES.summaryLinks;
    links.setAttribute("aria-label", `Search links for ${book.title}`);

    if (book.isbn) {
      links.appendChild(
        createLink(
          "Top Textbooks (ISBN)",
          buildTopTextbookIsbnUrl(book.isbn),
          CLASSES.summaryLink,
          { title: TOP_TEXTBOOKS_TOOLTIP }
        )
      );
    }

    if (book.title || book.author) {
      links.appendChild(
        createLink(
          "Top Textbooks (Title/Author)",
          buildTopTextbookTitleAuthorUrl(book.title, book.author),
          CLASSES.summaryLink,
          { title: TOP_TEXTBOOKS_TOOLTIP }
        )
      );

      links.appendChild(
        createLink(
          "General Search",
          buildGeneralUrl(book.title, book.author),
          CLASSES.summaryLink
        )
      );
    }

    item.appendChild(itemTitle);
    item.appendChild(metaList);
    item.appendChild(createSearchLabel());
    item.appendChild(links);

    updateSummaryItemAvailability(item, availabilityLine.querySelector("dd"), book);

    return item;
  }

  /**
   * Resolve and update the summary item's availability text.
   */
  async function updateSummaryItemAvailability(item, node, book) {
    if (!node) return;

    node.textContent = LIBRARY_STATUS.CHECKING;

    const result = await fetchLibraryAvailability(book);

    setAvailabilityContent(node, result);
    item.setAttribute("aria-busy", "false");
  }

  /**
   * Render the extracted books summary panel below the top toolbar.
   *
   * This panel shows all detected books on the page in a compact list view.
   */
  function renderSummaryPanel() {
    /**
     * Remove any existing panel before re-rendering.
     * Suppress announcement so we do not announce "hidden" and "shown" back-to-back.
     */
    removeSummaryPanel({ announce: false });

    const toolbar = document.querySelector(`.${CLASSES.toolbar}`);
    if (!toolbar) return;

    const books = getAllBooks();

    const panel = document.createElement("section");
    panel.className = CLASSES.summaryPanel;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", IDS.summaryTitle);

    const header = document.createElement("div");
    header.className = CLASSES.summaryHeader;

    const title = document.createElement("h2");
    title.className = CLASSES.summaryTitle;
    title.id = IDS.summaryTitle;
    title.textContent = `Library Book List (${books.length})`;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = CLASSES.summaryClose;
    closeButton.textContent = "Hide extracted books";
    closeButton.setAttribute("aria-label", "Hide extracted books list");
    closeButton.addEventListener("click", () => removeSummaryPanel());

    header.appendChild(title);
    header.appendChild(closeButton);
    panel.appendChild(header);

    if (!books.length) {
      const empty = document.createElement("p");
      empty.className = CLASSES.summaryEmpty;
      empty.textContent = "No books were detected on this page.";
      panel.appendChild(empty);
      toolbar.insertAdjacentElement("afterend", panel);
      announceMessage("No extracted books were detected on this page.");
      return;
    }

    /**
     * Use an ordered list because we explicitly number the books.
     */
    const list = document.createElement("ol");
    list.className = CLASSES.summaryList;

    books.forEach((book, index) => {
      list.appendChild(createSummaryItem(book, index));
    });

    panel.appendChild(list);
    toolbar.insertAdjacentElement("afterend", panel);

    announceMessage(`Extracted books list shown. ${books.length} books found.`);
  }

  /**
   * Open a set of URLs in new tabs with a small delay between each.
   *
   * Why the delay exists:
   * - reduces the chance of browser popup blocking
   * - avoids opening many tabs simultaneously
   */
  function openUrls(urls) {
    urls.forEach((url, index) => {
      setTimeout(() => {
        window.open(url, "_blank", "noopener,noreferrer");
      }, index * 250);
    });
  }

  /**
   * Inject the top-of-page Library Tools toolbar.
   *
   * This toolbar is intentionally simple and does not alter the page layout
   * beyond inserting a block at the top of the main bookstore container.
   */
  function injectToolbar() {
    if (document.querySelector(`.${CLASSES.toolbar}`)) return;

    const mainContainer = getMainContainer();
    if (!mainContainer) return;

    const toolbar = document.createElement("section");
    toolbar.className = CLASSES.toolbar;
    toolbar.setAttribute("role", "region");
    toolbar.setAttribute("aria-labelledby", IDS.toolbarTitle);

    const title = document.createElement("h2");
    title.className = CLASSES.toolbarTitle;
    title.id = IDS.toolbarTitle;
    title.textContent = "Library Tools";

    const actions = document.createElement("div");
    actions.className = CLASSES.toolbarActions;
    actions.setAttribute("aria-label", "Library tools actions");

    const showButton = document.createElement("button");
    showButton.type = "button";
    showButton.className = CLASSES.toolbarButton;
    showButton.textContent = "Show extracted books";
    showButton.setAttribute("aria-label", "Show extracted books list");
    showButton.addEventListener("click", renderSummaryPanel);

    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.className = `${CLASSES.toolbarButton} ${CLASSES.toolbarButtonSecondary}`;
    hideButton.textContent = "Hide extracted books";
    hideButton.setAttribute("aria-label", "Hide extracted books list");
    hideButton.addEventListener("click", () => removeSummaryPanel());

    actions.appendChild(showButton);
    actions.appendChild(hideButton);

    toolbar.appendChild(title);
    toolbar.appendChild(actions);

    mainContainer.insertAdjacentElement("afterbegin", toolbar);
  }

  /**
   * Main processing function.
   *
   * Responsibilities:
   * - find unprocessed bookstore books
   * - extract metadata
   * - inject per-book library panels
   * - ensure the top toolbar exists
   * - ensure the global live region exists
   */
  function processPage() {
    const unprocessedBookBlocks = getBookBlocks({ skipProcessed: true });

    debugLog("Unprocessed valid book blocks found:", unprocessedBookBlocks.length);

    unprocessedBookBlocks.forEach((block, index) => {
      const book = extractBookData(block);
      debugLog(`Book ${index + 1}:`, book);

      if (book.title && book.isbn) {
        injectBookPanel(block, book);
      }
    });

    injectToolbar();
    ensureGlobalLiveRegion();
  }

  /**
   * Debounce timer used when the page DOM changes rapidly.
   *
   * The bookstore page can rerender dynamically, so we avoid reprocessing
   * immediately on every mutation.
   */
  let processTimer = null;

  /**
   * Schedule a delayed page processing pass.
   */
  function scheduleProcess() {
    if (processTimer) {
      clearTimeout(processTimer);
    }

    processTimer = setTimeout(processPage, 300);
  }

  /**
   * Observe page mutations because the bookstore page is dynamic and may:
   * - rerender books after initial load
   * - lazy-load content
   * - replace sections after user interaction
   */
  const observer = new MutationObserver(() => {
    scheduleProcess();
  });

  /**
   * Initialize the extension content script.
   *
   * We process immediately, then observe the page for changes, and also run
   * a few delayed passes to catch late-rendered content.
   */
  function init() {
    processPage();

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener("load", scheduleProcess);

    /**
     * Extra delayed passes are intentionally included because some bookstore
     * content appears after the initial DOM becomes available.
     */
    setTimeout(processPage, 1000);
    setTimeout(processPage, 2500);
  }

  init();
})();