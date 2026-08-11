# UMCP Library Checker

UMCP Library Checker is a Chrome extension designed to support library access and discovery workflows in context while users browse scholarly or paywalled content. The extension is intended to reduce the number of steps between a user reading a resource and obtaining access to a legitimate library path to that resource.

The current implementation emphasizes a lightweight, in-page library helper rather than a textbook-specific interface. It injects a floating toolbar on likely scholarly pages and provides a simple proxy action from the browser popup when the user is on a page that needs institutional access.

---

## Purpose and user value

The extension supports three primary user actions:

1. Proxy a page through the UMD access pathway.
2. Search UMD Discover from the current page without opening a separate browser tab.
3. Reach research-help support quickly through UMD Library Answers.

This is especially useful when a user encounters a journal article, paywalled resource, or academic landing page and needs a fast path to library support or access.

---

## Functional overview

### In-page scholarly toolbar

The main user-facing feature is a floating toolbar injected into likely scholarly pages. It includes:

- a proxy action for the current page
- an inline search form for UMD Discover
- a direct link to UMD LibAnswers
- a per-site opt-out so a user can disable the toolbar on a host they do not want it on

The toolbar is designed to be low-friction and minimally intrusive. It prioritizes accessibility, a clear action model, and a broad but controlled set of page conditions under which it appears.

### Popup-based proxy flow

The browser popup exposes a current-page proxy action. When a valid page URL is available, the extension:

- reads the active tab URL
- validates the URL format
- constructs the UMD proxy URL
- opens the proxied page in the same tab

This provides a practical route for users who need access through the library proxy without leaving the current browsing session.

### Search UMD Discover

The toolbar includes an inline search interaction:

- user clicks the Discover action
- the toolbar expands to an input field
- user enters a query
- query is submitted to UMD Discover in a new browser navigation

This keeps the workflow anchored in the page the user is already reading while still using the library’s discovery interface.

### Research help

The toolbar includes a direct link to:

- https://umd.libanswers.com/

This provides a quick path to research support without requiring users to locate the library site independently.

---

## Legacy functionality retained in the codebase

The repository still contains earlier helper flows for:

- BNCollege course-material pages
- Google Search and Google Scholar result pages
- Amazon product and search-result pages

These code paths are not the primary experience in the current version, but they remain useful as supplemental catalog lookup tools and as a reference for page-specific metadata extraction logic.

---

## File-level architecture

### Primary runtime files

- `proxyButton.js` — main page-injection logic; scholarly-page heuristics; toolbar rendering; proxy link generation; Discover form logic; skip-host persistence
- `popup.js` — active-tab inspection and proxy execution from the extension popup
- `popup.html` — popup layout and status messaging

### Supporting library lookup files

- `content.js` — older bookstore and page-assist logic
- `googleSearch.js` — Google and Google Scholar helper logic
- `amazonSearch.js` — Amazon search and product-page helper logic
- `searchIntelligence.js` — shared query-cleaning and catalog search planning functions

### Styling

- `content.css` — shared page-injected styles
- `googleSearch.css` — Google-specific styling
- `amazonSearch.css` — Amazon-specific styling
- `proxyButton.js` also injects toolbar styling directly for the floating scholar toolbar

---

## Current behavioral model

The extension currently has two distinct layers:

### 1. Main scholarly access layer

This is the current focus of the project. It is designed to detect likely scholarly or article-like pages and then offer a small set of library actions without overwhelming the page.

Relevant components:

- `proxyButton.js`
- the manifest content script entry for broad page matching
- the skip-host storage logic

### 2. Legacy lookup layer

This layer is retained for catalog-oriented workflows on specific commercial or search surfaces. It provides result panels and search assistance where page structure makes item metadata easier to extract.

Relevant components:

- `content.js`
- `googleSearch.js`
- `amazonSearch.js`
- `searchIntelligence.js`

---

## Technical configuration

### Proxy base URL

```text
http://proxy-um.researchport.umd.edu/login?url=
```

This is the URL format used to pass the current page through the institutional proxy path.

### UMD Discover destination

```text
https://usmai-umcp.primo.exlibrisgroup.com/discovery/search
```

This is the default search destination used by the toolbar’s general search action.

### Research help destination

```text
https://umd.libanswers.com/
```

### Storage behavior

The toolbar supports a “Hide on this site” function. Selected hostnames are stored in browser storage to prevent the toolbar from appearing repeatedly on sites the user does not want it on.

---

## Manifest summary

The extension uses Manifest V3 and includes:

- `activeTab` permissions for current-page inspection
- `storage` permissions for skip-host state
- broad match patterns for the in-page toolbar
- content script entries for legacy site-specific helper flows

The manifest in `manifest.json` is the current source of truth for runtime script registration.

---

## Local testing workflow

### 1. Load the extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click “Load unpacked.”
4. Select the project directory.

### 2. Validate the toolbar on a scholarly page

Use a page that looks like a journal, article, or paywalled academic resource. Confirm that:

- the toolbar appears in the upper-right area of the page
- the proxy action opens the page through the UMD proxy
- the Discover action expands into the input form
- the research-help link opens the LibAnswers page

### 3. Validate the popup flow

Open the browser action popup and confirm:

- the active page is detected correctly
- the proxy button is enabled when a valid URL exists
- the page opens through the proxy when clicked

### 4. Validate legacy helper flows

Optionally test the older helper logic on:

- BNCollege course-material pages
- Google Search results
- Google Scholar results
- Amazon product pages

---

## Accessibility and usability notes

The project is designed with accessibility in mind and includes several important considerations:

- visible focus styles for keyboard users
- clear action labels for buttons and form controls
- `aria-live` announcements for dynamic status updates
- semantically clear controls that can be used without a mouse
- a deliberate effort to keep toolbar interactions minimal and easy to understand

These decisions support broader usability for both students and library staff who may need a fast and reliable interface.

---

## Maintenance considerations

The most important maintenance areas are:

- scholarly detection heuristics in `proxyButton.js`
- host exclusion and skip-host logic
- proxy URL construction
- focus and keyboard behavior for the toolbar
- manifest match patterns
- any legacy helper logic that depends on site-specific selectors or page structure

These are the areas most likely to require adjustment as website layouts or upstream access systems change.

---

## Project status

This project is best understood as a library-access helper focused on three priorities:

- proxying the current page through the UMD access path
- enabling general discovery through UMD Discover
- connecting users to research support quickly while they read scholarly content

The older bookstore, Google, and Amazon lookup code remains in the repository as supplementary functionality and may be updated independently of the current scholarly-toolbar workflow.

---

## License

The repository does not currently declare a formal license. If this extension is intended for internal UMD use only, a project-specific internal-use or licensing statement should be added before broader distribution.
