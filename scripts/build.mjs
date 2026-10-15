import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetSpecs = [
  ["/index.html", "index.html", "text/html; charset=utf-8"],
  ["/styles.css", "styles.css", "text/css; charset=utf-8"],
  ["/spelling-data.js", "spelling-data.js", "text/javascript; charset=utf-8"],
  ["/local-grader.js", "local-grader.js", "text/javascript; charset=utf-8"],
  ["/handwriting.js", "handwriting.js", "text/javascript; charset=utf-8"],
  ["/free-grader.js", "free-grader.js", "text/javascript; charset=utf-8"],
  ["/free-ocr-worker.js", "free-ocr-worker.js", "text/javascript; charset=utf-8"],
  ["/free-ocr-assets.js", "free-ocr-assets.js", "text/javascript; charset=utf-8"],
  ["/ocr-assets-manifest.js", "ocr-assets-manifest.js", "text/javascript; charset=utf-8"],
  ["/app.js", "app.js", "text/javascript; charset=utf-8"],
  ["/manifest.webmanifest", "manifest.webmanifest", "application/manifest+json; charset=utf-8"],
  ["/sw.js", "sw.js", "text/javascript; charset=utf-8"]
];

const assets = {};
for (const [url, file, contentType] of assetSpecs) {
  assets[url] = { body: await readFile(join(root, "site", file), "utf8"), contentType };
}
const source = await readFile(join(root, "worker", "index.js"), "utf8");
if (!source.includes("__STATIC_ASSETS__")) throw new Error("Worker asset placeholder is missing");
const output = source.replace("__STATIC_ASSETS__", JSON.stringify(assets));

await rm(join(root, "dist"), { recursive: true, force: true });
await mkdir(join(root, "dist", "server"), { recursive: true });
await mkdir(join(root, "dist", ".openai"), { recursive: true });
await writeFile(join(root, "dist", "server", "index.js"), output);
await writeFile(join(root, "dist", ".openai", "hosting.json"), await readFile(join(root, ".openai", "hosting.json")));
