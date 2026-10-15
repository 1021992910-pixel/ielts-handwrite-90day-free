import assert from "node:assert/strict";
import worker from "../dist/server/index.js";

const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async () => { externalCalls++; throw new Error("External inference must not run"); };
try {
  for (const method of ["GET", "POST", "OPTIONS"]) {
    const response = await worker.fetch(new Request("https://study.test/api/handwriting-grade", {
      method, ...(method === "POST" ? { body: "{}" } : {})
    }), { DASHSCOPE_API_KEY: "unused-test-value", HANDWRITING_REVIEW_ENABLED: "true" });
    assert.equal(response.status, 410);
    assert.ok(!(await response.text()).includes("unused-test-value"));
  }
  const head = await worker.fetch(new Request("https://study.test/", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(externalCalls, 0);
  console.log("Free-only server checks passed: cloud routes remain unavailable and no external inference is called.");
} finally {
  globalThis.fetch = originalFetch;
}
