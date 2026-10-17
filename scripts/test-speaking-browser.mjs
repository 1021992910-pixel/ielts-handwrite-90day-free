import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const playwright = require('C:/Users/10219/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const name = process.env.SPEAKING_BROWSER || 'chromium';
const browser = await playwright[name].launch({ headless: true, ...(name === 'chromium' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', acceptDownloads: true, ...(name === 'webkit' ? { isMobile: true, hasTouch: true } : {}) });
const original = [
  { id: 't-home', type: '口语 Part 1', title: '我的家乡（已改）', keywords: 'river / friendly', structure: '回答 → 原因', chunks: 'I come from...', answer: 'My original personal hometown answer.', review: 'good', lastReview: '2026-10-16', extra: 'preserve-me' },
  { id: 'legacy-part2', type: '口语 Part 2', title: '老口语模板', answer: 'My old Part 2 answer.', keywords: 'friend', review: 'hard' },
  { id: 'legacy-writing', type: '写作 Task 2', title: '老写作模板', answer: 'My original writing answer.', keywords: 'education', review: 'good', customMetadata: { keep: true } }
];
await context.addInitScript(({ original }) => {
  if (!localStorage.getItem('ieltsHandwriteStudyV1')) localStorage.setItem('ieltsHandwriteStudyV1', JSON.stringify({ templates: original, templatesPracticed: 9, wordReviewed: 17, readingText: '保留阅读资料' }));
  window.__spoken = []; window.__tracksStopped = 0;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ localService: true, lang: 'en-GB' }], cancel() {}, speak(item) { window.__spoken.push(item.text); } } });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { window.__tracksStopped++; } }] }) } });
  window.MediaRecorder = class {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/wav'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['test recording']) }); this.onstop?.(); }
  };
}, { original });
const page = await context.newPage(), errors = [], calls = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() !== 'GET' || /\/api\/|\.wasm|\.tar|free-ocr-worker/.test(request.url())) calls.push(request.url()); });
const oral = page.locator('#speakingTemplateHost'), written = page.locator('#writingTemplateHost');
try {
  await page.goto(process.env.SPEAKING_TEST_URL || 'http://127.0.0.1:4186/');
  await page.waitForFunction(() => window.WordPracticeReady && document.querySelector('#speakingTemplateHost [data-field="Answer"]'));
  assert.deepEqual(await page.evaluate(() => state.templates), original, 'Moving the editors must not rewrite existing data');
  assert.equal(await page.locator('[data-view=templates], #view-templates').count(), 0);
  await page.locator('[data-view=speaking]').click();
  assert.equal(await page.getByRole('heading', { name: '口语录音与重说', exact: true }).count(), 0);
  assert.equal(await oral.locator('.template-item').count(), 2);
  assert.equal(await written.locator('.template-item').count(), 1);
  assert.equal(await oral.locator('[data-field=Answer]').inputValue(), original[0].answer);
  assert.deepEqual(await oral.locator('[data-field=Type] option').allTextContents(), ['口语 Part 1', '口语 Part 2', '口语 Part 3']);
  await page.locator('#speakingExample summary').click();
  assert.match(await page.locator('#speakingExampleText').innerText(), /usually get up/);
  await page.locator('#listenSpeakingExample').click();
  assert.equal(await page.evaluate(() => window.__spoken.length), 1);
  await page.locator('#nextPrompt').click();
  await page.locator('#speakingExample summary').click();
  assert.match(await page.locator('#speakingExampleText').innerText(), /useful expressions/);
  await oral.locator('[data-field=Answer]').fill('My revised personal answer.');
  await oral.locator('[data-field=Save]').click();
  await oral.locator('[data-field=Listen]').click();
  assert.equal(await page.evaluate(() => window.__spoken.at(-1)), 'My revised personal answer.');
  await oral.locator('[data-field=Memory]').click();
  assert.equal(await page.locator('#memoryAnswer').isVisible(), false);
  assert.equal(await page.locator('#memoryRecord').isVisible(), true);
  await page.locator('#revealMemory').click();
  assert.match(await page.locator('#memoryAnswer').innerText(), /My revised personal answer/);
  await page.locator('[data-memory=hard]').click();
  assert.equal(await page.evaluate(() => state.templatesPracticed), 10);
  assert.equal(await page.evaluate(() => state.templates.find(item => item.id === 't-home').review), 'hard');
  await oral.locator('[data-field=Memory]').click();
  await page.locator('#memoryRecord').click();
  assert.match(await page.locator('#speakingPrompt').innerText(), /hometown/);
  await page.locator('#recordButton').click();
  const prompt = await page.locator('#speakingPrompt').innerText();
  await page.locator('#nextPrompt').click(); assert.equal(await page.locator('#speakingPrompt').innerText(), prompt, 'Recording prevents changing question');
  await page.locator('#recordButton').click();
  assert.match(await page.locator('#recordStatus').innerText(), /录音已完成/);
  assert.doesNotMatch(await page.locator('#recordStatus').innerText(), /找出|语法|发音/);
  assert.match(await page.locator('#recordingPlayback').getAttribute('src'), /^blob:/);
  assert.equal(await page.evaluate(() => window.__tracksStopped), 1);
  await page.locator('#saveSpeakingAnswer').click();
  assert.equal(await page.evaluate(() => state.templates.length), 3, 'Use existing matching template instead of duplicating it');
  await oral.locator('[data-field=New]').click();
  await oral.locator('[data-field=Title]').fill('新口语话题');
  await oral.locator('[data-field=Prompt]').fill('What do you do at weekends?');
  await oral.locator('[data-field=Answer]').fill('I visit my family at weekends.');
  await oral.locator('[data-field=Practice]').click();
  assert.equal(await page.locator('#speakingPrompt').innerText(), 'What do you do at weekends?');
  assert.equal(await page.locator('#speakingExample').isVisible(), false, 'Do not invent a linked sample for a custom question');
  await page.locator('[data-view=writing]').click();
  assert.equal(await written.locator('[data-field=Answer]').inputValue(), original[2].answer);
  await written.locator('[data-field=Answer]').fill('Revised writing answer.');
  await written.locator('[data-field=Memory]').click();
  assert.equal(await page.locator('#memoryOverlay').isVisible(), true, 'The shared dialog must not be hidden inside the speaking section');
  assert.equal(await page.locator('#memoryRecord').isVisible(), false);
  await page.locator('#revealMemory').click(); await page.locator('[data-memory=good]').click();
  assert.equal(await page.evaluate(() => state.templatesPracticed), 11);
  await written.locator('[data-field=New]').click();
  await written.locator('[data-field=Title]').fill('新写作模板'); await written.locator('[data-field=Answer]').fill('A new paragraph.');
  await page.reload(); await page.waitForFunction(() => window.WordPracticeReady);
  assert.equal(await page.evaluate(() => state.templates.length), 5);
  assert.equal(await page.evaluate(() => state.templates.find(item => item.id === 't-home').extra), 'preserve-me');
  assert.deepEqual(await page.evaluate(() => state.templates.find(item => item.id === 'legacy-writing').customMetadata), { keep: true });
  assert.equal(await page.evaluate(() => state.wordReviewed), 17);
  assert.equal(await page.evaluate(() => state.readingText), '保留阅读资料');
  await page.locator('[data-view=progress]').click();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#exportData').click();
  const download = await downloadPromise, backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(backup.state.templates.length, 5); assert.equal(backup.state.templatesPracticed, 11);
  await page.locator('#importData').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForEvent('load'); await page.waitForFunction(() => window.WordPracticeReady);
  assert.equal(await page.evaluate(() => state.templates.length), 5);
  await page.locator('[data-view=speaking]').click();
  await page.setViewportSize({ width: 820, height: 1180 }); await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(250);
  const output = new URL('../qa-handwriting/', import.meta.url); await mkdir(output, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(`speaking-merged-${name}.png`, output)), fullPage: true });
  for (const width of [820, 390]) { await page.setViewportSize({ width, height: 1180 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); }
  assert.deepEqual(calls, [], 'No AI uploads, paid APIs or model downloads'); assert.deepEqual(errors, []);
  console.log(`Speaking ${name} passed: preserved typed templates, separate oral/writing libraries, samples, local TTS path, recording UI, linking, recitation, persistence, backup/import and responsive layout. Media/TTS mocked; physical microphone and voice remain unverified.`);
} finally { await browser.close(); }
