(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  toolbar.closeSearchPanel = function(container, searchButton, liveRegion) {
    const form = container ? container.querySelector(".umcp-library-search-form") : null;
    if (!form) return false;
    form.remove();
    toolbar.setSearchButtonState(searchButton, false);
    toolbar.setLiveAnnouncement(liveRegion, "Search panel closed.");
    searchButton.focus();
    return true;
  };

  toolbar.openSearchPanel = function(container, searchButton, liveRegion) {
    const form = document.createElement("form");
    form.className = "umcp-library-search-form";
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", "Search UMD Discover");
    form.setAttribute("id", "umcp-library-search-form");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "umcp-library-search-input";
    input.placeholder = "Search for articles, books, or journals";
    input.setAttribute("aria-label", "Search UMD Discover for articles, books, or journals");
    input.setAttribute("autocomplete", "off");

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "umcp-library-search-submit";
    submit.textContent = "Go";
    submit.setAttribute("aria-label", "Submit UMD Discover search");

    form.appendChild(input);
    form.appendChild(submit);

    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        toolbar.closeSearchPanel(container, searchButton, liveRegion);
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) return;

      const url = new URL("https://usmai-umcp.primo.exlibrisgroup.com/discovery/search");
      url.searchParams.set("vid", "01USMAI_UMCP:UMCP");
      url.searchParams.set("lang", "en");
      url.searchParams.set("query", `any,contains,${query}`);
      toolbar.setLiveAnnouncement(liveRegion, "Searching UMCP Discover.");
      window.location.href = url.toString();
    });

    container.appendChild(form);
    toolbar.setSearchButtonState(searchButton, true);
    toolbar.setLiveAnnouncement(liveRegion, "Search panel opened.");
    input.focus();
  };

  toolbar.createSearchButton = function(container, liveRegion) {
    const searchButton = toolbar.createButton("Search UMD Discover", () => {
      const existingForm = container.querySelector(".umcp-library-search-form");
      if (existingForm) {
        toolbar.closeSearchPanel(container, searchButton, liveRegion);
        return;
      }

      toolbar.openSearchPanel(container, searchButton, liveRegion);
    }, "umcp-library-toolbar-button");

    searchButton.setAttribute("aria-expanded", "false");
    searchButton.setAttribute("aria-haspopup", "dialog");
    searchButton.removeAttribute("aria-controls");
    toolbar.applyButtonTheme(searchButton, toolbar.BUTTON_THEMES.search);
    return searchButton;
  };
})();
