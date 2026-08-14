# UMD Library Tools

UMD Library Tools is a Chrome extension that helps users move quickly from an article or scholarly page to the appropriate library access or discovery workflow. The extension combines a lightweight in-page toolbar with a popup-based action flow and a few legacy helper integrations that remain useful for catalog-oriented pages.

The current focus is on scholarly pages and paywalled journal content. The extension offers a low-friction way to:

- open the current page through the UMD proxy path
- search UMD Discover without leaving the page
- quickly reach UMD research help

---

## Project overview

This project grew out of a broader set of context-sensitive library helpers and now centers on a single, simple user experience:

1. detect when a user is on a likely scholarly page
2. surface a small floating toolbar in the upper-right corner of the page
3. provide an access action, a discovery action, and a help action
4. retain the older site-specific helper flows for search and catalog pages without making them the primary experience

This keeps the extension useful for a wide range of browsing contexts while keeping the main workflow focused and easy to understand.

---

## Primary features

### Direct proxy flow

The extension generates a direct proxied-domain URL for the current page, matching the working proxy pattern used by the bookmarklet flow. This avoids the login-menu route and preserves the actual target page instead of sending the user to a generic proxy landing page.

### In-page toolbar

On likely scholarly pages, the extension injects a compact toolbar with:

- a proxy button
- a search action for UMD Discover
- a research-help link to UMD LibAnswers
- a hide option for pages where the toolbar is not useful

### Popup flow

The popup validates the active tab URL and provides a consistent proxy action from the extension action menu when the user wants a second access path.

### Legacy support pages

The codebase still includes helper logic for:

- BNCollege pages
- Google and Google Scholar result pages
- Amazon pages

These remain present for compatibility and to preserve older catalog-style workflows, but they are not the primary user experience.

---

## Repository structure

### Runtime files

- `proxyButton.js` — scholarly toolbar injection, page detection, proxy generation, toolbar behavior, Discover search form, help navigation
- `popup.js` — popup logic for active-tab URL inspection and proxy actions
- `popup.html` — browser action popup UI

### Legacy helper files

- `content.js` — BNCollege and legacy page helper logic
- `googleSearch.js` — Google and Google Scholar support
- `amazonSearch.js` — Amazon support
- `searchIntelligence.js` — shared metadata and search logic

### Styling

- `content.css` — legacy page styling
- `googleSearch.css` — Google-specific styling
- `amazonSearch.css` — Amazon-specific styling

### Project metadata

- `manifest.json` — extension registration and script matches
- `README.md` — project overview and local development notes

---

## Proxy behavior and implementation notes

The proxy workflow intentionally uses the direct proxied-host pattern rather than the `login?url=` route because the login-host flow can land the user on a generic proxy menu instead of the intended article page. The direct host pattern matches the working bookmarklet flow and preserves the page target more reliably.

This is an important implementation detail because the bookmarklet is a useful reference point for the intended user experience: open the proxied publisher page directly and let the access system handle the session/auth flow.

---

## Development notes

### Local testing

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose “Load unpacked.”
4. Select this project directory.

### Suggested verification flow

- open a JSTOR or Project MUSE article page
- confirm the toolbar appears in the upper-right corner
- click the proxy button and verify the page loads through the direct proxied host
- verify the Discover action opens the search form
- verify the research-help button opens the LibAnswers page
- verify the popup still opens and proxies the active page correctly

### Browser compatibility

The extension is designed for Chromium-based browsers and is intended to be loaded as an unpacked extension during development rather than published as a broad external distribution.

---

## Accessibility notes

The project includes several accessibility-oriented decisions:

- explicit focus styling for keyboard navigation
- descriptive button labels and accessible search controls
- live-region status messaging for dynamic UI feedback
- a minimal floating action pattern so the toolbar stays unobtrusive while remaining visible and usable

---

## Notes for future maintenance

The areas most likely to require ongoing updates are:

- scholarly detection heuristics in `proxyButton.js`
- proxy URL generation and target preservation
- browser popup behavior when the active tab changes
- host-specific selectors or page patterns in the legacy helper files
- manifest match patterns if the project grows or changes browser support

---

## Current status

This repository is in a usable, functionally focused state for a library-access extension. It remains intentionally hybrid: the toolbar is the primary experience, while the older helper features remain in place for compatibility and optional use.

If the project is being prepared for a public GitHub repository, the recommended next step is to add a formal license file and, if desired, a short project screenshot or architecture diagram to make the repo easier to navigate.
