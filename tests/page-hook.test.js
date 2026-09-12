const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const source = readFileSync(join(__dirname, "..", "page-hook.js"), "utf8");

assert.match(source, /englishTrack\.baseUrl/);
assert.doesNotMatch(source, /setOption\?\.\(\s*["']captions["']/);
assert.doesNotMatch(source, /loadModule\?\.\(\s*["']captions["']/);

console.log("page-hook: caption preference guard passed");
