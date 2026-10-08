(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  // Newspapers the library provides through a database rather than a publisher
  // subscription. To add one, append an entry with the site's hostnames and the
  // MMS ID from the Alma electronic title export (the "MMS ID" column).
  toolbar.NEWSPAPER_ACCESS = [
    { title: "The New York Times", hosts: ["nytimes.com"], mmsId: "9963810551008238", database: "ProQuest" },
    { title: "The Wall Street Journal", hosts: ["wsj.com"], mmsId: "9963809975108238", database: "ProQuest" },
    { title: "The Washington Post", hosts: ["washingtonpost.com"], mmsId: "9963809374808238", database: "ProQuest" },
    { title: "Los Angeles Times", hosts: ["latimes.com"], mmsId: "9963800773608238", database: "ProQuest" },
    { title: "Chicago Tribune", hosts: ["chicagotribune.com"], mmsId: "9963823982508238", database: "ProQuest" },
    { title: "The Baltimore Sun", hosts: ["baltimoresun.com"], mmsId: "9963811651708238", database: "ProQuest" },
    { title: "Barron's", hosts: ["barrons.com"], mmsId: "9963840040308238", database: "ProQuest" }
  ];

  toolbar.findNewspaperAccess = function(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (!host) return null;
    return toolbar.NEWSPAPER_ACCESS.find((entry) =>
      entry.hosts.some((candidate) => toolbar.hostnameMatches(host, candidate))
    ) || null;
  };

  toolbar.getNewspaperCatalogUrl = function(entry) {
    const url = new URL("https://usmai-umcp.primo.exlibrisgroup.com/discovery/fulldisplay");
    url.searchParams.set("docid", `alma${entry.mmsId}`);
    url.searchParams.set("context", "L");
    url.searchParams.set("vid", "01USMAI_UMCP:UMCP");
    url.searchParams.set("lang", "en");
    return url.toString();
  };

  toolbar.createNewspaperButton = function(entry, liveRegion) {
    const button = toolbar.createButton(`Find ${entry.title} in UMD Libraries`, () => {
      toolbar.setLiveAnnouncement(liveRegion, `Opening the library catalog record for ${entry.title} in a new tab.`);
      window.open(toolbar.getNewspaperCatalogUrl(entry), "_blank", "noopener,noreferrer");
    }, "umcp-library-toolbar-button");

    button.title = `UMD Libraries provides ${entry.title} through ${entry.database}. Opens the catalog record in a new tab.`;
    toolbar.applyButtonTheme(button, toolbar.BUTTON_THEMES.newspaper);
    return button;
  };
})();
