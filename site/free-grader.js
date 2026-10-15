(function () {
  const scriptURL = document.currentScript.src;
  let worker, nextID = 0;
  const pending = new Map();
  function createWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./free-ocr-worker.js', scriptURL), { type: 'module' });
    worker.onmessage = event => {
      const data = event.data;
      if (data.type === 'progress') { for (const item of pending.values()) item.onProgress?.(data.message); return; }
      const item = pending.get(data.id); if (!item) return;
      pending.delete(data.id); item.cleanup();
      if (data.error) { console.warn('[Free OCR]', data.error); item.reject(new Error('免费识别暂时未能运行，请检查网络或浏览器版本。笔迹已保留。')); }
      else item.resolve(data);
    };
    worker.onerror = () => {
      for (const item of pending.values()) { item.cleanup(); item.reject(new Error('免费识别模型加载失败。请刷新后重试；不会切换到收费服务。')); }
      pending.clear(); worker?.terminate(); worker = null;
    };
    return worker;
  }
  window.FreeHandwritingGrader = {
    async grade(question, canvas, { signal, onProgress } = {}) {
      const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const id = ++nextID;
      const data = await new Promise((resolve, reject) => {
        const active = createWorker();
        const cancel = () => {
          const item = pending.get(id); if (!item) return;
          pending.delete(id); item.cleanup(); reject(new DOMException('Aborted', 'AbortError'));
          if (!pending.size) { active.terminate(); if (worker === active) worker = null; }
        };
        const timeout = setTimeout(() => {
          const item = pending.get(id); if (!item) return;
          pending.delete(id); item.cleanup(); reject(new Error('免费识别等待较久，请稍后重试。原笔迹已保存，没有产生接口费用。'));
          if (!pending.size) { active.terminate(); if (worker === active) worker = null; }
        }, 180000);
        const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); };
        pending.set(id, { resolve, reject, cleanup, onProgress }); signal?.addEventListener('abort', cancel, { once: true });
        active.postMessage({ id, image }, [image.data.buffer]);
      });
      return window.LocalGrader.gradeRecognized(question, data.items);
    }
  };
})();
