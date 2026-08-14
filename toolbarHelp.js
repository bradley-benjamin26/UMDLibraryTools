(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  toolbar.createHelpButton = function(liveRegion) {
    const helpButton = toolbar.createButton("Get Research Help", () => {
      toolbar.setLiveAnnouncement(liveRegion, "Opening the UMD research help page in a new tab.");
      window.open("https://umd.libanswers.com/", "_blank", "noopener,noreferrer");
    }, "umcp-library-toolbar-button");

    toolbar.applyButtonTheme(helpButton, toolbar.BUTTON_THEMES.help);
    return helpButton;
  };
})();
