(() => {
  "use strict";

  const MESSAGE_PREFIX = "CAPTIONROLL/";
  const engine = globalThis.CaptionRollEngine;
  const initialVideoId =
    location.pathname === "/watch" ? new URLSearchParams(location.search).get("v") : null;
  const state = {
    videoId: initialVideoId,
    rawCues: [],
    sentences: [],
    mode: "sentences",
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
  let videoElement = null;
  let observer = null;

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
      .panel.collapsed .toolbar, .panel.collapsed .list-wrap, .panel.collapsed .footer { display: none; }
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
      .toolbar { display:flex; align-items:center; gap:8px; padding: 9px 12px; border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
      .segments { display:flex; gap:2px; padding:3px; border-radius:10px; background: var(--yt-spec-10-percent-layer, rgba(0,0,0,.08)); }
      .segments button, .follow { border:0; border-radius:8px; padding:7px 10px; color:inherit; background:transparent; cursor:pointer; font-size:12px; }
      .segments button.active { color:#fff; background:var(--cr-accent); }
      .spacer { flex:1; }
      .follow { display:flex; align-items:center; gap:5px; color:var(--yt-spec-text-secondary, #606060); }
      .follow.active { color:var(--cr-accent); background:var(--cr-accent-soft); }
      .font-controls { display:flex; }
      .font-controls button { width:30px; height:30px; border:0; color:inherit; background:transparent; border-radius:7px; cursor:pointer; }
      .font-controls button:hover { background:var(--yt-spec-10-percent-layer, rgba(0,0,0,.1)); }
      .list-wrap { position:relative; min-height:0; }
      .list { height:100%; overflow:auto; scroll-behavior:smooth; padding: 12px 8px 120px; scrollbar-gutter:stable; }
      .empty { display:grid; place-items:center; min-height:240px; padding:32px; text-align:center; color:var(--yt-spec-text-secondary, #606060); font-size:14px; line-height:1.6; }
      .cue { width:100%; display:grid; grid-template-columns: 48px minmax(0,1fr); gap:10px; padding: 10px 12px; border:0;
        border-left:3px solid transparent; border-radius:10px; color:inherit; background:transparent; text-align:left; cursor:pointer; }
      .cue:hover { background:var(--yt-spec-10-percent-layer, rgba(0,0,0,.07)); }
      .cue.current { border-left-color:var(--cr-accent); background:var(--cr-accent-soft); }
      .time { padding-top:2px; color:var(--yt-spec-text-secondary, #606060); font-size:11px; font-variant-numeric: tabular-nums; }
      .text { font-size: calc(16px * var(--cr-font-scale, 1)); line-height:1.55; overflow-wrap:anywhere; }
      .cue.current .text { font-weight:600; }
      .resume { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); border:0; border-radius:999px; padding:9px 14px;
        color:#fff; background:var(--cr-accent); box-shadow:0 5px 18px rgba(0,0,0,.25); cursor:pointer; }
      .resume[hidden] { display:none; }
      .footer { min-height:38px; display:flex; align-items:center; padding:8px 14px; border-top:1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1));
        color:var(--yt-spec-text-secondary, #606060); font-size:11px; }
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
        <button class="icon-button collapse" type="button" title="收起文字稿" aria-label="收起文字稿">⌃</button>
      </header>
      <div class="toolbar">
        <div class="segments" aria-label="字幕显示方式">
          <button type="button" data-mode="sentences" class="active">完整句子</button>
          <button type="button" data-mode="raw">原始分段</button>
        </div>
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

    shadow.querySelector(".collapse").addEventListener("click", toggleCollapsed);
    shadow.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    shadow.querySelectorAll("[data-font]").forEach((button) => {
      button.addEventListener("click", () => changeFont(button.dataset.font === "up" ? 0.1 : -0.1));
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
    });
    listElement.addEventListener("click", (event) => {
      const row = event.target.closest(".cue");
      if (!row) return;
      const item = currentItems()[Number(row.dataset.index)];
      const video = getVideo();
      if (item && video) {
        video.currentTime = item.startMs / 1000;
        setFollow(true, true);
      }
    });
  }

  async function restorePreferences() {
    try {
      const saved = await chrome.storage.local.get({
        captionRollMode: "sentences",
        captionRollFontScale: 1,
        captionRollCollapsed: false
      });
      state.mode = saved.captionRollMode === "raw" ? "raw" : "sentences";
      state.fontScale = Math.min(1.4, Math.max(0.8, Number(saved.captionRollFontScale) || 1));
      state.collapsed = Boolean(saved.captionRollCollapsed);
      applyPreferences();
      renderList();
    } catch (_) {}
  }

  function savePreferences() {
    chrome.storage.local
      .set({
        captionRollMode: state.mode,
        captionRollFontScale: state.fontScale,
        captionRollCollapsed: state.collapsed
      })
      .catch(() => {});
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
    shadow.host.style.setProperty("--cr-font-scale", String(state.fontScale));
  }

  function toggleCollapsed() {
    state.collapsed = !state.collapsed;
    applyPreferences();
    savePreferences();
    if (!state.collapsed) scrollToActive();
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

  function setFollow(value, scrollNow = false) {
    state.follow = Boolean(value);
    followButton?.classList.toggle("active", state.follow);
    followButton?.setAttribute("aria-pressed", String(state.follow));
    if (resumeButton) resumeButton.hidden = state.follow;
    if (state.follow && scrollNow) scrollToActive();
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
      const row = document.createElement("button");
      row.type = "button";
      row.className = "cue";
      row.dataset.index = String(index);
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = formatTime(item.startMs);
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = item.text;
      row.append(time, text);
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
