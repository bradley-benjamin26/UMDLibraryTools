# UMCP Library Checker — Executive Summary

## Project purpose

UMCP Library Checker is a Chrome extension designed to reduce friction between a user’s current browsing activity and the library support they may need. The extension is centered on a lightweight scholarly-toolbar workflow that appears on likely academic or paywalled pages and offers a short set of actions that help users continue their research with less interruption.

## Current product focus

The current version is intentionally focused on a small set of high-value actions:

- proxy the current page through the UMD access path
- search UMD Discover from the page the user is already on
- open LibAnswers for research help quickly
- allow a user to hide the toolbar on a site that is not useful or relevant

This is a practical access workflow rather than a broad catalog interface.

## Why this architecture matters

The extension is built around a narrow primary flow and a smaller set of legacy helper flows. The main toolbar behavior is concentrated in `proxyButton.js`, which is the key file for understanding the active product direction.

The architecture keeps the current feature set manageable by dividing logic into a few clear layers:

- page detection and toolbar injection
- browser popup proxy behavior
- older page-specific lookup helpers for Google, Amazon, and bookstore surfaces
- query-cleaning logic for noisy search contexts

This helps keep the code understandable and reduces the risk of cross-site regressions.

## Main files to understand

### `proxyButton.js`

This is the primary implementation file for the live product flow. It handles the toolbar, detection heuristics, proxy creation, UMD Discover submission, and site-level opt-out state.

### `popup.js`

This file handles the browser action popup and current-tab proxy behavior.

### `manifest.json`

This file determines where content scripts run and what host permissions the extension has access to.

### `searchIntelligence.js`

This file helps avoid low-quality catalog searches by cleaning and evaluating user queries before they are used in library searches.

### Legacy page helper files

- `content.js`
- `googleSearch.js`
- `amazonSearch.js`

These files support site-specific catalog assistant flows that remain in the repository but are not the primary product direction.

## Key design decisions

### Page detection is intentionally conservative

The toolbar does not appear everywhere. It is designed to show up only on likely scholarly pages or paywalled resource contexts. This reduces clutter and avoids adding a persistent library UI to ordinary browsing sessions.

### The project preserves a simple user flow

Users are not asked to navigate a complicated interface. The toolbar focuses on a few actions that matter most in the moment: access, discovery, and help.

### The code keeps older helper logic isolated

Legacy flows remain in place for search-heavy or retailer pages, but they are separated from the primary toolbar flow. This helps isolate complexity and makes maintenance easier.

## Maintenance and risk areas

The most important places to monitor are:

- the page detection heuristics in `proxyButton.js`
- the skip-host logic in browser storage
- the browser action popup behavior in `popup.js`
- the manifest match patterns in `manifest.json`
- platform-specific selectors in the legacy helper scripts

If a page is not showing the toolbar when expected, the first place to inspect is the detection layer in `proxyButton.js`.

## Validation

The project includes a lightweight validation command that checks syntax and manifest integrity:

```bash
cd '/Users/bbradle1/Documents/projects/TopTextbookExtension' && node --check proxyButton.js && node --check popup.js && python3 -m json.tool manifest.json >/dev/null && echo 'validation OK'
```

This provides a quick sanity check for the main active code paths.

## Bottom line

UMCP Library Checker is a focused, context-aware research-support extension. It reduces friction in the moment a user encounters a scholarly or paywalled page by offering the most useful library actions directly in context, while keeping the codebase organized around a small set of clear implementation layers.
