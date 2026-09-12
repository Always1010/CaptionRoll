import { writeFile } from "node:fs/promises";

const port = Number(process.argv[2] ?? 9229);
const screenshotPath = process.argv[3];
const deadline = Date.now() + 20000;

async function findYouTubeTarget() {
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const target = targets.find((entry) => entry.type === "page" && entry.url.includes("youtube.com/watch"));
      if (target) return target;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Edge DevTools target did not become available");
}

function evaluate(target, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const id = 1;
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("DevTools evaluation timed out"));
    }, 15000);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.close();
      resolve(message.result?.result?.value);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("DevTools WebSocket failed"));
    });
  });
}

function moveMouse(target, x, y) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const id = 3;
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Mouse movement timed out"));
    }, 15000);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          id,
          method: "Input.dispatchMouseEvent",
          params: { type: "mouseMoved", x, y }
        })
      );
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.close();
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("DevTools mouse movement failed"));
    });
  });
}

function captureScreenshot(target) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const id = 2;
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Screenshot timed out"));
    }, 15000);
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({ id, method: "Page.captureScreenshot", params: { format: "png", fromSurface: true } })
      );
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.close();
      resolve(message.result?.data);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Screenshot WebSocket failed"));
    });
  });
}

function relativeLuminance(cssColor) {
  const values = String(cssColor).match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!values || values.length !== 3) return null;
  const channels = values.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return 0;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const target = await findYouTubeTarget();
await new Promise((resolve) => setTimeout(resolve, 10000));
const result = await evaluate(
  target,
  `({
    url: location.href,
    readyState: document.readyState,
    hasPlayer: Boolean(document.getElementById('movie_player')),
    hasPanel: Boolean(document.getElementById('captionroll-host')),
    panelParent: document.getElementById('captionroll-host')?.parentElement?.id ?? null,
    status: document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.status')?.textContent ?? null,
    cueCount: document.getElementById('captionroll-host')?.shadowRoot?.querySelectorAll('.cue').length ?? 0,
    hasRawMode: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('[data-mode="raw"]')),
    hasInteractionMode: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.interaction')),
    hasTranscriptFontControls: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.font-controls')),
    hasFavorites: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.favorites-toggle')),
    hasQuizletExport: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.quizlet-export')),
    hasVideoCaptionHost: Boolean(document.getElementById('captionroll-video-caption-host')),
    hasInlineCaptionSettings: Boolean(document.getElementById('captionroll-video-caption-host')?.shadowRoot?.querySelector('.caption-settings-trigger'))
  })`
);
console.log(JSON.stringify(result, null, 2));
if (!result?.hasPanel) process.exitCode = 1;
if (
  result?.hasRawMode ||
  !result?.hasInteractionMode ||
  !result?.hasTranscriptFontControls ||
  !result?.hasFavorites ||
  !result?.hasQuizletExport ||
  !result?.hasVideoCaptionHost ||
  !result?.hasInlineCaptionSettings
) {
  process.exitCode = 1;
}
const transcriptControls = await evaluate(
  target,
  `(() => {
    const root = document.getElementById('captionroll-host')?.shadowRoot;
    const interaction = root?.querySelector('.interaction');
    const fontUp = root?.querySelector('[data-font="up"]');
    const host = document.getElementById('captionroll-host');
    const modeBefore = interaction?.textContent ?? '';
    const fontBefore = host?.style.getPropertyValue('--cr-font-scale') ?? '';
    interaction?.click();
    const modeAfter = interaction?.textContent ?? '';
    interaction?.click();
    fontUp?.click();
    const fontAfter = host?.style.getPropertyValue('--cr-font-scale') ?? '';
    return { modeBefore, modeAfter, fontBefore, fontAfter };
  })()`
);
console.log(JSON.stringify({ transcriptControls }, null, 2));
if (
  !transcriptControls.modeBefore ||
  transcriptControls.modeBefore === transcriptControls.modeAfter ||
  Number(transcriptControls.fontAfter) <= Number(transcriptControls.fontBefore)
) {
  process.exitCode = 1;
}
if (result?.cueCount > 0) {
  await evaluate(
    target,
    "document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.cue')?.click()"
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  const videoCaption = await evaluate(
    target,
    `(() => {
      const player = document.getElementById('movie_player');
      const host = document.getElementById('captionroll-video-caption-host');
      const caption = host?.shadowRoot?.querySelector('.caption');
      const shell = host?.shadowRoot?.querySelector('.caption-shell');
      return {
        text: caption?.textContent?.trim() ?? '',
        visible: Boolean(shell && !shell.hidden),
        nativeCaptionsHidden: player?.classList.contains('captionroll-full-sentence-captions') ?? false
      };
    })()`
  );
  console.log(JSON.stringify({ videoCaption }, null, 2));
  if (!videoCaption.visible || !videoCaption.text || !videoCaption.nativeCaptionsHidden) {
    process.exitCode = 1;
  }

  await moveMouse(target, 1, 1);
  const captionInteractionBefore = await evaluate(
    target,
    `(() => {
      const root = document.getElementById('captionroll-video-caption-host')?.shadowRoot;
      const caption = root?.querySelector('.caption');
      const captionText = caption?.querySelector('span');
      const trigger = root?.querySelector('.caption-settings-trigger');
      if (!caption || !captionText || !trigger) return { found: false };
      const captionStyle = getComputedStyle(caption);
      const triggerStyle = getComputedStyle(trigger);
      const captionRect = caption.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(captionText);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const selectedText = selection?.toString().trim() ?? '';
      selection?.removeAllRanges();
      return {
        found: true,
        userSelect: captionStyle.userSelect,
        pointerEvents: captionStyle.pointerEvents,
        selectedText,
        triggerOpacity: triggerStyle.opacity,
        triggerVisibility: triggerStyle.visibility,
        triggerPointerEvents: triggerStyle.pointerEvents,
        captionCenter: {
          x: captionRect.left + captionRect.width / 2,
          y: captionRect.top + captionRect.height / 2
        },
        controlGap: triggerRect.left - captionRect.right
      };
    })()`
  );
  if (captionInteractionBefore?.captionCenter) {
    await moveMouse(
      target,
      captionInteractionBefore.captionCenter.x,
      captionInteractionBefore.captionCenter.y
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  const captionInteractionAfter = await evaluate(
    target,
    `(() => {
      const trigger = document.getElementById('captionroll-video-caption-host')?.shadowRoot?.querySelector('.caption-settings-trigger');
      if (!trigger) return { found: false };
      const style = getComputedStyle(trigger);
      return {
        found: true,
        triggerOpacity: style.opacity,
        triggerVisibility: style.visibility,
        triggerPointerEvents: style.pointerEvents
      };
    })()`
  );
  console.log(JSON.stringify({ captionInteractionBefore, captionInteractionAfter }, null, 2));
  if (
    !captionInteractionBefore.found ||
    captionInteractionBefore.userSelect !== 'text' ||
    captionInteractionBefore.pointerEvents !== 'auto' ||
    !captionInteractionBefore.selectedText ||
    Number(captionInteractionBefore.triggerOpacity) !== 0 ||
    captionInteractionBefore.triggerVisibility !== 'hidden' ||
    captionInteractionBefore.triggerPointerEvents !== 'none' ||
    captionInteractionBefore.controlGap < 0 ||
    captionInteractionBefore.controlGap > 1 ||
    !captionInteractionAfter.found ||
    Number(captionInteractionAfter.triggerOpacity) < 0.9 ||
    captionInteractionAfter.triggerVisibility !== 'visible' ||
    captionInteractionAfter.triggerPointerEvents !== 'auto'
  ) {
    process.exitCode = 1;
  }

  const captionControls = await evaluate(
    target,
    `(() => {
      const host = document.getElementById('captionroll-video-caption-host');
      const root = host?.shadowRoot;
      const trigger = root?.querySelector('.caption-settings-trigger');
      const popover = root?.querySelector('.caption-settings-popover');
      const fontUp = root?.querySelector('[data-caption-font="up"]');
      const position = root?.querySelector('[data-caption-position]');
      const background = root?.querySelector('[data-caption-background]');
      const fontBefore = host?.style.getPropertyValue('--cr-caption-font-size') ?? '';
      trigger?.click();
      const popoverVisible = Boolean(popover && !popover.hidden);
      fontUp?.click();
      const fontAfter = host?.style.getPropertyValue('--cr-caption-font-size') ?? '';
      if (position) {
        position.value = '16';
        position.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const positionAfter = host?.style.getPropertyValue('--cr-caption-position') ?? '';
      if (background) {
        background.value = '0.4';
        background.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const backgroundAfter = host?.style.getPropertyValue('--cr-caption-background') ?? '';
      return { popoverVisible, fontBefore, fontAfter, positionAfter, backgroundAfter };
    })()`
  );
  console.log(JSON.stringify({ captionControls }, null, 2));
  if (
    !captionControls.popoverVisible ||
    parseFloat(captionControls.fontAfter) <= parseFloat(captionControls.fontBefore) ||
    captionControls.positionAfter !== '16%' ||
    captionControls.backgroundAfter !== '0.4'
  ) {
    process.exitCode = 1;
  }

  const favoriteAppearance = await evaluate(
    target,
    `(() => {
      const root = document.getElementById('captionroll-host')?.shadowRoot;
      root?.querySelector('.favorite-action')?.click();
      root?.querySelector('.favorites-toggle')?.click();
      const input = root?.querySelector('.favorite-chinese');
      if (!input) return { inputFound: false };
      input.value = '中文测试';
      const style = getComputedStyle(input);
      return {
        inputFound: true,
        color: style.color,
        backgroundColor: style.backgroundColor
      };
    })()`
  );
  favoriteAppearance.contrastRatio = contrastRatio(
    favoriteAppearance.color,
    favoriteAppearance.backgroundColor
  );
  console.log(JSON.stringify({ favoriteAppearance }, null, 2));
  if (!favoriteAppearance.inputFound || favoriteAppearance.contrastRatio < 4.5) process.exitCode = 1;
}
if (screenshotPath) {
  const base64 = await captureScreenshot(target);
  await writeFile(screenshotPath, Buffer.from(base64, "base64"));
}
