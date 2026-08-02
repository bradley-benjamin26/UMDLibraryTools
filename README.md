# UMCP Library Checker

UMCP Library Checker is a Chrome browser extension that adds University of Maryland library catalog lookup tools directly into websites people are already using.

The extension currently supports three separate experiences:

1. **B&N Bookstore course materials pages**
2. **Google Search and Google Scholar results pages**
3. **Amazon search results and Amazon product pages**

Across those surfaces, the extension helps users quickly discover whether an item is available through the UMD library catalog, including both print and online availability when Alma SRU returns that information.

---

## What the extension does

### Bookstore integration

On supported B&N bookstore course materials pages, the extension:

- detects visible textbook or course-material entries
- extracts metadata such as title, author, edition, publisher, and ISBN
- injects a per-book library search panel
- adds a top-of-page library toolbar
- performs ISBN-based Alma SRU lookups
- reports availability in the page UI

This is the most precise workflow because bookstore pages often expose ISBNs directly.

### Google Search and Google Scholar integration

On supported Google Search and Google Scholar pages, the extension:

- reads the current search query from the URL
- applies light query heuristics to avoid obviously irrelevant searches
- runs a short sequence of Alma SRU searches from narrowest to broadest
- displays up to the top 5 catalog matches
- reports print availability from `AVA`
- reports online availability from `AVE`
- injects an accessible library results panel near the top of the page

### Amazon integration

On supported Amazon pages, the extension:

- detects Amazon search-result and product-detail pages
- extracts the strongest metadata available from the page
- prefers ISBN when present
- falls back to title and author search when needed
- displays up to the top 5 catalog matches
- reports both print and online availability
- injects an accessible library results panel into the page

---

## Core technical approach

The extension uses **Alma SRU** for catalog search and availability lookup.

Key patterns used across the project:

- **ISBN-first lookups** when reliable ISBNs are available
- **query-driven SRU searching** for Google and Amazon when structured metadata is incomplete
- **MARCXML parsing** to extract bibliographic and availability data
- **`AVA` fields** for print availability
- **`AVE` fields** for online availability
- **client-side UI injection** through content scripts
- **MutationObserver-based rerender handling** for dynamic pages
- **accessibility-first component design**

---

## Project files

### Core bookstore files

- `content.js` — bookstore extraction, panel injection, toolbar behavior, and ISBN-based availability checks
- `content.css` — bookstore styles

### Google / Scholar files

- `googleSearch.js` — Google Search and Google Scholar integration logic
- `googleSearch.css` — Google / Scholar panel styles

### Amazon files

- `amazonSearch.js` — Amazon search and product-page integration logic
- `amazonSearch.css` — Amazon panel styles

### Configuration

- `manifest.json` — Chrome extension manifest

### Documentation

- `README.md` — high-level project overview and setup instructions
- `developer_guide_updated.md` — implementation details and maintenance notes
- `manifest_addition.md` — Google / Scholar manifest example
- `manifest_amazon_addition.md` — Amazon manifest example

---

## Installation for local testing

### 1. Gather the extension files

Put all extension files into a single folder, for example:

```text
umcp-library-checker/
  manifest.json
  content.js
  content.css
  googleSearch.js
  googleSearch.css
  amazonSearch.js
  amazonSearch.css
  README.md
```

If you use icons, place them in the same folder or in a nested `icons/` directory and reference them in `manifest.json`.

### 2. Confirm required manifest entries

Your `manifest.json` should include:

- the bookstore content script entry
- the Google / Google Scholar content script entry
- the Amazon content script entry
- the Alma host permission

At minimum, Alma SRU access requires:

```json
"host_permissions": [
  "https://usmai-umcp.alma.exlibrisgroup.com/*"
]
```

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select your extension folder

### 4. Test supported pages

Recommended test cases:

#### Bookstore
- a B&N course materials page with visible textbooks and ISBNs

#### Google Search
- `beloved toni morrison`
- `introduction to algorithms cormen`
- `hamlet shakespeare`

#### Google Scholar
- a quoted article title
- author + article title

#### Amazon
- a known book-title search
- a title + author search
- a product page with visible ISBN-13

---

## Configuration notes

### UMD catalog link settings

For Google and Amazon catalog-result links, the current UMD catalog settings are:

```js
baseUrl: "https://usmai-umcp.primo.exlibrisgroup.com/discovery/search"
fixedParams: {
  vid: "01USMAI_UMCP:UMCP",
  lang: "en"
}
```

### UMD Alma SRU base

The current SRU base used by the project is:

```text
https://usmai-umcp.alma.exlibrisgroup.com/view/sru/01USMAI_UMCP
```

---

## Accessibility features

The extension is designed with accessibility in mind and uses:

- semantic headings and section structure
- definition lists for metadata
- keyboard-focusable controls
- visible focus states
- live regions for dynamic status updates
- `aria-busy` while asynchronous data is loading
- accessible hide/show controls for Google and Amazon result panels
- clear labeling for links that open in a new tab where applicable

The project should continue to target **WCAG AA** standards for any new work.

---

## Design principles

### Keep supported surfaces separate

Each supported site has its own content script and stylesheet so that page-specific logic stays maintainable.

### Prefer strong identifiers

When ISBN is present, it is the best lookup key because it is more precise than freeform title and author text.

### Fail gracefully on noisy queries

Google and Amazon queries are often messy. The extension should avoid showing low-quality catalog results when the page context is not likely to correspond to a useful library search.

### Avoid page-layout disruption

The injected UI is designed to feel local to the page without breaking the page layout.

---

## Maintenance tips

### If bookstore extraction stops working

Check:

- bookstore selectors in `content.js`
- whether the page changed its structure
- whether the book blocks still expose title, author, and ISBN

### If Google or Amazon results become poor

Check:

- query-cleaning heuristics
- SRU query order
- whether the source page still exposes the metadata the script expects

### If availability display stops working

Check:

- Alma SRU reachability
- `host_permissions` in `manifest.json`
- whether `AVA` and `AVE` fields are still present in the returned MARCXML
- browser console logs if debug output is enabled

### If duplicate or stale panels appear

Check:

- page rerender logic
- processed markers
- MutationObserver scheduling / debouncing

---

## Suggested future improvements

Possible next enhancements include:

- better heuristic filtering for non-library Google and Amazon searches
- richer location and call-number display
- optional user settings for supported sites
- better handling of multiple matching holdings
- improved deduplication across similar editions
- export of extracted bookstore book lists
- Chrome Web Store packaging and release workflow

---

## Publishing options

You can distribute the extension in one of three main ways:

1. **Load unpacked** for personal use or testing
2. **Private/internal sharing** with a small technical group
3. **Chrome Web Store publication** for easier installation and updates

Before publishing, make sure:

- the manifest is finalized
- permissions are as narrow as possible
- all supported match patterns are explicit
- icons and version metadata are present
- your store description clearly explains what the extension does

---

## License / internal use note

Add your preferred license or internal-use statement here.

Examples:

- MIT License
- Apache 2.0
- Internal UMD project / not for redistribution

---

## Quick summary

UMCP Library Checker brings library discovery into:

- bookstore pages
- Google Search and Google Scholar
- Amazon

It does that by:

- extracting the best available search context from each page
- querying Alma SRU
- parsing MARCXML
- detecting print and online availability
- rendering accessible, page-local catalog results for users
