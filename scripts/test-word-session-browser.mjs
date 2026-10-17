import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const playwright = require('C:/Users/10219/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browserName = process.env.WORDS_BROWSER || 'chromium';
const browser = await playwright[browserName].launch({ headless: true, ...(browserName === 'chromium' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', acceptDownloads: true, ...(browserName === 'webkit' ? { isMobile: true, hasTouch: true } : {}) });
const page = await context.newPage(), errors = [], forbidden = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() !== 'GET' || /free-ocr-worker|\.wasm|\.tar|opencv|\/api\//.test(request.url())) forbidden.push(request.url()); });
const ready = () => page.waitForFunction(() => { const workspace = document.querySelector('#wordWorkspace'); return window.WordPracticeReady && workspace && !workspace.busy && (workspace.question || typeof wordSession === 'function' && wordSession()?.phase === 'done'); });
// Exercise the real form, store, Next events and scheduler, without mocking the grader.
async function answers(count, firstFailures = false, keepFailing = '') {
  return page.evaluate(async ({ count, firstFailures, keepFailing }) => {
    const wait = async predicate => { for (let i = 0; i < 500; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Word state did not settle'); };
    const events = [];
    for (let i = 0; i < count; i++) {
      const workspace = document.querySelector('#wordWorkspace'); await wait(() => !workspace.busy);
      const before = workspace.question.turnId, word = currentWord[0], session = wordSession();
      const fail = firstFailures && session.round === 1 && session.seen.length < 2 || word === keepFailing;
      const unknown = firstFailures && session.round === 1 && session.seen.length === 0;
      workspace.input.value = fail ? '__wrong__' : workspace.question.kind === 'spelling' ? workspace.question.expected[0] : workspace.question.expected[0];
      workspace.input.dispatchEvent(new Event('input', { bubbles: true }));
      await workspace.submit(unknown);
      if (!workspace.attempt) throw new Error('No saved answer');
      if (workspace.attempt.status === 'wrong' && !workspace.attempt.reasons.length) (workspace.querySelector('.reason-options input[value="漏写或多写字母"]') || workspace.querySelector('.reason-options input')).click();
      await workspace.savePromise;
      if (workspace.querySelector('.grade-actions').children.length !== 1) throw new Error('Unexpected retry control');
      events.push({ word, fail, round: session.round, attemptId: workspace.attempt.id, turnId: before });
      await workspace.finish();
      await wait(() => wordSession().phase === 'done' || !workspace.busy && workspace.question.turnId !== before);
    }
    return events;
  }, { count, firstFailures, keepFailing });
}
try {
  await page.goto(process.env.WORDS_TEST_URL || 'http://127.0.0.1:4186/'); await ready();
  await page.evaluate(() => {
    direction = 'zh-en'; wordSource = 'daily'; state.wordReviewed = 0;
    state.wordSessions = {};
    state.wordSessions[sessionKey()] = WordPractice.create(words(), { id: crypto.randomUUID(), day: todayKey(), direction, random: false });
    document.querySelectorAll('[data-direction]').forEach(button => button.classList.toggle('active', button.dataset.direction === direction));
    nextWord();
  });
  await ready(); await page.locator('[data-view=words]').click();
  const first = await answers(15, true);
  const beforeReload = await page.evaluate(() => ({ session: wordSession().id, pending: wordSession().pending, first: wordSession().seen.length, reviewed: state.wordReviewed }));
  await page.reload(); await ready(); await page.locator('[data-view=words]').click();
  assert.deepEqual(await page.evaluate(() => ({ session: wordSession().id, pending: wordSession().pending, first: wordSession().seen.length, reviewed: state.wordReviewed })), beforeReload);
  const rest = await answers(15);
  assert.equal(new Set([...first, ...rest].map(event => event.word)).size, 30);
  const weak = first.slice(0, 2).map(event => event.word);
  assert.equal(await page.evaluate(() => wordSession().phase), 'review');
  assert.equal(await page.evaluate(() => wordSession().items.length), 30);
  assert.deepEqual((await page.evaluate(() => [...wordSession().pending])).sort(), [...weak].sort());
  assert.equal(await page.locator('#wordSessionComplete').isVisible(), false);
  // The wordbook opens practice immediately, retaining the paused daily session.
  const dailyTurn = await page.evaluate(() => document.querySelector('#wordWorkspace').question.turnId);
  await page.locator('[data-word-source=review]').click();
  await page.waitForFunction(() => wordSource === 'review' && !document.querySelector('#wordWorkspace').busy);
  assert.equal(await page.evaluate(() => wordSession().items.length), 2);
  assert.equal(await page.locator('#typedWordAnswer').isVisible(), true);
  assert.equal(await page.locator('#typedWordAnswer').inputValue(), '');
  assert.equal(await page.locator('.wordbook-item').count(), 2);
  assert.equal(await page.locator('.wordbook-item.fully-unknown').count(), 1);
  assert.match(await page.locator('.wordbook-item.fully-unknown').textContent(), /完全不会/);
  const output = new URL('../qa-handwriting/', import.meta.url); await mkdir(output, { recursive: true });
  await page.locator('#wordBookCatalog > summary').click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: fileURLToPath(new URL(`wordbook-${browserName}.png`, output)), fullPage: true });
  await page.locator('[data-word-source=daily]').click(); await page.waitForFunction(() => wordSource === 'daily' && !document.querySelector('#wordWorkspace').busy); await ready();
  assert.equal(await page.evaluate(() => document.querySelector('#wordWorkspace').question.turnId), dailyTurn);
  const review = await answers(2, false, weak[0]);
  assert.ok(review.every(event => weak.includes(event.word)));
  assert.equal(await page.evaluate(() => wordSession().pending.length), 1);
  assert.equal(await page.evaluate(() => wordSession().pending[0]), weak[0]);
  await answers(1);
  assert.equal(await page.evaluate(() => wordSession().phase), 'done');
  assert.equal(await page.evaluate(() => wordSession().mastered.length), 30);
  assert.equal(await page.evaluate(() => state.wordReviewed), 33);
  assert.equal(await page.locator('#wordPracticeGrid').isVisible(), false);
  assert.match(await page.locator('#wordCompleteDetail').innerText(), /30.*33/);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: fileURLToPath(new URL(`daily-word-session-complete-${browserName}.png`, output)), fullPage: true });
  const completedId = await page.evaluate(() => wordSession().id);
  await page.reload(); await ready(); await page.locator('[data-view=words]').click();
  assert.equal(await page.evaluate(() => wordSession().id), completedId);
  assert.equal(await page.locator('#wordSessionComplete').isVisible(), true, 'Reload does not start another 30 words');
  // Add a new failure record to test the book-only loop to completion.
  await page.evaluate(async () => {
    await HandwritingNotebook.put('attempt:book-only', { id: 'book-only', question: { id: 'zh-en:healthy', module: 'words', kind: 'spelling', prompt: '健康的', expected: ['healthy'] }, inputMode: 'typed', answer: '', status: 'wrong', unknown: true, expected: 'healthy', reasons: ['完全不会'], createdAt: new Date().toISOString(), counted: true });
    await refreshWordBook();
  });
  await page.locator('[data-word-source=review]').click(); await ready();
  await page.waitForFunction(() => wordSource === 'review' && !document.querySelector('#wordWorkspace').busy);
  assert.equal(await page.evaluate(() => wordSession().items.length), 3);
  await answers(3); await page.waitForFunction(() => wordBook.every(entry => !entry.open));
  assert.equal(await page.locator('#wordSessionComplete').isVisible(), true);
  assert.equal(await page.locator('#wordBookCount').innerText(), '3', 'Previously wrong words stay available for later review');
  assert.equal(await page.locator('#wordBookPanel').isVisible(), true);
  assert.equal(await page.locator('#newWordSession').isVisible(), false);
  assert.equal(await page.locator('#wordPracticeGrid').isVisible(), false, 'Completing book practice does not automatically start another session');
  // Review success is a separate attempt, never an overwrite of the failed answer.
  const stored = await page.evaluate(() => HandwritingNotebook.export());
  assert.equal(stored.find(([key]) => key === 'attempt:book-only')[1].status, 'wrong');
  assert.ok(stored.some(([, value]) => value?.question?.sessionKey === 'review:zh-en' && value.status === 'correct'));
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: fileURLToPath(new URL(`word-session-complete-${browserName}.png`, output)), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const beforeBookRestart = await page.evaluate(() => wordSession().id);
  await page.locator('[data-word-source=review]').click();
  await page.waitForFunction(previous => wordSession().id !== previous && !document.querySelector('#wordWorkspace').busy, beforeBookRestart);
  assert.equal(await page.locator('#typedWordAnswer').isVisible(), true, 'Clicking the book again starts another independent review directly');
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  console.log(`Finite session ${browserName} passed: 30 original words, weak-only rounds through all correct, stop at 33 answers, refresh resume/completion, unified colored wordbook, direct book practice, immutable original attempts and no AI requests.`);
} finally { await browser.close(); }
