const PROXY_BASE_URL = "http://proxy-um.researchport.umd.edu/login?url=";
const SKIP_STORAGE_KEY = "umcp-library-skip-hosts";

// Keep the proxy URL builder isolated so the popup logic can stay focused on
// current-tab inspection and user interaction.
function buildProxyUrl(url) {
  if (!url) return "";
  return `${PROXY_BASE_URL}${encodeURIComponent(url)}`;
}

function readSkippedHosts() {
  try {
    const rawValue = window.localStorage.getItem(SKIP_STORAGE_KEY);
    if (!rawValue) return [];
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function writeSkippedHosts(hosts) {
  try {
    window.localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(hosts));
  } catch (error) {
    // Ignore storage failures silently so the popup remains usable.
  }
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

      const proxiedUrl = buildProxyUrl(currentUrl);
      await chrome.tabs.update(tab.id, { url: proxiedUrl });
      setMessage("The page was opened through the UMD proxy.");
    } catch (error) {
      setMessage("Could not apply the proxy.");
    }
  });

  updateStatus();
})();
