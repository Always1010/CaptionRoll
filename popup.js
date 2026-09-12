(() => {
  "use strict";

  const settingsEngine = globalThis.CaptionRollSettings;
  const panelVisible = document.querySelector('[data-setting="captionRollPanelVisible"]');
  const fontScale = document.querySelector('[data-setting="captionRollFontScale"]');
  const follow = document.querySelector('[data-setting="captionRollFollow"]');
  const expanded = document.querySelector('[data-setting="captionRollExpanded"]');
  const scaleOutput = document.querySelector('[data-output="captionRollFontScale"]');
  const status = document.querySelector(".saved");

  function render(settings) {
    panelVisible.checked = settings.captionRollPanelVisible;
    fontScale.value = String(settings.captionRollFontScale);
    follow.checked = settings.captionRollFollow;
    expanded.checked = !settings.captionRollCollapsed;
    scaleOutput.value = `${Math.round(settings.captionRollFontScale * 100)}%`;
    document.querySelector(
      `input[name="interaction"][value="${settings.captionRollInteractionMode}"]`
    ).checked = true;
  }

  async function load() {
    const saved = await chrome.storage.local.get(settingsEngine.defaults);
    render(settingsEngine.normalize(saved));
  }

  async function save(values) {
    await chrome.storage.local.set(values);
    status.textContent = "已保存";
    window.setTimeout(() => {
      status.textContent = "设置会自动保存在本机";
    }, 1000);
  }

  panelVisible.addEventListener("change", () => save({ captionRollPanelVisible: panelVisible.checked }));
  follow.addEventListener("change", () => save({ captionRollFollow: follow.checked }));
  expanded.addEventListener("change", () => save({ captionRollCollapsed: !expanded.checked }));
  fontScale.addEventListener("input", () => {
    scaleOutput.value = `${Math.round(Number(fontScale.value) * 100)}%`;
  });
  fontScale.addEventListener("change", () => save({ captionRollFontScale: Number(fontScale.value) }));
  document.querySelectorAll('input[name="interaction"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) save({ captionRollInteractionMode: input.value });
    });
  });

  void load();
})();
