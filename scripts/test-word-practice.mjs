import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../site/word-practice.js', import.meta.url), 'utf8'), context);
const practice = context.WordPractice;
const words = Array.from({ length: 40 }, (_, i) => [`word${i}`, `词义${i}`]);
const session = practice.create(words, { id: 'session', day: '2026-10-17', random: false });
let sequence = 0;
function answer(s, status) {
  const word = practice.current(s)[0], id = `a${++sequence}`;
  const attempt = { id, question: { id: `zh-en:${word}`, sessionId: s.id }, status, createdAt: '2026-10-17T12:00:00Z' };
  assert.equal(practice.record(s, attempt), true);
  assert.equal(practice.record(s, attempt), false, 'Double next must not count twice');
  return word;
}
assert.equal(session.items.length, 30);
for (let i = 0; i < 30; i++) { assert.equal(practice.current(session)[0], `word${i}`); answer(session, i < 2 ? 'wrong' : 'correct'); }
assert.equal(session.phase, 'review'); assert.equal(session.pending.length, 2); assert.equal(session.mastered.length, 28);
let retryWord;
for (let i = 0; i < 2; i++) { retryWord ||= practice.current(session)[0]; answer(session, practice.current(session)[0] === retryWord ? 'wrong' : 'correct'); }
assert.equal(session.pending.length, 1); assert.equal(practice.current(session)[0], retryWord);
const restored = JSON.parse(JSON.stringify(session)); assert.equal(practice.current(restored)[0], retryWord);
answer(session, 'correct'); assert.equal(session.phase, 'done'); assert.equal(practice.current(session), null);
assert.equal(session.mastered.length, 30); assert.equal(session.attempts, 33); assert.equal(session.seen.length, 30);
assert.equal(practice.create([], { id: 'empty', source: 'review' }).phase, 'done');
const uncertain = practice.create(words.slice(0, 1), { id: 'uncertain' }); answer(uncertain, 'uncertain');
assert.equal(uncertain.phase, 'review'); assert.equal(uncertain.mastered.length, 0); answer(uncertain, 'correct'); assert.equal(uncertain.phase, 'done');
const records = [];
function history(word, status, reasons = [], counted = true) {
  const id = String(records.length); records.push([`attempt:${id}`, { id, question: { id: `zh-en:${word}`, module: 'words', kind: 'spelling', prompt: '词义', expected: [word] }, status, reasons, counted, createdAt: `2026-10-17T12:00:0${id}Z` }]);
}
history('word0', 'wrong', ['完全不会']); history('word1', 'wrong', ['输入失误']); history('word0', 'wrong', ['完全不会']);
let book = practice.book(records, words); assert.equal(book.length, 2); assert.equal(book[0].fullyUnknown, true); assert.equal(book[0].mistakes, 2);
history('word0', 'correct', [], false); assert.equal(practice.book(records, words).length, 2, 'An unfinished correct attempt is not yet removed');
history('word0', 'correct'); book = practice.book(records, words); assert.equal(book.length, 2); assert.equal(book.find(item => item.key === 'word0').open, false); assert.equal(book.find(item => item.key === 'word0').fullyUnknown, false);
history('word1', 'uncertain'); assert.equal(practice.book(records, words).find(item => item.key === 'word1').status, 'uncertain');
console.log('Finite practice and wordbook passed: 30 unique words, automatic weak-only rounds, stop after all correct, persistence, idempotence, uncertain answers and unified fully-unknown records.');
