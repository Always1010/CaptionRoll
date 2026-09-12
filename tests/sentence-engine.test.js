const assert = require("node:assert/strict");
const { mergeIntoSentences, prepareCues, removeRollingOverlap } = require("../sentence-engine.js");

assert.equal(
  removeRollingOverlap("I think the biggest", "the biggest problem is this"),
  "problem is this"
);

const prepared = prepareCues([
  { startMs: 0, endMs: 1000, text: "Hello world" },
  { startMs: 500, endMs: 1500, text: "Hello world" }
]);
assert.equal(prepared.length, 1);
assert.equal(prepared[0].endMs, 1500);

const sentences = mergeIntoSentences([
  { startMs: 0, endMs: 1000, text: "I think the biggest" },
  { startMs: 900, endMs: 2000, text: "the biggest problem with this approach" },
  { startMs: 1900, endMs: 3000, text: "is that it does not scale." },
  { startMs: 3300, endMs: 4200, text: "That is why" },
  { startMs: 4100, endMs: 5000, text: "we need another plan." }
]);

assert.equal(sentences.length, 2);
assert.equal(sentences[0].text, "I think the biggest problem with this approach is that it does not scale.");
assert.equal(sentences[1].text, "That is why we need another plan.");

const paused = mergeIntoSentences([
  { startMs: 0, endMs: 800, text: "This is one idea" },
  { startMs: 2200, endMs: 3000, text: "Here is another" }
]);
assert.equal(paused.length, 2);

console.log("sentence-engine: all tests passed");
