(function (global) {
  "use strict";

  function normalizeMilliseconds(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
  }

  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => ({
        startMs: normalizeMilliseconds(item?.startMs),
        endMs: normalizeMilliseconds(item?.endMs),
        text: String(item?.text ?? "").replace(/\s+/g, " ").trim()
      }))
      .filter((item) => item.text)
      .map((item) => ({
        ...item,
        endMs: item.endMs > item.startMs ? item.endMs : item.startMs + 1000
      }));
  }

  function formatSrtTime(milliseconds) {
    const total = normalizeMilliseconds(milliseconds);
    const hours = Math.floor(total / 3600000);
    const minutes = Math.floor((total % 3600000) / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
  }

  function formatTextTime(milliseconds) {
    const totalSeconds = Math.floor(normalizeMilliseconds(milliseconds) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const minuteText = hours ? String(minutes).padStart(2, "0") : String(minutes);
    const prefix = hours ? `${hours}:` : "";
    return `${prefix}${minuteText}:${String(seconds).padStart(2, "0")}`;
  }

  function buildSrt(items) {
    return normalizeItems(items)
      .map(
        (item, index) =>
          `${index + 1}\n${formatSrtTime(item.startMs)} --> ${formatSrtTime(item.endMs)}\n${item.text}`
      )
      .join("\n\n");
  }

  function buildTxt(items) {
    return normalizeItems(items)
      .map((item) => `[${formatTextTime(item.startMs)}] ${item.text}`)
      .join("\n");
  }

  function safeFilename(title, fallback = "CaptionRoll") {
    const cleaned = String(title ?? "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
    return cleaned || fallback;
  }

  const api = { buildSrt, buildTxt, formatSrtTime, safeFilename };
  global.CaptionRollSubtitleExport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
