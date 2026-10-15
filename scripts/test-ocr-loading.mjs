import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, stat } from 'node:fs/promises';
import { ASSETS, loadOCRAssets } from '../site/free-ocr-assets.js';
import { createHash } from 'node:crypto';

for (const asset of ASSETS) {
  const file = new URL(`../site/${asset.path}`, import.meta.url);
  assert.equal((await stat(file)).size, asset.bytes, asset.path);
  assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), asset.sha256);
}
const asset = { key: 'test', label: '测试组件', path: './test.bin', bytes: 4, type: 'application/octet-stream' };
const records = new Map();
const storage = {
  async open() { return { async put(url, response) { records.set(url, response); }, async delete(url) { records.delete(url); } }; },
  async match(url) { return records.get(url)?.clone(); }
};
let requests = 0; const progress = [];
const options = { assets: [asset], storage, onProgress: data => progress.push(data), fetchImpl: async () => { requests++; return new Response(new Uint8Array([1, 2, 3, 4])); } };
const result = await loadOCRAssets(options);
assert.equal(result.test.size, 4); assert.equal(progress.at(-1).percent, 100);
await loadOCRAssets(options); assert.equal(requests, 1, 'A second attempt must reuse a complete cached file');
const url = new URL(asset.path, new URL('../site/free-ocr-assets.js', import.meta.url)).href;
records.set(url, new Response(new Uint8Array([1])));
await loadOCRAssets(options); assert.equal(requests, 2, 'An incomplete cached file must be redownloaded');
const durableRecords = new Map(); let durableRequests = 0;
const persistence = { get: async key => durableRecords.get(key), put: async (key, bytes) => durableRecords.set(key, bytes) };
const durableOptions = { assets: [asset], storage: undefined, persistence, fetchImpl: async () => { durableRequests++; return new Response(new Uint8Array([1, 2, 3, 4])); } };
await loadOCRAssets(durableOptions); await loadOCRAssets(durableOptions);
assert.equal(durableRequests, 1); assert.ok(durableRecords.get(url) instanceof ArrayBuffer, 'Persist raw bytes, not Blob/File data that some WebKit builds reject');
for (const [response, expected] of [[new Response('no', { status: 404 }), /HTTP 404/], [new Response('html', { headers: { 'content-type': 'text/html' } }), /返回了网页/], [new Response('bad'), /不完整/]]) {
  await assert.rejects(loadOCRAssets({ assets: [asset], storage: undefined, fetchImpl: async () => response }), expected);
}
function hangingFetch(_url, { signal }) {
  return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
}
await assert.rejects(loadOCRAssets({ assets: [asset], storage: undefined, stallMs: 25, fetchImpl: hangingFetch }), /没有进展/);
await assert.rejects(loadOCRAssets({ assets: [asset], storage: undefined, stallMs: 25, fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({ start(control) { control.enqueue(new Uint8Array([1])); signal.addEventListener('abort', () => control.error(new DOMException('Aborted', 'AbortError'))); } })) }), /没有进展/);
const abort = new AbortController();
const cancelled = loadOCRAssets({ assets: [asset], storage: undefined, signal: abort.signal, fetchImpl: hangingFetch });
setTimeout(() => abort.abort(), 10); await assert.rejects(cancelled, { name: 'AbortError' });
const tried = [], checked = { ...asset, sha256: createHash('sha256').update(new Uint8Array([1, 2, 3, 4])).digest('hex'), sources: ['https://cdn.test/model.bin', asset.path] };
await loadOCRAssets({ assets: [checked], storage: undefined, fetchImpl: async url => { tried.push(url); return new Response(new Uint8Array(url.startsWith('https:') ? [4, 3, 2, 1] : [1, 2, 3, 4])); } });
assert.equal(tried.length, 2, 'A same-size but wrong-hash CDN file must fall back rather than execute');

// Exercise the real main-thread lifecycle without waiting actual seconds for watchdogs.
const workers = [], timers = new Map(); let timerID = 0;
class WorkerMock {
  constructor() { workers.push(this); }
  postMessage(data) { this.data = data; }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage({ data: { id: this.data.id, ...data } }); }
}
const context = vm.createContext({
  document: { currentScript: { src: 'https://study.test/free-grader.js' } },
  window: { LocalGrader: { gradeRecognized: (_question, items) => items } }, Worker: WorkerMock,
  URL, DOMException, console,
  setTimeout: (fn, ms) => { timers.set(++timerID, { fn, ms }); return timerID; }, clearTimeout: id => timers.delete(id)
});
vm.runInContext(await readFile(new URL('../site/free-grader.js', import.meta.url), 'utf8'), context);
const canvas = { width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(4) }) }) };
const grade = args => context.window.FreeHandwritingGrader.grade({}, canvas, args);
const stages = [];
let operation = grade({ onProgress: (message, detail) => stages.push(detail.stage) });
assert.equal(stages[0], 'boot', 'A stage must appear immediately, before any large imports');
workers.at(-1).emit({ type: 'progress', stage: 'download', message: '25%', percent: 25 });
assert.ok([...timers.values()].some(timer => timer.ms === 35000));
[...timers.values()].find(timer => timer.ms === 35000).fn();
await assert.rejects(operation, /没有进展/); assert.equal(workers.at(-1).terminated, true); assert.equal(timers.size, 0);
const control = new AbortController();
operation = grade({ signal: control.signal }); control.abort();
await assert.rejects(operation, { name: 'AbortError' }); assert.equal(timers.size, 0);
operation = grade({});
workers[0].onerror();
assert.equal(workers.at(-1).terminated, undefined, 'An obsolete worker failure must not stop the new retry');
workers.at(-1).emit({ type: 'progress', stage: 'recognize', message: '识别中' });
[...timers.values()].find(timer => timer.ms === 30000).fn();
await assert.rejects(operation, /超过30秒/);
operation = grade({}); workers.at(-1).emit({ items: ['ok'] });
assert.deepEqual(await operation, ['ok']); assert.equal(timers.size, 0);
const count = workers.length;
operation = grade({}); workers.at(-1).emit({ items: ['next'] });
await operation; assert.equal(workers.length, count, 'Successful retry keeps the already initialized engine');
console.log('OCR loading checks passed: manifest sizes, persistent complete-file cache, corrupt/HTTP/HTML failures, stalled headers/body, cancellation, stage-specific watchdogs, retry and engine reuse.');
