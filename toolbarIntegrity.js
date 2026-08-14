(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  toolbar.normalizeDoi = function(value) {
    const text = toolbar.cleanText(value || "");
    if (!text) return "";

    const stripped = text
      .replace(/^https?:\/\/doi\.org\//i, "")
      .replace(/^https?:\/\/dx\.doi\.org\//i, "")
      .replace(/^doi\s*:/i, "")
      .replace(/^https?:\/\//i, "")
      .trim();

    return stripped.replace(/\s+/g, "").replace(/\.$/, "");
  };

  toolbar.extractDoiFromPage = function() {
    const selectors = [
      'meta[name="citation_doi"]',
      'meta[name="doi"]',
      'meta[property="article:published_time"]',
      'meta[property="og:identifier"]',
      'meta[name="DC.identifier"]'
    ];

    const candidates = [];
    selectors.forEach((selector) => {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((node) => {
        const value = node.getAttribute("content") || node.content || node.getAttribute("value") || "";
        if (value) candidates.push(value);
      });
    });

    const locationValue = window.location.href;
    const urlMatch = locationValue.match(/\/doi\/(10\.[^?#/]+)/i);
    if (urlMatch && urlMatch[1]) {
      candidates.push(urlMatch[1]);
    }

    for (const candidate of candidates) {
      const normalized = toolbar.normalizeDoi(candidate);
      if (/^10\./.test(normalized)) {
        return normalized;
      }
    }

    return "";
  };

  toolbar.parseCrossrefIntegrityStatus = function(payload) {
    const message = payload && payload.message ? payload.message : {};
    if (!message) {
      return { alerts: [], summary: "No integrity alerts reported." };
    }

    const alerts = [];
    const seen = new Set();

    const addAlert = (type, label, detail) => {
      const key = `${type}|${detail}`;
      if (seen.has(key)) return;
      seen.add(key);
      alerts.push({ type, label, detail });
    };

    if (message.retraction === true || message.retraction === "true") {
      addAlert("retraction", "Retraction", "Crossref marks this work as retracted.");
    }

    const updateTypes = Array.isArray(message["update-to"]) ? message["update-to"] : [];
    updateTypes.forEach((entry) => {
      const type = toolbar.cleanText(entry && (entry.type || entry["update-type"] || "")).toLowerCase();
      const date = toolbar.cleanText(entry && (entry.date || ""));
      if (!type) return;

      if (type.includes("retraction")) {
        addAlert("retraction", "Retraction", date ? `Crossref reports a retraction dated ${date}.` : "Crossref reports a retraction.");
      }

      if (type.includes("expression") || type.includes("concern")) {
        addAlert("expression-of-concern", "Expression of concern", date ? `Crossref reports an expression of concern dated ${date}.` : "Crossref reports an expression of concern.");
      }

      if (type.includes("correction")) {
        addAlert("correction", "Correction", date ? `Crossref reports a correction dated ${date}.` : "Crossref reports a correction.");
      }

      if (type.includes("withdrawal")) {
        addAlert("withdrawal", "Withdrawal", date ? `Crossref reports a withdrawal dated ${date}.` : "Crossref reports a withdrawal.");
      }
    });

    const title = toolbar.cleanText(message.title && message.title[0] ? message.title[0] : "");
    if (!alerts.length) {
      return {
        alerts: [],
        summary: title ? `No integrity alerts were reported for ${title}.` : "No integrity alerts were reported for this DOI.",
        title
      };
    }

    const summary = alerts.map((alert) => alert.label).join("; ");
    return {
      alerts,
      summary: `Integrity check found: ${summary}.`,
      title
    };
  };

  toolbar.fetchCrossrefIntegrity = async function(doi) {
    if (!doi) {
      return {
        doi: "",
        alerts: [],
        summary: "No DOI was found on this page, so no Crossref integrity check could be run.",
        status: "missing-doi"
      };
    }

    try {
      const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Crossref request failed with status ${response.status}`);
      }

      const data = await response.json();
      const parsed = toolbar.parseCrossrefIntegrityStatus(data);
      return {
        doi,
        alerts: parsed.alerts,
        summary: parsed.summary,
        status: parsed.alerts.length ? "alert" : "clear",
        title: parsed.title || ""
      };
    } catch (error) {
      return {
        doi,
        alerts: [],
        summary: "The Crossref integrity check could not be completed right now.",
        status: "error",
        error: error && error.message ? error.message : "unknown"
      };
    }
  };

  toolbar.showIntegrityPanel = function(status, button) {
    let panel = document.getElementById("umcp-library-integrity-panel");
    if (panel) {
      panel.remove();
    }

    panel = document.createElement("div");
    panel.id = "umcp-library-integrity-panel";
    panel.className = "umcp-library-integrity-panel";

    const title = document.createElement("div");
    title.className = "umcp-library-integrity-header";
    title.textContent = "Article integrity";

    const summary = document.createElement("div");
    summary.className = "umcp-library-integrity-summary";
    summary.textContent = status.summary || "No integrity alert summary is available.";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";
    closeButton.addEventListener("click", () => panel.remove());

    const list = document.createElement("ul");
    list.className = "umcp-library-integrity-list";

    if (status.alerts && status.alerts.length) {
      status.alerts.forEach((alert) => {
        const item = document.createElement("li");
        item.textContent = `${alert.label}: ${alert.detail}`;
        list.appendChild(item);
      });
    } else if (status.status === "clear") {
      const item = document.createElement("li");
      item.textContent = "No retraction or similar integrity events were reported by Crossref for this DOI.";
      list.appendChild(item);
    } else if (status.status === "missing-doi") {
      const item = document.createElement("li");
      item.textContent = "This page does not expose a DOI, so the integrity check could not be run.";
      list.appendChild(item);
    } else if (status.status === "error") {
      const item = document.createElement("li");
      item.textContent = "The integrity check request failed. Please try again or check the page DOI.";
      list.appendChild(item);
    }

    panel.appendChild(title);
    panel.appendChild(summary);
    panel.appendChild(list);
    panel.appendChild(closeButton);
    toolbar.appendToPageRoot(panel);

    if (button) {
      button.textContent = status.alerts.length ? `Integrity alert: ${status.alerts[0].label}` : status.status === "clear" ? "No integrity alerts" : status.status === "missing-doi" ? "No DOI found" : "Integrity check failed";
      button.disabled = false;
      button.setAttribute("aria-disabled", "false");
      button.dataset.status = status.status;
    }
  };

  toolbar.createIntegrityButton = function(liveRegion) {
    const integrityButton = toolbar.createButton("Check article integrity", async () => {
      const doi = toolbar.extractDoiFromPage();
      integrityButton.disabled = true;
      integrityButton.textContent = "Checking...";
      integrityButton.setAttribute("aria-disabled", "true");
      toolbar.setLiveAnnouncement(liveRegion, "Checking the article DOI for integrity alerts.");

      const status = await toolbar.fetchCrossrefIntegrity(doi);
      if (status.alerts && status.alerts.length) {
        toolbar.setLiveAnnouncement(liveRegion, `Integrity alert found: ${status.alerts[0].label}.`);
      } else if (status.status === "clear") {
        toolbar.setLiveAnnouncement(liveRegion, "No integrity alerts reported for this article.");
      } else {
        toolbar.setLiveAnnouncement(liveRegion, "The integrity check was unable to complete.");
      }

      toolbar.showIntegrityPanel(status, integrityButton);
    }, "umcp-library-toolbar-button");

    toolbar.applyButtonTheme(integrityButton, toolbar.BUTTON_THEMES.integrity || "umcp-library-toolbar-button--integrity");
    return integrityButton;
  };
})();
