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

console.log("Local grader tests passed");
