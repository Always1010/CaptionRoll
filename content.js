(() => {
  "use strict";

  const MESSAGE_PREFIX = "CAPTIONROLL/";
  const engine = globalThis.CaptionRollEngine;
  const cardEngine = globalThis.CaptionRollCards;
  const initialVideoId =
    location.pathname === "/watch" ? new URLSearchParams(location.search).get("v") : null;
  const state = {
    videoId: initialVideoId,
    rawCues: [],
    sentences: [],
    mode: "sentences",
    interactionMode: "seek",
    view: "transcript",
    favorites: [],
    selectedFavoriteIds: new Set(),
    follow: true,
    collapsed: false,
    fontScale: 1,
    activeIndex: -1,
    statusCode: "loading",
    statusMessage: "正在查找英文字幕…",
    trackLabel: ""
  };

  let host = null;
  let shadow = null;
  let listElement = null;
  let statusElement = null;
  let metaElement = null;
  let resumeButton = null;
  let followButton = null;
  let favoritesElement = null;
  let favoriteCountElement = null;
  let selectAllElement = null;
  let exportStatusElement = null;
  let videoElement = null;
  let observer = null;
  let translatorSession = null;
  let translating = false;

  const template = `
    <style>
      :host { color-scheme: light dark; --cr-accent: #2f80ed; --cr-accent-soft: rgba(47,128,237,.14); }
      * { box-sizing: border-box; }
      button { font: inherit; }
      .panel {
        height: min(76vh, 790px); min-height: 480px; display: grid;
        grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden;
        color: var(--yt-spec-text-primary, #0f0f0f);
        background: var(--yt-spec-base-background, #fff);
        border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.12));
        border-radius: 16px; box-shadow: 0 12px 34px rgba(0,0,0,.16);
        font-family: Roboto, Arial, sans-serif;
      }
      .panel.collapsed { height: 58px; min-height: 58px; grid-template-rows: 58px; }
      .panel.collapsed .toolbar, .panel.collapsed .list-wrap, .panel.collapsed .footer, .panel.collapsed .favorites-view { display: none; }
      .panel.favorites-open .toolbar, .panel.favorites-open > .list-wrap, .panel.favorites-open > .footer { display:none; }
      .header { min-height: 58px; display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px;
        border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
      .brand { min-width: 0; flex: 1; }
      .brand-line { display:flex; align-items:center; gap:8px; }
      .logo { width: 10px; height: 10px; border-radius: 50%; background: var(--cr-accent); box-shadow: 0 0 0 4px var(--cr-accent-soft); }
      h2 { margin: 0; font-size: 16px; line-height: 22px; font-weight: 700; }
      .status { margin-top: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px;
        color: var(--yt-spec-text-secondary, #606060); }
      .icon-button { width: 34px; height: 34px; display:grid; place-items:center; padding:0; border:0; border-radius: 50%;
        color: inherit; background: transparent; cursor:pointer; }
      .icon-button:hover { background: var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
      .favorites-toggle { width:auto; padding:0 10px; gap:5px; white-space:nowrap; font-size:12px; }
      .favorites-toggle.active { color:var(--cr-accent); background:var(--cr-accent-soft); }
      .toolbar { display:flex; align-items:center; gap:8px; padding: 9px 12px; border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
      .segments { display:flex; gap:2px; padding:3px; border-radius:10px; background: var(--yt-spec-10-percent-layer, rgba(0,0,0,.08)); }
      .segments button, .follow { border:0; border-radius:8px; padding:7px 10px; color:inherit; background:transparent; cursor:pointer; font-size:12px; }
      .segments button.active { color:#fff; background:var(--cr-accent); }
      .interaction { border:0; border-radius:8px; padding:7px 10px; color:var(--yt-spec-text-secondary, #606060);
        background:var(--yt-spec-10-percent-layer, rgba(0,0,0,.08)); cursor:pointer; font-size:12px; white-space:nowrap; }
      .interaction.select { color:var(--cr-accent); background:var(--cr-accent-soft); }
      .spacer { flex:1; }
      .follow { display:flex; align-items:center; gap:5px; color:var(--yt-spec-text-secondary, #606060); }
      .follow.active { color:var(--cr-accent); background:var(--cr-accent-soft); }
      .font-controls { display:flex; }
      .font-controls button { width:30px; height:30px; border:0; color:inherit; background:transparent; border-radius:7px; cursor:pointer; }
      .font-controls button:hover { background:var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
      .list-wrap { position:relative; min-height:0; }
      .list { height:100%; overflow:auto; scroll-behavior:smooth; padding: 12px 8px 120px; scrollbar-gutter:stable; }
      .empty { display:grid; place-items:center; min-height:240px; padding:32px; text-align:center; color:var(--yt-spec-text-secondary, #606060); font-size:14px; line-height:1.6; }
      .cue { width:100%; display:grid; grid-template-columns: 48px minmax(0,1fr) 34px; gap:10px; padding: 10px 8px 10px 12px; border:0;
        border-left:3px solid transparent; border-radius:10px; color:inherit; background:transparent; text-align:left; cursor:pointer; }
      .cue:hover { background:var(--yt-spec-10-percent-layer, rgba(0,0,0,.07)); }
      .cue.current { border-left-color:var(--cr-accent); background:var(--cr-accent-soft); }
      .cue.no-favorite { grid-template-columns:48px minmax(0,1fr); padding-right:12px; }
      .list.select-mode .cue { cursor:text; user-select:text; }
      .time { padding-top:2px; color:var(--yt-spec-text-secondary, #606060); font-size:11px; font-variant-numeric: tabular-nums; }
      .text { font-size: calc(16px * var(--cr-font-scale, 1)); line-height:1.55; overflow-wrap:anywhere; }
      .cue.current .text { font-weight:600; }
      .favorite-action { width:32px; height:32px; align-self:start; border:0; border-radius:50%; color:var(--yt-spec-text-secondary, #606060);
        background:transparent; cursor:pointer; font-size:18px; line-height:1; }
      .favorite-action:hover { background:var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
      .favorite-action.saved { color:#f2a100; }
      .resume { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); border:0; border-radius:999px; padding:9px 14px;
        color:#fff; background:var(--cr-accent); box-shadow:0 5px 18px rgba(0,0,0,.25); cursor:pointer; }
      .resume[hidden] { display:none; }
      .footer { min-height:38px; display:flex; align-items:center; padding:8px 14px; border-top:1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1));
        color:var(--yt-spec-text-secondary, #606060); font-size:11px; }
      .favorites-view { grid-row:2 / 5; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; }
      .favorites-view[hidden] { display:none; }
      .favorites-toolbar { display:flex; align-items:center; gap:8px; padding:10px 12px;
        border-bottom:1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
      .check-all { display:flex; align-items:center; gap:7px; font-size:12px; cursor:pointer; }
      .secondary-button { border:0; border-radius:8px; padding:7px 10px; color:inherit;
        background:var(--yt-spec-10-percent-layer, rgba(0,0,0,.08)); cursor:pointer; font-size:12px; }
      .favorites-list { min-height:0; overflow:auto; padding:8px; }
      .favorite-card { display:grid; grid-template-columns:24px minmax(0,1fr) 34px; gap:8px; padding:12px 8px;
        border-bottom:1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.08)); }
      .favorite-card input { margin-top:4px; }
      .favorite-english { font-size:14px; line-height:1.5; overflow-wrap:anywhere; }
      .favorite-chinese { width:100%; min-height:54px; margin-top:8px; resize:vertical; border:1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.14));
        border-radius:8px; padding:8px 9px; color:inherit; background:var(--yt-spec-base-background, #fff); font:inherit; font-size:13px; line-height:1.45; }
      .favorite-chinese:focus { outline:2px solid var(--cr-accent-soft); border-color:var(--cr-accent); }
      .favorite-source { margin-top:5px; color:var(--yt-spec-text-secondary, #606060); font-size:11px; }
      .favorite-remove { width:30px; height:30px; border:0; border-radius:50%; color:var(--yt-spec-text-secondary, #606060);
        background:transparent; cursor:pointer; }
      .favorite-remove:hover { color:#c62828; background:rgba(198,40,40,.1); }
      .favorites-footer { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 12px;
        border-top:1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); color:var(--yt-spec-text-secondary, #606060); font-size:11px; }
      .export-summary { min-width:0; flex:1; }
      .export-status { margin-top:3px; white-space:normal; line-height:1.35; }
      .export-status.error { color:#c62828; }
      .primary-button { border:0; border-radius:999px; padding:9px 14px; color:#fff; background:var(--cr-accent);
        cursor:pointer; font-size:12px; font-weight:600; white-space:nowrap; }
      .primary-button:disabled, .secondary-button:disabled { opacity:.55; cursor:default; }
      @media (prefers-color-scheme: dark) {
        .panel { background: var(--yt-spec-base-background, #0f0f0f); color:var(--yt-spec-text-primary, #f1f1f1); }
      }
    </style>
    <section class="panel" aria-label="CaptionRoll 英文文字稿">
      <header class="header">
        <div class="brand">
          <div class="brand-line"><span class="logo"></span><h2>CaptionRoll</h2></div>
          <div class="status">正在查找英文字幕…</div>
        </div>
        <button class="icon-button favorites-toggle" type="button" title="打开收藏夹" aria-label="打开收藏夹">★ <span class="favorite-count">0</span></button>
        <button class="icon-button collapse" type="button" title="收起文字稿" aria-label="收起文字稿">⌃</button>
      </header>
      <div class="toolbar">
        <div class="segments" aria-label="字幕显示方式">
          <button type="button" data-mode="sentences" class="active">完整句子</button>
          <button type="button" data-mode="raw">原始分段</button>
        </div>
        <button type="button" class="interaction" title="切换为可选择文字">跳转模式</button>
        <div class="spacer"></div>
        <button type="button" class="follow active" title="自动跟随播放">● 跟随</button>
        <div class="font-controls" aria-label="字号">
          <button type="button" data-font="down" title="减小字号">A−</button>
          <button type="button" data-font="up" title="增大字号">A+</button>
        </div>
      </div>
      <div class="list-wrap">
        <div class="list" tabindex="0"><div class="empty">正在读取播放器的英文字幕…</div></div>
        <button type="button" class="resume" hidden>回到当前字幕</button>
      </div>
      <footer class="footer"><span class="meta">等待字幕数据</span></footer>
      <section class="favorites-view" aria-label="句子收藏夹" hidden>
        <div class="favorites-toolbar">
          <label class="check-all"><input class="select-all" type="checkbox"> 全选</label>
          <div class="spacer"></div>
          <button type="button" class="secondary-button translate-selected">生成中文</button>
          <button type="button" class="secondary-button remove-selected">删除所选</button>
        </div>
        <div class="favorites-list"><div class="empty">还没有收藏句子。</div></div>
        <div class="favorites-footer">
          <div class="export-summary">
            <div class="favorites-meta">0 条收藏</div>
            <div class="export-status">中文与英文仅保存在本机</div>
          </div>
          <button type="button" class="primary-button quizlet-export">复制并打开 Quizlet</button>
        </div>
      </section>
    </section>
  `;

  function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function currentItems() {
    return state.mode === "sentences" ? state.sentences : state.rawCues;
  }

  function mountPanel() {
    const secondaryInner = document.querySelector("ytd-watch-flexy #secondary-inner");
    const secondary = document.querySelector("ytd-watch-flexy #secondary");
    const fallback = document.querySelector("ytd-watch-flexy #below");
    const mount = secondaryInner ?? secondary ?? fallback;
    if (!mount) return false;

    if (host?.isConnected && host.parentElement === mount) return true;

    if (!host) {
      host = document.createElement("aside");
      host.id = "captionroll-host";
      shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = template;
      bindUi();
      void restorePreferences();
    }
    mount.prepend(host);
    if (secondary) secondary.classList.add("captionroll-secondary");
    return true;
  }

  function bindUi() {
    listElement = shadow.querySelector(".list");
    statusElement = shadow.querySelector(".status");
    metaElement = shadow.querySelector(".meta");
    resumeButton = shadow.querySelector(".resume");
    followButton = shadow.querySelector(".follow");
    favoritesElement = shadow.querySelector(".favorites-list");
    favoriteCountElement = shadow.querySelector(".favorite-count");
    selectAllElement = shadow.querySelector(".select-all");
    exportStatusElement = shadow.querySelector(".export-status");
    const interactionButton = shadow.querySelector(".interaction");

    shadow.querySelector(".collapse").addEventListener("click", toggleCollapsed);
    shadow.querySelector(".favorites-toggle").addEventListener("click", toggleFavoritesView);
    shadow.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    shadow.querySelectorAll("[data-font]").forEach((button) => {
      button.addEventListener("click", () => changeFont(button.dataset.font === "up" ? 0.1 : -0.1));
    });
    interactionButton.addEventListener("click", toggleInteractionMode);
    selectAllElement.addEventListener("change", () => {
      state.selectedFavoriteIds = selectAllElement.checked
        ? new Set(state.favorites.map((favorite) => favorite.id))
        : new Set();
      renderFavorites();
    });
    shadow.querySelector(".remove-selected").addEventListener("click", removeSelectedFavorites);
    shadow.querySelector(".translate-selected").addEventListener("click", translateSelectedFavorites);
    shadow.querySelector(".quizlet-export").addEventListener("click", exportToQuizlet);
    favoritesElement.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-select-favorite]");
      if (checkbox) {
        if (checkbox.checked) state.selectedFavoriteIds.add(checkbox.dataset.selectFavorite);
        else state.selectedFavoriteIds.delete(checkbox.dataset.selectFavorite);
        updateFavoriteSelectionSummary();
        return;
      }
      const chineseInput = event.target.closest("[data-chinese-id]");
      if (chineseInput) updateFavoriteChinese(chineseInput.dataset.chineseId, chineseInput.value);
    });
    favoritesElement.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-favorite]");
      if (!removeButton) return;
      removeFavorite(removeButton.dataset.removeFavorite, true);
    });
    followButton.addEventListener("click", () => setFollow(!state.follow, true));
    resumeButton.addEventListener("click", () => setFollow(true, true));
    listElement.addEventListener("wheel", () => setFollow(false), { passive: true });
    listElement.addEventListener("touchstart", () => setFollow(false), { passive: true });
    listElement.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button === 0) setFollow(false);
    });
    listElement.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) setFollow(false);
      const row = event.target.closest(".cue");
      if (event.key === "Enter" && row && state.interactionMode === "seek") {
        event.preventDefault();
        seekToItem(Number(row.dataset.index));
      }
    });
    listElement.addEventListener("click", (event) => {
      const row = event.target.closest(".cue");
      const favoriteButton = event.target.closest("[data-favorite-index]");
      if (favoriteButton) {
        toggleFavorite(Number(favoriteButton.dataset.favoriteIndex));
        return;
      }
      if (!row || state.interactionMode !== "seek") return;
      seekToItem(Number(row.dataset.index));
    });
  }

  async function restorePreferences() {
    try {
      const saved = await chrome.storage.local.get({
        captionRollMode: "sentences",
        captionRollInteractionMode: "seek",
        captionRollFontScale: 1,
        captionRollCollapsed: false,
        captionRollFavorites: []
      });
      state.mode = saved.captionRollMode === "raw" ? "raw" : "sentences";
      state.interactionMode = saved.captionRollInteractionMode === "select" ? "select" : "seek";
      state.fontScale = Math.min(1.4, Math.max(0.8, Number(saved.captionRollFontScale) || 1));
      state.collapsed = Boolean(saved.captionRollCollapsed);
      state.favorites = cardEngine.normalizeFavorites(saved.captionRollFavorites);
      state.selectedFavoriteIds = new Set(state.favorites.map((favorite) => favorite.id));
      applyPreferences();
      renderList();
      renderFavorites();
    } catch (_) {}
  }

  function savePreferences() {
    chrome.storage.local
      .set({
        captionRollMode: state.mode,
        captionRollInteractionMode: state.interactionMode,
        captionRollFontScale: state.fontScale,
        captionRollCollapsed: state.collapsed
      })
      .catch(() => {});
  }

  function saveFavorites() {
    chrome.storage.local.set({ captionRollFavorites: state.favorites }).catch(() => {});
  }

  function applyPreferences() {
    if (!shadow) return;
    shadow.querySelector(".panel").classList.toggle("collapsed", state.collapsed);
    const collapseButton = shadow.querySelector(".collapse");
    collapseButton.textContent = state.collapsed ? "⌄" : "⌃";
    collapseButton.title = state.collapsed ? "展开文字稿" : "收起文字稿";
    shadow.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.mode);
    });
    const interactionButton = shadow.querySelector(".interaction");
    const selecting = state.interactionMode === "select";
    interactionButton.textContent = selecting ? "选字模式" : "跳转模式";
    interactionButton.title = selecting ? "切换为点击字幕跳转" : "切换为可选择文字";
    interactionButton.classList.toggle("select", selecting);
    interactionButton.setAttribute("aria-pressed", String(selecting));
    listElement?.classList.toggle("select-mode", selecting);
    listElement?.querySelectorAll(".cue").forEach((row) => {
      row.title = selecting ? "拖动选择文字" : "点击跳转到此处";
      row.setAttribute("role", selecting ? "group" : "button");
    });
    const favoritesOpen = state.view === "favorites";
    shadow.querySelector(".panel").classList.toggle("favorites-open", favoritesOpen);
    const favoritesView = shadow.querySelector(".favorites-view");
    favoritesView.hidden = !favoritesOpen;
    const favoritesButton = shadow.querySelector(".favorites-toggle");
    favoritesButton.classList.toggle("active", favoritesOpen);
    favoritesButton.title = favoritesOpen ? "返回文字稿" : "打开收藏夹";
    favoritesButton.setAttribute("aria-label", favoritesButton.title);
    shadow.host.style.setProperty("--cr-font-scale", String(state.fontScale));
  }

  function toggleCollapsed() {
    state.collapsed = !state.collapsed;
    applyPreferences();
    savePreferences();
    if (!state.collapsed) scrollToActive();
  }

  function toggleFavoritesView() {
    state.view = state.view === "favorites" ? "transcript" : "favorites";
    applyPreferences();
    if (state.view === "favorites") renderFavorites();
    else scrollToActive();
  }

  function setMode(mode) {
    if (mode !== "raw" && mode !== "sentences") return;
    state.mode = mode;
    state.activeIndex = -1;
    applyPreferences();
    renderList();
    updatePlaybackPosition(true);
    savePreferences();
  }

  function changeFont(delta) {
    state.fontScale = Math.min(1.4, Math.max(0.8, Math.round((state.fontScale + delta) * 10) / 10));
    applyPreferences();
    savePreferences();
  }

  function toggleInteractionMode() {
    state.interactionMode = state.interactionMode === "seek" ? "select" : "seek";
    applyPreferences();
    savePreferences();
  }

  function currentVideoTitle() {
    const heading = document.querySelector("ytd-watch-metadata h1, #info-contents h1");
    return heading?.textContent?.trim() || document.title.replace(/\s+-\s+YouTube\s*$/, "").trim();
  }

  function favoriteForItem(item) {
    if (!item || !state.videoId) return null;
    const id = cardEngine.createFavoriteId(state.videoId, item.startMs, item.text);
    return state.favorites.find((favorite) => favorite.id === id) ?? null;
  }

  function toggleFavorite(index) {
    if (state.mode !== "sentences") return;
    const item = state.sentences[index];
    if (!item || !state.videoId) return;
    const existing = favoriteForItem(item);
    if (existing) {
      removeFavorite(existing.id);
      return;
    }
    const seconds = Math.max(0, Math.floor(item.startMs / 1000));
    const favorite = cardEngine.createFavorite({
      english: item.text,
      videoId: state.videoId,
      startMs: item.startMs,
      sourceTitle: currentVideoTitle(),
      sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(state.videoId)}&t=${seconds}s`,
      savedAt: Date.now()
    });
    if (!favorite) return;
    state.favorites.unshift(favorite);
    state.selectedFavoriteIds.add(favorite.id);
    saveFavorites();
    renderList();
    renderFavorites();
  }

  function removeFavorite(id, requireConfirmation = false) {
    if (requireConfirmation && !window.confirm("确定删除这条收藏吗？")) return;
    const next = state.favorites.filter((favorite) => favorite.id !== id);
    if (next.length === state.favorites.length) return;
    state.favorites = next;
    state.selectedFavoriteIds.delete(id);
    saveFavorites();
    renderList();
    renderFavorites();
  }

  function removeSelectedFavorites() {
    if (!state.selectedFavoriteIds.size) return;
    if (!window.confirm(`确定删除所选的 ${state.selectedFavoriteIds.size} 条收藏吗？`)) return;
    state.favorites = state.favorites.filter((favorite) => !state.selectedFavoriteIds.has(favorite.id));
    state.selectedFavoriteIds.clear();
    saveFavorites();
    renderList();
    renderFavorites();
  }

  function updateFavoriteSelectionSummary() {
    if (!selectAllElement) return;
    const selectedCount = state.favorites.filter((favorite) => state.selectedFavoriteIds.has(favorite.id)).length;
    selectAllElement.checked = Boolean(state.favorites.length) && selectedCount === state.favorites.length;
    selectAllElement.indeterminate = selectedCount > 0 && selectedCount < state.favorites.length;
    shadow.querySelector(".favorites-meta").textContent = `${state.favorites.length} 条收藏 · 已选 ${selectedCount} 条`;
    shadow.querySelector(".translate-selected").disabled = selectedCount === 0 || translating;
    shadow.querySelector(".quizlet-export").disabled = selectedCount === 0 || translating;
  }

  function updateFavoriteChinese(id, value) {
    const favorite = state.favorites.find((entry) => entry.id === id);
    if (!favorite) return;
    favorite.chinese = cardEngine.normalizeCardText(value);
    saveFavorites();
    setExportStatus("中文已保存在本机");
  }

  function renderFavorites() {
    if (!favoritesElement) return;
    favoriteCountElement.textContent = String(state.favorites.length);
    favoritesElement.replaceChildren();
    if (!state.favorites.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "还没有收藏句子。\n返回文字稿，点击句子右侧的星标即可收藏。";
      empty.style.whiteSpace = "pre-line";
      favoritesElement.append(empty);
      updateFavoriteSelectionSummary();
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const favorite of state.favorites) {
      const card = document.createElement("article");
      card.className = "favorite-card";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.selectedFavoriteIds.has(favorite.id);
      checkbox.dataset.selectFavorite = favorite.id;
      checkbox.setAttribute("aria-label", `选择：${favorite.english}`);
      const body = document.createElement("div");
      const english = document.createElement("div");
      english.className = "favorite-english";
      english.textContent = favorite.english;
      const source = document.createElement("div");
      source.className = "favorite-source";
      source.textContent = `${formatTime(favorite.startMs)}${favorite.sourceTitle ? ` · ${favorite.sourceTitle}` : ""}`;
      const chinese = document.createElement("textarea");
      chinese.className = "favorite-chinese";
      chinese.dataset.chineseId = favorite.id;
      chinese.value = favorite.chinese;
      chinese.placeholder = "中文提示：可手动填写，或选中后生成中文";
      chinese.setAttribute("aria-label", `中文提示：${favorite.english}`);
      body.append(english, chinese, source);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "favorite-remove";
      remove.dataset.removeFavorite = favorite.id;
      remove.title = "删除收藏";
      remove.setAttribute("aria-label", "删除收藏");
      remove.textContent = "×";
      card.append(checkbox, body, remove);
      fragment.append(card);
    }
    favoritesElement.append(fragment);
    updateFavoriteSelectionSummary();
  }

  function selectedFavorites() {
    return state.favorites.filter((favorite) => state.selectedFavoriteIds.has(favorite.id));
  }

  function setExportStatus(message, isError = false) {
    if (!exportStatusElement) return;
    exportStatusElement.textContent = message;
    exportStatusElement.classList.toggle("error", isError);
  }

  function persistVisibleChineseEdits() {
    favoritesElement?.querySelectorAll("[data-chinese-id]").forEach((input) => {
      const favorite = state.favorites.find((entry) => entry.id === input.dataset.chineseId);
      if (favorite) favorite.chinese = cardEngine.normalizeCardText(input.value);
    });
    saveFavorites();
  }

  async function getTranslatorSession() {
    if (translatorSession) return translatorSession;
    if (!("Translator" in globalThis)) {
      throw new Error("当前 Edge 版本不支持本地 Translator API，请手动填写中文。");
    }
    const creation = globalThis.Translator.create({
      sourceLanguage: "en",
      targetLanguage: "zh",
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          const progress = Math.round((event.loaded / Math.max(event.total || 1, 1)) * 100);
          setExportStatus(`首次使用正在下载本地翻译模型：${progress}%`);
        });
      }
    });
    translatorSession = await creation;
    return translatorSession;
  }

  async function translateSelectedFavorites() {
    if (translating) return;
    persistVisibleChineseEdits();
    const targets = selectedFavorites().filter((favorite) => !favorite.chinese);
    if (!targets.length) {
      setExportStatus("所选卡片已经有中文；如需修改，可以直接编辑。");
      return;
    }

    translating = true;
    updateFavoriteSelectionSummary();
    setExportStatus("正在准备本地翻译…");
    try {
      const translator = await getTranslatorSession();
      for (let index = 0; index < targets.length; index += 1) {
        setExportStatus(`正在生成中文 ${index + 1}/${targets.length}…`);
        targets[index].chinese = cardEngine.normalizeCardText(await translator.translate(targets[index].english));
      }
      saveFavorites();
      setExportStatus(`已为 ${targets.length} 张卡片生成中文，请检查后再导入。`);
    } catch (error) {
      translatorSession?.destroy?.();
      translatorSession = null;
      setExportStatus(error?.message || "本地翻译失败，请手动填写中文。", true);
    } finally {
      translating = false;
      renderFavorites();
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {}

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("无法写入剪贴板，请检查浏览器的剪贴板权限。");
  }

  async function exportToQuizlet() {
    persistVisibleChineseEdits();
    const chosen = selectedFavorites();
    const missingChinese = chosen.filter((favorite) => !favorite.chinese).length;
    if (!chosen.length) {
      setExportStatus("请先选择至少一张卡片。", true);
      return;
    }
    if (missingChinese) {
      setExportStatus(`还有 ${missingChinese} 张卡片缺少中文，请先生成或手动填写。`, true);
      return;
    }

    const importText = cardEngine.buildQuizletImport(chosen);
    try {
      await copyText(importText);
      setExportStatus(`已复制 ${chosen.length} 张卡片，正在打开 Quizlet…`);
      await chrome.runtime.sendMessage({ type: "CAPTIONROLL/OPEN_QUIZLET" });
    } catch (error) {
      setExportStatus(error?.message || "复制失败，请重试。", true);
    }
  }

  function setFollow(value, scrollNow = false) {
    state.follow = Boolean(value);
    followButton?.classList.toggle("active", state.follow);
    followButton?.setAttribute("aria-pressed", String(state.follow));
    if (resumeButton) resumeButton.hidden = state.follow;
    if (state.follow && scrollNow) scrollToActive();
  }

  function seekToItem(index) {
    const item = currentItems()[index];
    const video = getVideo();
    if (!item || !video) return;
    video.currentTime = item.startMs / 1000;
    setFollow(true, true);
  }

  function updateStatus() {
    if (!statusElement) return;
    statusElement.textContent = state.statusMessage;
    if (state.rawCues.length) {
      const count = state.mode === "sentences" ? state.sentences.length : state.rawCues.length;
      metaElement.textContent = `${count} 条 · ${state.mode === "sentences" ? "智能整句" : "YouTube 原始分段"}${
        state.trackLabel ? ` · ${state.trackLabel}` : ""
      }`;
    } else {
      metaElement.textContent = state.statusCode === "no-captions" ? "当前视频不可用" : "等待字幕数据";
    }
  }

  function renderList() {
    if (!listElement) return;
    const items = currentItems();
    listElement.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent =
        state.statusCode === "no-captions"
          ? state.statusMessage
          : `${state.statusMessage}\n如果视频尚未播放，开始播放一次可以帮助 YouTube 加载字幕。`;
      empty.style.whiteSpace = "pre-line";
      listElement.append(empty);
      updateStatus();
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "cue";
      row.dataset.index = String(index);
      row.tabIndex = 0;
      row.setAttribute("role", state.interactionMode === "seek" ? "button" : "group");
      row.title = state.interactionMode === "seek" ? "点击跳转到此处" : "拖动选择文字";
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = formatTime(item.startMs);
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = item.text;
      row.append(time, text);
      if (state.mode === "sentences") {
        const saved = Boolean(favoriteForItem(item));
        const favoriteButton = document.createElement("button");
        favoriteButton.type = "button";
        favoriteButton.className = `favorite-action${saved ? " saved" : ""}`;
        favoriteButton.dataset.favoriteIndex = String(index);
        favoriteButton.title = saved ? "取消收藏" : "收藏句子";
        favoriteButton.setAttribute("aria-label", favoriteButton.title);
        favoriteButton.textContent = saved ? "★" : "☆";
        row.append(favoriteButton);
      } else {
        row.classList.add("no-favorite");
      }
      fragment.append(row);
    });
    listElement.append(fragment);
    updateStatus();
  }

  function getVideo() {
    if (!videoElement?.isConnected) videoElement = document.querySelector("video.html5-main-video, video");
    return videoElement;
  }

  function findActiveIndex(items, currentMs) {
    let low = 0;
    let high = items.length - 1;
    let answer = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (items[middle].startMs <= currentMs + 80) {
        answer = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return answer;
  }

  function updatePlaybackPosition(force = false) {
    const video = getVideo();
    const items = currentItems();
    if (!video || !items.length) return;
    const nextIndex = findActiveIndex(items, video.currentTime * 1000);
    if (!force && nextIndex === state.activeIndex) return;
    listElement?.querySelector(".cue.current")?.classList.remove("current");
    state.activeIndex = nextIndex;
    if (nextIndex >= 0) {
      listElement?.querySelector(`.cue[data-index="${nextIndex}"]`)?.classList.add("current");
      if (state.follow && !state.collapsed) scrollToActive();
    }
  }

  function scrollToActive() {
    const current = listElement?.querySelector(".cue.current");
    if (!current) return;
    current.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleMessage(event) {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || typeof message.type !== "string" || !message.type.startsWith(MESSAGE_PREFIX)) return;

    if (message.type === `${MESSAGE_PREFIX}NAV`) {
      state.videoId = message.videoId ?? null;
      state.rawCues = [];
      state.sentences = [];
      state.activeIndex = -1;
      state.statusCode = "loading";
      state.statusMessage = state.videoId ? "正在查找英文字幕…" : "请打开一个 YouTube 视频";
      state.trackLabel = "";
      renderList();
      return;
    }

    if (message.videoId !== state.videoId) return;
    if (message.type === `${MESSAGE_PREFIX}STATUS`) {
      state.statusCode = message.code;
      state.statusMessage = message.message;
      updateStatus();
      if (!state.rawCues.length) renderList();
    }
    if (message.type === `${MESSAGE_PREFIX}CUES` && Array.isArray(message.cues)) {
      state.rawCues = engine.prepareCues(message.cues);
      state.sentences = engine.mergeIntoSentences(state.rawCues);
      state.trackLabel = message.trackLabel ?? "English";
      state.statusCode = "ready";
      state.statusMessage = `已加载 ${state.trackLabel}`;
      state.activeIndex = -1;
      renderList();
      updatePlaybackPosition(true);
    }
  }

  window.addEventListener("message", handleMessage);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CAPTIONROLL/TOGGLE") toggleCollapsed();
  });

  function start() {
    mountPanel();
    observer = new MutationObserver(() => mountPanel());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(updatePlaybackPosition, 250);
  }

  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
