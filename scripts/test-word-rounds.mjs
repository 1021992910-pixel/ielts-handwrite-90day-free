import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../site/word-rounds.js', import.meta.url), 'utf8'), context);
const { select, complete } = context.WordRounds;
const words = [['apple', '苹果'], ['book', '书'], ['cat', '猫']], stats = {}, rounds = {}, today = '2026-10-16';
const seen = new Set();
let wrong;
for (let i = 0; i < 3; i++) {
  const current = select(rounds, 'zh-en', words, stats, today);
  assert.ok(!seen.has(current[0]), 'Do not repeat before the round ends'); seen.add(current[0]);
  assert.equal(select(rounds, 'zh-en', words, stats, today, current[0])[0], current[0], 'An unfinished question survives a reload');
  if (!wrong) wrong = current[0];
  stats[current[0]] = { rating: current[0] === wrong ? 0 : 3, next: '2026-10-20' };
  complete(rounds, 'zh-en', current[0]);
  if (i < 2) assert.notEqual(select(rounds, 'zh-en', words, stats, today, current[0])[0], current[0], 'A preferred completed word cannot bypass the round');
}
assert.equal(rounds['zh-en'].number, 1);
const next = select(rounds, 'zh-en', words, stats, today);
assert.equal(rounds['zh-en'].number, 2);
assert.equal(next[0], wrong, 'Later rounds focus on the previously wrong word');
const restored = JSON.parse(JSON.stringify(rounds));
assert.equal(select(restored, 'zh-en', words, stats, today)[0], wrong);
assert.ok(select(rounds, 'en-zh', words, stats, today));
assert.equal(rounds['zh-en'].number, 2, 'Directions keep independent rounds');
const imported = [['apple', '苹果'], ['apple', '苹果']];
assert.equal(select({}, 'zh-en', imported, {}, today)[0], 'apple');
console.log('Word rounds passed: no repeats within a round, unfinished resume, wrong-word review after the round, direction isolation and deduplication.');
