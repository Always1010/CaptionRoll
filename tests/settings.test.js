const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { defaults, normalize } = require("../settings.js");

assert.deepEqual(normalize({}), defaults);
assert.equal(normalize({ captionRollInteractionMode: "select" }).captionRollInteractionMode, "select");
assert.equal(normalize({ captionRollInteractionMode: "invalid" }).captionRollInteractionMode, "seek");
assert.equal(normalize({ captionRollFontScale: 9 }).captionRollFontScale, 1.4);
assert.equal(normalize({ captionRollFontScale: 0.12 }).captionRollFontScale, 0.8);
assert.equal(normalize({ captionRollPanelVisible: false }).captionRollPanelVisible, false);
assert.equal(normalize({ captionRollFollow: false }).captionRollFollow, false);
assert.equal(normalize({ captionRollCollapsed: true }).captionRollCollapsed, true);
assert.equal(normalize({ captionRollVideoCaptions: false }).captionRollVideoCaptions, false);
assert.equal(normalize({ captionRollCaptionFontScale: 9 }).captionRollCaptionFontScale, 1.6);
assert.equal(normalize({ captionRollCaptionPosition: 0 }).captionRollCaptionPosition, 4);
assert.equal(normalize({ captionRollCaptionBackground: 2 }).captionRollCaptionBackground, 0.9);

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "manifest.json"), "utf8"));
const popup = readFileSync(join(__dirname, "..", "popup.html"), "utf8");
const content = readFileSync(join(__dirname, "..", "content.js"), "utf8");
assert.equal(manifest.action.default_popup, "popup.html");
assert.match(popup, /captionRollInteractionMode|name="interaction"/);
assert.doesNotMatch(popup, /captionRollFontScale/);
assert.match(popup, /captionRollVideoCaptions/);
assert.match(popup, /captionRollCaptionPosition/);
assert.doesNotMatch(content, /data-mode="raw"/);

console.log("settings: all tests passed");
