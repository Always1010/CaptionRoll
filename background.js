chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url?.startsWith("https://www.youtube.com/")) return;
  chrome.tabs.sendMessage(tab.id, { type: "CAPTIONROLL/TOGGLE" }).catch(() => {});
});
