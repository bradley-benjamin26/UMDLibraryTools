# UMCP Library Checker — Updated Developer Guide

## Overview

This browser extension enhances multiple web experiences by adding University of Maryland library catalog discovery directly into pages that users are already viewing.

The extension now supports three separate integration surfaces:

1. **B&N Bookstore course materials pages**
2. **Google Search and Google Scholar results pages**
3. **Amazon search results and Amazon product pages**

Each feature is implemented as a separate content-script experience so the logic stays maintainable and page-specific behavior does not get tangled together.

At a high level, the extension:

- detects the current supported page type
- extracts the best available search context from the page
- sends catalog lookups to Alma SRU
- parses returned MARCXML records
- detects print and online availability using Alma availability fields
- injects accessible, page-local UI that lets the user review catalog matches
- updates itself when dynamic page changes occur

---

## Current project files

### `content.js`

Main bookstore integration logic.

Responsibilities:

- detect bookstore book blocks
- extract title, author, edition, publisher, and ISBN
- inject per-book library search panels
- inject the top-of-page toolbar
- run ISBN-based Alma SRU availability checks
- update async availability state
- react to dynamic page rerenders

### `content.css`

Styles used by the bookstore feature.

Responsibilities:

- top toolbar layout
- inline panel styling
- metadata list styling
- button and link styling
- focus styles
- responsive behavior
- screen-reader-only utility classes

### `googleSearch.js`

Google Search and Google Scholar integration logic.

Responsibilities:

- detect standard Google Search pages and Google Scholar pages
- extract the search query from the page URL
- decide whether the query is likely useful as a catalog lookup
- run a small sequence of SRU searches from most precise to broadest
- parse up to the top 5 catalog results
- detect both print and online availability
- inject an accessible panel into the Google or Scholar results page
- support hide/show behavior without removing the panel
- re-run cleanly when Google dynamically updates the results page

### `googleSearch.css`

Styles used by the Google / Google Scholar feature.

Responsibilities:

- UMD-themed panel shell
- result card styling
- availability badges
- metadata layout
- action button styling
- stable visited-link behavior
- hide/show body behavior
- responsive layout

### `amazonSearch.js`

Amazon integration logic.

Responsibilities:

- detect Amazon search result pages and product pages
- extract the strongest available metadata from the page
- prefer ISBN when available
- fall back to title and author when ISBN is unavailable
- run a short SRU search sequence
- parse up to the top 5 catalog results
- detect both print and online availability
- inject an accessible panel into the Amazon page
- support hide/show behavior without removing the panel
- re-run when Amazon updates page content dynamically

### `amazonSearch.css`

Styles used by the Amazon feature.

Responsibilities:

- UMD-themed panel shell
- result card styling
- badge styling
- action control styling
- visited-link overrides
- responsive layout
- hide/show body behavior

### `manifest.json`

The Chrome extension manifest.

Responsibilities:

- defines extension metadata
- declares content scripts and CSS files
- defines site match patterns
- declares host permissions
- determines where the extension can execute network requests

This file is especially important because Alma SRU requests target a host that is different from Google, Amazon, or the bookstore.

Example required permission:

```json
"host_permissions": [
  "https://usmai-umcp.alma.exlibrisgroup.com/*"
]
```

Without that permission, SRU requests may fail even if the page logic is otherwise correct.

---

## Supported experiences

## 1. Bookstore feature

The original bookstore feature is item-driven.

The script starts from known books already listed on the course materials page. Because those records typically expose ISBNs, the feature can perform highly precise SRU lookups.

### Bookstore workflow

When a supported bookstore page loads:

1. `content.js` runs
2. it scans the page for visible, valid book blocks
3. it extracts title, author, edition, publisher, and ISBN
4. it injects a library panel below each book
5. it injects a top-level toolbar at the top of the page
6. it sends ISBN-based SRU requests
7. it parses XML responses
8. it updates the UI with availability results
9. it watches for later page rerenders and reprocesses as needed

### Why ISBN is used

For the bookstore experience, ISBN is the most reliable lookup key because it is:

- more precise than title/author
- less affected by punctuation differences
- less affected by subtitles and edition wording
- ideal for cache keys

---

## 2. Google Search and Google Scholar feature

The Google feature is query-driven rather than item-driven.

Unlike the bookstore page, Google and Google Scholar do not provide a structured book record up front. Instead, the feature must interpret a freeform user query and transform it into one or more SRU searches.

### Google workflow

When a supported Google Search or Google Scholar page loads:

1. `googleSearch.js` detects the page type
2. it reads the query from the `q` URL parameter
3. it sanitizes and normalizes the query
4. it decides whether the query looks likely to help as a catalog search
5. it builds a short sequence of SRU queries from narrowest to broadest
6. it stops when it gets useful results
7. it renders up to 5 results in an injected panel
8. it shows print and online availability where present
9. it supports hiding and re-showing the results body
10. it re-runs when Google or Scholar updates the page dynamically

### Google vs Google Scholar support

A separate file is not required.

`googleSearch.js` supports both page types because they share:

- the same SRU lookup path
- the same result rendering structure
- the same visual design
- the same availability parsing rules

The differences are mostly:

- page detection
- DOM mount point selection
- labeling of the source page in the UI

### Why query heuristics are needed

Google queries are often noisy. Some are clearly catalog-like, while others are not.

Examples likely to work well:

- `beloved toni morrison`
- `introduction to algorithms cormen`
- quoted article titles in Google Scholar

Examples that are less useful:

- `best laptop for college`
- `weather tomorrow`
- `how to fix dishwasher leaking`

The script uses heuristics and token filtering to reduce obviously irrelevant catalog lookups.

---

## 3. Amazon feature

The Amazon feature is a hybrid of item-driven and query-driven behavior.

On product pages, the script can often extract structured metadata such as title, author, and ISBN. On search pages, it may only have the user’s Amazon query.

### Amazon workflow

When a supported Amazon page loads:

1. `amazonSearch.js` detects whether it is a search page or product page
2. it extracts the strongest available metadata
3. it prefers ISBN over title/author when possible
4. it generates one or more SRU queries from strongest to broadest
5. it renders up to 5 results in an injected panel
6. it displays both print and online availability when present
7. it supports hide/show of the panel body
8. it re-runs when Amazon dynamically changes the page

### Why ISBN-first matters on Amazon

Amazon product pages can expose different levels of metadata quality.

ISBN, when present, remains the strongest match key. Title and author fallback logic exists because not every page exposes a reliable ISBN in the visible DOM.

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
