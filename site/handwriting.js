(function () {
  const PREFIX = 'ieltsHandwriteStudyV1';
  let database;
  function db() {
    return database ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('ielts-handwriting-notebook', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('entries');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('无法打开笔迹存储，请检查浏览器存储权限。'));
    });
  }
  async function transaction(mode, action) {
    const connection = await db();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction('entries', mode);
      const request = action(tx.objectStore('entries'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(new Error('笔迹未保存成功，请先导出备份再继续。'));
      tx.onabort = tx.onerror;
    });
  }
  const notebook = {
    get: key => transaction('readonly', store => store.get(key)),
    put: (key, value) => transaction('readwrite', store => store.put(value, key)),
    async export() {
      const connection = await db();
      return new Promise((resolve, reject) => {
        const tx = connection.transaction('entries', 'readonly');
        const store = tx.objectStore('entries');
        const keys = store.getAllKeys(), values = store.getAll();
        tx.oncomplete = () => resolve(keys.result.map((key, index) => [key, values.result[index]]));
        tx.onerror = () => reject(new Error('无法导出笔迹'));
      });
    },
    async import(entries) {
      if (!Array.isArray(entries)) throw new Error('笔迹备份格式有误');
      const connection = await db();
      return new Promise((resolve, reject) => {
        const tx = connection.transaction('entries', 'readwrite');
        for (const entry of entries) {
          if (!Array.isArray(entry) || typeof entry[0] !== 'string') { tx.abort(); return; }
          tx.objectStore('entries').put(entry[1], entry[0]);
        }
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(new Error('笔迹导入失败'));
      });
    }
  };
  window.HandwritingNotebook = notebook;
  function notice(text) { if (typeof toast === 'function') toast(text); }
  const copy = value => JSON.parse(JSON.stringify(value));

  class HandwritingPad extends HTMLElement {
    connectedCallback() {
      if (this.canvas) return;
      this.padId = this.getAttribute('pad-id') || crypto.randomUUID();
      this.strokes = []; this.redoStack = []; this.tool = 'pen'; this.penWidth = 3;
      this.color = '#183252'; this.revision = 0; this.savePromise = Promise.resolve();
      this.innerHTML = `<article class="panel pad-panel"><div class="pad-head"><div><strong class="pad-title"></strong><small class="pad-hint"></small></div><div class="pad-tools"><button data-tool="pen" aria-pressed="true">笔</button><button data-tool="eraser" aria-pressed="false">橡皮擦</button><button data-action="undo" aria-label="撤销上一笔">撤销</button><button data-action="redo">重做</button><button data-action="clear">清空本题</button><button data-action="save">导出图片</button></div></div><div class="pen-settings"><label>笔粗 <select aria-label="笔粗"><option value="2">细</option><option value="3" selected>中</option><option value="5">粗</option></select></label><label>颜色 <input type="color" value="#183252" aria-label="笔迹颜色"></label><label class="touch-option"><input type="checkbox" checked> 仅用笔书写</label><button class="text-button" data-action="expand">放大书写</button></div><div class="canvas-wrap"><canvas aria-label="手写答题纸"></canvas><span class="ink-placeholder">直接在这里写，保留您的笔迹</span></div><div class="pad-footer"><span class="pad-save-status" role="status">正在载入…</span><span>清空后可撤销恢复</span></div></article>`;
      this.querySelector('.pad-title').textContent = this.getAttribute('title') || '本题答题纸';
      this.querySelector('.pad-hint').textContent = this.getAttribute('hint') || '不转换成打印字，写完再提交';
      this.canvas = this.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.querySelector('.canvas-wrap'));
      this.canvas.addEventListener('pointerdown', event => this.down(event));
      this.canvas.addEventListener('pointermove', event => this.move(event));
      this.canvas.addEventListener('pointerup', event => this.up(event));
      this.canvas.addEventListener('pointercancel', event => this.up(event));
      this.canvas.addEventListener('lostpointercapture', event => this.up(event));
      this.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => {
        this.tool = button.dataset.tool;
        this.querySelectorAll('[data-tool]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      });
      this.querySelector('select').onchange = event => this.penWidth = Number(event.target.value);
      this.querySelector('input[type=color]').oninput = event => this.color = event.target.value;
      this.querySelector('[data-action=undo]').onclick = () => {
        if (this.locked || this.loading || !this.strokes.length) return;
        this.redoStack.push(this.strokes.pop()); this.changed();
      };
      this.querySelector('[data-action=redo]').onclick = () => {
        if (this.locked || this.loading || !this.redoStack.length) return;
        this.strokes.push(this.redoStack.pop()); this.changed();
      };
      this.querySelector('[data-action=clear]').onclick = () => {
        if (this.locked || this.loading || !this.strokes.length) return;
        // A clear operation is itself undoable; old attempts are never deleted here.
        this.redoStack = []; this.strokes.push({ tool: 'clear', points: [] }); this.changed();
      };
      this.querySelector('[data-action=save]').onclick = () => this.download();
      this.querySelector('[data-action=expand]').onclick = event => {
        const expanded = this.classList.toggle('expanded-pad');
        event.target.textContent = expanded ? '收起书写' : '放大书写';
        document.body.classList.toggle('pad-is-expanded', expanded);
        this.resize();
      };
      this.setScope(this.padId);
      this.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.classList.contains('expanded-pad')) this.querySelector('[data-action=expand]').click();
      });
    }
    disconnectedCallback() { this.resizeObserver?.disconnect(); }
    async setScope(scope) {
      this.up();
      this.scope = scope; this.loading = true; this.activeStroke = null;
      this.strokes = []; this.redoStack = []; this.revision++; this.draw();
      const token = this.loadToken = crypto.randomUUID();
      try {
        let saved = await notebook.get(`draft:${scope}`);
        if (!saved && scope === this.padId) {
          try { saved = JSON.parse(localStorage.getItem(`${PREFIX}:${this.padId}`) || 'null'); } catch { /* Keep old storage intact. */ }
        }
        if (this.loadToken !== token) return;
        this.strokes = Array.isArray(saved) ? saved : [];
        this.loading = false; this.status('笔迹自动保存在本机'); this.draw();
      } catch (error) {
        if (this.loadToken !== token) return;
        this.loading = false; this.storageFailed = true; this.status(error.message); notice(error.message);
      }
    }
    status(message) { this.querySelector('.pad-save-status').textContent = message; }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      this.canvas.width = Math.round(rect.width * ratio); this.canvas.height = Math.round(rect.height * ratio);
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); this.draw();
    }
    point(event) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)), p: event.pressure || .5 };
    }
    down(event) {
      if (this.locked || this.loading || this.activeStroke || event.button > 0) return;
      if (event.pointerType === 'touch' && this.querySelector('.touch-option input').checked) return;
      event.preventDefault(); this.canvas.setPointerCapture(event.pointerId); this.pointer = event.pointerId;
      this.activeStroke = { tool: this.tool, width: this.penWidth, color: this.color, points: [this.point(event)] };
      this.strokes.push(this.activeStroke); this.redoStack = []; this.draw();
    }
    move(event) {
      if (!this.activeStroke || event.pointerId !== this.pointer) return;
      event.preventDefault();
      for (const item of event.getCoalescedEvents?.() || [event]) {
        const point = this.point(item), last = this.activeStroke.points.at(-1);
        if (Math.hypot(point.x - last.x, point.y - last.y) > .0007) this.activeStroke.points.push(point);
      }
      if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); });
    }
    up(event) {
      if (!this.activeStroke || (event && event.pointerId !== this.pointer)) return;
      this.activeStroke = null; this.pointer = null; this.changed();
    }
    changed() {
      this.revision++; this.draw(); this.persist();
      this.dispatchEvent(new CustomEvent('inkchange', { bubbles: true }));
    }
    persist() {
      const scope = this.scope, strokes = copy(this.strokes);
      this.status('正在保存…');
      const pending = this.savePromise = notebook.put(`draft:${scope}`, strokes);
      pending.then(() => { if (this.scope === scope && this.savePromise === pending) this.status('已自动保存 · 可稍后继续'); }, error => { this.storageFailed = true; this.status(error.message); notice(error.message); });
      return pending;
    }
    get hasInk() {
      const lastClear = this.strokes.map(s => s.tool).lastIndexOf('clear');
      return this.strokes.slice(lastClear + 1).some(s => Array.isArray(s) ? s.length : s.tool !== 'eraser' && s.points?.length);
    }
    paint(context, width, height, strokes = this.strokes) {
      context.clearRect(0, 0, width, height); context.lineCap = 'round'; context.lineJoin = 'round';
      for (const stroke of strokes) {
        if (stroke.tool === 'clear') { context.clearRect(0, 0, width, height); continue; }
        const points = Array.isArray(stroke) ? stroke : stroke.points;
        if (!points?.length) continue;
        context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
        context.strokeStyle = stroke.color || '#183252'; context.fillStyle = context.strokeStyle;
        const lineWidth = stroke.tool === 'eraser' ? 26 : (stroke.width || 3);
        if (points.length === 1) {
          context.beginPath(); context.arc(points[0].x * width, points[0].y * height, lineWidth / 2, 0, Math.PI * 2); context.fill();
        }
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i];
          context.lineWidth = lineWidth * (stroke.tool === 'eraser' ? 1 : .65 + (b.p || .5) * .7);
          context.beginPath(); context.moveTo(a.x * width, a.y * height);
          context.quadraticCurveTo(a.x * width, a.y * height, b.x * width, b.y * height); context.stroke();
        }
      }
      context.globalCompositeOperation = 'source-over';
    }
    draw() {
      if (!this.ctx) return;
      const rect = this.canvas.getBoundingClientRect();
      this.paint(this.ctx, rect.width, rect.height);
      this.querySelector('.ink-placeholder').classList.toggle('hidden', this.hasInk);
    }
    clearForNext() { this.strokes = []; this.redoStack = []; this.changed(); }
    imageCanvas(maxSide = 1600, strokes = this.strokes) {
      const rect = this.canvas.getBoundingClientRect();
      const width = rect.width || 900, height = rect.height || 420;
      const ratio = Math.min(2, maxSide / Math.max(width, height));
      const ink = document.createElement('canvas'); ink.width = Math.round(width * ratio); ink.height = Math.round(height * ratio);
      const context = ink.getContext('2d'); context.scale(ratio, ratio); this.paint(context, width, height, strokes);
      const out = document.createElement('canvas'); out.width = ink.width; out.height = ink.height;
      const target = out.getContext('2d'); target.fillStyle = '#fff'; target.fillRect(0, 0, out.width, out.height); target.drawImage(ink, 0, 0);
      return out;
    }
    download() {
      const a = document.createElement('a'); a.download = `手写答案-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = this.imageCanvas().toDataURL('image/png'); a.click();
    }
  }
  customElements.define('handwriting-pad', HandwritingPad);

  class AnswerWorkspace extends HTMLElement {
    connectedCallback() {
      if (this.pad) return;
      this.innerHTML = `<div class="answer-workspace"><div class="answer-steps"><span>① 手写答案</span><span>② 提交批改</span><span>③ 记录错因</span></div><handwriting-pad title="本题答题纸" pad-id="${this.id}-draft"></handwriting-pad><div class="submission-bar"><span class="submission-note">笔迹保存在本机；提交时仅发送本题图片进行云端批改。</span><button class="primary" data-submit>提交批改</button></div><div class="grade-result hidden" role="status" aria-live="polite"><strong class="grade-title"></strong><dl><div><dt>识别到的答案</dt><dd data-recognized></dd></div><div><dt>参考答案</dt><dd data-expected></dd></div></dl><p data-explanation></p><div class="error-reasons hidden"><p>我这次错在哪里？可多选</p><div class="reason-options"></div></div><div class="grade-actions"><button class="secondary" data-retry>重新作答</button><button class="text-button" data-dispute>识别有误，重新核实</button><button class="primary" data-next>保存并下一题</button></div></div><p class="submission-error hidden" role="alert"></p><details class="answer-history"><summary>答题记录 <span class="history-count">0</span></summary><div class="history-list"></div></details></div>`;
      this.pad = this.querySelector('handwriting-pad');
      this.querySelector('.submission-note').textContent = '免费本机识别，不上传笔迹。首次提交需要加载模型，请稍等。';
      this.submitButton = this.querySelector('[data-submit]');
      this.submitButton.onclick = () => this.submit();
      this.querySelector('[data-next]').onclick = () => this.advance();
      this.querySelector('[data-retry]').onclick = () => this.retry();
      this.querySelector('[data-dispute]').onclick = async () => {
        if (!this.attempt) return;
        this.attempt.disputed = true; this.attempt.status = 'uncertain';
        this.attempt.reasons = ['识别有误'];
        try { await notebook.put(`attempt:${this.attempt.id}`, this.attempt); } catch (error) { this.error(error.message); return; }
        this.result = null; this.renderResult(this.attempt); this.renderHistory();
        this.dispatchEvent(new CustomEvent('answer-invalidated', { bubbles: true }));
      };
      this.pad.addEventListener('inkchange', () => {
        if (this.result || this.attempt) { this.result = null; this.attempt = null; this.querySelector('.grade-result').classList.add('hidden'); }
        this.clearError();
      });
      this.historyVersion = 0;
      this.renderHistory();
    }
    setQuestion(question) {
      this.controller?.abort(); this.question = copy(question); this.generation = crypto.randomUUID();
      this.result = null; this.attempt = null; this.busy = false; this.setBusy(false);
      this.querySelector('.grade-result').classList.add('hidden'); this.clearError();
      this.pad.setScope(`${question.module}:${question.id}`);
      this.pad.querySelector('.pad-title').textContent = question.title || '本题答题纸';
      this.renderHistory();
    }
    clearError() { this.querySelector('.submission-error').classList.add('hidden'); }
    error(message) { const el = this.querySelector('.submission-error'); el.textContent = message; el.classList.remove('hidden'); }
    setBusy(busy) {
      this.busy = busy; this.pad.locked = busy; this.submitButton.disabled = busy;
      this.submitButton.textContent = busy ? '正在识别与批改…' : '提交批改';
      this.setAttribute('aria-busy', String(busy));
    }
    async submit() {
      if (!this.question || this.busy || this.pad.loading) return;
      this.pad.up();
      if (!this.pad.hasInk) { this.error('请先在答题纸上写出答案，再提交。'); return; }
      if (this.result && this.attempt && this.attempt.inkRevision === this.pad.revision) { this.error('这份答案已经批改，可记录错因后进入下一题，或重写再提交。'); return; }
      const generation = this.generation, question = copy(this.question), strokes = copy(this.pad.strokes), inkRevision = this.pad.revision;
      this.clearError(); this.setBusy(true); this.controller = new AbortController();
      const timeout = setTimeout(() => this.controller?.abort(), 190000);
      try {
        await this.pad.savePromise;
        const answerImage = this.pad.imageCanvas(1200, strokes);
        const pixels = this.pad.imageCanvas(800, strokes).getContext('2d');
        const rgba = pixels.getImageData(0, 0, pixels.canvas.width, pixels.canvas.height).data;
        let hasVisibleInk = false;
        for (let i = 0; i < rgba.length; i += 4) if (rgba[i] < 235 || rgba[i + 1] < 235 || rgba[i + 2] < 235) { hasVisibleInk = true; break; }
        if (!hasVisibleInk) throw new Error('答题纸目前是空白的，请写出答案再提交。');
        if (!window.FreeHandwritingGrader) throw new Error('免费识别组件尚未加载，请刷新页面后重试。');
        const data = await window.FreeHandwritingGrader.grade(question, answerImage, {
          signal: this.controller.signal,
          onProgress: message => { if (generation === this.generation) this.submitButton.textContent = message; }
        });
        if (!['correct', 'wrong', 'uncertain'].includes(data.status) || typeof data.recognized !== 'string' || typeof data.explanation !== 'string') throw new Error('批改结果不完整，请重新提交；本题尚未计分。');
        if (generation !== this.generation) return;
        const attempt = { id: crypto.randomUUID(), question, strokes, status: data.status, recognized: data.recognized, explanation: data.explanation, expected: question.expected.join('；'), reasons: [], createdAt: new Date().toISOString(), inkRevision, counted: false };
        await notebook.put(`attempt:${attempt.id}`, attempt);
        if (generation !== this.generation) return;
        this.attempt = attempt; this.result = data; this.renderResult(attempt); this.renderHistory();
        this.dispatchEvent(new CustomEvent('answer-graded', { bubbles: true, detail: { question, status: data.status } }));
      } catch (error) {
        if (generation === this.generation) this.error(error.name === 'AbortError' ? '识别等待超时，答案已保存，请稍后重试。' : error.message);
      } finally {
        clearTimeout(timeout); if (generation === this.generation) this.setBusy(false);
      }
    }
    renderResult(attempt) {
      const root = this.querySelector('.grade-result'); root.className = `grade-result ${attempt.status}`;
      root.querySelector('.grade-title').textContent = { correct: '✓ 本题答对了', wrong: '本题需要复习', uncertain: '笔迹需要核实 · 暂不计对错' }[attempt.status];
      root.querySelector('[data-recognized]').textContent = attempt.recognized || '未能清楚辨认';
      root.querySelector('[data-expected]').textContent = attempt.expected;
      root.querySelector('[data-explanation]').textContent = attempt.disputed ? '您已标记识别有误，本题不会记为答错。请重新作答后提交核实。' : attempt.explanation;
      root.querySelector('.error-reasons').classList.toggle('hidden', attempt.status !== 'wrong');
      root.querySelector('[data-dispute]').classList.toggle('hidden', attempt.status === 'uncertain');
      root.querySelector('[data-next]').disabled = attempt.status === 'uncertain';
      const options = root.querySelector('.reason-options'); options.replaceChildren();
      for (const reason of ['没记住意思', '意思混淆', '拼写错误', '听音没听清', '粗心漏写', '其他原因']) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'checkbox'; input.value = reason; input.checked = attempt.reasons.includes(reason);
        input.onchange = async () => {
          attempt.reasons = [...options.querySelectorAll('input:checked')].map(el => el.value);
          try { await notebook.put(`attempt:${attempt.id}`, attempt); } catch (error) { this.error(error.message); }
        };
        label.append(input, document.createTextNode(reason)); options.append(label);
      }
    }
    async advance() {
      if (!this.attempt || !this.result || this.attempt.status === 'uncertain' || this.attempt.counted || this.busy) return;
      if (this.attempt.status === 'wrong' && !this.attempt.reasons.length) { this.error('请选择这次的错因，再保存并进入下一题。'); return; }
      this.setBusy(true);
      try {
        this.attempt.counted = true;
        await notebook.put(`attempt:${this.attempt.id}`, this.attempt);
        await notebook.put(`draft:${this.attempt.question.module}:${this.attempt.question.id}`, []);
        this.dispatchEvent(new CustomEvent('answer-completed', { bubbles: true, detail: copy(this.attempt) }));
      } catch (error) { this.attempt.counted = false; this.error(error.message); }
      finally { this.setBusy(false); }
    }
    retry() {
      if (this.busy) return;
      this.pad.clearForNext(); this.result = null; this.attempt = null;
      this.querySelector('.grade-result').classList.add('hidden'); this.clearError();
    }
    async renderHistory() {
      const version = ++this.historyVersion;
      try {
        const entries = await notebook.export();
        if (version !== this.historyVersion) return;
        const attempts = entries.filter(([key, value]) => key.startsWith('attempt:') && value.question?.module === this.getAttribute('module')).map(([, value]) => value).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        this.querySelector('.history-count').textContent = String(attempts.length);
        const list = this.querySelector('.history-list'); list.replaceChildren();
        if (!attempts.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '提交后的答案、原笔迹和错因会保留在这里。'; list.append(p); }
        this.historyLimit ||= 20;
        for (const attempt of attempts.slice(0, this.historyLimit)) {
          const item = document.createElement('details'); item.className = 'history-item';
          const summary = document.createElement('summary');
          summary.textContent = `${attempt.question.prompt} · ${{ correct: '答对', wrong: '需复习', uncertain: '待核实' }[attempt.status]} · ${new Date(attempt.createdAt).toLocaleString('zh-CN')}`;
          const body = document.createElement('div'), image = document.createElement('img'); image.alt = '此次作答的原始笔迹';
          // Render on demand to avoid allocating an image for every historical page.
          item.addEventListener('toggle', () => { if (item.open && !image.src) image.src = this.pad.imageCanvas(1000, attempt.strokes).toDataURL('image/png'); });
          const recognized = document.createElement('p'); recognized.textContent = `识别：${attempt.recognized || '不清晰'}；参考答案：${attempt.expected}`;
          const reason = document.createElement('p'); reason.textContent = `错因：${attempt.reasons.join('、') || '未记录'}。${attempt.explanation}`;
          const repeat = document.createElement('button'); repeat.className = 'secondary'; repeat.textContent = '重新练这题';
          repeat.onclick = () => { if (!this.busy) this.dispatchEvent(new CustomEvent('answer-repeat', { bubbles: true, detail: copy(attempt.question) })); };
          body.append(image, recognized, reason, repeat); item.append(summary, body); list.append(item);
        }
        if (attempts.length > this.historyLimit) {
          const more = document.createElement('button'); more.className = 'secondary'; more.textContent = '查看更早的记录';
          more.onclick = () => { this.historyLimit += 20; this.renderHistory(); }; list.append(more);
        }
      } catch (error) { this.error(error.message); }
    }
  }
  customElements.define('answer-workspace', AnswerWorkspace);
})();
