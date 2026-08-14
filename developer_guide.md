# UMD Library Tools — Developer Guide

## Overview

UMD Library Tools is a Chrome extension that reduces friction between a user’s browsing session and the library resources they may need. The active architecture is a toolbar injected on likely scholarly pages. It is intentionally lightweight and built around a small set of practical actions: proxy access, UMD Discover search, research help, and cite support.

The current implementation is organized as a modular toolbar system rather than a single large script. The main runtime files are:

- `toolbarCore.js` — shared injection, styling, detection, and utility logic
- `toolbarProxy.js` — proxy URL construction and direct access workflow
- `toolbarSearch.js` — search form and Discover actions
- `toolbarHelp.js` — LibAnswers link behavior
- `toolbarCite.js` — metadata extraction, citation formatting, RIS export, and Zotero support

Legacy support files remain in the repository for compatibility and older workflows, but the active user experience is driven by the toolbar modules above.

---

## Execution model

### Content-script entry points

`manifest.json` registers the toolbar scripts on broad URL matches so they can evaluate pages and decide whether to show the library toolbar.

The main flow is:

1. page loads and the content scripts execute
2. `toolbarCore.js` decides whether the page is likely scholarly
3. `toolbarProxy.js`, `toolbarSearch.js`, `toolbarHelp.js`, and `toolbarCite.js` attach their actions to the injected toolbar
4. chrome extension popup logic provides a separate proxy shortcut from the browser action

### Important design note

This project uses a modular content-script design instead of a single monolithic injection file. That makes maintenance easier, keeps page detection separate from action logic, and reduces the chance that one feature affects another.

---

## File-by-file map

### `manifest.json`

The manifest is the runtime source of truth for:

- extension identity and version
- permissions
- content-script matches
- toolbar stylesheet injection
- browser action popup configuration

The toolbar scripts are injected broadly enough to allow the page-detection logic to decide when a toolbar is relevant.

### `toolbarCore.js`

This is the foundation for the active toolbar system.

It includes:

- toolbar container creation
- button creation and theme application
- page-root insertion helpers
- live-region announcements
- scholarly page detection heuristics
- shared DOM and string utilities

This file is the best starting point for future updates to toolbar layout, behavior, or detection logic.

### `toolbarProxy.js`

This file manages the direct proxy flow.

Responsibilities include:

- canonical URL selection
- recognizing the current page already being proxied
- constructing the correct proxied URL
- attaching the Proxy action to the toolbar

The direct page-preserving flow is intentionally designed to match working bookmarklet behavior and avoid generic menu redirects.

### `toolbarSearch.js`

This file creates the UMD Discover action and search panel. It uses a lightweight in-page form to avoid forcing users to leave the page.

### `toolbarHelp.js`

This file creates the LibAnswers help action and points the user to the UMD research-help site.

### `toolbarCite.js`

This is the citation feature module.

It handles:

- metadata harvesting from meta tags, JSON-LD, and page text
- splitting author names correctly into first/last-name objects
- stripping noisy branding from titles such as JSTOR and Project MUSE prefixes
- building MLA, Chicago Notes & Bibliography, and APA citations
- creating RIS exports and Zotero payloads

### `popup.js`

This file handles the browser action popup. It exposes a simple active-tab fallback for users who prefer to trigger access from the extension menu instead of the page toolbar.

### `popup.html`

This file renders the popup UI and includes the minimal active-tab logic needed to support the popup path.

### `proxyButton.js`

This file still acts as a bootstrap helper. It initializes the toolbar flow and keeps the project compatible with the earlier architecture while the newer modular toolbar files remain the active implementation.

### Legacy support files

The following files remain in the repository for compatibility and older workflows:

- `content.js`
- `googleSearch.js`
- `amazonSearch.js`
- `searchIntelligence.js`
- `content.css`
- `googleSearch.css`
- `amazonSearch.css`

These are not the main user experience, but they preserve older functionality and provide a migration path for future refinements.

---

## Styling architecture

The current styling is shared in `toolbar.css` rather than embedded in a single script. This keeps the toolbar and citation panel styles easier to review and update.

The design uses a UMD-themed palette and a compact floating action pattern, with a focus on clarity over clutter.

---

## Validation flow

This project is designed to be validated with quick syntax and manifest checks:

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && node --check toolbarCite.js && node --check toolbarCore.js && node --check toolbarProxy.js && node --check toolbarSearch.js && node --check toolbarHelp.js && node --check proxyButton.js && python3 -m json.tool manifest.json >/dev/null && echo 'validation-ok'
```

This should be used after making UI or logic changes, especially when modifying metadata handling, page detection, or toolbar wiring.

---

## Maintenance notes

The most likely future work areas are:

- improved metadata heuristics for publisher-specific pages
- additional citation item types beyond journal articles and books
- stricter detection of scholarly pages with unusual URL patterns
- extension packaging and release metadata for GitHub publication

The modular structure means most future work can be done without broad rewrites, as long as new logic remains attached to the existing toolbar architecture.
- paywall-like text signals
- citation metadata elements in the page

This reduces false positives while still catching the kinds of pages a researcher is likely to need support on.

### Build and injection flow

The flow can be thought of as:

1. check current page against skip logic
2. if not skipped, check scholarly heuristics
3. if page qualifies, inject toolbar styles
4. create action buttons for proxy, Discover, and help
5. render a form for Discover search when selected
6. bind click and submit behavior
7. ensure focus and accessibility semantics are present

This is the central user interaction path in the project.

---

## Storage and state handling

The site opt-out behavior is implemented through browser storage.

Relevant behavior:

- `readSkippedHosts()` reads the saved host list
- `writeSkippedHosts()` writes the updated host list
- `shouldSkipToolbarForCurrentPage()` checks whether the current host should be silenced

This is intentionally simple and should stay that way unless the project grows into a full user-settings model.

---

## Proxy and search actions

### Proxy action

The proxy action builds a proxied URL using the current page location:

```js
const proxiedUrl = `${PROXY_BASE_URL}${encodeURIComponent(currentUrl)}`;
```

This is an explicit string-building pattern, not a dynamic rewrite system. It is straightforward and easy to debug.

### Discover action

The Discover action toggles a search form and then submits the user’s query to the UMD Discover URL.

This is a simple form-based interaction and should stay lightweight unless the project adds richer search UX.

### Research-help action

The help button opens the LibAnswers URL directly.

This is intentionally not built around complex query processing. It serves as a direct support path.

---

## Accessibility implementation notes

The toolbar and popup were updated to include clearer keyboard and semantic behavior.

Notable patterns:

- `:focus-visible` styling
- explicit labels for interactive controls
- `aria-live` areas for status updates
- button semantics for actions rather than generic clickable divs
- a predictable keyboard path for the toolbar

When modifying the UI, keep these constraints in mind. Accessibility is tied directly to how the toolbar behaves in a live browser context.

---

## Local testing and validation

### Quick validation commands

Use this command from the project root:

```bash
cd '/Users/bbradle1/Documents/projects/TopTextbookExtension' && node --check proxyButton.js && node --check popup.js && python3 -m json.tool manifest.json >/dev/null && echo 'validation OK'
```

This checks:

- `proxyButton.js` parses without syntax errors
- `popup.js` parses without syntax errors
- `manifest.json` is valid JSON

### Manual browser checks

After loading the extension, verify:

1. toolbar appears on a likely scholarly page
2. toolbar does not appear on excluded or clearly unrelated hosts
3. proxy action opens the page via the UMD proxy
4. Discover form expands correctly and submits to the correct URL
5. help link opens LibAnswers
6. site opt-out works
7. toolbar is keyboard accessible and visible when focused

---

## High-risk change areas

These are the places most likely to break behavior if the project is extended:

1. `proxyButton.js` detection heuristics
2. `SKIP_STORAGE_KEY` handling and `localStorage` access
3. `manifest.json` content-script patterns
4. Google/Amazon-specific selectors in legacy helper files
5. query-cleaning logic in `searchIntelligence.js`

If an issue appears on a real-world page, the first place to inspect is nearly always the page-detection logic in `proxyButton.js`.

---

## Design boundaries and intended scope

This project should remain a focused helper rather than a generalized portal.

It is intentionally designed to:

- be useful at the moment of need
- minimize clutter on ordinary pages
- avoid claiming authority over unrelated page content
- support library workflows without becoming a large page-rewrite engine

This scope is important for maintainability. If future features expand, they should be added deliberately and grouped into separate modules rather than mixed into the primary toolbar logic.

---

## Maintenance guidance

When making future changes, follow this priority order:

1. confirm the issue in the active user flow
2. inspect `proxyButton.js` first if it is a page-visibility or toolbar issue
3. inspect `manifest.json` if the content script is not running
4. inspect `popup.js` if the browser action is failing
5. inspect `searchIntelligence.js` if mismatched queries or false positives appear
6. inspect legacy helper files only when the issue occurs on a known page type such as Google, Amazon, or BNCollege

This order reduces debugging time and keeps the architecture understandable.

---

## Summary for future developers

If you are coming into this project new, the central mental model is:

- page detection lives in `proxyButton.js`
- popup logic lives in `popup.js`
- manifest registration drives where the code runs
- legacy helper scripts remain for site-specific catalog lookup behavior
- `searchIntelligence.js` is the query-cleaning layer for unreliable search contexts

The current project is intentionally compact, but it is not trivial. The main behaviors are concentrated in a small number of files, so a future developer can understand most of the system by reading those files in order.

---

## License note

The repository does not currently define a formal license. If this extension is intended for internal UMD use only, add an internal-use or distribution statement before it is shared more widely.

---

## Debugging guide

This section is intended as a practical checklist for debugging runtime issues in the live extension.

### 1. Start with the page-detection layer

If the toolbar does not appear when expected, the first place to inspect is `proxyButton.js`.

Check:

- `isLikelyScholarlyPage()`
- URL path hints
- host exclusions
- `readSkippedHosts()` / `shouldSkipToolbarForCurrentPage()`
- the page text used to detect paywall or academic signals

Most false negatives and false positives come from one of these heuristics being too strict or too broad.

### 2. Confirm manifest registration

If a content script is not firing at all, inspect `manifest.json` before touching the page logic.

Check:

- `matches` patterns
- script order
- CSS attachment
- the `run_at` timing
- host permissions

A missing match pattern or a too-narrow permission set can make the feature appear broken even when the JavaScript is valid.

### 3. Confirm content-script execution in the browser

Use Chrome DevTools on the target page and look for:

- console errors
- injected elements with the expected IDs or classes
- whether the toolbar was added at all
- whether the script exited early because of a detection decision

Useful debugging patterns:

- inspect `document.body.innerText` on the target page
- confirm the page includes expected metadata tags such as citation fields
- compare the current hostname to the host exclusion list

### 4. Inspect state and persistent toggles

If the toolbar disappears on one site and reappears later, inspect the stored skip-host list.

Relevant code:

- `readSkippedHosts()`
- `writeSkippedHosts()`
- `shouldSkipToolbarForCurrentPage()`

This is a common cause of user confusion because the behavior can appear inconsistent when the host list is stale or when the same domain is visited under a different hostname form.

### 5. Validate the popup flow separately from page injection

The popup and the in-page toolbar are separate code paths.

If the popup fails but the toolbar works, inspect:

- `popup.js`
- `popup.html`
- Chrome tab API access
- whether the active tab exposes a valid URL

If the toolbar works but the popup does not, the issue is likely in the popup’s tab detection or URL validation logic rather than the page-injection detection logic.

### 6. Debug legacy helper pages separately

The Google, Amazon, and bookstore helper flows are not the current primary interface, but they still have site-specific logic.

When debugging those pages:

- inspect the exact page pattern being matched
- verify the metadata extraction is producing the expected title or ISBN
- check the query-cleaning logic in `searchIntelligence.js`
- confirm the panel is mounted in the correct DOM location for that site

These pages are more sensitive to layout changes because they rely on selectors and page structure.

### 7. Use a narrow hypothesis-first approach

When a bug appears, work in this order:

1. confirm whether the content script runs at all
2. confirm whether the page passes the detection heuristic
3. confirm whether the injected UI is created
4. confirm whether the click handler or form handler fires
5. confirm whether the browser API call or URL generation is correct

This sequence is the fastest way to isolate whether the issue is in detection, rendering, or browser interaction.

---

## Architecture principles

The extension now uses a **page-specific modular architecture**.

### Why features are separated by surface

Each supported site has different:

- DOM structure
- mount points
- metadata quality
- rerender behavior
- UX expectations

Keeping the logic in separate files makes maintenance safer and reduces cross-feature regressions.

### Shared implementation concepts across all features

Although the code is separated by page type, the main architectural ideas are shared:

- normalize extracted text before using it
- prefer the strongest available lookup key
- cache SRU lookups to avoid repeated requests
- debounce page reprocessing after DOM mutations
- render semantic, accessible UI
- keep injected styles scoped to the extension panel
- avoid changing the host page layout more than necessary

---

## Alma SRU usage

All current features use Alma SRU as the lookup layer.

### Why SRU is used

SRU works well for this extension because:

- it can be requested directly from a client-side extension
- it does not require maintaining a private proxy server
- it returns structured MARCXML
- availability information is available in the returned record data

### Current SRU configuration

The extension uses the UMD Alma SRU endpoint:

```text
https://usmai-umcp.alma.exlibrisgroup.com/view/sru/01USMAI_UMCP
```

Typical core parameters:

- `version=1.2`
- `operation=searchRetrieve`
- `recordSchema=marcxml`

### Common lookup strategies

#### Bookstore

- `alma.isbn="{isbn}"`

#### Amazon product pages

- ISBN first when available
- then fallback query strategies such as title/author or keyword-style combinations

#### Google / Google Scholar

- phrase or title-oriented query first
- then broader token-based fallback queries

The exact query-building sequence may evolve over time as search quality is tuned.

---

## Availability model

Availability is now tracked separately for print and online resources.

### Print availability: `AVA`

Print availability is based on MARC data fields where:

- `datafield tag="AVA"`
- subfield `code="e"` contains availability status

If any relevant `AVA` field reports `available`, the script can treat the item as print-available.

### Online availability: `AVE`

Electronic availability is based on MARC data fields where:

- `datafield tag="AVE"`
- subfield `code="e"` contains availability status

If any relevant `AVE` field reports `available`, the script can treat the item as having an online version.

### Current UI rules

The Google and Amazon features now apply these display rules:

- show a print badge only when the print state is meaningful
- show an online badge only when the online state is meaningful
- suppress duplicate online badges
- suppress noisy unknown print badges
- include online availability in the summary when relevant

This prevents clutter while still surfacing the most useful information.

---

## Dynamic page handling

All supported page types can rerender without a full page reload.

### Why a `MutationObserver` is used

Google, Google Scholar, Amazon, and the bookstore can all:

- load content after the initial page render
- swap DOM sections after filters or navigation
- replace result containers dynamically

A one-time processing pass is not enough.

So the content scripts use a `MutationObserver` plus debounced processing to detect changes and re-run extraction/injection only after the page settles.

### Debouncing strategy

A timer is typically used to:

1. clear any pending process request
2. wait briefly
3. rerun the main page-processing function

This prevents excessive reruns during rapid DOM updates.

---

## Accessibility design

WCAG AA accessibility is a core project requirement.

All injected UI should continue to follow these patterns.

### Semantic structure

Use semantic elements whenever possible:

- `section`
- real headings such as `h2` and `h3`
- `dl`, `dt`, and `dd` for metadata
- `ol` and `li` for ordered summaries

### Live regions

Live regions are used to announce meaningful changes such as:

- availability updates
- summary panel show/hide events
- bulk actions like opening multiple links
- result load completion

### `aria-busy`

Panels and async result regions should mark loading state so assistive technologies understand that updates are still in progress.

### Focus behavior

Interactive controls should have:

- visible keyboard focus styling
- strong color contrast
- predictable interaction states

### New-tab communication

If links open in a new tab, that behavior should be communicated accessibly using hidden assistive text and/or clear labeling.

### Hide/show behavior

Hide/show controls should:

- update button labels appropriately
- synchronize `aria-expanded`
- use `[hidden]` or equivalent semantic hiding on the collapsible body
- keep the panel in the DOM instead of removing it entirely

This maintains structure and predictability for all users.

---

## Google / Scholar implementation notes

## Page detection

`googleSearch.js` distinguishes:

- standard Google Search result pages
- Google Scholar result pages

This usually depends on hostname and pathname checks.

Examples:

- standard Google search hosts such as `www.google.com/search`
- Scholar hosts such as `scholar.google.com/scholar`

## Mount points

Google changes its DOM periodically, so the script uses:

- one primary mount point
- several fallback mount points

This improves resilience when Google slightly changes its layout.

## Query sanitation

Before sending the query to SRU, the script should remove obvious noise such as:

- search operators
- repeated punctuation
- broad web-only terms
- some non-helpful stop words

The goal is not to perfectly understand the query. It is to transform it into a more catalog-friendly input.

## Result limits

The Google / Scholar feature intentionally renders only the top 5 results. This keeps the panel concise and fast to scan.

## Hide/show control

The Google panel includes an accessible toggle that:

- keeps the panel visible
- collapses only the body
- switches between “Hide results” and “Show results”
- preserves layout consistency

---

## Amazon implementation notes

## Supported page types

The Amazon feature currently targets:

- Amazon search result pages
- Amazon product detail pages

## Metadata extraction priorities

On product pages, the script should prefer:

1. ISBN
2. title
3. author
4. secondary contextual clues if needed

On search pages, the script may rely more heavily on the search query.

## Product-page complexity

Amazon uses different DOM patterns across:

- print books
- Kindle pages
- marketplace listings
- international domains

Selectors are therefore centralized so they can be updated more safely when Amazon changes its markup.

## Hide/show control

Like the Google feature, the Amazon panel now supports an accessible body toggle rather than full panel removal.

---

## Bookstore implementation notes

## Selectors matter most

If the bookstore integration breaks, the first thing to inspect is the `SELECTORS` object.

The bookstore feature depends on consistent detection of:

- the main course-materials container
- each book block
- title text
- author text
- metadata rows

## Processed marker

The bookstore feature uses a processed marker attribute so it does not inject duplicate panels into the same book block.

This is especially important because the bookstore page may rerender portions of the DOM more than once.

---

## Suggested code organization patterns

To keep the code clean and efficient, each page-specific script should continue following these structural patterns.

## 1. Centralized configuration

Keep important constants grouped together:

- endpoints
- max result limits
- debounce timing
- heuristic thresholds
- catalog link settings

## 2. Centralized selectors and class names

Keep selector maps and CSS class maps near the top of each file.

Why this matters:

- easier maintenance
- safer refactoring
- fewer typos
- clearer JS/CSS alignment

## 3. Small utility functions

Examples include:

- text normalization
- HTML escaping
- ISBN normalization
- CQL term escaping
- URL building
- visibility checks

These functions should stay pure and reusable whenever possible.

## 4. Runtime state object

Transient state such as timers, last processed URL, and active request tokens should live in one state object so async behavior is easier to reason about.

## 5. Result caching

Repeated searches for the same query or identifier should reuse the same in-flight or completed Promise whenever possible.

This prevents duplicate SRU traffic and reduces flicker.

## 6. Clear orchestration entry point

Each file should have one central orchestration function such as `processPage()` that:

- reads context
- validates whether the feature should run
- performs the lookup
- renders or updates the panel

This makes the lifecycle easier to follow.

## 7. Explanatory comments

Comment the code at the level of architectural intent rather than restating trivial syntax.

Good comments explain:

- why a selector fallback exists
- why a query strategy is ordered a certain way
- why a status is suppressed from the UI
- why debouncing is needed

---

## Manifest guidance

The final manifest should include separate content script entries for each supported surface.

A typical arrangement would be:

- bookstore content script + stylesheet
- Google / Google Scholar content script + stylesheet
- Amazon content script + stylesheet

### Important Google note

Chrome match patterns do not support a literal `google.*` wildcard. Add each exact Google or Scholar domain that you want to support.

Examples:

- `https://www.google.com/search*`
- `https://www.google.com/webhp*`
- `https://scholar.google.com/scholar*`
- country-specific Google and Scholar domains as needed

### Amazon note

If you want broader international coverage, each Amazon country domain should also be added explicitly.

Examples:

- `https://www.amazon.com/*`
- `https://www.amazon.ca/*`
- `https://www.amazon.co.uk/*`

---

## Common maintenance tasks

## If the bookstore feature stops working

Check:

- bookstore DOM selectors
- visibility checks
- processed markers
- whether the page has replaced nodes entirely

## If Google or Scholar results look poor

Check:

- query sanitation rules
- stop-word list
- candidate query ordering
- whether the panel should be suppressed for that search

## If Amazon extraction becomes unreliable

Check:

- product title selectors
- author selectors
- ISBN extraction selectors
- page-type detection logic

## If SRU lookups fail

Check:

- `host_permissions` in `manifest.json`
- SRU endpoint availability
- request URLs in the console
- response diagnostics
- XML parsing assumptions
- whether Alma index support changed

## If duplicate panels appear

Check:

- processed markers
- stale container reuse
- rerender detection
- whether a page navigation changed the URL without a full reload

## If visited links become unreadable again

Check:

- `:visited` styles for panel links
- page-level host styles that may be bleeding through
- whether button/link styles are still scoped to the panel CSS classes

## If hide/show stops working

Check:

- the body element receiving `[hidden]`
- `aria-expanded` synchronization
- click handler registration
- whether host-page CSS is overriding the panel body display rule

---

## Suggested future improvements

Possible next enhancements include:

- shared utility module for duplicated SRU helpers across Google and Amazon
- stronger book-likeliness heuristics for Google and Amazon queries
- richer availability summaries including locations and call numbers
- optional direct SRU XML debug link in development mode
- improved multi-holding summarization
- more robust support for additional Google and Amazon country domains
- user preference to auto-collapse panels by default
- optional result deduplication across multiple SRU query strategies
- export of extracted summary data for bookstore pages

---

## Final summary

The extension now works across three distinct experiences:

1. **Bookstore pages** for known course materials
2. **Google Search and Google Scholar** for query-driven catalog discovery
3. **Amazon** for shopping/search contexts with ISBN-first matching when possible

The most important design choices are still:

- use Alma SRU for a fully client-side architecture
- prefer ISBN whenever available
- support both print (`AVA`) and online (`AVE`) availability
- avoid heavy layout changes on host pages
- watch for dynamic DOM changes
- cache repeated lookups
- keep injected UI semantic and accessible
- keep site-specific logic separated for maintainability

If you are maintaining this project later, the best places to start are:

- **selectors** if extraction breaks
- **SRU query-building logic** if search quality degrades
- **availability parsing** if Alma behavior changes
- **panel rendering and CSS** if UI needs to change
- **manifest match patterns and permissions** if the extension stops loading or fetching correctly
