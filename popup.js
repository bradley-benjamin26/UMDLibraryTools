async function getCurrentTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tabs[0];
}

(async () => {
  const pageStatus = document.getElementById("pageStatus");
  const activationStatus = document.getElementById("activationStatus");

  try {
    const tab = await getCurrentTab();
    const url = tab?.url || "";

    if (url.startsWith("https://umcp.bncollege.com/course-material-listing-page")) {
      pageStatus.textContent = "Supported bookstore page detected.";
      activationStatus.textContent = "Library links should appear on book listings.";
      activationStatus.style.color = "#0a6b2d";
    } else if (url.startsWith("https://umcp.bncollege.com/")) {
      pageStatus.textContent = "UMCP bookstore detected.";
      activationStatus.textContent =
        "This extension is currently set up for the course materials listing page.";
      activationStatus.style.color = "#8a5a00";
    } else {
      pageStatus.textContent = "This is not a supported bookstore page.";
      activationStatus.textContent =
        "Open a UMCP Barnes & Noble course materials listing page to use the extension.";
      activationStatus.style.color = "#8b1e1e";
    }
  } catch (error) {
    pageStatus.textContent = "Could not inspect current tab.";
    activationStatus.textContent = error.message;
    activationStatus.style.color = "#8b1e1e";
  }
})();