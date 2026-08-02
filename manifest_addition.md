# Manifest update for Google Search support

Add a new content script entry for Google Search pages and keep the Alma host permission already required for SRU.

## Example update

```json
{
  "content_scripts": [
    {
      "matches": [
        "https://www.bkstr.com/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://www.google.com/search*"
      ],
      "js": ["googleSearch.js"],
      "css": ["googleSearch.css"],
      "run_at": "document_idle"
    }
  ],
  "host_permissions": [
    "https://usmai-umcp.alma.exlibrisgroup.com/*"
  ]
}
```

## Important notes
