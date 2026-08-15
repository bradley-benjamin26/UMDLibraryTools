(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  toolbar.normalizeDoi = function(value) {
    const text = toolbar.cleanText(value || "");
    if (!text) return "";

    const candidate = text
      .replace(/^https?:\/\//i, "")
      .replace(/^doi\s*:/i, "")
      .trim();

    const match = candidate.match(/(?:[^/?#]+\/)?(10\.[^?#\s"'<>]+)/i);
    if (!match || !match[1]) {
      return "";
    }

    let doi = match[1]
      .replace(/\s+/g, "")
      .replace(/[.,;]+$/, "");

    const noisySuffixes = [
      "Google",
      "Scholar",
      "Reference",
      "References",
      "Crossref",
      "Web of Science",
      "Web",
      "Go to",
      "Go",
      "To",
      "Science"
    ];

    for (const suffix of noisySuffixes.sort((a, b) => b.length - a.length)) {
      if (doi.toLowerCase().endsWith(suffix.toLowerCase())) {
        doi = doi.slice(0, -suffix.length).replace(/[._;:=-]+$/, "");
      }
    }

    return /^10\./.test(doi) ? doi : "";
  };

  toolbar.extractDoiFromPage = function() {
    const selectors = [
      'meta[name="citation_doi"]',
      'meta[name="doi"]',
      'meta[property="article:published_time"]',
      'meta[property="og:identifier"]',
      'meta[name="DC.identifier"]',
      'a[href*="doi.org"]',
      'a[href*="dx.doi.org"]',
      'a[href*="doi="]',
      'a[href*="10."]'
    ];

    const candidates = [];
    selectors.forEach((selector) => {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((node) => {
        const value = node.getAttribute("content") || node.content || node.getAttribute("value") || node.getAttribute("href") || node.textContent || "";
        if (value) candidates.push(value);
      });
    });

    const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || "";
    if (bodyText) {
      candidates.push(bodyText);
    }

    const locationValue = window.location.href;
    const urlMatch = locationValue.match(/(?:\/doi\/|(?:doi\.org\/|dx\.doi\.org\/))(10\.[^?#/]+)/i);
    if (urlMatch && urlMatch[1]) {
      candidates.push(urlMatch[1]);
    }

    for (const candidate of candidates) {
      const extracted = toolbar.extractDoiFromText(candidate);
      if (extracted) {
        return extracted;
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
      toolbar.addDebugLog("Crossref integrity check skipped because no DOI was available.", { doi: doi || "", source: "missing-doi" });
      return {
        doi: "",
        alerts: [],
        summary: "No DOI was found on this page, so no Crossref integrity check could be run.",
        status: "missing-doi"
      };
    }

    const url = toolbar.buildCrossrefUrl(`/works/${encodeURIComponent(doi)}`);
    toolbar.addDebugLog("Crossref integrity lookup started.", { doi, url });

    try {
      const request = await toolbar.fetchCrossrefJson(`/works/${encodeURIComponent(doi)}`);
      const response = request.response;

      toolbar.addDebugLog("Crossref integrity response received.", {
        doi,
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        contentType: response.headers && response.headers.get ? response.headers.get("content-type") : "unknown"
      });

      if (!response.ok) {
        const errorMessage = `Crossref request failed with status ${response.status}`;
        toolbar.addDebugLog(errorMessage, { doi, status: response.status, statusText: response.statusText });
        throw new Error(errorMessage);
      }

      const data = request.data;
      toolbar.addDebugLog("Crossref integrity payload received.", {
        doi,
        payloadPreview: toolbar.stringifyForLog(data, 1500)
      });

      const parsed = toolbar.parseCrossrefIntegrityStatus(data);
      const result = {
        doi,
        alerts: parsed.alerts,
        summary: parsed.summary,
        status: parsed.alerts.length ? "alert" : "clear",
        title: parsed.title || ""
      };

      toolbar.addDebugLog("Crossref integrity parsing complete.", {
        doi,
        status: result.status,
        alertCount: result.alerts.length,
        summary: result.summary
      });

      return result;
    } catch (error) {
      const message = error && error.message ? error.message : "unknown";
      toolbar.addDebugLog("Crossref integrity check failed.", {
        doi,
        error: message,
        stack: error && error.stack ? error.stack.slice(0, 1000) : ""
      });
      return {
        doi,
        alerts: [],
        summary: "The Crossref integrity check could not be completed right now.",
        status: "error",
        error: message
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

  toolbar.runArticleIntegrityCheck = async function(button, liveRegion) {
    const doi = toolbar.extractDoiFromPage();
    button.disabled = true;
    button.textContent = "Checking...";
    button.setAttribute("aria-disabled", "true");
    toolbar.setLiveAnnouncement(liveRegion, "Checking the article DOI for integrity alerts.");

    const status = await toolbar.fetchCrossrefIntegrity(doi);
    if (status.alerts && status.alerts.length) {
      toolbar.setLiveAnnouncement(liveRegion, `Integrity alert found: ${status.alerts[0].label}.`);
    } else if (status.status === "clear") {
      toolbar.setLiveAnnouncement(liveRegion, "No integrity alerts reported for this article.");
    } else {
      toolbar.setLiveAnnouncement(liveRegion, "The integrity check was unable to complete.");
    }

    toolbar.showIntegrityPanel(status, button);
  };

  toolbar.extractDoiFromText = function(text) {
    const source = String(text || "");
    if (!source) return "";

    const patterns = [
      /https?:\/\/(?:[^/\s]+\/)?(?:dx\.)?doi\.org\/(10\.[^\s"'<>]+)/i,
      /https?:\/\/[^/\s]+\/(10\.[^\s"'<>]+)/i,
      /(?:^|[^A-Za-z0-9])(?:doi\s*:\s*)?(10\.\d{4,9}\/[^\s"'<>]+)/i,
      /(?:^|[?&](?:doi|id)=)(10\.\d{4,9}\/[^&\s"'<>]+)/i,
      /(?:^|[^A-Za-z0-9])(10\.\d{4,9}\/[^\s"'<>]+)/i
    ];

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        const cleaned = toolbar.normalizeDoi(match[1].replace(/[.,;]+$/, ""));
        if (/^10\./.test(cleaned)) {
          return cleaned;
        }
      }
    }

    return "";
  };

  toolbar.isLikelyReferenceText = function(text, headingText) {
    const cleaned = toolbar.cleanText(text || "");
    if (!cleaned || cleaned.length < 30) return false;

    const negativeKeywords = /\b(?:table of contents|contents|additional information|related isbn|save view citation|open access|about project muse|project muse|series page|copyright|cover half title|index|about|book customers|publishers|language english|metrics and citations|journal overview and metrics|editorial board|submission guidelines|reprints|permissions)\b/i;
    if (negativeKeywords.test(cleaned)) return false;

    const headingTextNormalized = toolbar.cleanText(headingText || "");
    const refKeywords = /\b(?:references?|bibliography|works cited|literature cited|cited works|citations|sources|reference list)\b/i;
    const likelyCitationSignals = [
      /10\.\d{4,9}\//i,
      /\b(?:doi|isbn|isbn-13|isbn-10|pp\.|vol\.|chapter|edition|press|publisher)\b/i,
      /\b\d{4}\b/,
      /\b[A-Z][a-z]+(?:,\s*[A-Z][a-z]+|\s+[A-Z]\.)/,
      /\b(?:journal|book|chapter|editor|translator|volume|issue)\b/i,
      /(?:^|\n)\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*,\s*\d{4}\b/
    ];

    const hasReferenceHeading = refKeywords.test(headingTextNormalized) || refKeywords.test(cleaned);
    const hasCitationSignal = likelyCitationSignals.some((pattern) => pattern.test(cleaned));
    const hasListPattern = /(?:^|\n)\s*(?:[A-Z][a-z]+|[A-Z]\.)\S*(?:\s+(?:[A-Z][a-z]+|[A-Z]\.)\S*)*\s*(?:,\s*\d{4}|\(\d{4}\))/m.test(cleaned);
    const hasCitationPattern = hasCitationSignal || hasListPattern;

    if (hasCitationPattern && cleaned.length >= 80 && cleaned.length < 6000) {
      if (hasReferenceHeading) {
        return true;
      }

      const authorYearCount = (cleaned.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*\([^\n]*\d{4}\)|\b[A-Z][a-z]+\s*,\s*[A-Z][a-z]+\s*\(\d{4}\)|\b[A-Z][a-z]+\s+et\s+al\.|\b[A-Z][a-z]+\s+et\s+al\./gi) || []).length;
      const doiCount = (cleaned.match(/10\.\d{4,9}\//gi) || []).length;
      const yearCount = (cleaned.match(/\b\d{4}\b/g) || []).length;

      return authorYearCount >= 1 || doiCount >= 1 || yearCount >= 2;
    }

    return false;
  };

  toolbar.findReferenceTextOnPage = function() {
    const root = document.body || document.documentElement;
    const explicitSelectors = [
      'div.citations',
      'div.citation',
      'div.citation-content',
      '[id*="bibr"]',
      'section[id*="reference" i]',
      'section[class*="reference" i]',
      '.references',
      '.reference-list',
      '[id*="reference" i]',
      '[class*="reference" i]',
      'article',
      'ol',
      'ul',
      'table'
    ];

    const explicitNodes = [];
    explicitSelectors.forEach((selector) => {
      explicitNodes.push(...Array.from(root.querySelectorAll(selector)));
    });

    const candidateRoots = explicitNodes.length
      ? explicitNodes.filter((node, index, array) => array.indexOf(node) === index)
      : Array.from(root.querySelectorAll('main, article, section, ol, ul, li, p'));

    const curated = [];
    let directReferenceMatch = "";

    candidateRoots.forEach((node) => {
      const text = toolbar.cleanText(node.textContent || "");
      if (!text || text.length < 20 || text.length > 6000) return;
      if (/\b(?:table of contents|contents|additional information|related isbn|open access|about project muse|series page|copyright|cover half title|index)\b/i.test(text)) {
        return;
      }

      const headingText = Array.from(node.querySelectorAll("h1, h2, h3, h4, h5, h6, header"))
        .map((heading) => heading.textContent || "")
        .join(" ");
      const combinedText = `${headingText} ${text}`;
      const isExplicitReferenceSection = /\b(?:references?|bibliography|works cited|literature cited|cited works|citations|sources|reference list)\b/i.test(combinedText);
      const citationLikeText = /10\.\d{4,9}\//i.test(text) || /\b(?:doi|isbn|pp\.|vol\.|chapter|edition|press|publisher)\b/i.test(text) || /\b[A-Z][a-z]+(?:,\s*[A-Z][a-z]+|\s+[A-Z]\.)/i.test(text) || /\b\d{4}\b/.test(text);

      if (isExplicitReferenceSection && citationLikeText) {
        const referenceBlock = text.length > 400 ? text : combinedText;
        if (!directReferenceMatch) {
          directReferenceMatch = referenceBlock;
        }
        curated.push(referenceBlock);
      }

      const nodeMatches = toolbar.isLikelyReferenceText(text, headingText) ||
        (node.tagName && /^(OL|UL|LI|P|SECTION|ARTICLE|TABLE)$/i.test(node.tagName) && /10\.\d{4,9}\//.test(text));

      if (nodeMatches) {
        curated.push(text);
      }
    });

    const deduped = [...new Set(curated.map((entry) => entry.replace(/\s+/g, " ").trim()).filter(Boolean))];
    if (deduped.length) {
      return deduped.join("\n\n");
    }

    if (directReferenceMatch) {
      return directReferenceMatch;
    }

    const pageDoi = toolbar.extractDoiFromPage();
    if (pageDoi) {
      return `DOI: ${pageDoi}`;
    }

    return "";
  };

  toolbar.debugLogEntries = [];

  toolbar.stringifyForLog = function(value, maxLength = 2000) {
    if (value === undefined || value === null) {
      return String(value);
    }

    if (typeof value === "string") {
      return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
    }

    try {
      const text = JSON.stringify(value);
      return text && text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    } catch (error) {
      return String(value).slice(0, maxLength);
    }
  };

  toolbar.addDebugLog = function(message, details) {
    if (!toolbar.DEBUG_MODE) {
      return "";
    }

    const detailText = details === undefined ? "" : ` | ${toolbar.stringifyForLog(details)}`;
    const entry = `${new Date().toISOString()} - ${message}${detailText}`;
    toolbar.debugLogEntries.push(entry);
    console.info("[UMD reference debug]", message, details);
    return entry;
  };

  toolbar.downloadDebugLog = function(fileName = "umd-library-debug-log.txt") {
    if (!toolbar.DEBUG_MODE) {
      return;
    }

    const content = toolbar.debugLogEntries.length ? toolbar.debugLogEntries.join("\n") : "No debugging events were recorded.";
    toolbar.downloadTextReport(fileName, content);
  };

  toolbar.downloadTextReport = function(fileName, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  toolbar.CROSSREF_CONFIG = {
    mailto: "bbradle1@umd.edu",
    politePool: true,
    requestsPerWindowCount: 10,
    requestsPerWindowMs: 3000
  };

  toolbar.crossrefRequestQueue = Promise.resolve();
  toolbar.lastCrossrefRequestAt = 0;

  toolbar.getCrossrefRequestDelay = function() {
    if (toolbar.CROSSREF_CONFIG.politePool) {
      return Math.ceil(toolbar.CROSSREF_CONFIG.requestsPerWindowMs / toolbar.CROSSREF_CONFIG.requestsPerWindowCount);
    }

    return 200;
  };

  toolbar.buildCrossrefUrl = function(path, params) {
    const url = new URL(path, "https://api.crossref.org");
    const searchParams = params || {};

    Object.keys(searchParams).forEach((key) => {
      const value = searchParams[key];
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    url.searchParams.set("mailto", toolbar.CROSSREF_CONFIG.mailto);
    return url.toString();
  };

  toolbar.scheduleCrossrefRequest = function(task) {
    const run = async () => {
      const delay = toolbar.getCrossrefRequestDelay();
      const elapsed = Date.now() - toolbar.lastCrossrefRequestAt;
      const waitTime = Math.max(0, delay - elapsed);
      if (waitTime) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      toolbar.lastCrossrefRequestAt = Date.now();
      return task();
    };

    toolbar.crossrefRequestQueue = toolbar.crossrefRequestQueue.then(run, run);
    return toolbar.crossrefRequestQueue;
  };

  toolbar.fetchCrossrefJson = function(path, params) {
    return toolbar.scheduleCrossrefRequest(async () => {
      const url = toolbar.buildCrossrefUrl(path, params);
      const retryableStatuses = new Set([429, 500, 502, 503, 504]);
      let response = null;
      let data = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        });

        if (!retryableStatuses.has(response.status) || attempt === 2) {
          data = response.ok ? await response.json() : null;
          break;
        }

        const retryAfterHeader = response.headers && response.headers.get ? response.headers.get("retry-after") : "";
        const retryAfterSeconds = Number(retryAfterHeader);
        const backoffMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : toolbar.getCrossrefRequestDelay() * Math.pow(2, attempt);

        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      return { url, response, data };
    });
  };

  toolbar.stripReferenceNoise = function(text) {
    let cleaned = String(text || "")
      .replace(/\r/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/https?:\/\/(?:[^\s/]+\/)?(?:dx\.)?doi(?:-org)?(?:\.org)?\/(10\.[^\s"'<>]+)/gi, " DOI:$1 ")
      .replace(/https?:\/\/[^\s]+/gi, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/(?:Reference|Google|Scholar|Crossref|Web(?:\s+of)?\s+Science|Science)\s*(?=[A-Z])/gi, " ")
      .replace(/(?:Available access|Show details|Hide details)[\s\S]*$/i, " ")
      .replace(/\b(?:to)\b/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .trim();

    const doiMatch = cleaned.match(/(10\.\d{4,9}\/[^\s"'<>]+)/i);
    if (doiMatch && doiMatch[1]) {
      const doi = toolbar.normalizeDoi(doiMatch[1]);
      if (doi) {
        const doiIndex = cleaned.toLowerCase().indexOf(doi.toLowerCase());
        if (doiIndex >= 0) {
          const prefix = cleaned.slice(0, doiIndex + doi.length);
          const suffix = cleaned.slice(doiIndex + doi.length);
          const strippedSuffix = suffix.replace(/^(?:\s*(?:Google\s+Scholar|Crossref|Web\s+of\s+Science|Go\s+to(?:\s+Reference)?|Scholar|Reference(?:s)?)\s*)+.*$/i, "");
          cleaned = `${prefix}${strippedSuffix}`;
        }
      }
    }

    cleaned = cleaned
      .replace(/\s+(?:Google\s+Scholar|Crossref|Web\s+of\s+Science|Go\s+to(?:\s+Reference)?|Scholar|Reference(?:s)?)\s+[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*(?:\s*,\s*[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*)*$/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .trim();

    cleaned = cleaned
      .replace(/\b(?:Google\s+Scholar|Crossref|Web(?:\s+of)?\s+Science|Scholar|Reference(?:s)?)\b(?:\s*.*)?$/i, "")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .trim();

    return cleaned;
  };

  toolbar.parseAuthorNames = function(text) {
    const cleaned = toolbar.stripReferenceNoise(text || "");
    if (!cleaned) return [];

    const names = [];
    const seen = new Set();

    const pushName = (value) => {
      const normalized = toolbar.cleanText(value || "").replace(/[()]/g, "").replace(/[;,.]+$/, "").trim();
      if (!normalized || normalized.length <= 1 || /[0-9]/.test(normalized)) return;
      if (/^(?:Google|Scholar|Reference|Crossref|Web|of|Science|Go|to|Journal|Review|Management|Marketing|Research|Business|Tourism|International|Psychology|Studies|Quarterly|Academy|Press|Publishing|Current|Issues|European|American)$/i.test(normalized)) {
        return;
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        names.push(normalized);
      }
    };

    const yearMatch = cleaned.match(/\b(?:18|19|20|21)\d{2}\b/);
    const yearIndex = yearMatch ? cleaned.indexOf(yearMatch[0]) : -1;
    const beforeYear = yearIndex >= 0 ? cleaned.slice(0, yearIndex) : cleaned;

    const authorBlock = beforeYear
      .replace(/^\d+\.\s*/, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/^[\s).,;:(\[]+|[\s).,;:(\[]+$/g, "")
      .replace(/(?:Reference|Google|Scholar|Crossref|Web(?:\s+of)?\s+Science|Science)(?:\s+|(?=[A-Z]))+/gi, " ")
      .trim();

    const authorParts = authorBlock
      .split(/\s*(?:,\s*|\s+and\s+|\s*&\s*)\s*/)
      .map((part) => toolbar.cleanText(part).replace(/^[\s).,;:]+|[\s).,;:]+$/g, "").trim())
      .filter(Boolean);

    authorParts.forEach((part) => {
      const normalized = part.replace(/\s+/g, " ").trim();
      const valid = normalized.split(/\s+/).every((token) => /^[A-Z][A-Za-z'’.-]*\.?$/.test(token));
      if (valid && normalized.split(/\s+/).length >= 2) {
        pushName(normalized);
      }
    });

    if (names.length) return names;

    const trailingAuthorRegex = /(?:[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+)*|[A-Z]\.)\s*(?:,\s*(?:[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+)*|[A-Z]\.)\s*)+/g;
    const trailingMatches = cleaned.match(trailingAuthorRegex) || [];
    trailingMatches.forEach((match) => {
      match.split(/\s*,\s*|\s+and\s+/).forEach((part) => pushName(part));
    });

    return names;
  };

  toolbar.ReferenceEntry = function(entryText) {
    const original = toolbar.cleanText(entryText || "");
    const cleaned = toolbar.stripReferenceNoise(original);
    const citationText = cleaned
      .replace(/\b(?:Google\s+Scholar|Crossref|Web(?:\s+of)?\s+Science|Scholar|Reference(?:s)?)\b.*$/i, "")
      .trim();
    const yearMatch = citationText.match(/\b(?:18|19|20|21)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : "";
    const doi = toolbar.extractDoiFromText(original) || toolbar.extractDoiFromText(cleaned) || toolbar.extractDoiFromText(citationText);
    const authors = toolbar.parseAuthorNames(citationText);

    const yearIndex = yearMatch ? citationText.indexOf(yearMatch[0]) : -1;
    const beforeYear = yearIndex >= 0 ? citationText.slice(0, yearIndex).trim() : "";
    const afterYear = yearIndex >= 0 ? citationText.slice(yearIndex + yearMatch[0].length).trim() : citationText.trim();

    const journalKeywords = [
      "Journal", "Review", "Research", "Management", "Marketing", "Business", "Tourism", "Travel",
      "Retailing", "Consumer", "Hospitality", "Psychology", "Advertising", "Leisure", "Services",
      "Destination", "Academy", "Communication", "Monographs", "Perspectives", "Studies",
      "Quarterly", "International", "Current Issues", "Service", "Publishing", "Press",
      "Publishers", "University"
    ];

    const journalPattern = new RegExp(`\\.\\s*(?=(?:${journalKeywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b)`, "i");
    const journalMatch = afterYear.match(journalPattern);
    const titleText = journalMatch && journalMatch.index !== undefined
      ? afterYear.slice(0, journalMatch.index).replace(/^[\s).,;:]+|[\s:;,.]+$/g, "").trim()
      : afterYear.replace(/^[\s).,;:]+|[\s:;,.]+$/g, "").trim();
    const title = titleText || cleaned
      .replace(beforeYear, "")
      .replace(new RegExp(`\\b${year}\\b`, "g"), "")
      .replace(/^[\s).,;:]+|[\s:;,.]+$/g, "")
      .trim();

    const journalText = journalMatch && journalMatch.index !== undefined
      ? afterYear.slice(journalMatch.index + 1).trim()
      : "";
    const journalRegex = new RegExp(`(?:${journalKeywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})[^.;]*$`, "i");
    const journalSource = journalText ? journalText.replace(/[.]+$/g, "") : citationText.replace(/[.]+$/g, "");
    const journalMatchText = journalSource ? journalSource.match(journalRegex) : null;
    const cleanTitle = (value) => toolbar.cleanText(value || "")
      .replace(/\s*(?:DOI|doi)\s*:?\s*10\.\d{4,9}\/[\S]+.*$/i, "")
      .replace(/\s*https?:\/\/[^\s]+/gi, "")
      .replace(/\s*\[?\(?doi\)?\]?\s*:?\s*10\.\d{4,9}\/[\S]+.*$/i, "")
      .replace(/[.]+$/g, "")
      .trim();

    const entry = {
      raw: citationText,
      authors,
      year,
      doi,
      journal: journalMatchText ? toolbar.cleanText(journalMatchText[0]) : "",
      title: cleanTitle(title || citationText),
      isValid: Boolean(citationText && (year || doi || authors.length || /10\.\d{4,9}\//i.test(citationText)))
    };

    entry.getSearchTitle = function() {
      const candidate = this.title || this.raw || "";
      return cleanTitle(candidate)
        .replace(/\s*\(\s*\d{1,4}\s*(?:[-–]\s*\d{1,4})?\s*\)\s*$/g, "")
        .replace(/\s*,\s*\d{1,4}\s*(?:[-–]\s*\d{1,4})?\s*$/g, "")
        .replace(/\s+\d{1,4}\s*[-–]\s*\d{1,4}\s*$/g, "")
        .replace(/\s+\d{1,4}\s*$/g, "")
        .replace(/\s*[-–]\s*$/g, "")
        .trim();
    };

    entry.toDisplayString = function() {
      const parts = [];
      if (this.authors && this.authors.length) {
        parts.push(this.authors.join(", "));
      }
      if (this.year) {
        parts.push(`(${this.year})`);
      }
      if (this.title) {
        parts.push(this.title);
      }
      if (this.journal) {
        parts.push(this.journal);
      }
      if (this.doi) {
        parts.push(`DOI: ${this.doi}`);
      }
      return toolbar.cleanText(parts.join(". ")) || this.raw;
    };

    return entry;
  };

  toolbar.createReferenceEntry = function(entryText) {
    const entry = toolbar.ReferenceEntry(entryText);
    if (!entry || !entry.isValid) return null;
    return entry;
  };

  toolbar.isLikelyReferenceEntry = function(text) {
    const cleaned = toolbar.stripReferenceNoise(text);
    if (!cleaned || cleaned.length < 10) return false;
    if (/^(?:reference|crossref|google\s*scholar|web\s*of\s*science|scholar|google)(?:\s|$)/i.test(cleaned)) return false;
    if (/\b(?:Google\s+Scholar|Crossref|Web\s+of\s+Science|Go\s+to\s+Reference|Go\s+to|Scholar|Reference(?:s)?)\b/i.test(cleaned)) return false;

    const hasYear = /\b(?:18|19|20|21)\d{2}\b/.test(cleaned);
    const hasDoi = /10\.\d{4,9}\//i.test(cleaned);
    const hasDoiMarker = /(?:doi\s*:|doi\s+10\.|10\.\d{4,9}\/)/i.test(cleaned);
    const hasJournalSignal = /\b(?:Journal|Review|Management|Marketing|Research|Business|Tourism|International|Psychology|Studies|Quarterly|Academic|Press|Publishing|Current\s+Issues|European|American)\b/i.test(cleaned);
    const hasAuthorPattern = /(?:[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*\s*\(\d{4}\)|[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*\s*,\s*[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*\s*\(\d{4}\)|\b[A-Z][A-Za-z'’.-]+\s*,\s*\d{4}|(?:[A-Z]\.|[A-Z][A-Za-z'’.-]+)\s+(?:[A-Z]\.|[A-Z][A-Za-z'’.-]+)\s*\(\d{4}\))/i.test(cleaned);

    if (hasDoiMarker && (hasJournalSignal || hasAuthorPattern || hasYear || cleaned.length >= 20)) {
      return true;
    }

    return hasYear && (hasDoi || hasJournalSignal || hasAuthorPattern);
  };

  toolbar.splitReferenceEntries = function(referenceText) {
    const rawText = String(referenceText || "").replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
    if (!rawText) return [];

    const normalized = rawText;
    if (!normalized) return [];

    let candidateBlocks = normalized
      .split(/\n\s*\n+/)
      .map((block) => toolbar.cleanText(block).replace(/^[\s).,;:(\[]+|[\s).,;:(\[]+$/g, ""))
      .filter(Boolean);

    if (candidateBlocks.length <= 1) {
      candidateBlocks = normalized
        .split(/\n+/)
        .map((block) => toolbar.cleanText(block).replace(/^[\s).,;:(\[]+|[\s).,;:(\[]+$/g, ""))
        .filter(Boolean);
    }

    if (candidateBlocks.length <= 1) {
      const splitRegex = /(?=(?:^|[.!?]\s+|\n\s*)(?:[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*|[A-Z]\.)\s*(?:,\s*(?:[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*|[A-Z]\.)\s*)*(?:\(\d{4}\)|,\s*\d{4}\b|\s\d{4}\b))/g;
      const splitParts = normalized
        .split(splitRegex)
        .map((block) => toolbar.cleanText(block).replace(/^[\s).,;:(\[]+|[\s).,;:(\[]+$/g, ""))
        .filter(Boolean);

      if (splitParts.length > 1 && splitParts.filter((part) => toolbar.isLikelyReferenceEntry(part)).length >= 2) {
        candidateBlocks = splitParts;
      }
    }

    const entries = [];
    candidateBlocks.forEach((block) => {
      const text = toolbar.cleanText(block)
        .replace(/^[\s).,;:(\[]+|[\s).,;:(\[]+$/g, "")
        .trim();

      if (!text || !toolbar.isLikelyReferenceEntry(text)) return;
      const entry = toolbar.createReferenceEntry(text);
      if (entry) entries.push(entry);
    });

    if (!entries.length) {
      const fallback = normalized
        .split(/(?=(?:^|[.!?]\s+|\n\s*)(?:[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*|[A-Z]\.)\s*(?:,\s*(?:[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*|[A-Z]\.)\s*)*(?:\(\d{4}\)|,\s*\d{4}\b|\s\d{4}\b))/)
        .map((block) => toolbar.cleanText(block).replace(/^[\s).,;:(\[]+|[\s).,;:(\[]+$/g, ""))
        .filter(Boolean)
        .filter((block) => block && toolbar.isLikelyReferenceEntry(block))
        .map((block) => toolbar.createReferenceEntry(block))
        .filter(Boolean);

      return [...new Map(fallback.map((entry) => [entry.raw, entry])).values()];
    }

    return [...new Map(entries.map((entry) => [entry.raw, entry])).values()];
  };

  toolbar.formatReferenceTextForDisplay = function(referenceText) {
    const entries = toolbar.splitReferenceEntries(referenceText);
    if (!entries.length) {
      return toolbar.cleanText(referenceText || "");
    }
    return entries.map((entry, index) => `${index + 1}. ${entry.toDisplayString()}`).join("\n\n");
  };

  toolbar.evaluateReferencesText = async function(referenceText, progressCallback) {
    const entries = toolbar.splitReferenceEntries(referenceText);

    if (!entries.length) {
      return {
        fileName: "reference-integrity-report.txt",
        report: "No references were found on this page or in the pasted text.\n\nPlease paste a reference list manually or use the 'Find references' button again on a page that includes citations."
      };
    }

    const reportLines = [];
    const updateProgress = (stage, current, total) => {
      if (typeof progressCallback !== "function") return;
      progressCallback({ stage, current, total });
    };

    for (const [index, entry] of entries.entries()) {
      const line = entry.toDisplayString();
      const doi = entry.doi || toolbar.extractDoiFromText(line);
      let status;
      const current = index + 1;
      const total = entries.length;

      updateProgress("Evaluating reference", current, total);

      if (doi) {
        updateProgress("Checking DOI", current, total);
        toolbar.addDebugLog("Reference entry contained a DOI; checking it directly.", { doi, line });
        status = await toolbar.fetchCrossrefIntegrity(doi);

        if (status && status.status === "error") {
          const fallbackTitle = entry.getSearchTitle ? entry.getSearchTitle() : toolbar.cleanText(entry.title || line);
          if (fallbackTitle) {
            updateProgress("Searching title fallback", current, total);
            toolbar.addDebugLog("Direct DOI lookup failed; attempting title-based fallback.", { doi, fallbackTitle });
            try {
              const searchCandidates = [
                { path: "/works", params: { "query.title": fallbackTitle, select: "DOI,title,updated,relation", rows: 1 } },
                { path: "/works", params: { "query.bibliographic": fallbackTitle, select: "DOI,title,updated,relation", rows: 1 } }
              ];

              let response = null;
              let responseUrl = "";
              let payload = null;

              for (const candidate of searchCandidates) {
                const request = await toolbar.fetchCrossrefJson(candidate.path, candidate.params);
                response = request.response;
                responseUrl = request.url;
                payload = request.data;

                if (response.ok) {
                  const items = payload && payload.message && Array.isArray(payload.message.items) ? payload.message.items : [];
                  if (items.length) {
                    break;
                  }
                }
              }

              if (response && response.ok) {
                const item = payload && payload.message && Array.isArray(payload.message.items) ? payload.message.items[0] : null;
                const itemDoi = item && item.DOI ? toolbar.normalizeDoi(item.DOI) : "";

                if (itemDoi) {
                  toolbar.addDebugLog("Reference title search matched a DOI.", { fallbackTitle, resolvedDoi: itemDoi, url: responseUrl });
                  status = await toolbar.fetchCrossrefIntegrity(itemDoi);
                }
              }
            } catch (fallbackError) {
              toolbar.addDebugLog("Title fallback after DOI failure also failed.", {
                error: fallbackError && fallbackError.message ? fallbackError.message : "unknown"
              });
            }
          }
        }
      } else {
        try {
          updateProgress("Searching title", current, total);
          const sourceTitle = entry.getSearchTitle ? entry.getSearchTitle() : entry.title || line;
          const searchTitle = toolbar.cleanText(sourceTitle)
            .replace(/\s*(?:DOI|doi)\s*:?\s*10\.\d{4,9}\/[\S]+.*$/i, "")
            .replace(/\s*https?:\/\/[^\s]+/gi, "")
            .replace(/\s*\(\s*\d{1,4}\s*(?:[-–]\s*\d{1,4})?\s*\)\s*$/g, "")
            .replace(/\s*,\s*\d{1,4}\s*(?:[-–]\s*\d{1,4})?\s*$/g, "")
            .replace(/\s*[-–]\s*\d{1,4}\s*$/g, "")
            .replace(/\s+\d{1,4}\s*$/g, "")
            .replace(/\s*[-–]\s*$/g, "")
            .trim();

          toolbar.addDebugLog("Reference entry did not contain a DOI; attempting title-based Crossref lookup.", { line, searchTitle });

          if (!searchTitle) {
            status = {
              doi: "",
              alerts: [],
              summary: "No searchable title was available for this reference.",
              status: "missing-doi"
            };
          } else {
            const searchCandidates = [
              { path: "/works", params: { "query.title": searchTitle, select: "DOI,title,updated,relation", rows: 1 } },
              { path: "/works", params: { "query.bibliographic": searchTitle, select: "DOI,title,updated,relation", rows: 1 } }
            ];

            let response = null;
            let responseUrl = "";
            let payload = null;

            for (const candidate of searchCandidates) {
              const request = await toolbar.fetchCrossrefJson(candidate.path, candidate.params);
              response = request.response;
              responseUrl = request.url;
              payload = request.data;
              toolbar.addDebugLog("Reference search response received.", {
                status: response.status,
                ok: response.ok,
                searchTitle,
                url: responseUrl
              });

              if (response.ok) {
                const items = payload && payload.message && Array.isArray(payload.message.items) ? payload.message.items : [];
                if (items.length) {
                  break;
                }
              }
            }

            if (!response || !response.ok) {
              const errorMessage = `Crossref title search failed with status ${response ? response.status : "unknown"}`;
              toolbar.addDebugLog(errorMessage, { status: response ? response.status : "unknown", searchTitle });
              status = {
                doi: "",
                alerts: [],
                summary: "Unable to evaluate this reference because the Crossref search failed.",
                status: "error"
              };
            } else {
              toolbar.addDebugLog("Reference search payload received.", {
                searchTitle,
                payloadPreview: toolbar.stringifyForLog(payload, 1500),
                url: responseUrl
              });

              const item = payload && payload.message && Array.isArray(payload.message.items) ? payload.message.items[0] : null;
              const itemDoi = item && item.DOI ? toolbar.normalizeDoi(item.DOI) : "";

              if (!itemDoi) {
                toolbar.addDebugLog("Reference title search returned no usable DOI.", { searchTitle, payloadPreview: toolbar.stringifyForLog(payload, 1000) });
                status = {
                  doi: "",
                  alerts: [],
                  summary: "No DOI match was found for this reference in Crossref.",
                  status: "missing-doi"
                };
              } else {
                toolbar.addDebugLog("Reference title search matched a DOI.", { searchTitle, resolvedDoi: itemDoi });
                status = await toolbar.fetchCrossrefIntegrity(itemDoi);
              }
            }
          }
        } catch (error) {
          const message = error && error.message ? error.message : "unknown fetch error";
          toolbar.addDebugLog("Reference Crossref title lookup failed.", {
            line,
            error: message,
            stack: error && error.stack ? error.stack.slice(0, 1000) : ""
          });
          status = {
            doi: "",
            alerts: [],
            summary: "Unable to evaluate this reference because the Crossref request failed.",
            status: "error",
            error: message
          };
        }
      }

      const issueText = status && status.alerts && status.alerts.length
        ? status.alerts.map((alert) => `${alert.label}: ${alert.detail}`).join("; ")
        : status && status.status === "clear"
          ? "No integrity issues reported."
          : status && status.status === "missing-doi"
            ? "No DOI match found for this reference."
            : status && status.status === "error"
              ? "The Crossref evaluation failed for this reference."
              : "No integrity issues reported.";

      updateProgress("Reference complete", current, total);

      reportLines.push(`${line}\nResult: ${issueText}`);
    }

    const report = reportLines.join("\n\n");
    return {
      fileName: "reference-integrity-report.txt",
      report
    };
  };

  toolbar.createReferenceCheckPanel = function(button, liveRegion) {
    const existingPanel = document.getElementById("umcp-library-reference-panel");
    if (existingPanel) {
      existingPanel.remove();
      return;
    }

    const panel = document.createElement("div");
    panel.id = "umcp-library-reference-panel";
    panel.className = "umcp-library-integrity-panel";
    panel.style.width = "min(440px, calc(100vw - 28px))";
    panel.style.position = "fixed";
    panel.style.left = "20px";
    panel.style.top = "80px";
    panel.style.zIndex = "2147483647";
    panel.style.maxHeight = "calc(100vh - 30px)";
    panel.style.overflow = "auto";

    const titleBar = document.createElement("div");
    titleBar.style.display = "flex";
    titleBar.style.alignItems = "center";
    titleBar.style.justifyContent = "space-between";
    titleBar.style.gap = "8px";
    titleBar.style.marginBottom = "8px";
    titleBar.style.cursor = "move";
    titleBar.style.userSelect = "none";

    const title = document.createElement("div");
    title.className = "umcp-library-integrity-header";
    title.textContent = "Check references";

    const dragHandle = document.createElement("div");
    dragHandle.textContent = "⋮⋮";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.style.font = "bold 16px sans-serif";
    dragHandle.style.color = "#4b5563";
    dragHandle.style.cursor = "move";
    dragHandle.style.lineHeight = "1";

    titleBar.appendChild(title);
    titleBar.appendChild(dragHandle);

    const progressContainer = document.createElement("div");
    progressContainer.style.display = "none";
    progressContainer.style.marginBottom = "8px";

    const progressLabel = document.createElement("div");
    progressLabel.style.font = "11px/1.4 Arial, sans-serif";
    progressLabel.style.color = "#374151";
    progressLabel.textContent = "Waiting for input";

    const progressTrack = document.createElement("div");
    progressTrack.style.width = "100%";
    progressTrack.style.height = "8px";
    progressTrack.style.background = "#e5e7eb";
    progressTrack.style.borderRadius = "999px";
    progressTrack.style.overflow = "hidden";
    progressTrack.style.border = "1px solid #d1d5db";

    const progressFill = document.createElement("div");
    progressFill.style.width = "0%";
    progressFill.style.height = "100%";
    progressFill.style.background = "linear-gradient(90deg, #2563eb, #60a5fa)";
    progressFill.style.transition = "width 0.2s ease";
    progressTrack.appendChild(progressFill);

    progressContainer.appendChild(progressLabel);
    progressContainer.appendChild(progressTrack);

    const textarea = document.createElement("textarea");
    textarea.rows = 12;
    textarea.placeholder = "Click 'Find references' to import them from this page, or paste a list manually.";
    textarea.style.width = "100%";
    textarea.style.minHeight = "180px";
    textarea.style.resize = "vertical";
    textarea.style.boxSizing = "border-box";
    textarea.style.border = "1px solid #d0d7de";
    textarea.style.borderRadius = "8px";
    textarea.style.padding = "8px 10px";
    textarea.style.font = "12px/1.5 Arial, sans-serif";

    textarea.addEventListener("paste", (event) => {
      setTimeout(() => {
        const formatted = toolbar.formatReferenceTextForDisplay(textarea.value || "");
        if (formatted && formatted !== textarea.value) {
          textarea.value = formatted;
        }
      }, 0);
    });

    const actionBar = document.createElement("div");
    actionBar.style.display = "flex";
    actionBar.style.flexWrap = "wrap";
    actionBar.style.gap = "6px";

    const formatPastedButton = document.createElement("button");
    formatPastedButton.type = "button";
    formatPastedButton.textContent = "Format pasted references";
    formatPastedButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";
    formatPastedButton.addEventListener("click", () => {
      const formatted = toolbar.formatReferenceTextForDisplay(textarea.value || "");
      if (formatted) {
        textarea.value = formatted;
        toolbar.setLiveAnnouncement(liveRegion, "Pasted references were formatted into separate citation entries.");
      } else {
        toolbar.setLiveAnnouncement(liveRegion, "No citation entries were recognized in the pasted text.");
      }
    });

    const setProgress = (visible, labelText, value) => {
      progressContainer.style.display = visible ? "block" : "none";
      progressLabel.textContent = labelText || "Waiting for input";
      progressFill.style.width = `${Math.min(100, Math.max(0, Number(value) || 0))}%`;
    };

    const findButton = document.createElement("button");
    findButton.type = "button";
    findButton.textContent = "Find references";
    findButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--integrity";
    findButton.addEventListener("click", () => {
      toolbar.addDebugLog("Find references clicked.");
      setProgress(true, "Finding references…", 10);

      setTimeout(() => {
        const foundText = toolbar.findReferenceTextOnPage();
        setProgress(true, foundText ? "Reference list found" : "No references found", 100);

        if (foundText) {
          textarea.value = toolbar.formatReferenceTextForDisplay(foundText);
          toolbar.addDebugLog(`Reference extraction found ${foundText.length} characters.`);
          toolbar.setLiveAnnouncement(liveRegion, "Reference list imported from the current page.");
        } else {
          textarea.value = "No references were found on this page. Paste a list manually.";
          toolbar.addDebugLog("No references were found on this page.");
          toolbar.setLiveAnnouncement(liveRegion, "No references were found on this page.");
        }

        if (toolbar.DEBUG_MODE) {
          toolbar.downloadDebugLog("umd-library-reference-debug-log.txt");
        }
        setTimeout(() => setProgress(false, "Waiting for input", 0), 800);
      }, 40);
    });

    const evaluateButton = document.createElement("button");
    evaluateButton.type = "button";
    evaluateButton.textContent = "Evaluate References";
    evaluateButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--integrity";
    evaluateButton.addEventListener("click", async () => {
      if (!textarea.value.trim()) {
        textarea.value = "No references were entered. Click 'Find references' or paste a reference list manually.";
        toolbar.addDebugLog("Evaluation attempted with empty reference text.");
        toolbar.setLiveAnnouncement(liveRegion, "No references were entered.");
        return;
      }

      toolbar.addDebugLog("Evaluate References clicked.");
      evaluateButton.disabled = true;
      evaluateButton.textContent = "Evaluating...";
      setProgress(true, "Evaluating references…", 15);
      toolbar.setLiveAnnouncement(liveRegion, "Evaluating the references list for integrity issues.");

      try {
        setProgress(true, "Collecting references…", 35);
        const result = await toolbar.evaluateReferencesText(textarea.value, ({ stage, current, total }) => {
          const safeTotal = Math.max(1, Number(total) || 1);
          const safeCurrent = Math.max(0, Number(current) || 0);
          const percent = 35 + Math.min(50, Math.round((safeCurrent / safeTotal) * 50));
          setProgress(true, stage ? `${stage} ${safeCurrent}/${safeTotal}` : "Evaluating references…", percent);
        });
        toolbar.addDebugLog(`Reference evaluation completed. Report length: ${result.report.length}.`);
        setProgress(true, "Writing reference report…", 85);
        toolbar.downloadTextReport(result.fileName, result.report);
        if (toolbar.DEBUG_MODE) {
          toolbar.downloadDebugLog("umd-library-reference-debug-log.txt");
        }
        toolbar.setLiveAnnouncement(liveRegion, "Reference evaluation complete and the report was downloaded.");
        setProgress(true, "Evaluation complete", 100);
      } finally {
        setTimeout(() => {
          evaluateButton.disabled = false;
          evaluateButton.textContent = "Evaluate References";
          setProgress(false, "Waiting for input", 0);
        }, 700);
      }
    });

    const debugButton = document.createElement("button");
    debugButton.type = "button";
    debugButton.textContent = "Debug log";
    debugButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";
    debugButton.disabled = !toolbar.DEBUG_MODE;
    if (!toolbar.DEBUG_MODE) {
      debugButton.title = "Debug mode is off.";
      debugButton.style.opacity = "0.6";
      debugButton.style.cursor = "not-allowed";
    }
    debugButton.addEventListener("click", () => {
      if (!toolbar.DEBUG_MODE) {
        toolbar.setLiveAnnouncement(liveRegion, "Debug mode is off, so no log export is available.");
        return;
      }
      toolbar.addDebugLog("Debug log export requested manually.");
      toolbar.downloadDebugLog("umd-library-reference-debug-log.txt");
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";
    closeButton.addEventListener("click", () => panel.remove());

    actionBar.appendChild(findButton);
    actionBar.appendChild(formatPastedButton);
    actionBar.appendChild(evaluateButton);
    actionBar.appendChild(debugButton);
    actionBar.appendChild(closeButton);

    panel.appendChild(titleBar);
    panel.appendChild(progressContainer);
    panel.appendChild(textarea);
    panel.appendChild(actionBar);
    toolbar.makeElementDraggable(panel, dragHandle);
    toolbar.addDebugLog("Reference check panel opened.");
    toolbar.appendToPageRoot(panel);
  };

  toolbar.showIntegrityChoices = function(button, liveRegion) {
    const existingMenu = document.getElementById("umcp-library-integrity-menu");
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const menu = document.createElement("div");
    menu.id = "umcp-library-integrity-menu";
    Object.assign(menu.style, {
      position: "fixed",
      zIndex: "2147483647",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      minWidth: "180px",
      padding: "8px",
      background: "#ffffff",
      border: "1px solid #d0d7de",
      borderRadius: "10px",
      boxShadow: "0 10px 28px rgba(0, 0, 0, 0.18)",
      font: "13px/1.4 Arial, sans-serif",
      color: "#111827"
    });

    const articleButton = document.createElement("button");
    articleButton.type = "button";
    articleButton.textContent = "Check article";
    articleButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--integrity";
    articleButton.addEventListener("click", async () => {
      menu.remove();
      await toolbar.runArticleIntegrityCheck(button, liveRegion);
    });

    const referenceButton = document.createElement("button");
    referenceButton.type = "button";
    referenceButton.textContent = "Check references";
    referenceButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";
    referenceButton.addEventListener("click", () => {
      menu.remove();
      toolbar.createReferenceCheckPanel(button, liveRegion);
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";
    closeButton.addEventListener("click", () => menu.remove());

    menu.appendChild(articleButton);
    menu.appendChild(referenceButton);
    menu.appendChild(closeButton);

    const rect = button.getBoundingClientRect();
    const menuWidth = 180;
    const menuHeight = 130;
    menu.style.left = `${Math.min(window.innerWidth - menuWidth - 12, rect.left)}px`;
    menu.style.top = `${Math.min(window.innerHeight - menuHeight - 12, rect.bottom + 8)}px`;

    toolbar.appendToPageRoot(menu);
  };

  toolbar.createIntegrityButton = function(liveRegion) {
    const integrityButton = toolbar.createButton("Check article integrity", () => {
      toolbar.showIntegrityChoices(integrityButton, liveRegion);
    }, "umcp-library-toolbar-button");

    toolbar.applyButtonTheme(integrityButton, toolbar.BUTTON_THEMES.integrity || "umcp-library-toolbar-button--integrity");
    return integrityButton;
  };
})();
