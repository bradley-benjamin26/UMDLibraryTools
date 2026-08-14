// Popup logic for the browser action; this mirrors the direct proxied-host behavior used by
// the working bookmarklet flow and resolves the current tab to a safe proxy target.
const PROXY_BASE_URL = "https://proxy-um.researchport.umd.edu/login?url=";
const SKIP_STORAGE_KEY = "umcp-library-skip-hosts";
const PROXY_TARGET_STORAGE_KEY = "umcp-library-proxy-last-target";

// Keep the proxy URL builder isolated so the popup logic can stay focused on
// current-tab inspection and user interaction.
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

function isProxyHost(hostname) {
  return typeof hostname === "string" && /(?:^|\.)proxy-um\.researchport\.umd\.edu$/i.test(hostname);
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

function getStoredProxyTarget() {
  try {
    const rawValue = window.sessionStorage.getItem(PROXY_TARGET_STORAGE_KEY);
    if (rawValue) {
      const parsed = JSON.parse(rawValue);
      return typeof parsed === "string" && /^https?:\/\//i.test(parsed) ? parsed : "";
    }
  } catch (error) {
    // Ignore storage failures; the popup can also use Chrome storage when available.
  }

  if (chrome && chrome.storage && chrome.storage.local) {
    let candidate = "";
    chrome.storage.local.get([PROXY_TARGET_STORAGE_KEY], (items) => {
      candidate = items && items[PROXY_TARGET_STORAGE_KEY] ? items[PROXY_TARGET_STORAGE_KEY] : "";
    });
    return candidate;
  }

  return "";
}

function setStoredProxyTarget(url) {
  try {
    if (!url || !/^https?:\/\//i.test(url)) {
      return;
    }
    window.sessionStorage.setItem(PROXY_TARGET_STORAGE_KEY, JSON.stringify(url));
  } catch (error) {
    // Ignore storage failures; popup behavior can still proceed without the fallback.
  }

  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [PROXY_TARGET_STORAGE_KEY]: url });
  }
}

function resolvePopupProxyTarget(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);

    if (isProxyHost(parsed.hostname)) {
      const currentUrlTarget = getProxyTargetFromCurrentUrl(url);
      if (currentUrlTarget) {
        console.info("[UMD proxy] popup ignoring proxy menu host, using current URL qurl target:", currentUrlTarget);
        return currentUrlTarget;
      }

      const storedTarget = getStoredProxyTarget();
      if (storedTarget) {
        console.info("[UMD proxy] popup ignoring proxy menu host, using stored target:", storedTarget);
        return storedTarget;
      }

      const referrer = document.referrer || "";
      if (referrer) {
        try {
          const referrerUrl = new URL(referrer);
          if (!isProxyHost(referrerUrl.hostname)) {
            console.info("[UMD proxy] popup ignoring proxy menu host, using referrer:", referrerUrl.toString());
            return referrerUrl.toString();
          }
        } catch {
          // Ignore invalid referrer values.
        }
      }

      console.info("[UMD proxy] popup ignoring proxy menu host; current tab is a proxy redirect page.", url);
      return "";
    }

    const canonicalTarget = parsed.toString();
    setStoredProxyTarget(canonicalTarget);
    console.info("[UMCP Popup Debug] tab url:", url);
    console.info("[UMCP Popup Debug] resolved proxy target:", canonicalTarget);
    return canonicalTarget;
  } catch (error) {
    console.info("[UMCP Popup Debug] invalid tab url:", url);
    return url;
  }
}

function readSkippedHosts() {
  return [];
}

function writeSkippedHosts(hosts) {
  // Do not persist hide decisions. The toolbar should remain visible as soon as the
  // user returns to a scholarly page.
}

function isHostSkipped(hostname) {
  const normalizedHostname = String(hostname || "").toLowerCase();
  if (!normalizedHostname) {
    return false;
  }

  const skippedHosts = readSkippedHosts();
  return skippedHosts.some((value) => {
    const normalizedValue = String(value || "").toLowerCase();
    return normalizedValue === normalizedHostname || normalizedHostname.endsWith(`.${normalizedValue}`);
  });
}

function removeHostFromSkipList(hostname) {
  const normalizedHostname = String(hostname || "").toLowerCase();
  if (!normalizedHostname) {
    return;
  }

  const skippedHosts = readSkippedHosts();
  const nextHosts = skippedHosts.filter((value) => {
    const normalizedValue = String(value || "").toLowerCase();
    return normalizedValue !== normalizedHostname && !normalizedHostname.endsWith(`.${normalizedValue}`);
  });

  writeSkippedHosts(nextHosts);
}

(function () {
  const statusEl = document.getElementById("pageStatus");
  const button = document.getElementById("proxyButton");
  const messageEl = document.getElementById("proxyMessage");

  if (!statusEl || !button || !messageEl) {
    return;
  }

  function setButtonDisabled(disabled) {
    button.disabled = disabled;
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function setMessage(message) {
    messageEl.textContent = message;
  }

  // Guard the popup against unsupported or non-page contexts before trying to
  // proxy the current tab.
  function hasUsableHttpUrl(url) {
    return Boolean(url) && /^https?:\/\//i.test(url);
  }

  function setNoUrlState() {
    setStatus("No page URL detected.");
    setButtonDisabled(true);
    setMessage("Open a web page before using the proxy action.");
    button.textContent = "Open current page with UMD proxy";
    button.setAttribute("aria-label", "Open the current page with the UMD proxy");
  }

  // Query the active tab once and reuse the result for both status display and
  // the proxy action so the popup logic stays consistent.
  async function getActiveTab() {
    if (!chrome || !chrome.tabs || !chrome.tabs.query) {
      return null;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  async function updateStatus() {
    try {
      const tab = await getActiveTab();
      const currentUrl = tab && tab.url ? tab.url : "";

      if (!hasUsableHttpUrl(currentUrl)) {
        setNoUrlState();
        return;
      }

      let hostname = "";
      try {
        hostname = new URL(currentUrl).hostname;
      } catch {
        hostname = "";
      }

      const hiddenOnThisSite = isHostSkipped(hostname);
      setButtonDisabled(false);

      if (hiddenOnThisSite) {
        setStatus(`Toolbar hidden on: ${hostname}`);
        setMessage("This site is currently excluded from the toolbar. Restore it for this host.");
        button.textContent = "Show toolbar on this site";
        button.setAttribute("aria-label", "Show the toolbar on this website again");
        return;
      }

      setStatus(`Current page: ${hostname || "detected"}`);
      setMessage("This sends the current page through the University of Maryland proxy before loading it.");
      button.textContent = "Open current page with UMD proxy";
      button.setAttribute("aria-label", "Open the current page with the UMD proxy");
    } catch (error) {
      setStatus("Could not inspect current page.");
      setButtonDisabled(true);
      setMessage(error && error.message ? error.message : "Unable to inspect tab.");
    }
  }

  button.addEventListener("click", async () => {
    try {
      if (!chrome || !chrome.tabs || !chrome.tabs.query || !chrome.tabs.update) {
        setMessage("Proxy is unavailable because the Chrome API is missing.");
        return;
      }

      const tab = await getActiveTab();
      const currentUrl = (tab && tab.url) || "";

      if (!hasUsableHttpUrl(currentUrl)) {
        setMessage("This tab does not expose a valid URL to proxy.");
        return;
      }

      const hostname = (() => {
        try {
          return new URL(currentUrl).hostname.toLowerCase();
        } catch {
          return "";
        }
      })();

      if (hostname && isHostSkipped(hostname)) {
        removeHostFromSkipList(hostname);
        setStatus(`Toolbar restored for: ${hostname}`);
        setMessage("The toolbar will reappear when this page reloads.");
        button.textContent = "Open current page with UMD proxy";
        button.setAttribute("aria-label", "Open the current page with the UMD proxy");

        if (chrome.tabs.reload) {
          await chrome.tabs.reload(tab.id);
        }
        return;
      }

      const proxyTargetUrl = resolvePopupProxyTarget(currentUrl);
      setStoredProxyTarget(proxyTargetUrl);
      const proxiedUrl = buildProxyUrl(proxyTargetUrl);
      console.info("[UMD proxy] click handler", { target: proxyTargetUrl, proxiedUrl });
      console.info("[UMCP Popup Debug] final proxied url:", proxiedUrl);
      await chrome.tabs.update(tab.id, { url: proxiedUrl });
      setMessage("The page was opened through the UMD proxy.");
    } catch (error) {
      setMessage("Could not apply the proxy.");
    }
  });

  updateStatus();
})();
