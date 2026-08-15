(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  const PROXY_TARGET_STORAGE_KEY = "umcp-library-proxy-last-target";
  const PROXY_SUCCESS_STORAGE_KEY = "umcp-library-proxy-success";

  toolbar.getProxyTargetFromCurrentUrl = function(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
      return "";
    }

    try {
      const parsed = new URL(url);
      if (!toolbar.isProxyHost(parsed.hostname)) {
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
  };

  toolbar.getStoredProxyTargetSync = function() {
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
  };

  toolbar.getStoredProxyTarget = function() {
    return toolbar.getStoredProxyTargetSync();
  };

  toolbar.getProxyAccessState = function() {
    if (!toolbar.isCurrentPageOnProxyHost()) {
      return false;
    }

    try {
      const pageText = (document.body ? document.body.innerText : "") || "";
      const pageUrl = window.location.href || "";
      const combinedText = `${pageUrl} ${pageText}`.toLowerCase();
      const accessDeniedSignals = [
        "access denied",
        "access unavailable",
        "not authorized",
        "not available",
        "not authorized to access this resource",
        "please sign in",
        "sign in to continue",
        "login required",
        "subscription required",
        "restricted access",
        "institutional access required"
      ];
      const accessIndicators = [
        "full text",
        "download pdf",
        "pdf",
        "article",
        "journal",
        "chapter",
        "book",
        "abstract",
        "read online",
        "view pdf"
      ];

      const hasDeniedSignal = accessDeniedSignals.some((signal) => combinedText.includes(signal));
      if (hasDeniedSignal) {
        return false;
      }

      const hasAccessIndicator = accessIndicators.some((signal) => combinedText.includes(signal));
      return hasAccessIndicator || /\/proxy-um\.|\/login\?url=|\/login\?qurl=/i.test(pageUrl);
    } catch (error) {
      return false;
    }
  };

  toolbar.getProxySuccessState = function() {
    if (toolbar.isCurrentPageOnProxyHost()) {
      return toolbar.getProxyAccessState();
    }

    try {
      const rawValue = window.localStorage.getItem(PROXY_SUCCESS_STORAGE_KEY);
      return rawValue === "true";
    } catch (error) {
      return false;
    }
  };

  toolbar.setProxySuccessState = function(success) {
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
  };

  toolbar.setStoredProxyTarget = function(url) {
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
  };

  toolbar.getProxyReferrerTarget = function() {
    try {
      const referrer = document.referrer;
      if (!referrer) {
        return "";
      }

      const parsed = new URL(referrer);
      if (!toolbar.isProxyHost(parsed.hostname) && /^https?:\/\//i.test(referrer)) {
        return parsed.toString();
      }
    } catch (error) {
      // Ignore invalid referrers; falling back to the stored target is safer than proxying the menu.
    }
    return "";
  };

  toolbar.resolveProxyTargetUrl = function() {
    const href = window.location.href;
    const storedTarget = toolbar.getStoredProxyTargetSync();
    const proxyTargetFromCurrentUrl = toolbar.getProxyTargetFromCurrentUrl(href);
    const proxyReferrerTarget = toolbar.getProxyReferrerTarget();

    if (toolbar.isCurrentPageOnProxyHost()) {
      toolbar.debugProxyFlow("proxy host detected", {
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

    const canonicalUrl = toolbar.getPageTargetUrl();
    const finalUrl = canonicalUrl || href;
    toolbar.setStoredProxyTarget(finalUrl);

    const payload = { href, canonicalUrl, finalUrl };
    toolbar.logProxyState("script loaded", { host: window.location.host, url: window.location.href });
    toolbar.logProxyState("active", { target: finalUrl });
    toolbar.logProxyState("proxy success state", { state: "pending" });
    console.info("[UMCP Proxy Debug] page href:", payload.href);
    console.info("[UMCP Proxy Debug] canonical url:", payload.canonicalUrl);
    console.info("[UMCP Proxy Debug] final proxy target:", payload.finalUrl);
    return finalUrl;
  };

  toolbar.buildProxyUrl = function(url) {
    if (!url) return "";

    try {
      const parsed = new URL(url);
      const proxyHostname = parsed.hostname.replace(/\./g, "-") + ".proxy-um.researchport.umd.edu";
      return `https://${proxyHostname}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (error) {
      return `https://proxy-um.researchport.umd.edu/login?url=${encodeURIComponent(url)}`;
    }
  };

  toolbar.isAlreadyProxied = function(url) {
    if (typeof url !== "string") {
      return false;
    }

    try {
      const parsed = new URL(url);
      if (toolbar.isProxyHost(parsed.hostname)) {
        return true;
      }
    } catch (error) {
      // Ignore malformed URLs.
    }

    return url.includes("proxy-um.researchport.umd.edu/login?url=") ||
      url.includes("proxy-um.researchport.umd.edu/login?qurl=") ||
      url.includes("proxy-um.researchport.umd.edu/menu") ||
      /(?:^|\.)[a-z0-9-]+\.proxy-um\.researchport\.umd\.edu$/i.test(url);
  };

  toolbar.updateProxyButtonState = function(button, url) {
    const isProxyHostPage = toolbar.isCurrentPageOnProxyHost();
    const hasProxyAccess = isProxyHostPage ? toolbar.getProxyAccessState() : false;
    const hasProxySuccess = toolbar.getProxySuccessState();
    const nextText = isProxyHostPage
      ? (hasProxyAccess ? "Proxy successful" : "Access unavailable")
      : (hasProxySuccess ? "Proxy successful" : toolbar.isAlreadyProxied(url) ? "Already through UMD proxy" : "Open with UMD proxy");

    toolbar.logProxyState("before updateProxyButtonState", { url, nextText, buttonText: button && button.textContent, hasProxySuccess, hasProxyAccess, isProxyHostPage });
    if (button) {
      button.textContent = nextText;
      button.disabled = false;
      button.setAttribute("aria-disabled", "false");
      button.style.background = "";
      button.style.color = "";
      button.style.borderColor = "";
      button.style.cursor = "pointer";
    }
    toolbar.logProxyState("after updateProxyButtonState", { url, nextText, buttonText: button && button.textContent, hasProxySuccess, hasProxyAccess, isProxyHostPage });
  };

  toolbar.createProxyButton = function(container, liveRegion) {
    const proxyButton = toolbar.createButton(
      toolbar.getProxySuccessState() ? "Proxy successful" : toolbar.isAlreadyProxied(window.location.href) ? "Already through UMD proxy" : "Open with UMD proxy",
      () => {
        if (toolbar.getProxySuccessState()) {
          return;
        }
        const currentUrl = toolbar.resolveProxyTargetUrl();
        if (toolbar.isAlreadyProxied(currentUrl)) return;
        const proxiedUrl = toolbar.buildProxyUrl(currentUrl);
        toolbar.setStoredProxyTarget(currentUrl);
        toolbar.setProxySuccessState(false);
        toolbar.logProxyState("proxy click handler", { target: currentUrl, proxiedUrl });
        console.info("[UMD proxy] click handler target:", currentUrl);
        console.info("[UMD proxy] click handler proxied URL:", proxiedUrl);
        window.location.href = proxiedUrl;
      },
      "umcp-library-toolbar-button"
    );

    toolbar.updateProxyButtonState(proxyButton, window.location.href);
    toolbar.applyButtonTheme(proxyButton, toolbar.BUTTON_THEMES.proxy);
    return proxyButton;
  };
})();
