import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const vendor = join(root, 'site/vendor/paddleocr');
await mkdir(join(vendor, 'ort'), { recursive: true });
await mkdir(join(root, 'site/models'), { recursive: true });
await build({
  stdin: { contents: 'export { PaddleOCR } from "@paddleocr/paddleocr-js";', resolveDir: root },
  outfile: join(vendor, 'ocr-sdk.js'), bundle: true, format: 'esm', platform: 'browser',
  target: 'es2022', minify: true, legalComments: 'eof', external: ['fs', 'path', 'crypto'],
  alias: { 'onnxruntime-web': 'onnxruntime-web/wasm' },
  define: { 'process.env.NODE_ENV': '"production"' }
});
for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await copyFile(join(root, 'node_modules/onnxruntime-web/dist', file), join(vendor, 'ort', file));
}
const models = [
  ['PP-OCRv5_mobile_det', 4843520], ['PP-OCRv5_mobile_rec', 16701440]
];
const receipts = [];
for (const [name, expectedBytes] of models) {
  const file = `${name}_onnx_infer.tar`, target = join(root, 'site/models', file);
  if (await stat(target).then(s => s.size !== expectedBytes).catch(() => true)) {
    const url = `https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/${file}`;
    console.log(`Downloading official model: ${name}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== expectedBytes) throw new Error(`Unexpected model size: ${name} (${bytes.length})`);
    await writeFile(target, bytes);
  }
  const bytes = await readFile(target);
  receipts.push({ name, file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(vendor, 'model-receipts.json'), JSON.stringify(receipts, null, 2));
for (const [from, to] of [
  ['@paddleocr/paddleocr-js/package.json', 'paddleocr-package.json'],
  ['onnxruntime-web/package.json', 'onnxruntime-package.json']
]) await copyFile(join(root, 'node_modules', from), join(vendor, to));
for (const [name, url] of [
  ['PaddleOCR-LICENSE', 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/LICENSE'],
  ['onnxruntime-LICENSE', 'https://raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE']
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`License download failed: ${name}`);
  await writeFile(join(vendor, name), await response.text());
}
console.log('Free OCR assets prepared. No API key or paid requests are used.');
