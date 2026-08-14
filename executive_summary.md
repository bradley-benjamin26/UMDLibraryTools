# UMD Library Tools — Executive Summary

## Project purpose

UMD Library Tools is a browser extension built to reduce friction between a user’s current page and the library support they need. Its main goal is to make a scholarly article or journal page feel navigable without sending the user away from the context they are already reading.

## Product focus

The current version is centered on a small, high-value workflow:

- proxy the current page through the UMD access path
- search UMD Discover without leaving the page
- open LibAnswers for research help quickly
- offer citation support when page metadata can be extracted

This is designed as a practical access and discovery tool rather than a general-purpose library portal.

## Architecture

The active architecture is modular and toolbar-based:

- `toolbarCore.js` handles shared toolbar behavior and page detection
- `toolbarProxy.js` handles direct page proxying
- `toolbarSearch.js` handles Discover search actions
- `toolbarHelp.js` handles LibAnswers actions
- `toolbarCite.js` handles citation and metadata extraction
- `popup.js` provides the browser action fallback

The extension still includes legacy helper files for Google, Amazon, and bookstore flows, but the primary experience is the toolbar-based scholarly workflow.

## Why this matters

The main benefit of the current design is clarity. The toolbar is visible only where it is likely useful, the feature set remains compact, and the code is structured so maintenance can focus on a few clear modules instead of a large single script.

## Main files to understand

- `toolbarCore.js` — page detection and shared toolbar creation
- `toolbarProxy.js` — direct proxy behavior
- `toolbarSearch.js` — Discover action and form
- `toolbarHelp.js` — help action
- `toolbarCite.js` — citation metadata and export logic
- `manifest.json` — extension registration and script injection
- `popup.js` — active-tab fallback behavior

## Validation

The project can be validated with a quick syntax and manifest check:

```bash
cd "/Users/bbradle1/Documents/projects/TopTextbookExtension" && node --check toolbarCite.js && node --check toolbarCore.js && node --check toolbarProxy.js && node --check toolbarSearch.js && node --check toolbarHelp.js && node --check proxyButton.js && python3 -m json.tool manifest.json >/dev/null && echo 'validation-ok'
```

## Bottom line

UMD Library Tools is a focused scholarly-access extension prepared around a compact toolbar experience. It keeps the user work low-friction while preserving compatibility with older helper logic and remaining maintainable as a GitHub-ready project.
