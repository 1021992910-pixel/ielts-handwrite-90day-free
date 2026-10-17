import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/10219/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const browserName = process.env.NOTEBOOK_BROWSER || 'chromium';
const browser = await playwright[browserName].launch({ headless: true, ...(browserName === 'chromium' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', acceptDownloads: true, ...(browserName === 'webkit' ? { isMobile: true, hasTouch: true } : {}) });
// Regression fixture for the unchanged handwriting component (still used by listening).
// Production word practice now has its own keyboard-based browser test.
await context.route('**/*', async route => {
  if (route.request().resourceType() !== 'document') return route.continue();
  const response = await route.fetch();
  const body = (await response.text()).replace('<word-answer-workspace id="wordWorkspace" module="words"></word-answer-workspace>', '<answer-workspace id="wordWorkspace" module="words"></answer-workspace>');
  await route.fulfill({ response, body });
});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = process.env.NOTEBOOK_TEST_URL || 'http://127.0.0.1:4183/';
const output = new URL('../qa-handwriting/', import.meta.url);
await mkdir(output, { recursive: true });
let calls = 0, mode = 'correct';
await page.exposeFunction('__testFreeGrade', async (question, dimensions) => {
  calls++;
  if (mode === 'unavailable') throw new Error('免费模型尚未加载，笔迹已保留。');
  assert.ok(dimensions.width > 0 && dimensions.height > 0);
  assert.ok(question.expected.length > 0);
  return { status: mode, recognized: mode === 'wrong' ? '错误意思' : '不同', explanation: mode === 'correct' ? '意思正确，接受合理中文表达。' : mode === 'uncertain' ? '有些笔迹未能辨认，暂不计对错。' : '这个意思与参考词义不符。' };
});
await context.addInitScript(() => {
  const stub = { grade: (question, canvas, options) => {
    if (window.__hangOCR) {
      options.onProgress('准备免费识别 25% · 测试慢速下载', { stage: 'download', percent: 25 });
      return new Promise(() => {});
    }
    return window.__testFreeGrade(question, { width: canvas.width, height: canvas.height });
  } };
  Object.defineProperty(window, 'FreeHandwritingGrader', { configurable: true, get: () => stub, set: () => {} });
});
const workspace = () => page.locator('#wordWorkspace');
async function settled() { await page.waitForFunction(() => !document.querySelector('#wordWorkspace').pad.loading); }
async function ink() {
  await settled();
  await workspace().locator('canvas').scrollIntoViewIfNeeded();
  const box = await workspace().locator('canvas').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 70); await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 130, { steps: 8 });
  await page.mouse.move(box.x + 140, box.y + 70, { steps: 8 }); await page.mouse.up();
  await page.evaluate(() => document.querySelector('#wordWorkspace').pad.savePromise);
}
try {
  await page.goto(url); await page.locator('[data-view=words]').click();
  assert.equal(await page.locator('#wordScribbleAnswer').count(), 0);
  await page.waitForFunction(() => window.WordPracticeReady);
  await page.evaluate(() => { createWordSession('different'); nextWord(); }); await settled();
  await workspace().locator('[data-submit]').click();
  assert.match(await workspace().locator('.submission-error').innerText(), /先.*写/); assert.equal(calls, 0);
  await ink();
  const fallback = await page.evaluate(() => {
    const pad = document.querySelector('#wordWorkspace').pad, rect = pad.canvas.getBoundingClientRect();
    const stroke = pad.strokes.at(-1), before = stroke.points.length;
    pad.activeStroke = stroke; pad.pointer = 99;
    pad.move({ pointerId: 99, clientX: rect.left + 190, clientY: rect.top + 150, pressure: .5, preventDefault() {}, getCoalescedEvents() { return []; } });
    pad.up({ pointerId: 99, type: 'pointerup', clientX: rect.left + 210, clientY: rect.top + 160, pressure: .5 });
    return { before, after: stroke.points.length };
  });
  assert.equal(fallback.after, fallback.before + 2, 'Empty coalesced events and the final pen-up point must not drop ink');
  const strokeCount = await page.evaluate(() => document.querySelector('#wordWorkspace').pad.strokes.length);
  await workspace().locator('[data-action=clear]').click();
  assert.equal(await page.evaluate(() => document.querySelector('#wordWorkspace').pad.hasInk), false);
  await workspace().locator('[data-action=undo]').click();
  assert.equal(await page.evaluate(() => document.querySelector('#wordWorkspace').pad.strokes.length), strokeCount);
  await page.evaluate(() => document.querySelector('#wordWorkspace').pad.savePromise);
  await page.reload(); await page.locator('[data-view=words]').click(); await settled();
  assert.equal(await page.locator('#wordPrompt').innerText(), 'different');
  assert.equal(await page.evaluate(() => document.querySelector('#wordWorkspace').pad.hasInk), true);
  await page.screenshot({ path: new URL('01-answer-paper.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await workspace().locator('[data-submit]').click();
  await workspace().locator('.grade-result.correct').waitFor();
  assert.equal(await workspace().locator('[data-recognized]').innerText(), '不同');
  await workspace().locator('[data-next]').click(); await page.waitForFunction(() => state.wordReviewed === 1); await settled();
  assert.equal(await page.evaluate(() => state.wordReviewed), 1);
  assert.equal(await page.evaluate(() => document.querySelector('#wordWorkspace').pad.hasInk), false);
  mode = 'wrong'; await ink(); await workspace().locator('[data-submit]').click();
  await workspace().locator('.grade-result.wrong').waitFor();
  await workspace().locator('[data-next]').click();
  assert.match(await workspace().locator('.submission-error').innerText(), /选择.*错因/);
  await workspace().getByLabel('意思混淆', { exact: true }).check();
  await page.waitForFunction(async () => (await window.HandwritingNotebook.export()).some(([key, value]) => key.startsWith('attempt:') && value.reasons?.includes('意思混淆')));
  await page.reload(); await page.locator('[data-view=words]').click(); await settled();
  await workspace().locator('.grade-result.wrong').waitFor();
  assert.equal(await workspace().getByLabel('意思混淆', { exact: true }).isChecked(), true, 'Restore the uncompleted grading and chosen reason after reload');
  await page.screenshot({ path: new URL('02-grading-and-reasons.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await workspace().locator('[data-next]').click(); await page.waitForFunction(() => state.wordReviewed === 2); await settled();
  assert.equal(await page.evaluate(() => state.wordReviewed), 2);
  await workspace().locator('.answer-history > summary').click();
  assert.equal(await workspace().locator('.history-item').count(), 2);
  await workspace().locator('.history-item > summary').first().click();
  assert.match(await workspace().locator('.history-item').first().innerText(), /意思混淆/);
  await workspace().locator('.history-item').first().getByText('重新练这题', { exact: true }).click(); await settled();
  mode = 'uncertain'; await ink(); await workspace().locator('[data-submit]').click();
  await workspace().locator('.grade-result.uncertain').waitFor();
  assert.equal(await workspace().locator('[data-next]').isDisabled(), true);
  assert.equal(await page.evaluate(() => state.wordReviewed), 2);
  const uncertainQuestion = await page.evaluate(() => document.querySelector('#wordWorkspace').question.id);
  await workspace().locator('[data-skip]').click();
  await page.waitForFunction(previous => document.querySelector('#wordWorkspace').question.id !== previous, uncertainQuestion);
  assert.equal(await page.evaluate(() => state.wordReviewed), 2, 'Skipping an uncertain answer does not count as correct or wrong');
  await ink(); mode = 'unavailable';
  await workspace().locator('[data-submit]').click();
  await workspace().locator('.submission-error').waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('#wordWorkspace').pad.hasInk), true);
  assert.equal(await page.evaluate(() => state.wordReviewed), 2);
  const records = await page.evaluate(() => window.HandwritingNotebook.export());
  assert.equal(records.filter(([key]) => key.startsWith('attempt:')).length, 3);
  // Real pen pointer semantics: touch is ignored by default; a pen is accepted.
  const before = await page.evaluate(() => document.querySelector('#wordWorkspace').pad.strokes.length);
  await page.evaluate(() => window.__hangOCR = true);
  await workspace().locator('[data-submit]').click();
  await workspace().locator('.ocr-progress:not(.hidden)').waitFor();
  assert.equal(await workspace().locator('[data-progress-message]').innerText(), '正在准备批改');
  assert.match(await workspace().locator('[data-progress-technical]').textContent(), /25%/);
  assert.equal(await workspace().locator('.processing-details').getAttribute('open'), null);
  assert.doesNotMatch(await page.locator('body').innerText(), /免费|Token|46MB|模型|密钥/);
  assert.equal(await workspace().locator('progress').getAttribute('value'), '25');
  await page.screenshot({ path: new URL('04-download-progress.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await workspace().locator('[data-cancel]').click();
  await page.waitForFunction(() => !document.querySelector('#wordWorkspace').busy);
  assert.match(await workspace().locator('.submission-error').innerText(), /已取消/);
  assert.equal(await page.evaluate(() => document.querySelector('#wordWorkspace').pad.strokes.length), before);
  assert.equal(await page.evaluate(() => state.wordReviewed), 2);
  await page.evaluate(() => window.__hangOCR = false); mode = 'correct';
  await workspace().locator('[data-retry-submit]').click();
  await workspace().locator('.grade-result.correct').waitFor();
  // Cancellation must also work before recognition, while an IndexedDB write is stalled.
  await ink();
  await page.evaluate(() => { window.__savedInkPromise = document.querySelector('#wordWorkspace').pad.savePromise; document.querySelector('#wordWorkspace').pad.savePromise = new Promise(() => {}); });
  await workspace().locator('[data-submit]').click();
  await page.waitForFunction(() => document.querySelector('#wordWorkspace [data-progress-message]').textContent.includes('正在保存答案'));
  await workspace().locator('[data-cancel]').click();
  await page.waitForFunction(() => !document.querySelector('#wordWorkspace').busy);
  await page.evaluate(() => document.querySelector('#wordWorkspace').pad.savePromise = window.__savedInkPromise);
  await workspace().locator('[data-retry-submit]').click();
  await workspace().locator('.grade-result.correct').waitFor();
  const beforeTouch = await page.evaluate(() => document.querySelector('#wordWorkspace').pad.strokes.length);
  await workspace().locator('canvas').dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', clientX: 40, clientY: 40, button: 0 });
  assert.equal(await page.evaluate(() => document.querySelector('#wordWorkspace').pad.strokes.length), beforeTouch);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: new URL('03-ipad-portrait.png', output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  const portraitOverflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'absolute').map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, JSON.stringify(portraitOverflow));
  await page.locator('[data-view=listening]').click();
  await page.waitForFunction(() => !document.querySelector('#spellingWorkspace').pad.loading);
  assert.ok(await page.locator('#spellingWorkspace canvas').isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  assert.deepEqual(errors, []);
  console.log(`Browser ${browserName} checks passed: pen events, saved history, progress UI, cancellation during OCR and stalled storage, retry without rewriting, unscored failures, portrait and small screens. OCR mocked here; real engine has a separate test. Physical Apple Pencil remains unverified.`);
} finally { await browser.close(); }
