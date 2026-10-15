import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { ASSETS } from '../site/free-ocr-assets.js';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/10219/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const browserName = process.env.OCR_BROWSER || 'chromium';
const publicAssets = process.env.OCR_PUBLIC_ASSETS === '1';
const browser = await playwright[browserName].launch({ ...(browserName === 'chromium' ? { channel: 'msedge', ...(publicAssets ? { args: ['--no-proxy-server'] } : {}) } : {}), headless: true });
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1180, height: 820 }, ...(browserName === 'webkit' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
const page = await context.newPage(), external = [], posts = [], errors = [], assetRequests = [], publicRequests = [];
const publicURLs = new Set(ASSETS.flatMap(asset => asset.sources || []).filter(url => url.startsWith('https:')));
const testURL = process.env.FREE_OCR_TEST_URL || 'http://127.0.0.1:4183/';
const allowedOrigin = new URL(testURL).origin;
page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR:', error.message); });
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('[W:onnxruntime:')) console.log('BROWSER:', message.text()); });
page.on('request', request => {
  if (request.method() === 'POST') posts.push(request.url());
});
page.on('response', response => {
  if (response.status() === 200 && (publicURLs.has(response.url()) || ASSETS.some(asset => response.url() === new URL(asset.path, testURL).href))) assetRequests.push(response.url());
});
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== allowedOrigin) {
    if (publicURLs.has(url.href) && route.request().method() === 'GET') {
      publicRequests.push(url.href); return publicAssets ? route.continue() : route.abort();
    }
    external.push(url.origin); return route.abort();
  }
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
  assert.equal(assetRequests.length, ASSETS.length, 'Download each asset once, not again through the SDK');
  await page.reload();
  const warm = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 160;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 500, 160); ctx.fillStyle = '#183252'; ctx.font = '65px Arial'; ctx.fillText('improve', 20, 100);
    return window.FreeHandwritingGrader.grade({ kind: 'spelling', prompt: '提升', expected: ['improve'] }, canvas);
  });
  assert.equal(warm.status, 'correct');
  assert.equal(assetRequests.length, ASSETS.length, 'Reload reuses the persistent complete-file cache without downloading models again');
  assert.deepEqual(external, [], 'Only pinned public static components, never inference, may leave this origin');
  assert.deepEqual(posts, [], 'No paid or cloud inference requests'); assert.deepEqual(errors, []);
  const output = new URL('../qa-handwriting/', import.meta.url); await mkdir(output, { recursive: true });
  await writeFile(new URL(`free-ocr-real-engine-${browserName}${publicAssets ? '-public' : ''}.json`, output), JSON.stringify({ browserName, publicAssets, reports: result, reload: warm, assetRequests, publicRequests, externalRequests: external, postRequests: posts, note: 'Real OCR with rendered fixtures. WebKit mobile emulation is not a physical iPad or branded Safari test.' }, null, 2));
  console.log(`Real browser-local OCR ${browserName} tests passed: stages, one download per asset, cached reload and rendered text. Not a physical iPad test.`);
} finally { await browser.close(); }
