const assert = require("node:assert/strict");
const { buildSrt, buildTxt, formatSrtTime, safeFilename } = require("../subtitle-export.js");

const items = [
  { startMs: 1234, endMs: 4567, text: "  First   sentence. " },
  { startMs: 3661000, endMs: 3661000, text: "Second sentence." }
];

assert.equal(formatSrtTime(3661001), "01:01:01,001");
assert.equal(
  buildSrt(items),
  "1\n00:00:01,234 --> 00:00:04,567\nFirst sentence.\n\n" +
    "2\n01:01:01,000 --> 01:01:02,000\nSecond sentence."
);
assert.equal(buildTxt(items), "[0:01] First sentence.\n[1:01:01] Second sentence.");
assert.equal(safeFilename('A <video>: "title"?'), "A video title");
assert.equal(safeFilename("  ...  ", "fallback"), "fallback");
assert.equal(buildSrt([{ startMs: 0, endMs: 10, text: "   " }]), "");

console.log("subtitle export: all tests passed");
