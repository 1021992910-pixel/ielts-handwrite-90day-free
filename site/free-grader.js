(function () {
  const scriptURL = document.currentScript.src;
  let worker, nextID = 0, activeJob;
  function resetWorker() { worker?.terminate(); worker = null; }
  function createWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./free-ocr-worker.js', scriptURL), { type: 'module' });
    const owner = worker;
    worker.onmessage = event => {
      if (worker !== owner) return;
      const job = activeJob, data = event.data;
      if (!job || data.id !== job.id) return;
      if (data.type === 'progress') { job.progress(data); return; }
      if (data.error) { console.warn('[Free OCR]', data.error); job.finish(new Error(data.error)); }
      else job.finish(null, data);
    };
    worker.onerror = () => { if (worker === owner) activeJob?.finish(new Error('识别组件未能启动，可能是下载失败或浏览器不兼容。请点“重试批改”；笔迹未清除，不会转到收费服务。')); };
    worker.onmessageerror = () => { if (worker === owner) activeJob?.finish(new Error('浏览器未能传递答题图片。请重试；笔迹未清除。')); };
    return worker;
  }
  window.FreeHandwritingGrader = {
    async grade(question, canvas, { signal, onProgress } = {}) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (activeJob) throw new Error('另一份答案正在识别，请先完成或取消那次批改。');
      const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const id = ++nextID;
      const data = await new Promise((resolve, reject) => {
        let idleTimer, overallTimer;
        const cancel = () => job.finish(new DOMException('Aborted', 'AbortError'));
        const arm = (ms, message) => {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => job.finish(new Error(message)), ms);
        };
        const job = activeJob = {
          id,
          progress(data) {
            if (data.stage === 'download') arm(35000, '模型下载已超过35秒没有进展。请检查网络后点“重试批改”；已下载完整的组件会尽量复用，笔迹未清除。');
            else if (data.stage === 'initialize') arm(45000, '识别模型初始化超过45秒，可能是浏览器兼容或设备内存问题。请关闭其他标签页后重试；笔迹未清除。');
            else if (data.stage === 'recognize') arm(30000, '本机识别超过30秒仍未完成，已停止本次处理。请重试；本题不计错，笔迹未清除。');
            onProgress?.(data.message, data);
          },
          finish(error, result) {
            if (activeJob !== job) return;
            activeJob = null;
            clearTimeout(idleTimer); clearTimeout(overallTimer);
            signal?.removeEventListener('abort', cancel);
            if (error) { resetWorker(); reject(error); } else resolve(result);
          }
        };
        signal?.addEventListener('abort', cancel, { once: true });
        arm(20000, '识别组件启动超过20秒仍无响应。请点“重试批改”；笔迹未清除，不会产生接口费用。');
        overallTimer = setTimeout(() => job.finish(new Error('本次准备超过5分钟，已停止等待。请重试或更换网络；笔迹未清除，没有接口费用。')), 300000);
        onProgress?.('正在启动识别组件…', { stage: 'boot' });
        if (activeJob !== job) return;
        try { createWorker().postMessage({ id, image }, [image.data.buffer]); }
        catch { job.finish(new Error('浏览器无法启动免费识别。请使用更新的 Safari 重试；笔迹未清除。')); }
      });
      return window.LocalGrader.gradeRecognized(question, data.items);
    }
  };
})();
