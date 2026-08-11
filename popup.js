const PROXY_BASE_URL = "http://proxy-um.researchport.umd.edu/login?url=";

// Keep the proxy URL builder isolated so the popup logic can stay focused on
// current-tab inspection and user interaction.
function buildProxyUrl(url) {
  if (!url) return "";
  return `${PROXY_BASE_URL}${encodeURIComponent(url)}`;
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

      try {
        setStatus(`Current page: ${new URL(currentUrl).hostname}`);
      } catch {
        setStatus("Current page detected.");
      }
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

      const proxiedUrl = buildProxyUrl(currentUrl);
      await chrome.tabs.update(tab.id, { url: proxiedUrl });
      setMessage("The page was opened through the UMD proxy.");
    } catch (error) {
      setMessage("Could not apply the proxy.");
    }
  });

  updateStatus();
})();
