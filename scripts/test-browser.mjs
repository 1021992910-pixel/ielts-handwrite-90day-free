import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const targets = await fetch("http://127.0.0.1:9223/json/list").then(response => response.json());
const target = targets.find(item => item.type === "page" && item.url === "http://127.0.0.1:4181/");
assert.ok(target?.webSocketDebuggerUrl, "Local preview tab was not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const response = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
  return response.result.value;
}

const result = await evaluate(`(() => {
  const byId = id => document.getElementById(id);
  document.querySelector('[data-view="words"]').click();
  const expectedWord = byId('wordMeaning').textContent.split(/[；;,，、/]+/)[0].trim();
  byId('wordScribbleAnswer').value = expectedWord;
  byId('checkWordAnswer').click();
  const wordCorrect = byId('wordCheckResult').classList.contains('correct');
  byId('wordScribbleAnswer').value = 'definitely wrong';
  byId('checkWordAnswer').click();
  const wordWrong = byId('wordCheckResult').classList.contains('wrong');

  document.querySelector('[data-view="listening"]').click();
  byId('spellingScribbleAnswer').value = byId('spellingEnglish').textContent;
  byId('checkSpellingAnswer').click();
  const spellingCorrect = byId('spellingCheckResult').classList.contains('correct');

  return {
    wordCorrect,
    wordWrong,
    spellingCorrect,
    aiButtons: document.querySelectorAll('.ai-review-button').length,
    privacyBadge: document.querySelector('.privacy-chip')?.textContent.trim(),
    activeView: document.querySelector('.view.active')?.id
  };
})()`);

await command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 1366, deviceScaleFactor: 1, mobile: true });
const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(join(tmpdir(), "ielts-free-version-interaction-check.png"), Buffer.from(screenshot.data, "base64"));

assert.equal(result.wordCorrect, true);
assert.equal(result.wordWrong, true);
assert.equal(result.spellingCorrect, true);
assert.equal(result.aiButtons, 0);
assert.equal(result.privacyBadge, "无登录 · 无 Token");
assert.equal(result.activeView, "view-listening");

socket.close();
console.log("Browser interaction tests passed", result);
