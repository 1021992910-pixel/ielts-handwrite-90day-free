import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../site/local-grader.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const grader = context.LocalGrader;

assert.equal(grader.matchesAny(" Environment ", ["environment"]), true);
assert.equal(grader.matchesAny("ENVIRONMENT。", ["environment"]), true);
assert.equal(grader.matchesAny("环境", ["环境", "周围环境"]), true);
assert.equal(grader.matchesAny("enviroment", ["environment"]), false);
assert.equal(grader.matchesAny("", ["environment"]), false);
const question = { kind: 'meaning', prompt: 'different', expected: ['不同的'] };
assert.equal(grader.gradeRecognized(question, [{ text: '不同', score: .99 }]).status, 'correct');
assert.equal(grader.gradeRecognized(question, [{ text: '不一样', score: .99 }]).status, 'correct');
assert.equal(grader.gradeRecognized(question, [{ text: '独具一格', score: .99 }]).status, 'uncertain');
assert.equal(grader.gradeRecognized(question, [{ text: '教育', score: .99 }]).status, 'wrong');
assert.equal(grader.gradeRecognized(question, [{ text: '不同', score: .5 }]).status, 'uncertain');
assert.equal(grader.gradeRecognized(question, []).status, 'uncertain');
const spelling = { kind: 'spelling', prompt: '环境', expected: ['environment'] };
assert.equal(grader.gradeRecognized(spelling, [{ text: 'enviroment', score: .99 }]).status, 'wrong');
assert.equal(grader.gradeRecognized(spelling, [{ text: 'ENVIRONMENT', score: .99 }]).status, 'correct');
assert.equal(grader.normalizeSpelling('a vailable'), 'a vailable');

console.log("Local grader tests passed");

const typed = (q, answer) => grader.gradeTyped(q, answer);
for (const answer of ['不同', '不同的', '不一样', '不同；不一样']) assert.equal(typed(question, answer).status, 'correct', answer);
for (const answer of ['教育', '不同；教育', '不知道']) assert.equal(typed(question, answer).status, 'wrong', answer);
for (const answer of ['独具一格', '不同；尚未收录的意思', '不重要']) assert.equal(typed(question, answer).status, 'uncertain', answer);
assert.equal(typed({ kind: 'meaning', prompt: 'custom', expected: ['自定义释义'] }, '自定义释义').status, 'correct');
assert.equal(typed(question, '   ').status, 'empty');
assert.equal(typed(question, 'a'.repeat(201)).status, 'empty');
for (const answer of ['environment', ' ENVIRONMENT ', 'ｅｎｖｉｒｏｎｍｅｎｔ', 'environment.']) assert.equal(typed(spelling, answer).status, 'correct', answer);
for (const answer of ['enviroment', 'environ ment', 'environments', 'environ-ment', 'enviroment / environment']) assert.equal(typed(spelling, answer).status, 'wrong', answer);
assert.equal(typed(spelling, 'enviroment').diff.target.filter(token => token.kind === 'missing').map(token => token.char).join(''), 'n');
assert.equal(typed({ ...spelling, expected: ['colour', 'color'] }, 'color').status, 'correct');
assert.equal(typed({ ...spelling, expected: ['take part in'] }, 'takepartin').status, 'wrong');
assert.equal(grader.wordErrorReasons('meaning').includes('听音没听清'), false);
assert.equal(grader.wordErrorReasons('spelling').includes('漏写或多写字母'), true);
console.log('Typed word checks passed: exact spelling, character diff, meaning aliases, mixed answers, unknown meanings and direction-specific reasons.');
