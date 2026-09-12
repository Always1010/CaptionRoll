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

const suffixSentences = mergeIntoSentences([
  { startMs: 0, endMs: 1000, text: "This is a podcast." },
  { startMs: 900, endMs: 2000, text: "So we continue." },
  { startMs: 1900, endMs: 3000, text: "This is a test." }
]);
assert.deepEqual(
  suffixSentences.map((sentence) => sentence.text),
  ["This is a podcast.", "So we continue.", "This is a test."]
);

const abbreviation = mergeIntoSentences([
  { startMs: 0, endMs: 1000, text: "I spoke with Dr." },
  { startMs: 900, endMs: 2000, text: "Smith yesterday." }
]);
assert.deepEqual(abbreviation.map((sentence) => sentence.text), ["I spoke with Dr. Smith yesterday."]);

const initialism = mergeIntoSentences([
  {
    startMs: 0,
    endMs: 3000,
    text: "The U.S. economy grew. next we will discuss why."
  }
]);
assert.deepEqual(initialism.map((sentence) => sentence.text), [
  "The U.S. economy grew.",
  "next we will discuss why."
]);

const longSpokenSentence = mergeIntoSentences([
  { startMs: 17000, endMs: 22000, text: "[laughter] Um but I thought that actually this whole idea" },
  { startMs: 22000, endMs: 27000, text: "of English names um for English learners or people speaking" },
  { startMs: 27000, endMs: 33000, text: "English as a second or third or fourth" },
  {
    startMs: 29000,
    endMs: 38000,
    text: "uh language was a really really interesting topic actually and that it would be a fun thing to explore on this podcast. So today we are going to be asking the"
  },
  { startMs: 42000, endMs: 45000, text: "question should you choose an English name?" }
]);
assert.deepEqual(
  longSpokenSentence.map((sentence) => sentence.text),
  [
    "[laughter] Um but I thought that actually this whole idea of English names um for English learners or people speaking English as a second or third or fourth uh language was a really really interesting topic actually and that it would be a fun thing to explore on this podcast.",
    "So today we are going to be asking the question should you choose an English name?"
  ]
);

const possessiveBoundarySentence =
  "The reason why I kind of immediately feel like no, you do not need an English name is because I think [laughter] most people would prefer like most English I don't know if most English speak people, but at least the people I have spoken to about this, English native speakers I have spoken to about this, they would rather try and say your";
const possessiveBoundary = mergeIntoSentences([
  { startMs: 438000, endMs: 463000, text: possessiveBoundarySentence },
  {
    startMs: 463000,
    endMs: 470000,
    text: "real name. um as opposed to using your English name because they think it is more respectful."
  }
]);
assert.deepEqual(
  possessiveBoundary.map((sentence) => sentence.text),
  [
    `${possessiveBoundarySentence} real name.`,
    "um as opposed to using your English name because they think it is more respectful."
  ]
);

const longUnpunctuatedLead = Array.from({ length: 63 }, (_, index) => `word${index}`).join(" ");
const safeFallback = mergeIntoSentences([
  { startMs: 0, endMs: 31000, text: `${longUnpunctuatedLead} the` },
  { startMs: 30000, endMs: 33000, text: "question appears," },
  { startMs: 33000, endMs: 35000, text: "another topic follows" }
]);
assert.deepEqual(
  safeFallback.map((sentence) => sentence.text),
  [`${longUnpunctuatedLead} the question appears,`, "another topic follows"]
);

console.log("sentence-engine: all tests passed");
