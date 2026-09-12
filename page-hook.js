(() => {
  "use strict";

  const PREFIX = "CAPTIONROLL/";
  const TIMED_TEXT_RE = /\/api\/timedtext\?/;
  const originalFetch = window.fetch;
  const originalXhrOpen = XMLHttpRequest.prototype.open;

  let videoId = null;
  let englishTrack = null;
  let potUrl = null;
  let fetchInFlight = false;
  let deliveredSignature = "";
  let lastStatus = "";
  let announceAttempts = 0;
  let nudgeAttempts = 0;
  let fetchAttempts = 0;
  let nextFetchAt = 0;
  let timer = 0;

  function post(type, payload = {}) {
    window.postMessage({ type: `${PREFIX}${type}`, ...payload }, location.origin);
  }

  function postStatus(code, message) {
    const signature = `${code}:${message}`;
    if (signature === lastStatus) return;
    lastStatus = signature;
    post("STATUS", { videoId, code, message });
  }

  function getVideoId() {
    if (location.pathname !== "/watch") return null;
    return new URLSearchParams(location.search).get("v");
  }

  function getPlayer() {
    return document.getElementById("movie_player");
  }

  function getPlayerResponse() {
    const player = getPlayer();
    try {
      const response = player?.getPlayerResponse?.();
      if (response) return response;
    } catch (_) {}
    return window.ytInitialPlayerResponse ?? null;
  }

  function trackName(track) {
    return (
      track?.name?.simpleText ??
      track?.name?.runs?.map((run) => run.text).join("") ??
      track?.languageCode ??
      "English"
    );
  }

  function pickEnglishTrack(tracks) {
    const english = tracks.filter((track) =>
      String(track.languageCode ?? "").toLowerCase().startsWith("en")
    );
    return (
      english.find((track) => track.kind !== "asr" && track.languageCode === "en") ??
      english.find((track) => track.kind !== "asr") ??
      english.find((track) => track.languageCode === "en") ??
      english[0] ??
      null
    );
  }

  function noteTimedTextUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      if (url.searchParams.get("v") !== videoId) return;
      if (potUrl !== url.href) {
        fetchAttempts = 0;
        nextFetchAt = 0;
      }
      potUrl = url.href;
      void fetchEnglishTranscript();
    } catch (_) {}
  }

  function cleanText(text) {
    return String(text ?? "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseJson3(text) {
    const data = JSON.parse(text);
    const cues = [];
    for (const event of data.events ?? []) {
      if (!Array.isArray(event.segs)) continue;
      const cueText = cleanText(event.segs.map((segment) => segment.utf8 ?? "").join(""));
      if (!cueText) continue;
      const startMs = Number(event.tStartMs ?? 0);
      const durationMs = Math.max(80, Number(event.dDurationMs ?? 0));
      cues.push({ startMs, endMs: startMs + durationMs, text: cueText });
    }
    return cues;
  }

  function parseXml(text) {
    const documentNode = new DOMParser().parseFromString(text, "text/xml");
    const cues = [];
    for (const node of documentNode.querySelectorAll("p, text")) {
      const isParagraph = node.tagName.toLowerCase() === "p";
      const startValue = Number(node.getAttribute(isParagraph ? "t" : "start") ?? 0);
      const durationValue = Number(node.getAttribute(isParagraph ? "d" : "dur") ?? 0);
      const startMs = isParagraph ? startValue : startValue * 1000;
      const durationMs = Math.max(80, isParagraph ? durationValue : durationValue * 1000);
      const cueText = cleanText(node.textContent);
      if (cueText) cues.push({ startMs, endMs: startMs + durationMs, text: cueText });
    }
    return cues;
  }

  function parseVtt(text) {
    const cues = [];
    const pattern = /(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3})\s+-->\s+(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3})[^\n]*\n([\s\S]*?)(?=\n{2,}|$)/g;
    let match;
    const toMs = (hours, minutes, seconds, milliseconds) =>
      (Number(hours?.replace(":", "") ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 +
      Number(milliseconds);
    while ((match = pattern.exec(text))) {
      const cueText = cleanText(match[9].replace(/<[^>]+>/g, ""));
      if (!cueText) continue;
      cues.push({
        startMs: toMs(match[1], match[2], match[3], match[4]),
        endMs: toMs(match[5], match[6], match[7], match[8]),
        text: cueText
      });
    }
    return cues;
  }

  function parseTimedText(text) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return [];
    try {
      if (trimmed.startsWith("{")) return parseJson3(trimmed);
      if (trimmed.startsWith("<")) return parseXml(trimmed);
      if (trimmed.startsWith("WEBVTT")) return parseVtt(trimmed);
    } catch (_) {}
    return [];
  }

  function deliverCues(cues, source) {
    if (!cues.length || getVideoId() !== videoId) return false;
    cues.sort((a, b) => a.startMs - b.startMs);
    const signature = `${videoId}:${cues.length}:${cues[0].startMs}:${cues.at(-1).startMs}`;
    if (signature === deliveredSignature) return true;
    deliveredSignature = signature;
    post("CUES", {
      videoId,
      source,
      trackLabel: trackName(englishTrack),
      cues
    });
    postStatus("ready", `已读取 ${trackName(englishTrack)}`);
    return true;
  }

  async function inspectNativeResponse(rawUrl, response) {
    try {
      const url = new URL(rawUrl, location.href);
      const language = (url.searchParams.get("tlang") || url.searchParams.get("lang") || "").toLowerCase();
      if (!language.startsWith("en") || url.searchParams.get("v") !== videoId) return;
      const body = await response.clone().text();
      deliverCues(parseTimedText(body), "player-response");
    } catch (_) {}
  }

  async function fetchEnglishTranscript() {
    if (
      !potUrl ||
      !englishTrack ||
      fetchInFlight ||
      deliveredSignature ||
      fetchAttempts >= 7 ||
      Date.now() < nextFetchAt
    ) {
      return;
    }
    fetchInFlight = true;
    fetchAttempts += 1;
    nextFetchAt = Date.now() + Math.min(8000, 500 * 2 ** fetchAttempts);
    try {
      const url = new URL(potUrl);
      url.searchParams.set("fmt", "json3");
      url.searchParams.set("lang", englishTrack.languageCode);
      url.searchParams.delete("tlang");
      if (englishTrack.kind === "asr") url.searchParams.set("kind", "asr");
      else url.searchParams.delete("kind");

      const response = await originalFetch.call(window, url.href, { credentials: "same-origin" });
      const body = await response.text();
      if (!deliverCues(parseTimedText(body), "timed-text")) {
        postStatus("waiting", "字幕请求已发现，正在等待有效英文轨道…");
      }
    } catch (_) {
      postStatus("waiting", "英文字幕暂时读取失败，正在重试…");
    } finally {
      fetchInFlight = false;
    }
  }

  window.fetch = function captionRollFetch(input, init) {
    const result = originalFetch.call(this, input, init);
    try {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (rawUrl && TIMED_TEXT_RE.test(rawUrl)) {
        noteTimedTextUrl(rawUrl);
        result.then((response) => inspectNativeResponse(rawUrl, response)).catch(() => {});
      }
    } catch (_) {}
    return result;
  };

  XMLHttpRequest.prototype.open = function captionRollXhrOpen(method, rawUrl, ...rest) {
    try {
      const url = typeof rawUrl === "string" ? rawUrl : rawUrl.href;
      if (TIMED_TEXT_RE.test(url)) {
        noteTimedTextUrl(url);
        this.addEventListener(
          "load",
          () => {
            try {
              const languageUrl = new URL(url, location.href);
              const language = (
                languageUrl.searchParams.get("tlang") || languageUrl.searchParams.get("lang") || ""
              ).toLowerCase();
              if (!language.startsWith("en")) return;
              const body =
                typeof this.response === "string" ? this.response : JSON.stringify(this.response ?? "");
              deliverCues(parseTimedText(body), "player-response");
            } catch (_) {}
          },
          { once: true }
        );
      }
    } catch (_) {}
    return originalXhrOpen.call(this, method, rawUrl, ...rest);
  };

  function selectAndLoadEnglishTrack() {
    const player = getPlayer();
    if (!player || !englishTrack || deliveredSignature) return;

    try {
      const current = player.getOption?.("captions", "track");
      const currentLanguage = String(current?.languageCode ?? "").toLowerCase();
      if (!currentLanguage.startsWith("en") && nudgeAttempts < 3) {
        player.loadModule?.("captions");
        player.setOption?.("captions", "track", {
          languageCode: englishTrack.languageCode,
          vssId: englishTrack.vssId,
          kind: englishTrack.kind,
          name: englishTrack.name
        });
      }
      if (!potUrl && nudgeAttempts < 8) {
        nudgeAttempts += 1;
        player.setOption?.("captions", "reload", true);
      }
    } catch (_) {}
  }

  function discoverTrack() {
    const response = getPlayerResponse();
    if (!response || response.videoDetails?.videoId !== videoId) return false;
    const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    englishTrack = pickEnglishTrack(tracks);
    if (!englishTrack) {
      postStatus("no-captions", "这个视频没有可读取的英文字幕");
      return true;
    }
    postStatus("loading", `正在加载 ${trackName(englishTrack)}…`);
    return true;
  }

  function tick() {
    clearTimeout(timer);
    if (!videoId) return;
    announceAttempts += 1;
    if (!englishTrack) discoverTrack();
    if (englishTrack) {
      selectAndLoadEnglishTrack();
      void fetchEnglishTranscript();
    } else if (announceAttempts > 30) {
      postStatus("no-captions", "没有找到英文字幕轨道");
    }
    timer = window.setTimeout(tick, deliveredSignature ? 2000 : 400);
  }

  function restart() {
    clearTimeout(timer);
    videoId = getVideoId();
    englishTrack = null;
    potUrl = null;
    fetchInFlight = false;
    deliveredSignature = "";
    lastStatus = "";
    announceAttempts = 0;
    nudgeAttempts = 0;
    fetchAttempts = 0;
    nextFetchAt = 0;
    post("NAV", { videoId });
    if (videoId) {
      postStatus("loading", "正在查找英文字幕…");
      tick();
    }
  }

  restart();
  document.addEventListener("yt-navigate-finish", restart);
})();
