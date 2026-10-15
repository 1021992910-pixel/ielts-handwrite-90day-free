import { PaddleOCR } from './vendor/paddleocr/ocr-sdk.js';

let engine;
async function initialize() {
  if (!engine) {
    self.postMessage({ type: 'progress', message: '正在加载免费识别模型，首次使用请稍等…' });
    engine = PaddleOCR.create({
      lang: 'ch', ocrVersion: 'PP-OCRv5', worker: false,
      textDetectionModelName: 'PP-OCRv5_mobile_det',
      textRecognitionModelName: 'PP-OCRv5_mobile_rec',
      textDetectionModelAsset: { url: new URL('./models/PP-OCRv5_mobile_det_onnx_infer.tar', import.meta.url).href },
      textRecognitionModelAsset: { url: new URL('./models/PP-OCRv5_mobile_rec_onnx_infer.tar', import.meta.url).href },
      ortOptions: { backend: 'wasm', numThreads: 1, simd: true, disableWasmProxy: true, wasmPaths: new URL('./vendor/paddleocr/ort/', import.meta.url).href }
    }).then(ocr => {
      // The browser adapter uses document.createElement; provide an ImageData adapter in the worker.
      // Each Mat belongs to one prediction and is released by the pipeline's finally block.
      ocr.sourceToMat = (cv, source) => {
        if (!(source instanceof ImageData)) throw new Error('Unsupported worker image input');
        const mat = cv.matFromImageData(source);
        return { width: source.width, height: source.height, mat, dispose() { mat.delete(); } };
      };
      return ocr;
    }).catch(error => { engine = null; throw error; });
  }
  return engine;
}
let queue = Promise.resolve();
self.onmessage = event => {
  const { id, image } = event.data;
  queue = queue.catch(() => {}).then(async () => {
    try {
      const ocr = await initialize();
      self.postMessage({ type: 'progress', message: '正在本机识别您的笔迹…' });
      const [result] = await ocr.predict(image, { textRecScoreThresh: 0 });
      self.postMessage({ id, items: result.items.map(item => ({ text: item.text, score: item.score, poly: item.poly })), metrics: result.metrics });
    } catch (error) { self.postMessage({ id, error: error.message || '免费模型未能完成识别' }); }
  });
};
