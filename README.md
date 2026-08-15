# UMD Library Tools

UMD Library Tools is a Manifest V3 Chrome extension that helps users move from a paywalled or scholarly page to library-supported access and citation workflows faster.

The project combines:

- a floating toolbar for scholarly pages
- a popup proxy shortcut from the browser action
- page-specific helpers for BNCollege, Google/Scholar, and Amazon

## Current capabilities

### Scholarly-page toolbar

On likely scholarly pages, the extension injects a compact floating toolbar with:

- Open with UMD proxy
- Search UMD Discover
- Get Research Help (LibAnswers)
- Cite panel (MLA/Chicago/APA, RIS, Zotero, copy)
- Check references panel (Crossref lookup and report export)
- Hide toolbar on this site (session-level hide/show button)

### Reference integrity checks

The reference panel can:

- find references from the current page
- clean and split noisy citation blocks
- detect DOI-bearing entries
- evaluate references against Crossref
- export a plain-text integrity report

Recent performance and reliability updates include:

- request-start rate limiting for Crossref polite-pool access
- in-memory caching for successful Crossref JSON responses
- in-memory caching for successful DOI integrity results
- draggable reference panel title bar

### Popup proxy shortcut

The extension popup provides a second path to proxy access for the active tab.

Recent updates include:

- persistent proxy-target fallback in local storage
- persisted host skip-list state used by popup restore logic
- improved proxy-host target recovery behavior

### Page-specific helpers

The extension also includes dedicated integrations:

- BNCollege course-material extraction and CSV export
- Google and Google Scholar library-match panels
- Amazon catalog helper panel

## Project structure

### Toolbar runtime

- toolbarCore.js
- toolbarProxy.js
- toolbarSearch.js
- toolbarHelp.js
- toolbarCite.js
- toolbarIntegrity.js
- proxyButton.js

### Popup

- popup.html
- popup.js

### Page-specific integrations

- content.js + content.css (BNCollege)
- googleSearch.js + googleSearch.css
- amazonSearch.js + amazonSearch.css
- searchIntelligence.js

### Tests

- tests/popup-regression.test.js
- tests/reference-regression.test.js

## Installation (unpacked)

1. Open chrome://extensions.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose this repository folder.

## Validation commands

Run syntax checks:

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && \
node --check popup.js toolbarCore.js toolbarProxy.js toolbarSearch.js toolbarHelp.js toolbarCite.js toolbarIntegrity.js proxyButton.js content.js searchIntelligence.js amazonSearch.js googleSearch.js
```

Run regression harnesses:

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && \
node tests/popup-regression.test.js && \
node tests/reference-regression.test.js
```

Validate popup markup:

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && npx htmlhint popup.html
```

## Browser support

Designed for Chromium-based browsers as an unpacked extension during development.

## Notes

- The toolbar CSS theme has been unified to red buttons with white text.
- Google/Amazon helper surfaces are aligned to the same UMD visual direction.
- Crossref behavior follows polite-pool pacing and includes retry/backoff for transient failures.
