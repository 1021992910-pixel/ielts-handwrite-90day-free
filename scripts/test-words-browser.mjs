import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/10219/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const browserName = process.env.WORDS_BROWSER || 'chromium';
const browser = await playwright[browserName].launch({ headless: true, ...(browserName === 'chromium' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', acceptDownloads: true, ...(browserName === 'webkit' ? { isMobile: true, hasTouch: true } : {}) });
const page = await context.newPage(), errors = [], forbidden = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (request.method() !== 'GET' || /free-ocr-worker|\.wasm|\.tar|opencv|\/api\//.test(request.url())) forbidden.push(request.url());
});
const base = process.env.WORDS_TEST_URL || 'http://127.0.0.1:4186/';
const output = new URL('../qa-handwriting/', import.meta.url); await mkdir(output, { recursive: true });
const workspace = () => page.locator('#wordWorkspace');
const settled = () => page.waitForFunction(() => { const workspace = document.querySelector('#wordWorkspace'); return workspace.question && !workspace.busy; });
async function select(word, direction = 'en-zh') {
  await settled();
  await page.evaluate(({ word, selectedDirection }) => {
    direction = selectedDirection;
    document.querySelectorAll('[data-direction]').forEach(button => button.classList.toggle('active', button.dataset.direction === direction));
    nextWord(word);
  }, { word, selectedDirection: direction });
  await settled();
}
async function submit(answer, status) {
  await workspace().locator('textarea').fill(answer);
  await workspace().locator('[data-submit]').click();
  await workspace().locator(`.grade-result.${status}`).waitFor(); await settled();
}
try {
  await page.goto(base); await settled();
  await page.evaluate(() => {
    state.activeWord = 'different'; state.wordDirection = 'en-zh'; state.wordReviewed = 7;
    state.wordStats.education = { rating: 3, next: '2099-01-01', reasons: ['旧错因'] };
    state.readingText = '原有阅读材料'; state.spellingReviewed = 11; saveState();
    return window.HandwritingNotebook.import([
      ['draft:words:en-zh:different', [{ tool: 'pen', points: [{ x: .1, y: .2 }, { x: .2, y: .3 }] }]],
      ['attempt:legacy-word-test', { id: 'legacy-word-test', question: { id: 'en-zh:different', module: 'words', kind: 'meaning', prompt: 'different', expected: ['不同的'] }, strokes: [{ tool: 'pen', points: [{ x: .1, y: .2 }, { x: .2, y: .3 }] }], status: 'wrong', recognized: '教育', expected: '不同的', reasons: ['意思混淆'], explanation: '旧版记录', counted: true, createdAt: '2026-10-15T12:00:00Z' }]
    ]);
  });
  await page.reload(); await settled(); await page.locator('[data-view=words]').click();
  assert.equal(await workspace().locator('canvas').count(), 0);
  assert.equal(await workspace().locator('textarea').getAttribute('autocorrect'), 'off');
  assert.equal(await workspace().locator('textarea').getAttribute('spellcheck'), 'false');
  await workspace().locator('[data-submit]').click();
  assert.match(await workspace().locator('.submission-error').innerText(), /先输入/);
  assert.equal(await page.evaluate(() => state.wordReviewed), 7);
  await workspace().locator('textarea').fill('还没提交的草稿');
  await page.evaluate(() => document.querySelector('#wordWorkspace').savePromise);
  await select('environment'); assert.equal(await workspace().locator('textarea').inputValue(), '');
  await select('different'); assert.equal(await workspace().locator('textarea').inputValue(), '还没提交的草稿');
  await page.reload(); await settled(); await page.locator('[data-view=words]').click();
  assert.equal(await workspace().locator('textarea').inputValue(), '还没提交的草稿');
  await submit('不同', 'correct');
  assert.equal(await page.locator('#wordAnswer').isVisible(), true);
  assert.equal(await workspace().locator('.error-reasons').isVisible(), false);
  assert.equal(await workspace().locator('textarea').getAttribute('readonly'), '');
  assert.equal(await page.evaluate(() => state.wordReviewed), 7, 'Grading alone does not count twice');
  await page.evaluate(() => { const button = document.querySelector('#wordWorkspace [data-next]'); button.click(); button.click(); });
  await page.waitForFunction(() => state.wordReviewed === 8); await settled();
  await select('environment', 'zh-en'); await submit('enviroment', 'wrong');
  assert.equal(await workspace().locator('.spelling-diff').isVisible(), true);
  assert.equal(await workspace().locator('.letter-missing').innerText(), 'n');
  await workspace().locator('[data-next]').click();
  assert.match(await workspace().locator('.submission-error').innerText(), /请选择错因/);
  assert.equal(await page.evaluate(() => state.wordReviewed), 8);
  await workspace().getByLabel('漏写或多写字母', { exact: true }).check();
  await workspace().getByLabel('输入失误', { exact: true }).check();
  await page.evaluate(() => document.querySelector('#wordWorkspace').savePromise);
  await page.reload(); await settled(); await page.locator('[data-view=words]').click();
  await workspace().locator('.grade-result.wrong').waitFor();
  assert.equal(await workspace().getByLabel('漏写或多写字母', { exact: true }).isChecked(), true);
  assert.equal(await workspace().getByLabel('输入失误', { exact: true }).isChecked(), true);
  await page.screenshot({ path: fileURLToPath(new URL(`words-${browserName}-spelling.png`, output)), fullPage: true });
  await workspace().locator('[data-next]').click(); await page.waitForFunction(() => state.wordReviewed === 9); await settled();
  assert.deepEqual(await page.evaluate(() => state.wordStats.environment.reasons), ['漏写或多写字母', '输入失误']);
  await select('different'); await submit('教育', 'wrong');
  assert.equal(await workspace().getByLabel('与其他词义混淆', { exact: true }).count(), 1);
  assert.equal(await workspace().getByLabel('听音没听清', { exact: true }).count(), 0);
  await workspace().locator('[data-dispute]').click(); await settled();
  await workspace().locator('.grade-result.uncertain').waitFor();
  await workspace().locator('[data-skip]').click(); await settled();
  assert.equal(await page.evaluate(() => state.wordReviewed), 9);
  await select('different'); await workspace().locator('[data-clear]').click();
  await submit('独具一格', 'uncertain');
  assert.equal(await workspace().locator('[data-next]').isVisible(), false);
  await workspace().locator('[data-skip]').click(); await settled();
  assert.equal(await page.evaluate(() => state.wordReviewed), 9);
  await select('improve', 'zh-en'); await workspace().locator('[data-unknown]').click();
  await workspace().locator('.grade-result.wrong').waitFor(); await settled();
  await workspace().getByLabel('暂不确定原因', { exact: true }).check();
  await workspace().locator('[data-next]').click(); await page.waitForFunction(() => state.wordReviewed === 10); await settled();
  await select('different'); await workspace().locator('[data-clear]').click(); await submit('不一样', 'correct');
  await workspace().locator('.answer-history > summary').click();
  const legacy = workspace().locator('.history-item').filter({ hasText: '旧版记录' });
  await legacy.locator('summary').click(); assert.equal(await legacy.locator('img').isVisible(), true);
  assert.ok((await page.evaluate(() => HandwritingNotebook.get('draft:words:en-zh:different'))).length);
  assert.equal(await page.evaluate(() => state.readingText), '原有阅读材料');
  assert.equal(await page.evaluate(() => state.spellingReviewed), 11);
  assert.equal(await page.evaluate(() => state.wordStats.education.reasons[0]), '旧错因');
  // Persist, export and reimport both old ink and new typed attempts.
  await page.locator('[data-view=progress]').click();
  const downloaded = page.waitForEvent('download'); await page.locator('#exportData').click();
  const download = await downloaded; const backup = await readFile(await download.path(), 'utf8');
  const parsed = JSON.parse(backup);
  assert.ok(parsed.notebook.some(([key]) => key === 'attempt:legacy-word-test'));
  assert.ok(parsed.notebook.some(([key, value]) => key.startsWith('attempt:') && value.inputMode === 'typed' && value.reasons?.includes('漏写或多写字母')));
  await page.locator('#importData').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.waitForEvent('load'); await settled();
  assert.equal(await page.evaluate(() => state.wordReviewed), 10);
  await page.locator('[data-view=words]').click();
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: fileURLToPath(new URL(`words-${browserName}-portrait.png`, output)), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.locator('[data-view=listening]').click();
  assert.ok(await page.locator('#spellingWorkspace canvas').isVisible(), 'Other modules keep their original component');
  assert.deepEqual(forbidden, [], 'Words do not request an OCR model, upload answers, or call APIs');
  assert.deepEqual(errors, []);
  console.log(`Typed words ${browserName} passed: original data, Chinese aliases, spelling diff, reasons, refresh, draft isolation, no double count, disputes, backup/import, old ink history, mobile layouts and no OCR/API requests.`);
} finally { await browser.close(); }
