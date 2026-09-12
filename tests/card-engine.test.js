const assert = require("node:assert/strict");
const {
  buildQuizletImport,
  createFavorite,
  createFavoriteId,
  normalizeCardText,
  normalizeFavorites
} = require("../card-engine.js");

assert.equal(normalizeCardText("  Hello\n   world  "), "Hello world");
assert.equal(
  createFavoriteId("abc", 1234, "A useful sentence."),
  createFavoriteId("abc", 1234, "A useful sentence.")
);
assert.notEqual(
  createFavoriteId("abc", 1234, "A useful sentence."),
  createFavoriteId("abc", 2234, "A useful sentence.")
);

const favorite = createFavorite({
  english: "  That's exactly what I mean. ",
  startMs: 5210.4,
  videoId: "video-1",
  sourceTitle: "Example",
  sourceUrl: "https://www.youtube.com/watch?v=video-1&t=5s",
  savedAt: 42
});
assert.equal(favorite.english, "That's exactly what I mean.");
assert.equal(favorite.startMs, 5210);
assert.equal(favorite.chinese, "");
assert.equal(favorite.savedAt, 42);

assert.deepEqual(normalizeFavorites([favorite, favorite, { english: " " }]), [favorite]);

assert.equal(
  buildQuizletImport([
    { ...favorite, chinese: "这正是我的意思。" },
    { english: "Missing Chinese", chinese: "" },
    { english: "Line\nwith\ttabs", chinese: "多行\n内容" }
  ]),
  "这正是我的意思。\tThat's exactly what I mean.\n多行 内容\tLine with tabs"
);

console.log("card-engine: all tests passed");
