import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const handlers = {}, deleted = [];
const context = vm.createContext({
  self: { location: { origin: 'https://study.test' }, addEventListener: (name, action) => handlers[name] = action, clients: { claim() {} } },
  caches: {
    keys: async () => ['ielts-handwrite-free-v4', 'ielts-handwrite-local-ocr-v9', 'ielts-handwrite-words-v10', 'ielts-handwrite-words-v11', 'other-study-app', 'ielts-ocr-models-v1'],
    delete: async key => deleted.push(key),
    match: async () => undefined
  },
  URL, Response, fetch: async () => { throw new Error('offline'); }
});
vm.runInContext(await readFile(new URL('../site/sw.js', import.meta.url), 'utf8'), context);
let operation;
handlers.activate({ waitUntil: promise => operation = promise }); await operation;
assert.deepEqual(deleted, ['ielts-handwrite-free-v4', 'ielts-handwrite-local-ocr-v9', 'ielts-handwrite-words-v10'], 'Do not clear another app cache on the same GitHub Pages origin');
let response;
handlers.fetch({ request: new Request('https://study.test/missing.js'), respondWith: promise => response = promise });
assert.equal((await response).type, 'error', 'An unavailable model must not receive HTML as if it were a model');
let intercepted = false;
handlers.fetch({ request: new Request('https://study.test/models/recognizer.tar'), respondWith: () => intercepted = true });
assert.equal(intercepted, false, 'Model downloads belong to the resumable loader, not a duplicate service-worker cache');
console.log('Cache checks passed: preserve other apps and fail missing model requests explicitly.');
