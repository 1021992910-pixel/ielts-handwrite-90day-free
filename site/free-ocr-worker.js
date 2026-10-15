import { loadOCRAssets } from './free-ocr-assets.js';

let engine;
async function initialize(progress) {
  if (!engine) engine = (async () => {
    if (typeof WebAssembly !== 'object') throw new Error('此浏览器不支持本机识别所需的 WebAssembly，请更新 Safari 后重试。');
    const blobs = await loadOCRAssets({ onProgress: progress });
    const urls = Object.fromEntries(Object.entries(blobs).map(([key, blob]) => [key, URL.createObjectURL(blob)]));
    progress({ stage: 'initialize', message: '组件已准备好，正在初始化本机模型…' });
    try {
      // Reuse downloaded bytes even on a first visit without a controlling Service Worker.
      const { PaddleOCR } = await import(urls.sdk);
      const ocr = await PaddleOCR.create({
        lang: 'ch', ocrVersion: 'PP-OCRv5', worker: false,
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textRecognitionModelName: 'PP-OCRv5_mobile_rec',
        textDetectionModelAsset: { url: urls.det },
        textRecognitionModelAsset: { url: urls.rec },
        ortOptions: { backend: 'wasm', numThreads: 1, simd: true, disableWasmProxy: true, wasmPaths: { mjs: urls.runtime, wasm: urls.wasm } }
      });
      // The browser adapter uses document.createElement; provide an ImageData adapter in the worker.
      // Each Mat belongs to one prediction and is released by the pipeline's finally block.
      ocr.sourceToMat = (cv, source) => {
        if (!(source instanceof ImageData)) throw new Error('Unsupported worker image input');
        const mat = cv.matFromImageData(source);
        return { width: source.width, height: source.height, mat, dispose() { mat.delete(); } };
      };
      return ocr;
    } finally { for (const url of Object.values(urls)) URL.revokeObjectURL(url); }
  })().catch(error => { engine = null; throw error; });
  return engine;
}
let queue = Promise.resolve();
self.onmessage = event => {
  const { id, image } = event.data;
  const progress = data => self.postMessage({ type: 'progress', id, ...data });
  progress({ stage: 'download', message: '正在检查本机已缓存的免费识别组件…' });
  queue = queue.catch(() => {}).then(async () => {
    try {
      const ocr = await initialize(progress);
      progress({ stage: 'recognize', message: '正在本机识别笔迹并核对答案…' });
      const [result] = await ocr.predict(image, { textRecScoreThresh: 0 });
      self.postMessage({ id, items: result.items.map(item => ({ text: item.text, score: item.score, poly: item.poly })), metrics: result.metrics });
    } catch (error) {
      const message = error.message || '免费模型未能完成识别';
      console.warn('[Free OCR engine]', message);
      self.postMessage({ id, error: /[\u3400-\u9fff]/.test(message) ? message : '本机识别初始化或运行失败，可能是浏览器兼容或内存问题。请关闭其他标签页后重试；本题不计错，笔迹未清除。' });
    }
  });
};
