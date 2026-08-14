# UMD Library Tools

UMD Library Tools is a Chrome extension for scholarly research workflows. It helps users access library resources quickly from a page they are already reading by providing a lightweight toolbar for proxy access, search, help, and citation support.

The extension focuses on a simple workflow:

- detect when a user is on a likely scholarly page
- show a compact toolbar in the upper-right corner
- allow direct proxy access to the page through UMD
- open UMD Discover or LibAnswers without leaving the page
- provide citation tools for journal articles and books when metadata can be extracted

---

## Features

### Direct proxy access

The extension builds a direct proxied link for the current page and uses the UMD research-port workflow rather than sending users to a generic proxy menu. This preserves the original target page more reliably than a login redirect flow.

### Toolbar actions

On likely scholarly pages, the toolbar includes:

- Proxy access
- Search UMD Discover
- Research help via LibAnswers
- Cite support for metadata extraction and export
- Optional hide action for sites where the toolbar is not useful

### Citation support

The citation module currently supports metadata harvesting and citation formatting for journal articles and books. It can:

- collect author, title, journal, volume, issue, pages, DOI, URL, and abstract data
- normalize author names into usable first/last-name objects
- generate MLA, Chicago Notes & Bibliography, and APA citations
- export RIS data and send a citation to Zotero if available locally

### Popup support

The browser action popup provides a second access path for the current tab, making the proxy option available without requiring the user to open the page’s toolbar.

---

## Project structure

### Core runtime files

- `toolbarCore.js` — shared toolbar utilities, page detection, button theming, root injection
- `toolbarProxy.js` — direct proxy generation and page-proxy logic
- `toolbarSearch.js` — UMD Discover search UI and submission flow
- `toolbarHelp.js` — LibAnswers help action
- `toolbarCite.js` — citation metadata extraction, style formatting, RIS export, and Zotero support
- `proxyButton.js` — bootstrap/init shim for the toolbar flow
- `popup.js` — browser action popup logic
- `popup.html` — popup UI

### Styling

- `toolbar.css` — main toolbar and citation-panel styling
- `content.css` — legacy page helper styling
- `googleSearch.css` — Google helper styling
- `amazonSearch.css` — Amazon helper styling

### Legacy support files

- `content.js` — legacy bookstore/page helper logic
- `googleSearch.js` — legacy Google and Google Scholar helper logic
- `amazonSearch.js` — legacy Amazon page helper logic
- `searchIntelligence.js` — shared query cleaning and metadata heuristics

### Metadata and project docs

- `manifest.json` — extension registration, permissions, and injected scripts
- `README.md` — project overview and usage notes
- `developer_guide.md` — implementation details and architecture history
- `executive_summary.md` — concise product summary

---

## Installation and local testing

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project directory.
5. Open a journal or scholarly page and confirm the toolbar appears.

### Recommended validation checks

- open a JSTOR or Project MUSE article page
- confirm the toolbar appears in the upper-right area
- click Proxy and verify the direct proxied page loads as expected
- click Search UMD Discover and confirm the search panel opens
- click Research Help and confirm LibAnswers opens
- click Cite and confirm the panel opens with citation options

---

## Browser compatibility

This project is designed for Chromium-based browsers and is intended to be used as an unpacked extension during development.

---

## Accessibility and UX notes

The extension includes a small set of accessibility-oriented features:

- explicit focus styles for toolbar and popup controls
- live-region announcements for dynamic status updates
- compact inline actions that minimize visual interruption on article pages
- a hide option so users can opt out on sites where the toolbar is not useful

---

## Validation

Use the following command to verify the extension still parses cleanly:

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && node --check toolbarCite.js && node --check toolbarCore.js && node --check toolbarProxy.js && node --check toolbarSearch.js && node --check toolbarHelp.js && node --check proxyButton.js && python3 -m json.tool manifest.json >/dev/null && echo 'validation-ok'
```

---

## Repository status

The project is in a working, extension-ready state for a GitHub repository. It keeps compatibility with older helper features while using the modular toolbar architecture as the primary user experience.
