(() => {
  "use strict";

  // The extension uses a direct proxied-host pattern instead of the generic login route.
  // This matches the working bookmarklet flow and avoids landing on the proxy menu page.
  const PROXY_BASE_URL = "https://proxy-um.researchport.umd.edu/login?url=";
  const CONTAINER_ID = "umcp-library-inline-tools";
  const SKIP_STORAGE_KEY = "umcp-library-skip-hosts";
  const PROXY_TARGET_STORAGE_KEY = "umcp-library-proxy-last-target";
  const PROXY_SUCCESS_STORAGE_KEY = "umcp-library-proxy-success";

  // Centralized configuration for the scholarly detection rules and button variants.
  const TOOLBAR_CONFIG = {
    ignoredHostnames: [
      "google.com",
      "googleusercontent.com",
      "scholar.google.com",
      "www.google.com",
      "www.amazon.com",
      "amazon.com",
      "umcp.bncollege.com",
      "facebook.com",
      "twitter.com",
      "x.com",
      "youtube.com",
      "github.com",
      "docs.google.com"
    ],
    excludedHostPatterns: [
      /(^|\.)umd\.edu$/i,
      /(^|\.)library\.umd\.edu$/i,
      /(^|\.)lib\.umd\.edu$/i,
      /(^|\.)libanswers\.com$/i,
      /(^|\.)umaryland\.edu$/i,
      /(^|\.)maryland\.edu$/i,
      /(^|\.)libraries?\./i,
      /(^|\.)news\./i,
      /(^|\.)calendar\./i,
      /(^|\.)directory\./i,
      /(^|\.)events\./i,
      /(^|\.)search\./i,
      /(^|\.)catalog\./i
    ],
    scholarlyPathHints: [
      "/doi/",
      "/article/",
      "/articles/",
      "/fulltext",
      "/pdf",
      "/journals/",
      "/journal/",
      "/issue/",
      "/issues/",
      "/abstract",
      "/papers/",
      "/research/",
      "/stable/",
      "doi.org",
      "citation"
    ],
    scholarlyHostHints: [
      /(^|\.)jstor\.org$/i,
      /(^|\.)projectmuse\.org$/i,
      /(^|\.)muse\.jhu\.edu$/i,
      /(^|\.)ingentaconnect\.com$/i,
      /(^|\.)sciencedirect\.com$/i,
      /(^|\.)springerlink\.com$/i,
      /(^|\.)wiley\.com$/i
    ],
    paywallSignals: [
      "paywall",
      "subscription required",
      "sign in to continue",
      "access provided by",
      "premium content",
      "subscribe to view",
      "institutional access",
      "login to read",
      "full text pdf",
      "read article",
      "author manuscript",
      "journal",
      "abstract",
      "access denied",
      "download pdf"
    ]
  };

  // Reuse the centralized config so the detection behavior stays easy to tune.
  const EXCLUDED_HOST_PATTERNS = TOOLBAR_CONFIG.excludedHostPatterns;
  const IGNORE_HOSTNAMES = TOOLBAR_CONFIG.ignoredHostnames;

  // Theme keys map to the CSS classes used by the floating toolbar buttons.
  const BUTTON_THEMES = {
    proxy: "umcp-library-toolbar-button--proxy",
    search: "umcp-library-toolbar-button--search",
    help: "umcp-library-toolbar-button--help",
    skip: "umcp-library-toolbar-button--skip"
  };
  const DEBUG_MODE = false;
  const DEBUG_BOX_ID = "umcp-library-proxy-debug-box";

  function isProxyHost(hostname) {
    return typeof hostname === "string" && /(?:^|\.)proxy-um\.researchport\.umd\.edu$/i.test(hostname);
  }

  function isCurrentPageOnProxyHost() {
    try {
      return isProxyHost(window.location.hostname);
    } catch (error) {
      return false;
    }
  }

  function getProxyTargetFromCurrentUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
      return "";
    }

    try {
      const parsed = new URL(url);
      if (!isProxyHost(parsed.hostname)) {
        return "";
      }

      const params = ["url", "qurl", "target", "redirect"];
      for (const key of params) {
        const candidate = parsed.searchParams.get(key);
        if (candidate && /^https?:\/\//i.test(candidate)) {
          return candidate;
        }
      }
    } catch (error) {
      // Ignore malformed proxy URLs; they are not valid targets.
    }

    return "";
  }

  function debugProxyFlow(stage, payload) {
    if (!DEBUG_MODE) return;
    console.info("[UMD proxy]", stage, payload);
  }

  function getStoredProxyTargetSync() {
    try {
      const rawValue = window.sessionStorage.getItem(PROXY_TARGET_STORAGE_KEY);
      if (!rawValue) {
        return "";
      }

      const parsed = JSON.parse(rawValue);
      return typeof parsed === "string" && /^https?:\/\//i.test(parsed) ? parsed : "";
    } catch (error) {
      return "";
    }
  }

  function readStoredProxyTargetFromStorage(callback) {
    const fallbackValue = getStoredProxyTargetSync();
    debugProxyFlow("storage lookup start", { fallbackValue, hasChromeStorage: Boolean(chrome && chrome.storage && chrome.storage.local) });

    if (!chrome || !chrome.storage || !chrome.storage.local) {
      callback(fallbackValue);
      return;
    }

    chrome.storage.local.get([PROXY_TARGET_STORAGE_KEY], (items) => {
      const storedValue = items && items[PROXY_TARGET_STORAGE_KEY];
      const resolvedValue = typeof storedValue === "string" && /^https?:\/\//i.test(storedValue)
        ? storedValue
        : fallbackValue;

      debugProxyFlow("storage lookup complete", {
        fallbackValue,
        rawStoredValue: storedValue,
        resolvedValue
      });
      callback(resolvedValue);
    });
  }

  function getStoredProxyTarget() {
    return getStoredProxyTargetSync();
  }

  function getProxySuccessState() {
    if (isCurrentPageOnProxyHost()) {
      return true;
    }

    try {
      const rawValue = window.localStorage.getItem(PROXY_SUCCESS_STORAGE_KEY);
      return rawValue === "true";
    } catch (error) {
      return false;
    }
  }

  function setProxySuccessState(success) {
    try {
      window.localStorage.setItem(PROXY_SUCCESS_STORAGE_KEY, success ? "true" : "false");
    } catch (error) {
      // Ignore storage failures during navigation events.
    }

    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [PROXY_SUCCESS_STORAGE_KEY]: success ? "true" : "false" });
      }
    } catch (error) {
      // Ignore invalidated extension context issues.
    }
  }

  function setStoredProxyTarget(url) {
    try {
      if (!url || !/^https?:\/\//i.test(url)) {
        return;
      }
      window.sessionStorage.setItem(PROXY_TARGET_STORAGE_KEY, JSON.stringify(url));
    } catch (error) {
      // Ignore storage failures; the proxy still works without this fallback.
    }

    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [PROXY_TARGET_STORAGE_KEY]: url });
      }
    } catch (error) {
      console.warn("[UMD proxy] storage write skipped because the extension context was invalidated.", error);
    }
  }

  function getProxyReferrerTarget() {
    try {
      const referrer = document.referrer;
      if (!referrer) {
        return "";
      }

      const parsed = new URL(referrer);
      if (!isProxyHost(parsed.hostname) && /^https?:\/\//i.test(referrer)) {
        return parsed.toString();
      }
    } catch (error) {
      // Ignore invalid referrers; falling back to the stored target is safer than proxying the menu.
    }
    return "";
  }

  function getCanonicalPageUrl() {
    const canonicalLink = document.querySelector('link[rel="canonical"][href]');
    if (canonicalLink && canonicalLink.href) {
      try {
        return new URL(canonicalLink.href, window.location.href).toString();
      } catch (error) {
        return window.location.href;
      }
    }
    return window.location.href;
  }

  function getPageTargetUrl() {
    return getCanonicalPageUrl() || window.location.href;
  }

  function showProxyDebugMessages(payload) {
    if (!DEBUG_MODE) return;

    let box = document.getElementById(DEBUG_BOX_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = DEBUG_BOX_ID;
      Object.assign(box.style, {
        position: "fixed",
        left: "18px",
        top: "18px",
        zIndex: "2147483647",
        maxWidth: "420px",
        background: "rgba(0, 0, 0, 0.84)",
        color: "#ffffff",
        border: "1px solid #ffd200",
        borderRadius: "10px",
        padding: "10px 12px",
        font: "12px/1.45 Arial, sans-serif",
        boxShadow: "0 10px 24px rgba(0,0,0,0.2)",
        pointerEvents: "none"
      });
      const root = document.body || document.documentElement;
      if (root) {
        root.appendChild(box);
      }
    }

    const messages = [
      `Page URL: ${payload.href}`,
      `Canonical URL: ${payload.canonicalUrl}`,
      `Final proxy target: ${payload.finalUrl}`
    ];

    box.innerHTML = messages
      .map((message) => `<div>${message}</div>`)
      .join("");
  }

  function logProxyState(label, payload) {
    if (!DEBUG_MODE) return;
    console.info(`[UMD proxy] ${label}`, payload);
  }

  function resolveProxyTargetUrl() {
    const href = window.location.href;
    const storedTarget = getStoredProxyTargetSync();
    const proxyTargetFromCurrentUrl = getProxyTargetFromCurrentUrl(href);
    const proxyReferrerTarget = getProxyReferrerTarget();

    if (isProxyHost(window.location.hostname)) {
      debugProxyFlow("proxy host detected", {
        href,
        storedTarget,
        proxyTargetFromCurrentUrl,
        proxyReferrerTarget,
        searchParams: new URL(href).searchParams.toString()
      });

      const fallbackTarget = proxyTargetFromCurrentUrl || storedTarget || proxyReferrerTarget || href;
      console.info("[UMD proxy] on proxy auth host; leaving the auth flow in place and not redirecting away:", fallbackTarget);
      return fallbackTarget;
    }

    const canonicalUrl = getPageTargetUrl();
    const finalUrl = canonicalUrl || href;
    setStoredProxyTarget(finalUrl);

    const payload = { href, canonicalUrl, finalUrl };

    logProxyState("script loaded", { host: window.location.host, url: window.location.href });
    logProxyState("active", { target: finalUrl });
    logProxyState("proxy success state", { state: "pending" });
    console.info("[UMCP Proxy Debug] page href:", payload.href);
    console.info("[UMCP Proxy Debug] canonical url:", payload.canonicalUrl);
    console.info("[UMCP Proxy Debug] final proxy target:", payload.finalUrl);
    showProxyDebugMessages(payload);

    return finalUrl;
  }

  // Keep the toolbar visuals in one injected stylesheet so the JS stays focused on behavior.
  const TOOLBAR_STYLES = `
    #umcp-library-inline-tools,
    #umcp-library-toolbar-show-button,
    .umcp-library-toolbar-button,
    .umcp-library-search-form,
    .umcp-library-search-input,
    .umcp-library-search-submit {
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }

    .umcp-library-toolbar-button {
      border-radius: 999px;
      padding: 10px 14px;
      font: 600 13px/1 Arial, sans-serif;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      outline: none;
      border: 1px solid transparent;
    }

    .umcp-library-toolbar-button:focus-visible {
      outline: 3px solid #003a8c;
      outline-offset: 2px;
      box-shadow: 0 0 0 2px rgba(255, 210, 0, 0.45);
    }

    .umcp-library-toolbar-button--proxy {
      background: #e21833;
      color: #ffffff;
      border-color: #e21833;
    }

    .umcp-library-toolbar-button--proxy:hover {
      background: #b6122a;
      color: #ffffff;
    }

    .umcp-library-toolbar-button--search {
      background: #ffffff;
      color: #000000;
      border-color: #e21833;
    }

    .umcp-library-toolbar-button--search:hover {
      background: #fff7c7;
      color: #000000;
    }

    .umcp-library-toolbar-button--help {
      background: #ffd200;
      color: #000000;
      border-color: #ad7231;
    }

    .umcp-library-toolbar-button--help:hover {
      background: #f2c900;
      color: #000000;
    }

    .umcp-library-toolbar-button--skip {
      background: #ffffff;
      color: #000000;
      border-color: #d0d7de;
    }

    .umcp-library-toolbar-button--skip:hover {
      background: #f3f4f6;
      color: #000000;
    }

    .umcp-library-search-form {
      display: flex;
      gap: 6px;
      align-items: center;
      background: #ffffff;
      border: 1px solid #ffd200;
      border-radius: 999px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
      padding: 4px 6px 4px 10px;
    }

    .umcp-library-search-input {
      border: none;
      outline: none;
      font: 13px/1 Arial, sans-serif;
      width: 200px;
      padding: 8px 0;
      color: #000000;
      background: transparent;
    }

    .umcp-library-search-submit {
      border: 1px solid #e21833;
      background: #ffd200;
      color: #000000;
      border-radius: 999px;
      padding: 8px 12px;
      font: 600 12px/1 Arial, sans-serif;
      cursor: pointer;
    }
  `;

  function buildProxyUrl(url) {
    if (!url) return "";

    try {
      const parsed = new URL(url);
      const proxyHostname = parsed.hostname.replace(/\./g, "-") + ".proxy-um.researchport.umd.edu";
      return `https://${proxyHostname}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (error) {
      return `${PROXY_BASE_URL}${encodeURIComponent(url)}`;
    }
  }

  function isAlreadyProxied(url) {
    if (typeof url !== "string") {
      return false;
    }

    try {
      const parsed = new URL(url);
      if (isProxyHost(parsed.hostname)) {
        return true;
      }
    } catch (error) {
      // Ignore malformed URLs.
    }

    return url.includes("proxy-um.researchport.umd.edu/login?url=") ||
      url.includes("proxy-um.researchport.umd.edu/login?qurl=") ||
      url.includes("proxy-um.researchport.umd.edu/menu") ||
      /(?:^|\.)[a-z0-9-]+\.proxy-um\.researchport\.umd\.edu$/i.test(url);
  }

  // Persist host exclusions so the toolbar can be hidden on pages where the
  // scholarly heuristic is too aggressive or simply not useful.
  function readSkippedHosts() {
    return [];
  }

  function writeSkippedHosts(hosts) {
    // Do not persist hide decisions across revisits. The toolbar should remain visible
    // whenever the user lands on a scholarly page again.
  }

  function shouldSkipToolbarForCurrentPage() {
    return false;
  }

  function hostnameMatches(hostname, candidate) {
    return hostname === candidate || hostname.endsWith(`.${candidate}`);
  }

  function isLikelyScholarlyPage() {
    const hostname = window.location.hostname.toLowerCase();
    const url = window.location.href.toLowerCase();

    if (isProxyHost(hostname)) {
      return true;
    }

    if (IGNORE_HOSTNAMES.some((candidate) => hostnameMatches(hostname, candidate))) {
      return false;
    }

    if (EXCLUDED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
      return false;
    }

    const pageText = (document.body ? document.body.innerText : "") || "";
    const combinedText = `${url} ${pageText}`.toLowerCase();

    const hasStrongPathHint = TOOLBAR_CONFIG.scholarlyPathHints.some((hint) => url.includes(hint));
    const hasCitationMeta = !!document.querySelector('meta[name="citation_journal_title"], meta[name="citation_title"], meta[name="citation_doi"]');
    const hasPaywallHint = TOOLBAR_CONFIG.paywallSignals.some((signal) => combinedText.includes(signal));
    const hasArticleLanguage = /\b(?:doi|journal|article|abstract|full text|pdf|author manuscript|read online|subscribe to jpass)\b/i.test(pageText);
    const hasAcademicDomainHint = /(?:^|\.)((?:[a-z0-9-]+\.)*(?:edu|ac|gov|org))$/i.test(hostname) &&
      !/^((www\.)?google|amazon|facebook|twitter|x\.|youtube|github)\./i.test(hostname);
    const hasScholarlyHostHint = TOOLBAR_CONFIG.scholarlyHostHints.some((pattern) => pattern.test(hostname));

    if (hasStrongPathHint || hasCitationMeta || hasScholarlyHostHint) {
      return true;
    }

    return (hasPaywallHint || hasArticleLanguage) && hasAcademicDomainHint;
  }

  function ensureToolbarStyles() {
    // Inject the toolbar stylesheet once so repeated injections do not recreate it.
    if (document.getElementById("umcp-library-toolbar-styles")) return;
    const style = document.createElement("style");
    style.id = "umcp-library-toolbar-styles";
    style.textContent = TOOLBAR_STYLES;
    const parent = document.head || document.documentElement;
    parent.appendChild(style);
  }

  function createButton(label, onClick, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.classList.add("umcp-library-toolbar-button");
    if (className) {
      button.classList.add(className);
    }
    button.addEventListener("click", onClick);
    return button;
  }

  function applyButtonTheme(button, themeClass) {
    if (!button) return;
    button.classList.add(themeClass);
  }

  function setLiveAnnouncement(liveRegion, message) {
    if (!liveRegion) return;
    liveRegion.textContent = message;
  }

  function setSearchButtonState(searchButton, isOpen) {
    // Keep the toggle state in sync with the accessible expanded/collapsed state.
    if (!searchButton) return;
    searchButton.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      searchButton.setAttribute("aria-controls", "umcp-library-search-form");
      return;
    }
    searchButton.removeAttribute("aria-controls");
  }

  function getPageRoot() {
    return document.body || document.documentElement;
  }

  function appendToPageRoot(node) {
    // Centralize the final DOM insertion point so the toolbar and live region share one logic path.
    if (!node) return;
    getPageRoot().appendChild(node);
  }

  function updateProxyButtonState(button, url) {
    const hasProxySuccess = getProxySuccessState();
    const nextText = hasProxySuccess ? "Proxy successful" : isAlreadyProxied(url) ? "Already through UMD proxy" : "Open with UMD proxy";
    logProxyState("before updateProxyButtonState", { url, nextText, buttonText: button && button.textContent, hasProxySuccess });
    if (button) {
      button.textContent = nextText;
      button.disabled = hasProxySuccess;
      button.setAttribute("aria-disabled", String(hasProxySuccess));
      if (hasProxySuccess) {
        button.style.background = "#2e7d32";
        button.style.color = "#ffffff";
        button.style.borderColor = "#2e7d32";
        button.style.cursor = "default";
      } else {
        button.style.background = "";
        button.style.color = "";
        button.style.borderColor = "";
        button.style.cursor = "pointer";
      }
    }
    logProxyState("after updateProxyButtonState", { url, nextText, buttonText: button && button.textContent, hasProxySuccess });
  }

  function createToolbarContainer() {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("role", "toolbar");
    container.setAttribute("aria-label", "Library access tools");
    container.setAttribute("aria-orientation", "vertical");
    Object.assign(container.style, {
      position: "fixed",
      top: "18px",
      right: "18px",
      zIndex: "2147483647",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      alignItems: "flex-end"
    });
    return container;
  }

  function createLiveRegion() {
    const liveRegion = document.createElement("div");
    liveRegion.setAttribute("role", "status");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    Object.assign(liveRegion.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: "0"
    });
    return liveRegion;
  }

  function closeSearchPanel(container, searchButton, liveRegion) {
    const form = container ? container.querySelector(".umcp-library-search-form") : null;
    if (!form) return false;
    form.remove();
    setSearchButtonState(searchButton, false);
    setLiveAnnouncement(liveRegion, "Search panel closed.");
    searchButton.focus();
    return true;
  }

  function openSearchPanel(container, searchButton, liveRegion) {
    // Build the inline search form only when needed, then keep the focus flow accessible.
    const form = document.createElement("form");
    form.className = "umcp-library-search-form";
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", "Search UMD Discover");
    form.setAttribute("id", "umcp-library-search-form");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "umcp-library-search-input";
    input.placeholder = "Search for articles, books, or journals";
    input.setAttribute("aria-label", "Search UMD Discover for articles, books, or journals");
    input.setAttribute("autocomplete", "off");

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "umcp-library-search-submit";
    submit.textContent = "Go";
    submit.setAttribute("aria-label", "Submit UMD Discover search");

    form.appendChild(input);
    form.appendChild(submit);

    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearchPanel(container, searchButton, liveRegion);
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) return;

      const url = new URL("https://usmai-umcp.primo.exlibrisgroup.com/discovery/search");
      url.searchParams.set("vid", "01USMAI_UMCP:UMCP");
      url.searchParams.set("lang", "en");
      url.searchParams.set("query", `any,contains,${query}`);
      setLiveAnnouncement(liveRegion, "Searching UMCP Discover.");
      window.location.href = url.toString();
    });

    container.appendChild(form);
    setSearchButtonState(searchButton, true);
    setLiveAnnouncement(liveRegion, "Search panel opened.");
    input.focus();
  }

  function injectToolbar() {
    // Only attach the floating toolbar if this page matches the scholarly heuristics.
    if (document.getElementById(CONTAINER_ID)) return;
    if (!document.body && !document.documentElement) return;
    if (!isLikelyScholarlyPage()) return;

    ensureToolbarStyles();
    const container = createToolbarContainer();
    const liveRegion = createLiveRegion();

    const proxyButton = createButton(
      getProxySuccessState() ? "Proxy successful" : isAlreadyProxied(window.location.href) ? "Already through UMD proxy" : "Open with UMD proxy",
      () => {
        if (getProxySuccessState()) {
          return;
        }
        const currentUrl = resolveProxyTargetUrl();
        if (isAlreadyProxied(currentUrl)) return;
        const proxiedUrl = buildProxyUrl(currentUrl);
        setStoredProxyTarget(currentUrl);
        setProxySuccessState(false);
        logProxyState("proxy click handler", { target: currentUrl, proxiedUrl });
        console.info("[UMD proxy] click handler target:", currentUrl);
        console.info("[UMD proxy] click handler proxied URL:", proxiedUrl);
        window.location.href = proxiedUrl;
      },
      "umcp-library-toolbar-button"
    );

    updateProxyButtonState(proxyButton, window.location.href);
    applyButtonTheme(proxyButton, BUTTON_THEMES.proxy);

    const searchButton = createButton("Search UMD Discover", () => {
      const existingForm = container.querySelector(".umcp-library-search-form");
      if (existingForm) {
        closeSearchPanel(container, searchButton, liveRegion);
        return;
      }

      openSearchPanel(container, searchButton, liveRegion);
    }, "umcp-library-toolbar-button");

    searchButton.setAttribute("aria-expanded", "false");
    searchButton.setAttribute("aria-haspopup", "dialog");
    searchButton.removeAttribute("aria-controls");
    applyButtonTheme(searchButton, BUTTON_THEMES.search);

    const helpButton = createButton("Get Research Help", () => {
      setLiveAnnouncement(liveRegion, "Opening the UMD research help page in a new tab.");
      window.open("https://umd.libanswers.com/", "_blank", "noopener,noreferrer");
    }, "umcp-library-toolbar-button");

    applyButtonTheme(helpButton, BUTTON_THEMES.help);

    const hostname = window.location.hostname.toLowerCase();

    const skipButton = createButton(
      "Hide toolbar on this site",
      () => {
        const restoreButton = document.getElementById("umcp-library-toolbar-show-button");
        if (restoreButton) {
          restoreButton.remove();
        }

        container.style.display = "none";
        const showButton = document.createElement("button");
        showButton.id = "umcp-library-toolbar-show-button";
        showButton.type = "button";
        showButton.textContent = "Show toolbar on this site";
        showButton.classList.add("umcp-library-toolbar-button", "umcp-library-toolbar-button--search");
        Object.assign(showButton.style, {
          position: "fixed",
          top: "18px",
          right: "18px",
          zIndex: "2147483647"
        });
        showButton.addEventListener("click", () => {
          container.style.display = "flex";
          showButton.remove();
          setLiveAnnouncement(liveRegion, "Library toolbar restored for this site.");
        });
        appendToPageRoot(showButton);
        setLiveAnnouncement(liveRegion, "Library toolbar hidden for this site.");
      },
      "umcp-library-toolbar-button"
    );

    applyButtonTheme(skipButton, BUTTON_THEMES.skip);

    container.appendChild(proxyButton);
    container.appendChild(searchButton);
    container.appendChild(helpButton);
    container.appendChild(skipButton);
    appendToPageRoot(liveRegion);
    appendToPageRoot(container);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      resolveProxyTargetUrl();
      injectToolbar();
    }, { once: true });
  } else {
    resolveProxyTargetUrl();
    injectToolbar();
  }
})();
