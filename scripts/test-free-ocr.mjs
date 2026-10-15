import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { ASSETS } from '../site/free-ocr-assets.js';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/10219/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const browserName = process.env.OCR_BROWSER || 'chromium';
const browser = await playwright[browserName].launch({ ...(browserName === 'chromium' ? { channel: 'msedge' } : {}), headless: true });
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1180, height: 820 }, ...(browserName === 'webkit' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
const page = await context.newPage(), external = [], posts = [], errors = [], assetRequests = [];
const testURL = process.env.FREE_OCR_TEST_URL || 'http://127.0.0.1:4183/';
const allowedOrigin = new URL(testURL).origin;
page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR:', error.message); });
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('[W:onnxruntime:')) console.log('BROWSER:', message.text()); });
page.on('request', request => {
  if (request.method() === 'POST') posts.push(request.url());
  if (ASSETS.some(asset => request.url().endsWith(asset.path.slice(1)))) assetRequests.push(request.url());
});
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== allowedOrigin) { external.push(url.origin); return route.abort(); }
  return route.continue();
});
try {
  await page.goto(testURL);
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
      const stages = [];
      const grade = await window.FreeHandwritingGrader.grade({ kind, prompt, expected }, canvas, { onProgress: (_message, details) => { if (stages.at(-1) !== details.stage) stages.push(details.stage); } });
      reports.push({ source: text, ...grade, stages, ms: Math.round(performance.now() - start) });
    }
    return reports;
  });
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result[0].status, 'correct'); assert.equal(result[1].status, 'wrong'); assert.equal(result[2].status, 'correct');
  assert.deepEqual(result[0].stages, ['boot', 'download', 'initialize', 'recognize']);
  assert.equal(assetRequests.length, 5, 'Download each asset once, not again through the SDK');
  await page.reload();
  const warm = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 160;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 500, 160); ctx.fillStyle = '#183252'; ctx.font = '65px Arial'; ctx.fillText('improve', 20, 100);
    return window.FreeHandwritingGrader.grade({ kind: 'spelling', prompt: '提升', expected: ['improve'] }, canvas);
  });
  assert.equal(warm.status, 'correct');
  assert.equal(assetRequests.length, 5, 'Reload reuses the persistent complete-file cache without downloading models again');
  assert.deepEqual(external, [], 'No external model or inference requests');
  assert.deepEqual(posts, [], 'No paid or cloud inference requests'); assert.deepEqual(errors, []);
  const output = new URL('../qa-handwriting/', import.meta.url); await mkdir(output, { recursive: true });
  await writeFile(new URL(`free-ocr-real-engine-${browserName}.json`, output), JSON.stringify({ browserName, reports: result, reload: warm, assetRequests, externalRequests: external, postRequests: posts, note: 'Real OCR with rendered fixtures. WebKit mobile emulation is not a physical iPad or branded Safari test.' }, null, 2));
  console.log(`Real browser-local OCR ${browserName} tests passed: stages, one download per asset, cached reload and rendered text. Not a physical iPad test.`);
} finally { await browser.close(); }
