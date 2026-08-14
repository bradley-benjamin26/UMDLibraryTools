(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  toolbar.getJsonLdObjects = function() {
    const objects = [];

    Array.from(document.querySelectorAll('script[type="application/ld+json"]')).forEach((node) => {
      if (!node.textContent) return;
      try {
        const parsed = JSON.parse(node.textContent);
        if (Array.isArray(parsed)) {
          objects.push(...parsed);
        } else if (parsed) {
          objects.push(parsed);
        }
      } catch (error) {
        // Ignore malformed JSON-LD blocks; they are not required for citation support.
      }
    });

    return objects;
  };

  toolbar.flattenJsonLd = function(value, results = []) {
    if (!value) return results;
    if (Array.isArray(value)) {
      value.forEach((item) => toolbar.flattenJsonLd(item, results));
      return results;
    }
    if (typeof value !== "object") {
      return results;
    }

    results.push(value);
    Object.values(value).forEach((child) => toolbar.flattenJsonLd(child, results));
    return results;
  };

  toolbar.parseAuthorStringList = function(rawValue) {
    const cleaned = toolbar.cleanText(rawValue || "");
    if (!cleaned) return [];

    const singleAuthorSurnameFirst = /^[A-Z][A-Za-z'’.-]+,\s*[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*$/;
    if (singleAuthorSurnameFirst.test(cleaned)) {
      const [lastName, rest = ""] = cleaned.split(/,\s*/);
      return [{
        firstName: rest.trim(),
        lastName: lastName.trim(),
        displayName: rest.trim() ? `${rest.trim()} ${lastName.trim()}`.trim() : lastName.trim(),
        raw: cleaned
      }];
    }

    const commaSegments = cleaned
      .split(",")
      .map((segment) => toolbar.cleanText(segment))
      .filter(Boolean);

    if (commaSegments.length > 1) {
      const parsedList = commaSegments
        .map((segment) => toolbar.parseAuthorEntry(segment))
        .filter(Boolean);
      if (parsedList.length > 1) {
        return parsedList;
      }
    }

    return [toolbar.parseAuthorEntry(cleaned)].filter(Boolean);
  };

  toolbar.parseAuthorEntry = function(author) {
    if (!author) return null;

    if (typeof author === "string") {
      const cleaned = toolbar.cleanText(author);
      if (!cleaned) return null;

      const singleAuthorSurnameFirst = /^[A-Z][A-Za-z'’.-]+,\s*[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*$/;
      if (singleAuthorSurnameFirst.test(cleaned)) {
        const [lastName, rest = ""] = cleaned.split(/,\s*/);
        const firstName = rest.trim();
        return {
          firstName,
          lastName: lastName.trim(),
          displayName: firstName ? `${firstName} ${lastName}`.trim() : lastName.trim(),
          raw: cleaned
        };
      }

      if (cleaned.includes(",") && cleaned.split(",").length > 2) {
        return null;
      }

      const parts = cleaned.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        return { firstName: "", lastName: parts[0], displayName: parts[0], raw: cleaned };
      }

      const lastName = parts.pop();
      const firstName = parts.join(" ");
      return {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        raw: cleaned
      };
    }

    if (typeof author === "object") {
      const firstName = toolbar.cleanText(author.firstName || author.givenName || "");
      const lastName = toolbar.cleanText(author.lastName || author.familyName || "");
      const name = toolbar.cleanText(author.name || "");
      const displayName = toolbar.cleanText(author.displayName || "");

      if (firstName || lastName || name) {
        const resolvedFirst = firstName || (name && name.split(/\s+/).slice(0, -1).join(" ")) || "";
        const resolvedLast = lastName || (name && name.split(/\s+/).slice(-1)[0]) || "";
        return {
          firstName: resolvedFirst,
          lastName: resolvedLast,
          displayName: displayName || `${resolvedFirst} ${resolvedLast}`.trim() || name,
          raw: name || `${resolvedFirst} ${resolvedLast}`.trim()
        };
      }
    }

    return null;
  };

  toolbar.authorToDisplayName = function(author) {
    if (!author) return "";
    const parsed = toolbar.parseAuthorEntry(author);
    if (parsed) return parsed.displayName || `${parsed.firstName} ${parsed.lastName}`.trim();
    return toolbar.cleanText(author);
  };

  toolbar.normalizeAuthorName = function(name) {
    const parsed = toolbar.parseAuthorEntry(name);
    return parsed ? parsed.displayName : "";
  };

  toolbar.getAuthorsFromMetadata = function() {
    const metaAuthors = toolbar.getMetaArray('meta[name="citation_author"], meta[name="author"], meta[property="article:author"], meta[name="dc.creator"]');
    const metaParsed = metaAuthors
      .flatMap((author) => toolbar.parseAuthorStringList(author))
      .filter(Boolean);
    if (metaParsed.length) return metaParsed;

    const jsonLdObjects = toolbar.flattenJsonLd(toolbar.getJsonLdObjects());
    for (const entry of jsonLdObjects) {
      const authorField = Array.isArray(entry.author) ? entry.author : entry.creator ? entry.creator : [];
      const names = Array.isArray(authorField) ? authorField : [authorField].filter(Boolean);
      const extracted = names
        .flatMap((author) => {
          if (Array.isArray(author)) {
            return author.flatMap((part) => toolbar.parseAuthorStringList(part));
          }
          return toolbar.parseAuthorStringList(author);
        })
        .filter(Boolean);
      if (extracted.length) return extracted;
    }

    return [];
  };

  toolbar.normalizeArticleTitle = function(value) {
    let text = toolbar.cleanText(value || "");
    if (!text) return "";

    text = text
      .replace(/^Project MUSE\s*-\s*/i, "")
      .replace(/^Project MUSE\s*:\s*/i, "")
      .replace(/\s*\|\s*(?:JSTOR|Project MUSE|MUSE|Academic Search|Google Scholar).*$/i, "")
      .replace(/\s*[-–—]\s*(?:[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*(?:,\s*[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*)?)\s*(?:,\s*\d{4})?\s*$/i, "")
      .replace(/\s*[-–—]\s*(?:[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)*,\s*)+(?:\d{4}|n\.d\.)?\s*$/i, "")
      .replace(/\s*[-–—]\s*(?:[A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+(?:,\s*[A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+)*)\s*,\s*\d{4}\s*$/i, "")
      .replace(/,\s*(?:\d{4}|n\.d\.)\s*$/i, "")
      .replace(/\s*[-–:]\s+$/g, "")
      .replace(/^"+|"+$/g, "")
      .trim();

    return text;
  };

  toolbar.extractPageRange = function(value) {
    const text = toolbar.cleanText(value || "");

    const pageRangeMatch = text.match(/(?:pp?\.?\s*[:.-]?\s*|pages?\s*[:.-]?\s*|^|\s)(\d{1,4})\s*[-–]\s*(\d{1,4})(?!\d)/i);
    if (pageRangeMatch) {
      return {
        pages: `${pageRangeMatch[1]}-${pageRangeMatch[2]}`,
        startPage: pageRangeMatch[1],
        endPage: pageRangeMatch[2]
      };
    }

    const plainRangeMatch = text.match(/(?<!\d)(\d{1,4})\s*[-–]\s*(\d{1,4})(?!\d)/i);
    if (plainRangeMatch) {
      return {
        pages: `${plainRangeMatch[1]}-${plainRangeMatch[2]}`,
        startPage: plainRangeMatch[1],
        endPage: plainRangeMatch[2]
      };
    }

    const simpleMatch = text.match(/(?:pp?\.?\s*[:.-]?\s*|pages?\s*[:.-]?\s*)(\d{1,4})(?!\d)/i);
    if (simpleMatch) {
      return {
        pages: simpleMatch[1],
        startPage: simpleMatch[1],
        endPage: ""
      };
    }

    return { pages: "", startPage: "", endPage: "" };
  };

  toolbar.extractJournalAndIssueData = function() {
    const pageText = ((document.body && document.body.innerText) || "") + "\n" + (document.title || "");
    const result = {
      journal: "",
      volume: "",
      issue: "",
      pages: "",
      startPage: "",
      endPage: "",
      year: "",
      month: "",
      title: "",
      abstract: ""
    };

    const journalMatch = pageText.match(/(^|\n)([A-Za-z0-9&'’\.\- ]{2,80})\s*(?:,\s*)?(?:Vol(?:ume)?\.?|Volume)\s+(\d{1,4})/i);
    if (journalMatch && journalMatch[2]) {
      result.journal = toolbar.cleanText(journalMatch[2]);
      const volumeMatch = journalMatch[0].match(/(?:Vol(?:ume)?\.?|Volume)\s+(\d{1,4})/i);
      if (volumeMatch) result.volume = volumeMatch[1];
    }

    const issueMatch = pageText.match(/(?:No\.?|Number)\s+(\d{1,4})/i);
    if (issueMatch) result.issue = issueMatch[1];

    const pageRange = toolbar.extractPageRange(pageText);
    if (pageRange.pages) {
      result.pages = pageRange.pages;
      result.startPage = pageRange.startPage;
      result.endPage = pageRange.endPage;
    }

    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];
    const monthPattern = new RegExp(`\\b(${monthNames.join("|")})\\b`, "i");
    const monthMatch = pageText.match(monthPattern);
    if (monthMatch) result.month = monthMatch[1];

    const yearMatch = pageText.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b|\b(\d{4})\b/i);
    if (yearMatch) {
      const year = yearMatch[1] || yearMatch[2];
      if (year) result.year = year;
    }

    const titleFromDocument = toolbar.normalizeArticleTitle(document.title || "");
    if (titleFromDocument) {
      result.title = titleFromDocument;
    }

    const abstractMatch = pageText.match(/Abstract\s*[:.-]?\s*([\s\S]{50,700}?)(?=\n\s*(?:Journal Information|Publisher Information|Rights & Usage|Keywords|References|Related|Cited by)\b|$)/i);
    if (abstractMatch && abstractMatch[1]) {
      result.abstract = toolbar.cleanText(abstractMatch[1].replace(/\s+/g, " ")).slice(0, 2500);
    }

    return result;
  };

  toolbar.getPublicationMetadata = function() {
    const jsonLdObjects = toolbar.flattenJsonLd(toolbar.getJsonLdObjects());
    const pageMeta = toolbar.extractJournalAndIssueData();
    const metadata = {
      title: toolbar.normalizeArticleTitle(document.title || toolbar.getMetaContent('meta[property="og:title"]') || toolbar.getMetaContent('meta[name="citation_title"]') || ""),
      authors: toolbar.getAuthorsFromMetadata(),
      journal: toolbar.cleanText(pageMeta.journal || toolbar.getMetaContent('meta[name="citation_journal_title"]') || toolbar.getMetaContent('meta[name="dc.source"]') || ""),
      publisher: toolbar.cleanText(toolbar.getMetaContent('meta[name="citation_publisher"]') || toolbar.getMetaContent('meta[name="dc.publisher"]') || toolbar.getMetaContent('meta[name="book_publisher"]') || ""),
      place: toolbar.cleanText(toolbar.getMetaContent('meta[name="citation_place"]') || toolbar.getMetaContent('meta[name="dc.coverage"]') || ""),
      volume: toolbar.cleanText(pageMeta.volume || toolbar.getMetaContent('meta[name="citation_volume"]') || toolbar.getMetaContent('meta[name="volume"]') || ""),
      issue: toolbar.cleanText(pageMeta.issue || toolbar.getMetaContent('meta[name="citation_issue"]') || toolbar.getMetaContent('meta[name="issue"]') || ""),
      pages: toolbar.cleanText(pageMeta.pages || toolbar.getMetaContent('meta[name="citation_pages"]') || toolbar.getMetaContent('meta[name="page"]') || ""),
      startPage: toolbar.cleanText(pageMeta.startPage || ""),
      endPage: toolbar.cleanText(pageMeta.endPage || ""),
      month: toolbar.cleanText(pageMeta.month || ""),
      year: toolbar.cleanText(pageMeta.year || toolbar.getMetaContent('meta[name="citation_publication_date"]') || toolbar.getMetaContent('meta[name="dc.date"]') || toolbar.getMetaContent('meta[property="article:published_time"]') || ""),
      doi: toolbar.cleanText(toolbar.getMetaContent('meta[name="citation_doi"]') || toolbar.getMetaContent('meta[name="doi"]') || ""),
      isbn: toolbar.cleanText(toolbar.getMetaContent('meta[name="citation_isbn"]') || toolbar.getMetaContent('meta[name="isbn"]') || ""),
      issn: toolbar.cleanText(toolbar.getMetaContent('meta[name="citation_issn"]') || toolbar.getMetaContent('meta[name="issn"]') || ""),
      abstract: toolbar.cleanText(pageMeta.abstract || toolbar.getMetaContent('meta[name="citation_abstract"]') || toolbar.getMetaContent('meta[name="description"]') || toolbar.getMetaContent('meta[property="og:description"]') || ""),
      url: toolbar.cleanText(window.location.href)
    };

    for (const entry of jsonLdObjects) {
      const candidate = entry && (entry.name || entry.headline || entry.title || entry.articleSection || entry.isPartOf || entry.author || entry.publisher);
      if (!candidate && !entry) continue;

      metadata.title = metadata.title || toolbar.normalizeArticleTitle(entry.name || entry.headline || entry.title || "");
      metadata.journal = metadata.journal || toolbar.cleanText(entry.isPartOf && (entry.isPartOf.name || entry.isPartOf.issueName) || entry.publication || "");
      metadata.publisher = metadata.publisher || toolbar.cleanText(entry.publisher && (typeof entry.publisher === "string" ? entry.publisher : entry.publisher.name) || "");
      metadata.place = metadata.place || toolbar.cleanText(entry.locationCreated || (entry.publisher && entry.publisher.location) || "");
      metadata.volume = metadata.volume || toolbar.cleanText(entry.volumeNumber || (entry.isPartOf && entry.isPartOf.volumeNumber) || "");
      metadata.issue = metadata.issue || toolbar.cleanText(entry.issueNumber || (entry.isPartOf && entry.isPartOf.issueNumber) || "");
      metadata.pages = metadata.pages || toolbar.cleanText(entry.pagination || (entry.isPartOf && entry.isPartOf.pagination) || "");
      metadata.year = metadata.year || toolbar.cleanText(entry.datePublished || entry.publicationDate || "");
      metadata.doi = metadata.doi || toolbar.cleanText(entry.doi || "");
      metadata.isbn = metadata.isbn || toolbar.cleanText(entry.isbn || "");
      metadata.issn = metadata.issn || toolbar.cleanText(entry.issn || "");
      metadata.abstract = metadata.abstract || toolbar.cleanText(entry.abstract || "");
      metadata.url = metadata.url || toolbar.cleanText(entry.url || window.location.href);

      if (entry.author) {
        const extracted = Array.isArray(entry.author) ? entry.author : [entry.author];
        const authors = extracted
          .flatMap((author) => {
            if (typeof author === "string") return toolbar.parseAuthorStringList(author);
            if (author && (author.name || author.givenName || author.familyName)) {
              const family = author.familyName || "";
              const given = author.givenName || "";
              const combined = family && given ? `${family}, ${given}` : (family || author.name || "");
              return toolbar.parseAuthorStringList(combined);
            }
            return [];
          })
          .filter(Boolean);
        if (authors.length) metadata.authors = metadata.authors.length ? metadata.authors : authors;
      }

      if (metadata.title) break;
    }

    metadata.title = metadata.title || "Untitled";
    if (!metadata.authors || !metadata.authors.length) {
      metadata.authors = [{
        firstName: "",
        lastName: "Unknown author",
        displayName: "Unknown author",
        raw: "Unknown author"
      }];
    }
    return metadata;
  };

  toolbar.formatAuthorList = function(authors, style) {
    const cleanAuthors = (authors || [])
      .map((author) => toolbar.authorToDisplayName(author))
      .filter(Boolean);
    if (!cleanAuthors.length) return "Unknown author";

    if (style === "apa") {
      const formatted = cleanAuthors.slice(0, 7).map((author) => {
        const normalized = toolbar.cleanText(author).replace(/\s+/g, " ");
        if (!normalized) return "";
        if (normalized.includes(",")) {
          const [family, given] = normalized.split(/,\s*/);
          const initials = (given || "")
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + ".")
            .join(" ");
          return `${family}, ${initials}`.trim();
        }

        const tokens = normalized.split(/\s+/);
        if (tokens.length === 1) return `${tokens[0]}, `;
        const family = tokens.pop();
        const initialText = tokens.map((token) => token.charAt(0).toUpperCase() + ".").join(" ");
        return `${family}, ${initialText}`;
      }).filter(Boolean);

      if (formatted.length === 1) return formatted[0];
      if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
      return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
    }

    if (cleanAuthors.length === 1) return cleanAuthors[0];
    if (cleanAuthors.length === 2) return `${cleanAuthors[0]} & ${cleanAuthors[1]}`;
    return `${cleanAuthors.slice(0, -1).join(", ")}, & ${cleanAuthors[cleanAuthors.length - 1]}`;
  };

  toolbar.detectCitationType = function(metadata) {
    const journalText = toolbar.cleanText(metadata.journal || "");
    const isbn = toolbar.cleanText(metadata.isbn || "");
    const issn = toolbar.cleanText(metadata.issn || "");
    const volume = toolbar.cleanText(metadata.volume || "");
    const issue = toolbar.cleanText(metadata.issue || "");
    const pages = toolbar.cleanText(metadata.pages || "");

    if ((journalText || issn || volume || issue || pages) && !isbn) {
      return "journalArticle";
    }

    if (isbn || /book|novel|monograph|edition|publisher/.test((metadata.title || "") + " " + (metadata.abstract || ""))) {
      return "book";
    }

    return "journalArticle";
  };

  toolbar.buildCitationText = function(styleKey = "mla") {
    const metadata = toolbar.getPublicationMetadata();
    const itemType = toolbar.detectCitationType(metadata);
    const authorText = toolbar.formatAuthorList(metadata.authors, styleKey);
    const title = toolbar.cleanText(metadata.title) || "Untitled";
    const journal = toolbar.cleanText(metadata.journal || "Journal Title");
    const volume = toolbar.cleanText(metadata.volume);
    const issue = toolbar.cleanText(metadata.issue);
    const pages = toolbar.cleanText(metadata.pages);
    const year = toolbar.cleanText(metadata.year);
    const matchedYear = year.match(/(\d{4})/) ? year.match(/(\d{4})/)[1] : "";
    const doi = toolbar.cleanText(metadata.doi);
    const url = toolbar.cleanText(metadata.url) || window.location.href;

    if (itemType === "book") {
      const publisher = toolbar.cleanText(metadata.publisher || metadata.journal || "Publisher");
      const place = toolbar.cleanText(metadata.place || "");
      const bookYear = matchedYear || year || "n.d.";
      const bookTitle = title.includes(".") ? title : `${title}.`;

      if (styleKey === "apa") {
        return `${authorText}. (${bookYear}). ${bookTitle} ${publisher}.`;
      }

      if (styleKey === "chicago") {
        return `${authorText}. ${bookTitle} ${place ? `${place}: ` : ""}${publisher}, ${bookYear}.`;
      }

      return `${authorText}. ${bookTitle} ${publisher}, ${bookYear}.`;
    }

    if (styleKey === "apa") {
      const entry = `${authorText}. (${matchedYear || year || "n.d."}). ${title}. ${journal}${volume ? `, ${volume}` : ""}${issue ? `(${issue})` : ""}${pages ? `, ${pages}` : ""}. ${doi ? `https://doi.org/${doi}` : url}`;
      return entry;
    }

    if (styleKey === "chicago") {
      const titleText = title.includes(".") ? title : `${title}.`;
      const source = [journal, volume ? ` ${volume}` : "", issue ? `, no. ${issue}` : "", year ? ` (${matchedYear || year})` : "", pages ? `: ${pages}` : ""].join("").trim();
      return `${authorText}. "${titleText}" ${source}.${doi ? ` https://doi.org/${doi}.` : ` ${url}.`}`;
    }

    const mlaTitle = title.includes(".") ? title : `${title}.`;
    const mlaJournal = [journal, volume ? ` ${volume}` : "", issue ? `, no. ${issue}` : "", year ? ` (${matchedYear || year})` : "", pages ? `: ${pages}` : ""].join("").trim();
    return `${authorText}. "${mlaTitle}" ${mlaJournal}${doi ? ` ${doi}` : ` ${url}`}.`;
  };

  toolbar.logCitationMetadata = function(metadata, context = "citation") {
    console.info(`[UMD citation] ${context}`, metadata);
  };

  toolbar.buildRISRecord = function(metadata) {
    const authors = Array.isArray(metadata.authors) && metadata.authors.length ? metadata.authors : [{
      firstName: "",
      lastName: "Unknown author",
      displayName: "Unknown author",
      raw: "Unknown author"
    }];
    const title = toolbar.cleanText(metadata.title) || "Untitled";
    const journal = toolbar.cleanText(metadata.journal || "");
    const year = toolbar.cleanText(metadata.year || "");
    const volume = toolbar.cleanText(metadata.volume || "");
    const issue = toolbar.cleanText(metadata.issue || "");
    const pages = toolbar.cleanText(metadata.pages || "");
    const doi = toolbar.cleanText(metadata.doi || "");
    const isbn = toolbar.cleanText(metadata.isbn || "");
    const issn = toolbar.cleanText(metadata.issn || "");
    const abstract = toolbar.cleanText(metadata.abstract || "");
    const url = toolbar.cleanText(metadata.url || window.location.href);

    const records = [
      "TY  - JOUR",
      `TI  - ${title}`,
      ...authors.map((author) => {
        const parsed = toolbar.parseAuthorEntry(author);
        if (parsed && parsed.lastName && parsed.firstName) return `AU  - ${parsed.lastName}, ${parsed.firstName}`;
        return `AU  - ${toolbar.authorToDisplayName(author) || "Unknown author"}`;
      }),
      ...(journal ? [`JO  - ${journal}`] : []),
      ...(year ? [`PY  - ${year}`] : []),
      ...(volume ? [`VL  - ${volume}`] : []),
      ...(issue ? [`IS  - ${issue}`] : []),
      ...(pages ? [`SP  - ${pages}`] : []),
      ...(doi ? [`DO  - ${doi}`] : []),
      ...(isbn ? [`SN  - ${isbn}`] : []),
      ...(issn ? [`SN  - ${issn}`] : []),
      ...(abstract ? [`AB  - ${abstract}`] : []),
      `UR  - ${url}`,
      "ER  - "
    ];

    return records.join("\n");
  };

  toolbar.downloadRISFile = function(metadata, filename = "citation.ris") {
    const ris = toolbar.buildRISRecord(metadata);
    const blob = new Blob([ris], { type: "application/x-research-info-systems" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  toolbar.sendCitationToZotero = function(liveRegion) {
    const metadata = toolbar.getPublicationMetadata();
    const item = {
      itemType: "journalArticle",
      title: metadata.title || "Untitled",
      creators: (metadata.authors || []).map((author) => {
        const parsed = toolbar.parseAuthorEntry(author);
        if (parsed) {
          return {
            creatorType: "author",
            firstName: parsed.firstName || "",
            lastName: parsed.lastName || ""
          };
        }

        const cleaned = toolbar.cleanText(author);
        if (!cleaned) return null;
        if (cleaned.includes(",")) {
          const [lastName, firstPart] = cleaned.split(/,\s*/);
          return { creatorType: "author", firstName: firstPart || "", lastName: lastName || "" };
        }
        const parts = cleaned.split(/\s+/).filter(Boolean);
        return {
          creatorType: "author",
          firstName: parts.slice(0, -1).join(" "),
          lastName: parts[parts.length - 1] || ""
        };
      }).filter(Boolean),
      publicationTitle: metadata.journal || "",
      volume: metadata.volume || "",
      issue: metadata.issue || "",
      pages: metadata.pages || "",
      date: metadata.year || "",
      DOI: metadata.doi || "",
      ISSN: metadata.issn || "",
      ISBN: metadata.isbn || "",
      url: metadata.url || window.location.href,
      abstractNote: metadata.abstract || ""
    };

    const endpoints = [
      "http://127.0.0.1:23119/items",
      "http://127.0.0.1:23119/users/0/items",
      "http://127.0.0.1:23119/users/current/items",
      "http://127.0.0.1:23119/library/items"
    ];

    const send = (endpoint) => fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ items: [item] })
    });

    const tryEndpoints = async () => {
      for (const endpoint of endpoints) {
        try {
          const response = await send(endpoint);
          if (response.ok) {
            toolbar.setLiveAnnouncement(liveRegion, "Citation sent to Zotero.");
            return true;
          }
        } catch (error) {
          // Keep trying the next likely Zotero local API endpoint.
        }
      }

      toolbar.setLiveAnnouncement(liveRegion, "Zotero is not running locally or the local API is unavailable.");
      return false;
    };

    tryEndpoints();
  };

  toolbar.createCitationPanel = function(liveRegion) {
    const metadata = toolbar.getPublicationMetadata();
    toolbar.logCitationMetadata(metadata, "collected metadata");

    let panel = document.getElementById("umcp-library-citation-panel");
    if (panel) {
      panel.remove();
      return;
    }

    panel = document.createElement("div");
    panel.id = "umcp-library-citation-panel";
    panel.className = "umcp-library-citation-panel";

    const label = document.createElement("div");
    label.textContent = "Cite";
    label.className = "umcp-library-citation-header";

    const body = document.createElement("div");
    body.className = "umcp-library-citation-body";

    const actions = document.createElement("div");
    actions.className = "umcp-library-citation-actions";

    const risButton = document.createElement("button");
    risButton.type = "button";
    risButton.textContent = "Download .ris";
    risButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--cite";
    risButton.addEventListener("click", () => {
      toolbar.downloadRISFile(toolbar.getPublicationMetadata());
      toolbar.setLiveAnnouncement(liveRegion, "RIS file downloaded.");
    });

    const zoteroButton = document.createElement("button");
    zoteroButton.type = "button";
    zoteroButton.textContent = "Send to Zotero";
    zoteroButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--proxy";
    zoteroButton.addEventListener("click", () => {
      toolbar.sendCitationToZotero(liveRegion);
    });

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy citation";
    copyButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--search";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";

    const previewWrapper = document.createElement("div");
    previewWrapper.className = "umcp-library-citation-preview-wrapper";
    previewWrapper.style.display = "none";

    const previewActions = document.createElement("div");
    previewActions.className = "umcp-library-citation-preview-actions";

    const select = document.createElement("select");
    select.className = "umcp-library-citation-select";
    select.innerHTML = `
      <option value="mla">MLA 9</option>
      <option value="chicago">Chicago 18 / Turabian 9 Notes & Bibliography</option>
      <option value="apa">APA 9</option>
    `;

    const textarea = document.createElement("textarea");
    textarea.className = "umcp-library-citation-output";
    textarea.setAttribute("readonly", "readonly");
    textarea.rows = 6;

    const copyPreviewButton = document.createElement("button");
    copyPreviewButton.type = "button";
    copyPreviewButton.textContent = "Copy citation";
    copyPreviewButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--search";

    const closePreviewButton = document.createElement("button");
    closePreviewButton.type = "button";
    closePreviewButton.textContent = "Close";
    closePreviewButton.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";

    const updateCitation = () => {
      const selectedStyle = select.value;
      const formatted = toolbar.buildCitationText(selectedStyle);
      textarea.value = formatted;
      toolbar.logCitationMetadata({
        itemType: toolbar.detectCitationType(metadata),
        style: selectedStyle,
        formatted,
        raw: metadata
      }, "citation preview");
    };

    select.addEventListener("change", updateCitation);
    copyPreviewButton.addEventListener("click", () => {
      updateCitation();
      const textToCopy = textarea.value;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy)
          .then(() => toolbar.setLiveAnnouncement(liveRegion, "Citation copied to clipboard."))
          .catch(() => toolbar.setLiveAnnouncement(liveRegion, "Copy failed. Please select and copy manually."));
        return;
      }
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
        toolbar.setLiveAnnouncement(liveRegion, "Citation copied to clipboard.");
      } catch (error) {
        toolbar.setLiveAnnouncement(liveRegion, "Copy failed. Please select and copy manually.");
      }
    });

    closePreviewButton.addEventListener("click", () => {
      previewWrapper.style.display = "none";
      panel.style.maxHeight = "320px";
    });

    copyButton.addEventListener("click", () => {
      previewWrapper.style.display = "flex";
      panel.style.maxHeight = "420px";
      updateCitation();
    });

    closeButton.addEventListener("click", () => panel.remove());

    actions.appendChild(risButton);
    actions.appendChild(zoteroButton);
    actions.appendChild(copyButton);
    actions.appendChild(closeButton);
    previewActions.appendChild(copyPreviewButton);
    previewActions.appendChild(closePreviewButton);
    previewWrapper.appendChild(select);
    previewWrapper.appendChild(textarea);
    previewWrapper.appendChild(previewActions);
    body.appendChild(actions);
    body.appendChild(previewWrapper);

    panel.appendChild(label);
    panel.appendChild(body);
    toolbar.appendToPageRoot(panel);
    toolbar.setLiveAnnouncement(liveRegion, "Citation options opened.");
    return panel;
  };

  toolbar.createCiteButton = function(liveRegion) {
    const citeButton = toolbar.createButton("Cite", () => {
      const metadata = toolbar.getPublicationMetadata();
      toolbar.logCitationMetadata(metadata, "collected metadata on cite click");
      toolbar.createCitationPanel(liveRegion);
    }, "umcp-library-toolbar-button");

    toolbar.applyButtonTheme(citeButton, toolbar.BUTTON_THEMES.cite || "umcp-library-toolbar-button--cite");
    return citeButton;
  };

  toolbar.createSkipButton = function(container, liveRegion) {
    const skipButton = toolbar.createButton(
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
          toolbar.setLiveAnnouncement(liveRegion, "Library toolbar restored for this site.");
        });
        toolbar.appendToPageRoot(showButton);
        toolbar.setLiveAnnouncement(liveRegion, "Library toolbar hidden for this site.");
      },
      "umcp-library-toolbar-button"
    );

    toolbar.applyButtonTheme(skipButton, toolbar.BUTTON_THEMES.skip);
    return skipButton;
  };
})();
