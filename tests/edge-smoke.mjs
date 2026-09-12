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
    hasInteractionMode: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.interaction')),
    hasFavorites: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.favorites-toggle')),
    hasQuizletExport: Boolean(document.getElementById('captionroll-host')?.shadowRoot?.querySelector('.quizlet-export'))
  })`
);
console.log(JSON.stringify(result, null, 2));
if (!result?.hasPanel) process.exitCode = 1;
if (!result?.hasInteractionMode || !result?.hasFavorites || !result?.hasQuizletExport) process.exitCode = 1;
if (screenshotPath) {
  const base64 = await captureScreenshot(target);
  await writeFile(screenshotPath, Buffer.from(base64, "base64"));
}
