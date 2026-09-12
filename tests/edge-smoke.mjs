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
    hasFavorites: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.favorites-toggle')),
    hasQuizletExport: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.quizlet-export'))
  })`
);
console.log(JSON.stringify(result, null, 2));
if (!result?.hasPanel) process.exitCode = 1;
if (result?.hasRawMode || !result?.hasFavorites || !result?.hasQuizletExport) process.exitCode = 1;
if (result?.cueCount > 0) {
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
