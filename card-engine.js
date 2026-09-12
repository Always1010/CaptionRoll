(function exposeCaptionRollCards(root) {
  "use strict";

  function normalizeCardText(value) {
    return String(value ?? "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function createFavoriteId(videoId, startMs, english) {
    const sourceId = normalizeCardText(videoId) || "unknown";
    const time = Math.max(0, Math.round(Number(startMs) || 0));
    return `${sourceId}:${time}:${hashText(normalizeCardText(english))}`;
  }

  function normalizeFavorite(input) {
    const english = normalizeCardText(input?.english);
    if (!english) return null;
    const startMs = Math.max(0, Math.round(Number(input?.startMs) || 0));
    const videoId = normalizeCardText(input?.videoId);
    return {
      id: normalizeCardText(input?.id) || createFavoriteId(videoId, startMs, english),
      english,
      chinese: normalizeCardText(input?.chinese),
      videoId,
      startMs,
      sourceTitle: normalizeCardText(input?.sourceTitle),
      sourceUrl: String(input?.sourceUrl ?? "").trim(),
      savedAt: Number(input?.savedAt) || Date.now()
    };
  }

  function createFavorite(input) {
    return normalizeFavorite(input);
  }

  function normalizeFavorites(input) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    const result = [];
    for (const raw of input) {
      const favorite = normalizeFavorite(raw);
      if (!favorite || seen.has(favorite.id)) continue;
      seen.add(favorite.id);
      result.push(favorite);
    }
    return result;
  }

  const api = { createFavorite, createFavoriteId, normalizeCardText, normalizeFavorite, normalizeFavorites };
  root.CaptionRollCards = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
