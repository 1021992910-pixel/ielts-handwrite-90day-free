import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/10219/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1180, height: 820 } });
const page = await context.newPage(), external = [], posts = [], errors = [];
page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR:', error.message); });
page.on('console', message => { if (['error', 'warning'].includes(message.type())) console.log('BROWSER:', message.text()); });
page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.origin); return route.abort(); }
  return route.continue();
});
try {
  await page.goto('http://127.0.0.1:4183/');
  const result = await page.evaluate(async () => {
    const reports = [];
    for (const [text, kind, prompt, expected] of [
      ['environment', 'spelling', '环境', ['environment']],
      ['apple', 'spelling', '环境', ['environment']],
      ['不同', 'meaning', 'different', ['不同的']]
    ]) {
      const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 220;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 900, 220);
      ctx.fillStyle = '#183252'; ctx.font = '70px "Microsoft YaHei", Arial'; ctx.fillText(text, 40, 135);
      const start = performance.now();
      const grade = await window.FreeHandwritingGrader.grade({ kind, prompt, expected }, canvas, { onProgress: message => console.log(message) });
      reports.push({ source: text, ...grade, ms: Math.round(performance.now() - start) });
    }
    return reports;
  });
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result[0].status, 'correct'); assert.equal(result[1].status, 'wrong'); assert.equal(result[2].status, 'correct');
  assert.deepEqual(external, [], 'No external model or inference requests');
  assert.deepEqual(posts, [], 'No paid or cloud inference requests'); assert.deepEqual(errors, []);
  const output = new URL('../qa-handwriting/', import.meta.url); await mkdir(output, { recursive: true });
  await writeFile(new URL('free-ocr-real-engine-check.json', output), JSON.stringify({ reports: result, externalRequests: external, postRequests: posts, note: 'Real local OCR runtime with rendered text fixtures; not the user handwriting or a physical iPad test.' }, null, 2));
  console.log('Real browser-local OCR tests passed. These are rendered text fixtures, not physical Apple Pencil handwriting.');
} finally { await browser.close(); }
