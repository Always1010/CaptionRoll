const assert = require("node:assert/strict");
const { createFollowPause } = require("../follow-pause.js");

let nextId = 0;
const tasks = new Map();
const delays = [];
let resumed = 0;
const controller = createFollowPause({
  delayMs: 5000,
  schedule(callback, delay) {
    const id = ++nextId;
    tasks.set(id, callback);
    delays.push(delay);
    return id;
  },
  cancelSchedule(id) {
    tasks.delete(id);
  },
  onResume() {
    resumed += 1;
  }
});

controller.pause();
assert.equal(controller.isPaused(), true);
assert.deepEqual(delays, [5000]);
const firstId = nextId;

controller.pause();
assert.equal(tasks.has(firstId), false);
assert.deepEqual(delays, [5000, 5000]);
tasks.get(nextId)();
assert.equal(controller.isPaused(), false);
assert.equal(resumed, 1);

controller.pause();
const cancelledId = nextId;
controller.cancel();
assert.equal(controller.isPaused(), false);
assert.equal(tasks.has(cancelledId), false);
assert.equal(resumed, 1);

console.log("follow pause: all tests passed");
