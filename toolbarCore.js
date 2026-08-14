(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  toolbar.TOOLBAR_CONFIG = {
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

  toolbar.BUTTON_THEMES = {
    proxy: "umcp-library-toolbar-button--proxy",
    search: "umcp-library-toolbar-button--search",
    help: "umcp-library-toolbar-button--help",
    cite: "umcp-library-toolbar-button--cite",
    integrity: "umcp-library-toolbar-button--integrity",
    skip: "umcp-library-toolbar-button--skip"
  };

  toolbar.CONTAINER_ID = "umcp-library-inline-tools";
  toolbar.DEBUG_MODE = false;

  toolbar.debugProxyFlow = function(stage, payload) {
    if (!toolbar.DEBUG_MODE) return;
    console.info("[UMD proxy]", stage, payload);
  };

  toolbar.logProxyState = function(label, payload) {
    if (!toolbar.DEBUG_MODE) return;
    console.info(`[UMD proxy] ${label}`, payload);
  };

  toolbar.cleanText = function(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  };

  toolbar.getMetaContent = function(selector) {
    const element = document.querySelector(selector);
    if (!element) return "";
    const value = element.getAttribute("content") || element.content || "";
    return toolbar.cleanText(value);
  };

  toolbar.getMetaArray = function(selector) {
    return Array.from(document.querySelectorAll(selector))
      .map((node) => (node.getAttribute("content") || node.content || node.getAttribute("value") || "").trim())
      .filter(Boolean);
  };

  toolbar.getCanonicalPageUrl = function() {
    const canonicalLink = document.querySelector('link[rel="canonical"][href]');
    if (canonicalLink && canonicalLink.href) {
      try {
        return new URL(canonicalLink.href, window.location.href).toString();
      } catch (error) {
        return window.location.href;
      }
    }
    return window.location.href;
  };

  toolbar.getPageTargetUrl = function() {
    return toolbar.getCanonicalPageUrl() || window.location.href;
  };

  toolbar.hostnameMatches = function(hostname, candidate) {
    return hostname === candidate || hostname.endsWith(`.${candidate}`);
  };

  toolbar.isProxyHost = function(hostname) {
    return typeof hostname === "string" && /(?:^|\.)proxy-um\.researchport\.umd\.edu$/i.test(hostname);
  };

  toolbar.isCurrentPageOnProxyHost = function() {
    try {
      return toolbar.isProxyHost(window.location.hostname);
    } catch (error) {
      return false;
    }
  };

  toolbar.getPageRoot = function() {
    return document.body || document.documentElement;
  };

  toolbar.appendToPageRoot = function(node) {
    if (!node) return;
    toolbar.getPageRoot().appendChild(node);
  };

  toolbar.ensureToolbarStyles = function() {
    if (document.getElementById("umcp-library-toolbar-styles")) return;
    if (!window.chrome || !window.chrome.runtime || !window.chrome.runtime.getURL) return;

    const style = document.createElement("link");
    style.id = "umcp-library-toolbar-styles";
    style.rel = "stylesheet";
    style.type = "text/css";
    style.href = window.chrome.runtime.getURL("toolbar.css");
    const parent = document.head || document.documentElement;
    parent.appendChild(style);
  };

  toolbar.createButton = function(label, onClick, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.classList.add("umcp-library-toolbar-button");
    if (className) {
      button.classList.add(className);
    }
    button.addEventListener("click", onClick);
    return button;
  };

  toolbar.applyButtonTheme = function(button, themeClass) {
    if (!button) return;
    button.classList.add(themeClass);
  };

  toolbar.setLiveAnnouncement = function(liveRegion, message) {
    if (!liveRegion) return;
    liveRegion.textContent = message;
  };

  toolbar.setSearchButtonState = function(searchButton, isOpen) {
    if (!searchButton) return;
    searchButton.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      searchButton.setAttribute("aria-controls", "umcp-library-search-form");
      return;
    }
    searchButton.removeAttribute("aria-controls");
  };

  toolbar.createToolbarContainer = function() {
    const container = document.createElement("div");
    container.id = toolbar.CONTAINER_ID;
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
      alignItems: "flex-end",
      transition: "box-shadow 0.15s ease, transform 0.15s ease"
    });

    const grabHandle = document.createElement("div");
    grabHandle.className = "umcp-library-toolbar-grab-handle";
    grabHandle.setAttribute("aria-hidden", "true");
    grabHandle.title = "Drag to move the toolbar";
    grabHandle.innerHTML = `
      <svg class="umcp-library-toolbar-grab-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <path d="M12 2v5M12 17v5M2 12h5M17 12h5M7.5 7.5l4.5-4.5 4.5 4.5M7.5 16.5l4.5 4.5 4.5-4.5M16.5 7.5l4.5 4.5-4.5 4.5M7.5 7.5L3 12l4.5 4.5" />
      </svg>
    `;
    container.appendChild(grabHandle);

    toolbar.makeToolbarDraggable(container);
    return container;
  };

  toolbar.makeToolbarDraggable = function(container) {
    if (!container || container.dataset.dragBound === "true") return;
    container.dataset.dragBound = "true";

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const handlePointerDown = (event) => {
      if (event.target.closest("button, input, select, textarea, form")) {
        return;
      }

      dragging = true;
      const rect = container.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      container.setPointerCapture && container.setPointerCapture(event.pointerId);
      container.style.transition = "none";
    };

    const handlePointerMove = (event) => {
      if (!dragging) return;
      const nextLeft = clamp(event.clientX - offsetX, 12, Math.max(12, window.innerWidth - container.offsetWidth - 12));
      const nextTop = clamp(event.clientY - offsetY, 12, Math.max(12, window.innerHeight - container.offsetHeight - 12));
      container.style.left = `${nextLeft}px`;
      container.style.top = `${nextTop}px`;
      container.style.right = "auto";
    };

    const handlePointerUp = () => {
      dragging = false;
      container.style.transition = "box-shadow 0.15s ease, transform 0.15s ease";
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointerleave", handlePointerUp);
  };

  toolbar.createLiveRegion = function() {
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
  };

  toolbar.isLikelyScholarlyPage = function() {
    const hostname = window.location.hostname.toLowerCase();
    const url = window.location.href.toLowerCase();

    if (toolbar.isProxyHost(hostname)) {
      return true;
    }

    if (toolbar.TOOLBAR_CONFIG.ignoredHostnames.some((candidate) => toolbar.hostnameMatches(hostname, candidate))) {
      return false;
    }

    if (toolbar.TOOLBAR_CONFIG.excludedHostPatterns.some((pattern) => pattern.test(hostname))) {
      return false;
    }

    const pageText = (document.body ? document.body.innerText : "") || "";
    const combinedText = `${url} ${pageText}`.toLowerCase();

    const hasStrongPathHint = toolbar.TOOLBAR_CONFIG.scholarlyPathHints.some((hint) => url.includes(hint));
    const hasCitationMeta = !!document.querySelector('meta[name="citation_journal_title"], meta[name="citation_title"], meta[name="citation_doi"]');
    const hasPaywallHint = toolbar.TOOLBAR_CONFIG.paywallSignals.some((signal) => combinedText.includes(signal));
    const hasArticleLanguage = /\b(?:doi|journal|article|abstract|full text|pdf|author manuscript|read online|subscribe to jpass)\b/i.test(pageText);
    const hasAcademicDomainHint = /(?:^|\.)((?:[a-z0-9-]+\.)*(?:edu|ac|gov|org))$/i.test(hostname) && !/^((www\.)?google|amazon|facebook|twitter|x\.|youtube|github)\./i.test(hostname);
    const hasScholarlyHostHint = toolbar.TOOLBAR_CONFIG.scholarlyHostHints.some((pattern) => pattern.test(hostname));

    if (hasStrongPathHint || hasCitationMeta || hasScholarlyHostHint) {
      return true;
    }

    return (hasPaywallHint || hasArticleLanguage) && hasAcademicDomainHint;
  };

  toolbar.injectToolbar = function() {
    if (document.getElementById(toolbar.CONTAINER_ID)) return;
    if (!document.body && !document.documentElement) return;
    if (!toolbar.isLikelyScholarlyPage()) return;

    toolbar.ensureToolbarStyles();
    const container = toolbar.createToolbarContainer();
    const liveRegion = toolbar.createLiveRegion();

    const proxyButton = toolbar.createProxyButton(container, liveRegion);
    const searchButton = toolbar.createSearchButton(container, liveRegion);
    const helpButton = toolbar.createHelpButton(liveRegion);
    const citeButton = toolbar.createCiteButton(liveRegion);
    const integrityButton = toolbar.createIntegrityButton(liveRegion);
    const skipButton = toolbar.createSkipButton(container, liveRegion);

    container.appendChild(proxyButton);
    container.appendChild(searchButton);
    container.appendChild(helpButton);
    container.appendChild(citeButton);
    container.appendChild(integrityButton);
    container.appendChild(skipButton);
    toolbar.appendToPageRoot(liveRegion);
    toolbar.appendToPageRoot(container);
  };
})();
