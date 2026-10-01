(function (global) {
  "use strict";

  function createFollowPause(options = {}) {
    const delayMs = Math.max(0, Number(options.delayMs) || 0);
    const schedule = options.schedule ?? global.setTimeout.bind(global);
    const cancelSchedule = options.cancelSchedule ?? global.clearTimeout.bind(global);
    const onResume = typeof options.onResume === "function" ? options.onResume : () => {};
    let timer = null;
    let paused = false;

    function pause() {
      paused = true;
      if (timer !== null) cancelSchedule(timer);
      timer = schedule(() => {
        timer = null;
        paused = false;
        onResume();
      }, delayMs);
    }

    function cancel() {
      if (timer !== null) cancelSchedule(timer);
      timer = null;
      paused = false;
    }

    return {
      cancel,
      isPaused: () => paused,
      pause
    };
  }

  const api = { createFollowPause };
  global.CaptionRollFollowPause = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
