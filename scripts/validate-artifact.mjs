import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workerPath = resolve("dist/server/index.js");
const source = await readFile(workerPath, "utf8");
if (source.includes("__STATIC_ASSETS__")) throw new Error("Static assets were not embedded");
const worker = (await import(`${pathToFileURL(workerPath).href}?v=${Date.now()}`)).default;
if (!worker || typeof worker.fetch !== "function") throw new Error("Worker fetch export is missing");
const home = await worker.fetch(new Request("https://example.test/"), {});
if (home.status !== 200 || !(await home.text()).includes("90天雅思手写学习台")) throw new Error("Home page validation failed");
const api = await worker.fetch(new Request("https://example.test/local-only", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), {});
if (api.status !== 405) throw new Error("Static-only API guard validation failed");
console.log("Worker artifact validated");
