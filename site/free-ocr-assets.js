// Report progress before importing the large SDK. This cache contains no user ink.
export const ASSET_CACHE = 'ielts-ocr-models-v1';
export const ASSETS = [
  { key: 'sdk', label: '识别组件', path: './vendor/paddleocr/ocr-sdk.js', bytes: 10561077, type: 'text/javascript' },
  { key: 'det', label: '文字定位模型', path: './models/PP-OCRv5_mobile_det_onnx_infer.tar', bytes: 4843520, type: 'application/octet-stream' },
  { key: 'rec', label: '中英文识别模型', path: './models/PP-OCRv5_mobile_rec_onnx_infer.tar', bytes: 16701440, type: 'application/octet-stream' },
  { key: 'runtime', label: '运行组件', path: './vendor/paddleocr/ort/ort-wasm-simd-threaded.mjs', bytes: 24381, type: 'text/javascript' },
  { key: 'wasm', label: '本机计算组件', path: './vendor/paddleocr/ort/ort-wasm-simd-threaded.wasm', bytes: 14239897, type: 'application/wasm' }
];

let modelDatabase;
async function persistentModels() {
  if (!globalThis.indexedDB) return null;
  modelDatabase ||= new Promise(resolve => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; resolve(null); }, 4000);
    const request = indexedDB.open('ielts-ocr-components', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets');
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = request.onblocked = () => { clearTimeout(timer); expired = true; resolve(null); };
  });
  const connection = await modelDatabase;
  if (!connection) return null;
  function access(mode, action) {
    return new Promise((resolve, reject) => {
      const tx = connection.transaction('assets', mode);
      const request = action(tx.objectStore('assets'));
      const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(new Error('Component storage timed out')); }, 4000);
      tx.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(new Error('Component storage unavailable')); };
    });
  }
  return { get: url => access('readonly', store => store.get(url)), put: (url, blob) => access('readwrite', store => store.put(blob, url)) };
}

export async function loadOCRAssets({ onProgress = () => {}, signal, stallMs = 25000, assets = ASSETS, fetchImpl = fetch, storage = globalThis.caches, persistence } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  signal?.addEventListener('abort', cancel, { once: true });
  const sizes = new Map(), blobs = {}, total = assets.reduce((sum, item) => sum + item.bytes, 0);
  let cache, lastNotice = 0;
  const durable = persistence === undefined ? await persistentModels().catch(() => null) : persistence;
  try { cache = await storage?.open(ASSET_CACHE); } catch { /* Safari may deny persistent caching; downloads still work. */ }
  async function save(url, blob, type) {
    // IndexedDB persists in WebKit contexts where CacheStorage can be evicted on navigation.
    // It is a separate component database, never mixed into the user's notebook/backup.
    // Store bytes, not Blob objects: some WebKit builds reject Blob/File IDB writes.
    try { if (durable) { await durable.put(url, await blob.arrayBuffer()); return; } } catch { /* Optional storage fallback. */ }
    try { await cache?.put(url, new Response(blob, { headers: { 'Content-Type': type, 'Content-Length': String(blob.size) } })); } catch { /* Quota does not block inference. */ }
  }
  function report(asset, bytes, force = false) {
    sizes.set(asset.key, bytes);
    if (!force && Date.now() - lastNotice < 250) return;
    lastNotice = Date.now();
    const loaded = [...sizes.values()].reduce((sum, n) => sum + n, 0);
    const percent = Math.min(100, Math.floor(loaded / total * 100));
    onProgress({ stage: 'download', percent, loaded, total, message: `准备免费识别 ${percent}% · ${asset.label}（${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB）` });
  }
  async function load(asset) {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const url = new URL(asset.path, import.meta.url).href;
    try {
      const stored = await durable?.get(url);
      if (stored?.byteLength === asset.bytes) { report(asset, stored.byteLength, true); return new Blob([stored], { type: asset.type }); }
    } catch { /* CacheStorage and then download remain available. */ }
    let saved;
    // Prefer the explicit Cache; global lookup can also reuse complete legacy app files.
    try { saved = await cache?.match?.(url) || await storage?.match(url); } catch { /* Cache is optional. */ }
    if (saved?.ok) {
      const blob = await saved.blob();
      if (blob.size === asset.bytes) {
        if (durable) await save(url, blob, asset.type);
        report(asset, blob.size, true); return blob.slice(0, blob.size, asset.type);
      }
      try { await cache?.delete(url); } catch { /* A bad entry is never used. */ }
    }
    let timer, stalled = false;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { stalled = true; controller.abort(); }, stallMs);
    };
    report(asset, 0, true); refresh();
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`${asset.label}下载失败（HTTP ${response.status}）。请重试；笔迹未清除。`);
      if (/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error(`${asset.label}返回了网页而不是模型，请刷新到新版后重试。`);
      const chunks = []; let received = 0;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.byteLength) { chunks.push(value); received += value.byteLength; refresh(); report(asset, received); }
          }
        } finally { reader.releaseLock(); }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer()); chunks.push(bytes); received = bytes.byteLength;
      }
      if (received !== asset.bytes) throw new Error(`${asset.label}下载不完整，请重试；不会使用不完整的模型。`);
      clearTimeout(timer);
      const blob = new Blob(chunks, { type: asset.type });
      // Only complete files enter the cache; retry reuses files that finished downloading.
      await save(url, blob, asset.type);
      report(asset, received, true);
      return blob;
    } catch (error) {
      if (stalled) throw new Error(`${asset.label}下载已${Math.round(stallMs / 1000)}秒没有进展，已停止等待。请检查网络后重试；笔迹未清除。`);
      if (error instanceof TypeError && !controller.signal.aborted) throw new Error(`${asset.label}下载连接失败，请检查网络后点“重试批改”；笔迹未清除。`);
      throw error;
    } finally { clearTimeout(timer); }
  }
  // Two concurrent downloads avoid serial startup without creating a mobile memory spike.
  let next = 0, firstError;
  const loaders = Array.from({ length: 2 }, async () => {
    while (next < assets.length) {
      const asset = assets[next++];
      try { blobs[asset.key] = await load(asset); }
      catch (error) { firstError ||= error; controller.abort(); throw error; }
    }
  });
  try { await Promise.all(loaders); return blobs; }
  catch (error) { throw firstError || error; }
  finally { controller.abort(); signal?.removeEventListener('abort', cancel); await Promise.allSettled(loaders); }
}
