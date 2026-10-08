(() => {
  "use strict";

  window.UMDLibraryToolbar = window.UMDLibraryToolbar || {};
  const toolbar = window.UMDLibraryToolbar;

  const EMAIL_STORAGE_KEY = "umcp-library-crossref-email";
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  toolbar.userEmail = "";

  toolbar.isValidEmail = function(value) {
    return EMAIL_PATTERN.test(String(value || "").trim());
  };

  toolbar.loadUserEmail = function() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(EMAIL_STORAGE_KEY, (items) => {
          const stored = items && items[EMAIL_STORAGE_KEY];
          toolbar.userEmail = toolbar.isValidEmail(stored) ? String(stored).trim() : "";
          resolve(toolbar.userEmail);
        });
      } catch (error) {
        resolve("");
      }
    });
  };

  toolbar.saveUserEmail = function(value) {
    const email = String(value || "").trim();
    const previousEmail = toolbar.userEmail;
    toolbar.userEmail = email;
    return new Promise((resolve) => {
      try {
        const done = () => {
          if (chrome.runtime.lastError) {
            toolbar.userEmail = previousEmail;
            resolve(false);
          } else {
            resolve(true);
          }
        };
        if (email) {
          chrome.storage.sync.set({ [EMAIL_STORAGE_KEY]: email }, done);
        } else {
          chrome.storage.sync.remove(EMAIL_STORAGE_KEY, done);
        }
      } catch (error) {
        toolbar.userEmail = previousEmail;
        resolve(false);
      }
    });
  };

  toolbar.openSettingsPanel = function(liveRegion) {
    const existing = document.getElementById("umcp-library-settings-panel");
    if (existing) {
      existing.remove();
      return;
    }

    const panel = document.createElement("form");
    panel.id = "umcp-library-settings-panel";
    panel.className = "umcp-library-integrity-panel umcp-library-settings-panel";
    panel.setAttribute("aria-label", "UMD Library Tools settings");

    const header = document.createElement("div");
    header.className = "umcp-library-integrity-header";
    header.textContent = "Settings";

    const label = document.createElement("label");
    label.className = "umcp-library-settings-label";
    label.setAttribute("for", "umcp-library-settings-email");
    label.textContent = "Your email for Crossref (optional)";

    const input = document.createElement("input");
    input.type = "email";
    input.id = "umcp-library-settings-email";
    input.className = "umcp-library-settings-input";
    input.placeholder = "you@umd.edu";
    input.setAttribute("autocomplete", "email");
    input.value = toolbar.userEmail;

    const help = document.createElement("div");
    help.className = "umcp-library-integrity-summary";
    help.textContent = "Crossref gives faster, more reliable service to requests that identify a contact email (its \"polite pool\"). Your email is sent only to Crossref with reference and integrity lookups, and is stored in your browser sync storage.";

    const message = document.createElement("div");
    message.className = "umcp-library-settings-message";
    message.setAttribute("role", "status");

    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    save.className = "umcp-library-toolbar-button umcp-library-toolbar-button--cite";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.className = "umcp-library-toolbar-button umcp-library-toolbar-button--skip";
    close.addEventListener("click", () => panel.remove());

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") panel.remove();
    });

    panel.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value && !toolbar.isValidEmail(value)) {
        message.textContent = "Please enter a valid email address.";
        input.focus();
        return;
      }
      const saved = await toolbar.saveUserEmail(value);
      message.textContent = !saved
        ? "Could not save settings in this browser."
        : value ? "Saved. Crossref requests will use this email." : "Email removed.";
      toolbar.setLiveAnnouncement(liveRegion, message.textContent);
    });

    [header, label, input, help, message, save, close].forEach((node) => panel.appendChild(node));
    toolbar.appendToPageRoot(panel);
    input.focus();
  };

  toolbar.createSettingsButton = function(liveRegion) {
    const button = toolbar.createButton("\u2699", () => toolbar.openSettingsPanel(liveRegion), "umcp-library-settings-gear");
    button.setAttribute("aria-label", "Open UMD Library Tools settings");
    button.title = "Settings";
    return button;
  };

  toolbar.loadUserEmail();
})();
