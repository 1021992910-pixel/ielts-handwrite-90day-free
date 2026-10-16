import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const playwright = require('C:/Users/10219/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = fileURLToPath(new URL('../', import.meta.url)), site = resolve(root, 'site');
const oldFiles = new Set(['index.html', 'sw.js', 'local-grader.js', 'app.js', 'styles.css']);
const snapshot = new Map([...oldFiles].map(file => [file, execFileSync('git', ['show', `2d8a624:site/${file}`], { cwd: root })]));
let oldVersion = true;
const server = http.createServer(async (request, response) => {
  const file = new URL(request.url, 'http://test').pathname.replace(/^\/study\//, '') || 'index.html';
  const path = resolve(site, file);
  if (!path.startsWith(site + sep)) { response.writeHead(403).end(); return; }
  try {
    const bytes = oldVersion && snapshot.has(file) ? snapshot.get(file) : await readFile(path);
    response.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript', 'Cache-Control': 'no-cache' }); response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/study/`;
const browserName = process.env.WORDS_BROWSER || 'chromium';
const browser = await playwright[browserName].launch({ headless: true, ...(browserName === 'chromium' ? { channel: 'msedge' } : {}) });
try {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await caches.keys()).includes('ielts-handwrite-local-ocr-v9'));
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller && !document.querySelector('#wordWorkspace').pad.loading);
  await page.evaluate(() => { state.activeWord = 'different'; state.wordDirection = 'en-zh'; state.wordReviewed = 17; saveState(); });
  oldVersion = false;
  // Old cache controls this navigation; versioned scripts must still load the new grader.
  await page.goto(`${url}index.html?v=1016A`);
  await page.waitForFunction(() => document.querySelector('#wordWorkspace')?.input && !document.querySelector('#wordWorkspace').busy);
  await page.locator('[data-view=words]').click();
  assert.equal(await page.evaluate(() => state.wordReviewed), 17);
  await page.locator('#typedWordAnswer').fill('不同');
  await page.locator('#wordWorkspace [data-submit]').click();
  await page.locator('#wordWorkspace .grade-result.correct').waitFor();
  await page.waitForFunction(async () => {
    const cache = await caches.open('ielts-handwrite-words-v10');
    return Boolean(await cache.match('./word-answers.js?v=1016A'));
  });
  if (browserName === 'chromium') {
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#wordWorkspace')?.input && !document.querySelector('#wordWorkspace').busy);
    await page.locator('[data-view=words]').click();
    await page.locator('#wordWorkspace .grade-result.correct').waitFor();
  }
  assert.equal(await page.evaluate(() => state.wordReviewed), 17);
  assert.deepEqual(errors, []);
  console.log(`Cache upgrade ${browserName} passed: old cached page to new versioned grader, preserved state and result.${browserName === 'chromium' ? ' Offline reload also passed.' : ' WebKit offline navigation excluded: this test runtime reports an internal engine error; physical iPad offline behavior is not verified.'}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
