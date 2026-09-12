(function exposeCaptionRollSettings(root) {
  "use strict";

  const defaults = Object.freeze({
    captionRollPanelVisible: true,
    captionRollInteractionMode: "seek",
    captionRollFontScale: 1,
    captionRollFollow: true,
    captionRollCollapsed: false,
    captionRollVideoCaptions: true,
    captionRollCaptionFontScale: 1,
    captionRollCaptionPosition: 12,
    captionRollCaptionBackground: 0.7
  });

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function normalize(input = {}) {
    return {
      captionRollPanelVisible:
        input.captionRollPanelVisible === undefined
          ? defaults.captionRollPanelVisible
          : Boolean(input.captionRollPanelVisible),
      captionRollInteractionMode: input.captionRollInteractionMode === "select" ? "select" : "seek",
      captionRollFontScale:
        Math.round(clampNumber(input.captionRollFontScale, 0.8, 1.4, defaults.captionRollFontScale) * 10) / 10,
      captionRollFollow:
        input.captionRollFollow === undefined ? defaults.captionRollFollow : Boolean(input.captionRollFollow),
      captionRollCollapsed:
        input.captionRollCollapsed === undefined
          ? defaults.captionRollCollapsed
          : Boolean(input.captionRollCollapsed),
      captionRollVideoCaptions:
        input.captionRollVideoCaptions === undefined
          ? defaults.captionRollVideoCaptions
          : Boolean(input.captionRollVideoCaptions),
      captionRollCaptionFontScale:
        Math.round(
          clampNumber(
            input.captionRollCaptionFontScale,
            0.8,
            1.6,
            defaults.captionRollCaptionFontScale
          ) * 10
        ) / 10,
      captionRollCaptionPosition: Math.round(
        clampNumber(
          input.captionRollCaptionPosition,
          4,
          24,
          defaults.captionRollCaptionPosition
        )
      ),
      captionRollCaptionBackground:
        Math.round(
          clampNumber(
            input.captionRollCaptionBackground,
            0,
            0.9,
            defaults.captionRollCaptionBackground
          ) * 10
        ) / 10
    };
  }

  const api = { defaults, normalize };
  root.CaptionRollSettings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
