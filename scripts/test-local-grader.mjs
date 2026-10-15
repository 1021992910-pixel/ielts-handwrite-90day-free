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
