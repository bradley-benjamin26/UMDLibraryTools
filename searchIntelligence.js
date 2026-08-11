(() => {
  "use strict";

  // Shared query-planning module for catalog lookups.
  //
  // Phase 1 focuses on three improvements:
  // 1. cleaner handling of natural-language search queries
  // 2. lightweight intent detection (known item vs subject vs citation)
  // 3. better multi-pass SRU query planning without any remote thesaurus calls

  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "best", "book", "books", "find", "for",
    "from", "how", "i", "in", "information", "is", "items", "looking", "materials", "me",
    "my", "of", "on", "or", "please", "resources", "show", "texts", "that", "the", "to",
    "want", "what", "where", "with"
  ]);

  // Leading phrases that often indicate natural-language scaffolding rather than
  // meaningful search terms. We remove these conservatively from the start only.
  const LEADING_SCAFFOLDING_PATTERNS = [
    /^i am looking for\s+/i,
    /^i'm looking for\s+/i,
    /^looking for\s+/i,
    /^can you find\s+/i,
    /^could you find\s+/i,
    /^please find\s+/i,
    /^show me\s+/i,
    /^i want\s+/i,
    /^i need\s+/i,
    /^find me\s+/i,
    /^search for\s+/i,
    /^books?\s+about\s+/i,
    /^books?\s+on\s+/i,
    /^resources?\s+about\s+/i,
    /^resources?\s+on\s+/i,
    /^articles?\s+about\s+/i,
    /^articles?\s+on\s+/i,
    /^information\s+about\s+/i,
    /^information\s+on\s+/i,
    /^works?\s+about\s+/i,
    /^works?\s+on\s+/i,
    /^texts?\s+about\s+/i,
    /^texts?\s+on\s+/i,
    /^what are good books on\s+/i,
    /^what are good books about\s+/i,
    /^what is a good book on\s+/i,
    /^what is a good book about\s+/i,
    /^where can i find\s+/i
  ];

  // In-line cues that strongly suggest a topical or subject-style search.
  const SUBJECT_HINT_PATTERNS = [
    /\babout\b/i,
    /\brelated to\b/i,
    /\btopic of\b/i,
    /\bhistory of\b/i,
    /\bimpact of\b/i,
    /\beffects of\b/i,
    /\bcauses of\b/i,
    /\bpolicy (on|for)\b/i
  ];

  // Queries containing these patterns are usually not good catalog candidates.
  const NON_CATALOG_PATTERNS = [
    /\b(weather|map|maps|news|youtube|reddit|instagram|tiktok|facebook|twitter|x\.com)\b/i,
    /\bnear me\b/i,
    /\bzip code\b/i,
    /\blive score\b/i,
    /\bflight status\b/i,
    /\brestaurant\b/i,
    /\bopen now\b/i,
    /\bjobs?\b/i,
    /\brecipe\b/i,
    /\bmenu\b/i,
    /\bmovie times?\b/i,
    /\bbreaking news\b/i,
    /\bcoupon\b/i,
    /\bpromo code\b/i
  ];

  const DOI_PATTERN = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
  const YEAR_PATTERN = /\b(19|20)\d{2}\b/;
  const TITLE_AUTHOR_PATTERN = /^(.+?)\s+by\s+(.+)$/i;

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function escapeCqlTerm(value) {
    return normalizeText(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function dedupeList(values) {
    const seen = new Set();
    const deduped = [];

    for (const value of values) {
      const normalized = normalizeText(value).toLowerCase();
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      deduped.push(normalizeText(value));
    }

    return deduped;
  }

  function tokenize(text) {
    return normalizeText(text)
      .split(" ")
      .map((token) => token.replace(/[^A-Za-z0-9'\-]/g, "").toLowerCase())
      .filter(Boolean);
  }

  function removeSearchOperators(text) {
    return normalizeText(text)
      .replace(/\b(site|filetype|intitle|inurl|cache|related):\S+/gi, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[?!]+/g, " ")
      .replace(/\s*[-–—]\s*(pdf|epub|kindle|summary|analysis|sparknotes)\b/gi, " ")
      .replace(/\b(edition|ed\.?|hardcover|paperback)\b/gi, " ");
  }

  function stripLeadingScaffolding(text) {
    let stripped = normalizeText(text);

    for (const pattern of LEADING_SCAFFOLDING_PATTERNS) {
      stripped = stripped.replace(pattern, "");
    }

    return normalizeText(stripped);
  }

  function clipToWordLimit(text, maxWords) {
    return normalizeText(text).split(" ").filter(Boolean).slice(0, maxWords).join(" ");
  }

  function getQuotedPhrase(text) {
    const match = normalizeText(text).match(/"([^"]+)"/);
    return normalizeText((match && match[1]) || "");
  }

  function getUsefulTokens(text) {
    return tokenize(text).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  }

  function splitTitleAuthor(text) {
    const match = normalizeText(text).match(TITLE_AUTHOR_PATTERN);
    if (!match) {
      return null;
    }

    const title = normalizeText(match[1]);
    const author = normalizeText(match[2]);

    if (!title || !author) {
      return null;
    }

    return { title, author };
  }

  function detectSearchIntent(cleanedQuery, strippedQuery, context = {}, usefulTokens = []) {
    const sourceType = context.sourceType || "";
    const quotedPhrase = getQuotedPhrase(cleanedQuery);
    const titleAuthor = splitTitleAuthor(strippedQuery || cleanedQuery);
    const lowerQuery = cleanedQuery.toLowerCase();

    if (titleAuthor) {
      return "title-author";
    }

    if (sourceType === "scholar" && (quotedPhrase || DOI_PATTERN.test(cleanedQuery) || YEAR_PATTERN.test(cleanedQuery))) {
      return "citation";
    }

    if (quotedPhrase) {
      return "known-item";
    }

    if (
      SUBJECT_HINT_PATTERNS.some((pattern) => pattern.test(lowerQuery)) ||
      strippedQuery !== cleanedQuery
    ) {
      return "subject";
    }

    if (usefulTokens.length > 0 && usefulTokens.length <= 4) {
      return "known-item";
    }

    return "keyword";
  }

  function shouldAttemptCatalogSearch(analysis, options = {}) {
    const minUsefulWords = Number(options.minUsefulWords) || 2;
    const sourceType = analysis.sourceType || "";

    if (!analysis.cleanedQuery) {
      return {
        shouldSearch: false,
        skipReason: "No usable query remained after cleanup."
      };
    }

    if (NON_CATALOG_PATTERNS.some((pattern) => pattern.test(analysis.cleanedQuery))) {
      return {
        shouldSearch: false,
        skipReason: "The query looks more like a general web search than a catalog search."
      };
    }

    if (analysis.tokens.length === 0 || analysis.tokens.length > analysis.maxWords) {
      return {
        shouldSearch: false,
        skipReason: "The query is either empty or too long to use reliably as a catalog search."
      };
    }

    // Scholar queries are much more likely to be citation-like, so we allow a
    // lower threshold as long as the query is not obviously irrelevant.
    if (sourceType === "scholar") {
      return {
        shouldSearch: true,
        skipReason: ""
      };
    }

    if (analysis.quotedPhrase) {
      return {
        shouldSearch: true,
        skipReason: ""
      };
    }

    if (analysis.usefulTokens.length >= minUsefulWords || analysis.tokens.length <= 3) {
      return {
        shouldSearch: true,
        skipReason: ""
      };
    }

    return {
      shouldSearch: false,
      skipReason: "The query does not contain enough useful catalog terms."
    };
  }

  function analyzeQuery(rawQuery, context = {}, options = {}) {
    const sourceType = context.sourceType || "";
    const maxWords = sourceType === "scholar"
      ? Number(options.maxScholarWords) || 15
      : Number(options.maxQueryWords) || 8;

    const operatorCleaned = removeSearchOperators(rawQuery);
    const cleanedQuery = clipToWordLimit(operatorCleaned, maxWords);
    const strippedQuery = clipToWordLimit(stripLeadingScaffolding(cleanedQuery), maxWords);

    // When scaffolding cleanup leaves too little behind, fall back to the
    // operator-cleaned query rather than over-pruning the user input.
    const searchableQuery = strippedQuery || cleanedQuery;
    const quotedPhrase = getQuotedPhrase(cleanedQuery);
    const usefulTokens = getUsefulTokens(searchableQuery);
    const tokens = tokenize(searchableQuery);
    const titleAuthor = splitTitleAuthor(searchableQuery);
    const intent = detectSearchIntent(cleanedQuery, searchableQuery, context, usefulTokens);
    const decision = shouldAttemptCatalogSearch({
      cleanedQuery: searchableQuery,
      tokens,
      usefulTokens,
      quotedPhrase,
      sourceType,
      maxWords
    }, options);

    return {
      originalQuery: normalizeText(rawQuery),
      cleanedQuery: searchableQuery,
      operatorCleanedQuery: cleanedQuery,
      strippedQuery,
      tokens,
      usefulTokens,
      quotedPhrase,
      titleAuthor,
      searchIntent: intent,
      sourceType,
      maxWords,
      shouldSearch: decision.shouldSearch,
      skipReason: decision.skipReason
    };
  }

  function buildRoute(label, summary, cql, routeType = "keyword") {
    return {
      label,
      summary,
      cql,
      routeType
    };
  }

  function buildFieldPhrase(field, phrase) {
    return `alma.${field}="${escapeCqlTerm(phrase)}"`;
  }

  function buildFieldTokenAnd(field, tokens) {
    return dedupeList(tokens).map((token) => `alma.${field}="${escapeCqlTerm(token)}"`).join(" and ");
  }

  function buildTitleAuthorRoute(title, author, limit = 4) {
    const titleTokens = getUsefulTokens(title).slice(0, limit);
    const authorTokens = getUsefulTokens(author).slice(0, Math.max(1, limit - 1));

    if (titleTokens.length === 0 || authorTokens.length === 0) {
      return "";
    }

    const titlePart = buildFieldTokenAnd("title", titleTokens);
    const authorPart = buildFieldTokenAnd("creator", authorTokens);
    return [titlePart, authorPart].filter(Boolean).join(" and ");
  }

  function buildHeuristicCreatorRoute(tokens) {
    const dedupedTokens = dedupeList(tokens);
    if (dedupedTokens.length < 2) {
      return "";
    }

    const creatorToken = dedupedTokens[dedupedTokens.length - 1];
    const titleTokens = dedupedTokens.slice(0, -1);

    if (titleTokens.length === 0 || !creatorToken) {
      return "";
    }

    return [
      buildFieldTokenAnd("title", titleTokens),
      `alma.creator="${escapeCqlTerm(creatorToken)}"`
    ].filter(Boolean).join(" and ");
  }

  function buildKnownItemCandidates(analysis, options = {}) {
    const candidates = [];
    const keywordLimit = Number(options.keywordCandidateLimit) || 5;
    const usefulTokens = analysis.usefulTokens.slice(0, keywordLimit);

    if (analysis.quotedPhrase) {
      candidates.push(
        buildRoute(
          "quoted title phrase",
          `Tried exact quoted phrase: “${analysis.quotedPhrase}”`,
          buildFieldPhrase("title", analysis.quotedPhrase),
          "exact-title"
        )
      );
    }

    if (analysis.titleAuthor) {
      const mixedRoute = buildTitleAuthorRoute(analysis.titleAuthor.title, analysis.titleAuthor.author, keywordLimit);

      candidates.push(
        buildRoute(
          "title phrase",
          `Matched title phrase: “${analysis.titleAuthor.title}”`,
          buildFieldPhrase("title", analysis.titleAuthor.title),
          "title"
        )
      );

      if (mixedRoute) {
        candidates.push(
          buildRoute(
            "title + creator",
            `Matched title and creator terms from “${analysis.titleAuthor.title}” by “${analysis.titleAuthor.author}”`,
            mixedRoute,
            "title-author"
          )
        );
      }
    } else if (analysis.cleanedQuery) {
      candidates.push(
        buildRoute(
          "title phrase",
          `Matched title phrase: “${analysis.cleanedQuery}”`,
          buildFieldPhrase("title", analysis.cleanedQuery),
          "title"
        )
      );
    }

    if (usefulTokens.length >= 2) {
      candidates.push(
        buildRoute(
          "title keywords",
          `Matched title keywords: ${usefulTokens.join(", ")}`,
          buildFieldTokenAnd("title", usefulTokens),
          "title-keywords"
        )
      );

      const heuristicCreatorRoute = buildHeuristicCreatorRoute(usefulTokens);
      if (heuristicCreatorRoute) {
        candidates.push(
          buildRoute(
            "creator + title mix",
            `Matched likely creator/title terms: ${usefulTokens.join(", ")}`,
            heuristicCreatorRoute,
            "title-author-heuristic"
          )
        );
      }
    }

    if (usefulTokens.length >= 1) {
      candidates.push(
        buildRoute(
          "any-field keywords",
          `Matched keywords anywhere: ${usefulTokens.join(", ")}`,
          buildFieldTokenAnd("any", usefulTokens),
          "keyword"
        )
      );
    }

    return candidates;
  }

  function buildSubjectCandidates(analysis, options = {}) {
    const candidates = [];
    const keywordLimit = Number(options.keywordCandidateLimit) || 5;
    const usefulTokens = analysis.usefulTokens.slice(0, keywordLimit);

    if (analysis.cleanedQuery) {
      candidates.push(
        buildRoute(
          "subject phrase",
          `Tried a subject-oriented search for “${analysis.cleanedQuery}”`,
          buildFieldPhrase("subject", analysis.cleanedQuery),
          "subject"
        )
      );
    }

    if (usefulTokens.length >= 2) {
      candidates.push(
        buildRoute(
          "subject keywords",
          `Matched subject keywords: ${usefulTokens.join(", ")}`,
          buildFieldTokenAnd("subject", usefulTokens),
          "subject-keywords"
        )
      );
    }

    if (usefulTokens.length >= 1) {
      candidates.push(
        buildRoute(
          "any-field keywords",
          `Expanded to keyword matching for: ${usefulTokens.join(", ")}`,
          buildFieldTokenAnd("any", usefulTokens),
          "keyword"
        )
      );
    }

    if (analysis.cleanedQuery && analysis.cleanedQuery.split(" ").length <= 6) {
      candidates.push(
        buildRoute(
          "title fallback",
          `Also tried the cleaned phrase as a title search: “${analysis.cleanedQuery}”`,
          buildFieldPhrase("title", analysis.cleanedQuery),
          "title-fallback"
        )
      );
    }

    return candidates;
  }

  function buildCitationCandidates(analysis, options = {}) {
    const candidates = [];
    const keywordLimit = Number(options.keywordCandidateLimit) || 5;
    const usefulTokens = analysis.usefulTokens.slice(0, keywordLimit);

    if (analysis.quotedPhrase) {
      candidates.push(
        buildRoute(
          "quoted title phrase",
          `Tried exact quoted phrase: “${analysis.quotedPhrase}”`,
          buildFieldPhrase("title", analysis.quotedPhrase),
          "citation-title"
        )
      );
    }

    if (analysis.cleanedQuery) {
      candidates.push(
        buildRoute(
          "citation title phrase",
          `Tried the cleaned Scholar query as a title phrase: “${analysis.cleanedQuery}”`,
          buildFieldPhrase("title", analysis.cleanedQuery),
          "citation-title"
        )
      );
    }

    if (usefulTokens.length >= 2) {
      candidates.push(
        buildRoute(
          "citation keywords",
          `Matched likely citation keywords: ${usefulTokens.join(", ")}`,
          buildFieldTokenAnd("title", usefulTokens),
          "citation-keywords"
        )
      );
    }

    if (usefulTokens.length >= 1) {
      candidates.push(
        buildRoute(
          "any-field citation keywords",
          `Fell back to any-field matching for: ${usefulTokens.join(", ")}`,
          buildFieldTokenAnd("any", usefulTokens),
          "citation-keywords"
        )
      );
    }

    return candidates;
  }

  function buildKeywordCandidates(analysis, options = {}) {
    const candidates = [];
    const keywordLimit = Number(options.keywordCandidateLimit) || 5;
    const usefulTokens = analysis.usefulTokens.slice(0, keywordLimit);

    if (analysis.cleanedQuery) {
      candidates.push(
        buildRoute(
          "title phrase",
          `Tried the cleaned query as a title phrase: “${analysis.cleanedQuery}”`,
          buildFieldPhrase("title", analysis.cleanedQuery),
          "title"
        )
      );
    }

    if (usefulTokens.length >= 2) {
      candidates.push(
        buildRoute(
          "any-field keywords",
          `Matched keywords anywhere: ${usefulTokens.join(", ")}`,
          buildFieldTokenAnd("any", usefulTokens),
          "keyword"
        )
      );

      candidates.push(
        buildRoute(
          "title keywords",
          `Matched title keywords: ${usefulTokens.join(", ")}`,
          buildFieldTokenAnd("title", usefulTokens),
          "title-keywords"
        )
      );
    }

    return candidates;
  }

  function dedupeCandidates(candidates) {
    const seen = new Set();
    const deduped = [];

    for (const candidate of candidates) {
      const key = normalizeText(candidate.cql);
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(candidate);
    }

    return deduped;
  }

  function buildSearchPlan(rawQuery, context = {}, options = {}) {
    const analysis = analyzeQuery(rawQuery, context, options);
    let candidates = [];

    switch (analysis.searchIntent) {
      case "title-author":
      case "known-item":
        candidates = buildKnownItemCandidates(analysis, options);
        break;
      case "subject":
        candidates = buildSubjectCandidates(analysis, options);
        break;
      case "citation":
        candidates = buildCitationCandidates(analysis, options);
        break;
      default:
        candidates = buildKeywordCandidates(analysis, options);
        break;
    }

    return {
      analysis,
      shouldSearch: analysis.shouldSearch,
      skipReason: analysis.skipReason,
      candidates: dedupeCandidates(candidates)
    };
  }

  globalThis.UMCPSearchIntelligence = {
    normalizeText,
    sanitizeQuery(rawQuery, context = {}, options = {}) {
      return analyzeQuery(rawQuery, context, options).cleanedQuery;
    },
    analyzeQuery,
    buildSearchPlan
  };
})();