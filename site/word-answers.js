(function () {
  const notebook = window.HandwritingNotebook;
  const copy = value => JSON.parse(JSON.stringify(value));
  class WordAnswerWorkspace extends HTMLElement {
    connectedCallback() {
      if (this.input) return;
      this.innerHTML = `<div class="answer-workspace typed-workspace">
        <article class="panel typed-answer-panel"><label class="typed-label" for="typedWordAnswer">输入答案</label>
          <textarea id="typedWordAnswer" rows="3" maxlength="200" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="done"></textarea>
          <div class="typed-input-footer"><button class="text-button" data-clear type="button">清空</button></div>
          <div class="submission-bar"><button class="primary" data-submit type="button">提交核对</button><button class="text-button" data-unknown type="button">完全不会</button></div>
        </article>
        <p class="submission-error hidden" role="alert"></p>
        <section class="grade-result hidden" role="status" aria-live="polite"><strong class="grade-title"></strong>
          <dl><div><dt>我的答案</dt><dd data-recognized></dd></div><div><dt>参考答案</dt><dd data-expected></dd></div></dl>
          <fieldset class="error-reasons hidden"><legend>错在哪里？可多选</legend><div class="reason-options"></div></fieldset>
          <div class="grade-actions"><button class="primary" data-next type="button">下一题</button></div>
        </section>
        <details class="legacy-word-draft hidden"><summary>查看保留的旧版手写草稿</summary><div></div></details>
        <details class="answer-history"><summary>答题记录 <span class="history-count">0</span></summary><div class="history-list"></div></details>
      </div>`;
      this.input = this.querySelector('textarea'); this.savePromise = Promise.resolve(); this.historyVersion = 0;
      this.input.addEventListener('input', () => {
        if (this.attempt) { this.input.value = this.attempt.answer || ''; return; }
        this.revision++; this.hideResult(); this.queueDraft();
      });
      this.input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); this.submit(); }
      });
      this.querySelector('[data-submit]').onclick = () => this.submit();
      this.querySelector('[data-clear]').onclick = () => this.clearInput();
      this.querySelector('[data-next]').onclick = () => this.finish();
      this.querySelector('[data-unknown]').onclick = () => this.submit(true);
    }
    disconnectedCallback() { this.generation = null; }
    draftKey() { return `typed-draft:${this.question.module}:${this.question.id}${this.question.turnId ? ':' + this.question.turnId : ''}`; }
    error(message = '') {
      const element = this.querySelector('.submission-error'); element.textContent = message; element.classList.toggle('hidden', !message);
    }
    setBusy(busy) {
      this.busy = busy;
      this.querySelectorAll('button').forEach(button => button.disabled = busy);
      this.querySelector('[data-submit]').disabled = busy || Boolean(this.attempt);
      this.querySelector('[data-unknown]').disabled = busy || Boolean(this.attempt);
      this.input.readOnly = busy || Boolean(this.attempt);
      this.querySelectorAll('.reason-options input').forEach(input => input.disabled = busy);
    }
    hideResult() {
      this.querySelector('.grade-result').classList.add('hidden'); this.error();
      this.querySelector('.typed-answer-panel').classList.remove('hidden');
      this.dispatchEvent(new CustomEvent('answer-invalidated', { bubbles: true }));
    }
    queueDraft() {
      if (!this.question) return Promise.resolve();
      const key = this.draftKey(), generation = this.generation;
      const draft = { answer: this.input.value, attemptId: this.attempt?.id || null, updatedAt: new Date().toISOString() };
      this.savePromise = this.savePromise.catch(() => {}).then(() => notebook.put(key, draft));
      this.savePromise.catch(() => {
        if (generation === this.generation) this.error('保存失败，请勿关闭页面。');
      });
      return this.savePromise;
    }
    async setQuestion(question) {
      const generation = this.generation = crypto.randomUUID();
      this.question = copy(question); this.attempt = null; this.input.value = ''; this.revision = 0;
      this.hideResult(); this.setBusy(true);
      this.querySelector('.typed-label').textContent = question.kind === 'meaning' ? '输入中文意思' : '输入英文单词';
      this.input.lang = question.kind === 'meaning' ? 'zh-CN' : 'en';
      this.querySelector('.legacy-word-draft').classList.add('hidden');
      try {
        await this.savePromise.catch(() => {});
        let [draft, legacy] = await Promise.all([notebook.get(this.draftKey()), notebook.get(`draft:${question.module}:${question.id}`)]);
        if (!draft && question.adoptLegacy) draft = await notebook.get(`typed-draft:${question.module}:${question.id}`);
        if (generation !== this.generation) return;
        this.input.value = draft?.answer || '';
        if (draft?.attemptId) {
          const attempt = await notebook.get(`attempt:${draft.attemptId}`);
          if (generation !== this.generation) return;
          if (attempt && !attempt.counted && !attempt.skipped && attempt.question.id === question.id && attempt.inputMode === 'typed') {
            attempt.question = copy(question);
            // Resume an old pending typed result using the current binary policy.
            // Completed history is kept intact; the original answer remains locked.
            if (attempt.status === 'uncertain') attempt.status = 'wrong';
            this.attempt = attempt; this.renderResult();
            this.dispatchEvent(new CustomEvent('answer-graded', { bubbles: true, detail: { question, status: attempt.status } }));
          }
        }
        if (Array.isArray(legacy) && legacy.length) {
          const section = this.querySelector('.legacy-word-draft'); section.classList.remove('hidden'); section.querySelector('div').replaceChildren(this.legacyImage(legacy));
        }
      } catch { if (generation === this.generation) this.error('未能读取本题记录，请检查浏览器存储权限。旧记录没有被清除。'); }
      finally { if (generation === this.generation) { this.setBusy(false); this.renderHistory(); } }
    }
    async submit(unknown = false) {
      if (this.busy || !this.question || this.attempt) return;
      const question = copy(this.question), generation = this.generation, answer = this.input.value;
      const result = unknown ? { status: 'wrong', recognized: answer.trim(), explanation: '已记录为暂时不会。先看释义和例句，再选择需要加强的原因。' } : window.LocalGrader.gradeTyped(question, answer);
      if (result.status === 'empty') { this.error(result.explanation); this.input.focus(); return; }
      this.setBusy(true); this.error();
      try {
        await this.queueDraft();
        const attempt = { id: crypto.randomUUID(), question, inputMode: 'typed', answer, strokes: [], ...result, expected: question.expected.join('；'), reasons: unknown ? ['完全不会'] : [], createdAt: new Date().toISOString(), counted: false, unknown };
        await notebook.put(`attempt:${attempt.id}`, attempt);
        if (generation !== this.generation) return;
        this.attempt = attempt; await this.queueDraft();
        if (generation !== this.generation) return;
        this.renderResult(); this.renderHistory(); this.input.blur();
        this.dispatchEvent(new CustomEvent('answer-graded', { bubbles: true, detail: { question, status: attempt.status } }));
      } catch { if (generation === this.generation) { this.attempt = null; this.error('核对结果未保存成功，输入仍在，请再次提交；本题尚未计分。'); } }
      finally { if (generation === this.generation) this.setBusy(false); }
    }
    renderResult() {
      const attempt = this.attempt, root = this.querySelector('.grade-result');
      const correct = attempt.status === 'correct';
      root.className = `grade-result ${correct ? 'correct' : 'wrong'}`;
      this.querySelector('.typed-answer-panel').classList.add('hidden');
      root.querySelector('.grade-title').textContent = correct ? '✓ 答对了' : '✕ 答错了';
      root.querySelector('[data-recognized]').textContent = attempt.unknown ? '完全不会' : attempt.answer || attempt.recognized;
      root.querySelector('[data-expected]').textContent = attempt.expected;
      root.querySelector('.error-reasons').classList.toggle('hidden', correct);
      const options = root.querySelector('.reason-options'); options.replaceChildren();
      for (const [index, reason] of window.LocalGrader.wordErrorReasons(attempt.question.kind).entries()) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'checkbox'; input.value = reason; input.setAttribute('aria-label', reason); input.checked = attempt.reasons.includes(reason);
        input.onchange = () => {
          attempt.reasons = [...options.querySelectorAll('input:checked')].map(element => element.value);
          this.error(); this.savePromise = this.savePromise.catch(() => {}).then(() => notebook.put(`attempt:${attempt.id}`, copy(attempt)));
          this.savePromise.then(() => this.renderHistory(), () => this.error('错因尚未保存，请稍后重试。'));
        };
        const number = document.createElement('span'); number.className = 'reason-number'; number.setAttribute('aria-hidden', 'true'); number.textContent = `${index + 1}.`;
        label.append(input, number, document.createTextNode(reason)); options.append(label);
      }
      const diff = attempt.diff;
      root.querySelectorAll('dd').forEach(line => line.classList.toggle('answer-spelling', attempt.question.kind === 'spelling' && !attempt.unknown));
      if (diff && !attempt.unknown) for (const [selector, tokens] of [['[data-recognized]', diff.entered], ['[data-expected]', diff.target]]) {
        const line = root.querySelector(selector); line.replaceChildren();
        for (const token of tokens) { const span = document.createElement('span'); span.className = `letter-${token.kind}`; span.textContent = token.char === ' ' ? '␣' : token.char; line.append(span); }
      }
    }
    clearInput() {
      if (this.busy || this.attempt) return;
      this.input.value = ''; this.revision++; this.hideResult(); this.input.readOnly = false;
      this.queueDraft(); this.input.focus();
    }
    async finish() {
      const attempt = this.attempt;
      if (this.busy || !attempt || attempt.counted || attempt.skipped) return;
      if (attempt.status === 'wrong' && !attempt.reasons.length) { this.error('请选择错因，再点“下一题”。'); return; }
      const generation = this.generation, draftKey = this.draftKey(); this.setBusy(true); this.error();
      try {
        await this.savePromise; const saved = { ...copy(attempt), counted: true, skipped: false };
        await notebook.put(`attempt:${attempt.id}`, saved);
        try { await notebook.put(draftKey, { answer: '', attemptId: null }); }
        catch (error) { await notebook.put(`attempt:${attempt.id}`, attempt); throw error; }
        if (generation !== this.generation) return;
        Object.assign(attempt, saved);
        this.dispatchEvent(new CustomEvent('answer-completed', { bubbles: true, detail: copy(attempt) }));
      } catch { if (generation === this.generation) this.error('本题未完成保存，请重试。输入和旧记录不会清除。'); }
      finally { if (generation === this.generation) this.setBusy(false); }
    }
    legacyImage(strokes) {
      const image = document.createElement('img'); image.alt = '保留的旧版手写笔迹';
      const prototype = customElements.get('handwriting-pad').prototype;
      const renderer = { canvas: { getBoundingClientRect: () => ({ width: 900, height: 420 }) }, paint: prototype.paint };
      image.src = prototype.imageCanvas.call(renderer, 1000, strokes).toDataURL('image/png'); return image;
    }
    async renderHistory() {
      const version = ++this.historyVersion;
      try {
        const entries = await notebook.export(); if (version !== this.historyVersion) return;
        const attempts = entries.filter(([key, value]) => key.startsWith('attempt:') && value?.question?.module === 'words').map(([, value]) => value).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        this.querySelector('.history-count').textContent = String(attempts.length);
        const list = this.querySelector('.history-list'); list.replaceChildren();
        this.historyLimit ||= 20;
        for (const attempt of attempts.slice(0, this.historyLimit)) {
          const item = document.createElement('details'); item.className = 'history-item';
          const summary = document.createElement('summary'); summary.textContent = `${attempt.question.prompt} · ${attempt.status === 'correct' ? '答对' : '答错'} · ${new Date(attempt.createdAt).toLocaleString('zh-CN')}`;
          const body = document.createElement('div'), answer = document.createElement('p'), reasons = document.createElement('p');
          answer.textContent = `${attempt.inputMode === 'typed' ? '输入答案' : '旧版识别'}：${attempt.unknown ? '完全不会' : attempt.answer || attempt.recognized || '未识别'}；参考答案：${attempt.expected}`;
          reasons.textContent = `错因：${(attempt.reasons || []).join('、') || '未记录'}`;
          if (attempt.inputMode !== 'typed' && attempt.status !== 'uncertain' && attempt.explanation) reasons.textContent += `。${attempt.explanation}`;
          body.append(answer, reasons); item.append(summary, body);
          if (attempt.inputMode !== 'typed' && attempt.strokes?.length) item.addEventListener('toggle', () => { if (item.open && !body.querySelector('img')) body.prepend(this.legacyImage(attempt.strokes)); });
          list.append(item);
        }
        if (attempts.length > this.historyLimit) { const more = document.createElement('button'); more.className = 'secondary'; more.textContent = '查看更早记录'; more.onclick = () => { this.historyLimit += 20; this.renderHistory(); }; list.append(more); }
      } catch { this.error('暂时无法读取答题记录，旧数据没有被清除。'); }
    }
  }
  customElements.define('word-answer-workspace', WordAnswerWorkspace);
})();
