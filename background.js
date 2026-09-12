chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "CAPTIONROLL/OPEN_QUIZLET") return;
  chrome.tabs.create({ url: "https://quizlet.new" });
});
