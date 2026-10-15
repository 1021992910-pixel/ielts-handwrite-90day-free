import assert from 'node:assert/strict';
import { gradeHandwriting, normalizeSpelling, default as worker } from '../dist/server/index.js';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const question = { id: 'spelling:environment', module: 'words', kind: 'spelling', prompt: '环境', expected: ['environment'] };
const env = { DASHSCOPE_API_KEY: 'test-key-only', DASHSCOPE_MODEL: 'qwen3-vl-flash' };
function model(...responses) {
  let calls = 0;
  const fn = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (calls === 0) assert.ok(!JSON.stringify(body.messages).includes('environment'), 'OCR must not receive the reference answer');
    const answer = responses[calls++];
    assert.ok(answer, 'Unexpected paid-model request');
    return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
  };
  fn.calls = () => calls;
  return fn;
}
const wrongSpelling = model({ text: 'enviroment', legible: true, confidence: .98 });
assert.equal((await gradeHandwriting({ question, image }, env, wrongSpelling)).status, 'wrong');
assert.equal(wrongSpelling.calls(), 1, 'Spelling uses deterministic grading after transcription');
assert.equal(normalizeSpelling(' e n v '), 'e n v', 'Do not erase meaningful internal word boundaries');
assert.equal((await gradeHandwriting({ question, image }, env, model({ text: 'environment', legible: true, confidence: .98 }))).status, 'correct');
assert.equal((await gradeHandwriting({ question, image }, env, model({ text: 'enviroment', legible: false, confidence: .6 }))).status, 'uncertain');
const meaning = { ...question, kind: 'meaning', prompt: 'different', expected: ['不同的'] };
assert.equal((await gradeHandwriting({ question: meaning, image }, env, model({ text: '不同', legible: true, confidence: .97 }, { status: 'correct', explanation: '不同与不同的表达相同词义。', confidence: .98 }))).status, 'correct');
await assert.rejects(gradeHandwriting({ question, image }, env, model({ text: 'environment' })), /不完整/);
await assert.rejects(gradeHandwriting({ question, image: 'https://untrusted.example/image' }, env, model()), /PNG/);
const request = (extra = {}) => new Request('https://study.test/api/handwriting-grade', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ question, image }) });
assert.equal((await worker.fetch(request(), env)).status, 410, 'Cloud inference routes are disabled in the free version');
assert.equal((await worker.fetch(request(), { ...env, HANDWRITING_REVIEW_ENABLED: 'true', HANDWRITING_REVIEW_TOKEN: 'private-use-code' })).status, 410);
assert.equal((await worker.fetch(request({ Origin: 'https://other.example' }), env)).status, 410);
const unavailable = await worker.fetch(request(), env);
assert.ok(!(await unavailable.text()).includes('test-key-only'));
console.log('Handwriting API tests passed: blind transcription, spelling boundaries, meaning variants, uncertain and disabled states. All model calls were mocked.');
