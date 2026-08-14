(() => {
  "use strict";

  if (!window.UMDLibraryToolbar) {
    window.UMDLibraryToolbar = {};
  }

  const toolbar = window.UMDLibraryToolbar;

  function initializeToolbar() {
    if (typeof toolbar.resolveProxyTargetUrl === "function") {
      toolbar.resolveProxyTargetUrl();
    }

    if (typeof toolbar.injectToolbar === "function") {
      toolbar.injectToolbar();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeToolbar, { once: true });
  } else {
    initializeToolbar();
  }
})();
