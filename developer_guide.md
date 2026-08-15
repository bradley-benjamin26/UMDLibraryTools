# UMD Library Tools - Developer Guide

## Purpose

This guide documents the current architecture and maintenance workflow for UMD Library Tools.

The extension is built as:

- a modular scholarly-page toolbar
- a popup-based proxy shortcut
- targeted page integrations for BNCollege, Google/Scholar, and Amazon

## Runtime architecture

### Entry points from manifest

Manifest content scripts are grouped by page type:

- BNCollege course materials: searchIntelligence.js + content.js + content.css
- Google/Scholar search pages: searchIntelligence.js + googleSearch.js + googleSearch.css
- Amazon pages: searchIntelligence.js + amazonSearch.js + amazonSearch.css
- General web pages: toolbarCore.js + toolbarProxy.js + toolbarSearch.js + toolbarHelp.js + toolbarCite.js + toolbarIntegrity.js + proxyButton.js + toolbar.css

### Shared namespace

Toolbar modules share a single global object:

- window.UMDLibraryToolbar

This allows each module to register behaviors without hard imports between files.

## Core modules

### toolbarCore.js

Primary responsibilities:

- scholarly-page detection
- toolbar container creation/injection
- common button and accessibility helpers
- drag behavior for toolbar and draggable panels

Key methods:

- isLikelyScholarlyPage()
- injectToolbar()
- createToolbarContainer()
- makeToolbarDraggable()
- makeElementDraggable()

### toolbarProxy.js

Primary responsibilities:

- proxy target resolution
- proxied URL construction
- proxy success/access state handling
- toolbar proxy button behavior

Storage keys used:

- umcp-library-proxy-last-target
- umcp-library-proxy-success

### toolbarSearch.js

Primary responsibilities:

- Discover search panel open/close behavior
- Discover query submission

### toolbarHelp.js

Primary responsibilities:

- opens LibAnswers in a new tab

### toolbarCite.js

Primary responsibilities:

- metadata harvesting
- citation formatting and preview
- RIS export
- Zotero local API handoff
- toolbar hide/show session behavior

### toolbarIntegrity.js

Primary responsibilities:

- citation/reference extraction and normalization
- DOI detection
- Crossref reference evaluation
- integrity report export
- draggable reference panel UI

Recent behavior updates:

- Crossref request-start pacing queue
- retry/backoff on transient failures
- in-memory Crossref JSON cache
- in-memory DOI integrity cache

## Popup flow

### popup.js

Primary responsibilities:

- active-tab proxy action
- proxy target recovery when current tab is on proxy host/menu
- host skip-list persistence for popup restore state

Storage keys used:

- umcp-library-proxy-last-target
- umcp-library-skip-hosts

### popup.html

- popup shell UI
- loads popup.js

## Page-specific integrations

### content.js + content.css (BNCollege)

- course materials extraction
- per-book availability checks
- summary panel and CSV export

### googleSearch.js + googleSearch.css

- injected catalog helper on Google/Scholar

### amazonSearch.js + amazonSearch.css

- injected catalog helper on Amazon

### searchIntelligence.js

- shared query-cleaning and heuristic helpers

## Styling model

Main toolbar and panel styling:

- toolbar.css
- proxyButton.css

Page-specific styling:

- content.css
- googleSearch.css
- amazonSearch.css

Current theme direction:

- red toolbar buttons with white text
- UMD-aligned neutral surfaces

## Testing and validation

### Syntax check

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && \
node --check popup.js toolbarCore.js toolbarProxy.js toolbarSearch.js toolbarHelp.js toolbarCite.js toolbarIntegrity.js proxyButton.js content.js searchIntelligence.js amazonSearch.js googleSearch.js
```

### Popup regression harness

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && node tests/popup-regression.test.js
```

Covers:

- proxy-target restoration fallback behavior
- skip-list persistence behavior in popup storage helpers

### Reference regression harness

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && node tests/reference-regression.test.js
```

Covers:

- reference splitting
- DOI extraction
- noisy suffix cleanup behavior
- report generation with mocked success/failure paths

### Popup HTML linting

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && npx htmlhint popup.html
```

## High-risk change areas

1. scholarly-page detection heuristics in toolbarCore.js
2. proxy target/state logic in toolbarProxy.js and popup.js
3. reference parsing and Crossref request logic in toolbarIntegrity.js
4. manifest content-script match patterns and load order
5. page selectors in content.js, googleSearch.js, and amazonSearch.js

## Recommended maintenance flow

1. Reproduce on a real page first.
2. Apply smallest-file fix in the owning module.
3. Run syntax checks + both regression harnesses.
4. Validate manually on at least one scholarly page and one page-specific integration.
5. Commit with a scope-specific message.
