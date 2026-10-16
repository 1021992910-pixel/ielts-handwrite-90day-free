(function () {
  const notebook = window.HandwritingNotebook;
  const copy = value => JSON.parse(JSON.stringify(value));
  class WordAnswerWorkspace extends HTMLElement {
    connectedCallback() {
      if (this.input) return;
      this.innerHTML = `<div class="answer-workspace typed-workspace">
        <div class="answer-steps"><span>① 输入答案</span><span>② 提交核对</span><span>③ 记录错因</span></div>
        <article class="panel typed-answer-panel"><label class="typed-label" for="typedWordAnswer">输入答案</label>
          <p class="muted" id="wordInputHint">独立输入完整答案，提交后再查看释义与解析。</p>
          <textarea id="typedWordAnswer" rows="3" maxlength="200" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="done" aria-describedby="wordInputHint"></textarea>
          <div class="typed-input-footer"><span data-draft-status role="status">正在读取本题草稿…</span><button class="text-button" data-clear type="button">清空输入</button></div>
          <div class="submission-bar"><span class="submission-note">提交后由系统核对，无需自行判分。</span><button class="primary" data-submit type="button">提交核对</button></div>
          <button class="text-button" data-unknown type="button">暂时不会，查看答案并记录复习</button>
        </article>
        <p class="submission-error hidden" role="alert"></p>
        <section class="grade-result hidden" role="status" aria-live="polite"><strong class="grade-title"></strong>
          <dl><div><dt>我的答案</dt><dd data-recognized></dd></div><div><dt>参考答案</dt><dd data-expected></dd></div></dl>
          <div class="spelling-diff hidden" aria-label="拼写差异"><div><span>我的拼写</span><code data-entered-diff></code></div><div><span>参考拼写</span><code data-target-diff></code></div><small>橙色标出不同或多写的字母，绿色标出需要补上的字母；空格显示为 ␣。</small></div>
          <p data-explanation></p>
          <fieldset class="error-reasons hidden"><legend>这次主要错在哪里？可多选</legend><div class="reason-options"></div><small>系统已判断结果；这里只记录复习原因，不需要您判对错。不确定可选“暂不确定原因”。</small></fieldset>
          <div class="grade-actions"><button class="secondary" data-edit type="button">修改后重交</button><button class="text-button" data-dispute type="button">判断有疑问，暂不计分</button><button class="primary" data-next type="button">保存并下一题</button><button class="secondary hidden" data-skip type="button">暂存并下一题</button></div>
        </section>
        <details class="legacy-word-draft hidden"><summary>查看保留的旧版手写草稿</summary><div></div></details>
        <details class="answer-history"><summary>答题记录 <span class="history-count">0</span></summary><div class="history-list"></div></details>
      </div>`;
      this.input = this.querySelector('textarea'); this.savePromise = Promise.resolve(); this.historyVersion = 0;
      this.input.addEventListener('input', () => { this.revision++; this.attempt = null; this.hideResult(); this.queueDraft(); });
      this.input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); this.submit(); }
      });
      this.querySelector('[data-submit]').onclick = () => this.submit();
      this.querySelector('[data-clear]').onclick = () => this.edit(true);
      this.querySelector('[data-edit]').onclick = () => this.edit(false);
      this.querySelector('[data-next]').onclick = () => this.finish(false);
      this.querySelector('[data-skip]').onclick = () => this.finish(true);
      this.querySelector('[data-dispute]').onclick = () => this.dispute();
      this.querySelector('[data-unknown]').onclick = () => this.submit(true);
    }
    disconnectedCallback() { this.generation = null; }
    draftKey() { return `typed-draft:${this.question.module}:${this.question.id}`; }
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
      this.dispatchEvent(new CustomEvent('answer-invalidated', { bubbles: true }));
    }
    queueDraft() {
      if (!this.question) return Promise.resolve();
      const key = this.draftKey(), generation = this.generation;
      const draft = { answer: this.input.value, attemptId: this.attempt?.id || null, updatedAt: new Date().toISOString() };
      this.querySelector('[data-draft-status]').textContent = '正在保存…';
      this.savePromise = this.savePromise.catch(() => {}).then(() => notebook.put(key, draft));
      this.savePromise.then(() => { if (generation === this.generation) this.querySelector('[data-draft-status]').textContent = '本题输入已保存在此设备'; }, () => {
        if (generation === this.generation) { this.querySelector('[data-draft-status]').textContent = '尚未保存'; this.error('本题输入未保存成功，请勿关闭页面，可稍后重新提交。'); }
      });
      return this.savePromise;
    }
    async setQuestion(question) {
      const generation = this.generation = crypto.randomUUID();
      this.question = copy(question); this.attempt = null; this.input.value = ''; this.revision = 0;
      this.hideResult(); this.setBusy(true);
      this.querySelector('.typed-label').textContent = question.kind === 'meaning' ? '输入中文意思' : '输入英文单词';
      this.input.placeholder = question.kind === 'meaning' ? '输入您理解的中文意思' : '输入完整英文单词';
      this.input.lang = question.kind === 'meaning' ? 'zh-CN' : 'en';
      this.querySelector('#wordInputHint').textContent = question.kind === 'meaning' ? '支持已收录的同义释义；未收录表达会待核实，不强行判错。' : '独立输入完整英文；不提供字母提示，不自动纠正拼写。';
      this.querySelector('.legacy-word-draft').classList.add('hidden');
      try {
        await this.savePromise.catch(() => {});
        const [draft, legacy] = await Promise.all([notebook.get(this.draftKey()), notebook.get(`draft:${question.module}:${question.id}`)]);
        if (generation !== this.generation) return;
        this.input.value = draft?.answer || '';
        if (draft?.attemptId) {
          const attempt = await notebook.get(`attempt:${draft.attemptId}`);
          if (generation !== this.generation) return;
          if (attempt && !attempt.counted && !attempt.skipped && attempt.question.id === question.id && attempt.inputMode === 'typed') {
            this.attempt = attempt; this.renderResult();
            this.dispatchEvent(new CustomEvent('answer-graded', { bubbles: true, detail: { question, status: attempt.status } }));
          }
        }
        if (Array.isArray(legacy) && legacy.length) {
          const section = this.querySelector('.legacy-word-draft'); section.classList.remove('hidden'); section.querySelector('div').replaceChildren(this.legacyImage(legacy));
        }
        this.querySelector('[data-draft-status]').textContent = draft?.answer ? '已恢复本题输入' : '输入会自动保存在此设备';
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
        const attempt = { id: crypto.randomUUID(), question, inputMode: 'typed', answer, strokes: [], ...result, expected: question.expected.join('；'), reasons: [], createdAt: new Date().toISOString(), counted: false, unknown };
        await notebook.put(`attempt:${attempt.id}`, attempt);
        if (generation !== this.generation) return;
        this.attempt = attempt; await this.queueDraft();
        if (generation !== this.generation) return;
        this.renderResult(); this.renderHistory();
        this.dispatchEvent(new CustomEvent('answer-graded', { bubbles: true, detail: { question, status: attempt.status } }));
      } catch { if (generation === this.generation) { this.attempt = null; this.error('核对结果未保存成功，输入仍在，请再次提交；本题尚未计分。'); } }
      finally { if (generation === this.generation) this.setBusy(false); }
    }
    renderResult() {
      const attempt = this.attempt, root = this.querySelector('.grade-result');
      root.className = `grade-result ${attempt.status}`;
      root.querySelector('.grade-title').textContent = { correct: '✓ 本题答对了', wrong: '本题需要复习', uncertain: '待核实 · 暂不计对错' }[attempt.status];
      root.querySelector('[data-recognized]').textContent = attempt.unknown ? '暂时不会' : attempt.answer || attempt.recognized;
      root.querySelector('[data-expected]').textContent = attempt.expected;
      root.querySelector('[data-explanation]').textContent = attempt.explanation;
      root.querySelector('.error-reasons').classList.toggle('hidden', attempt.status !== 'wrong');
      root.querySelector('[data-next]').classList.toggle('hidden', attempt.status === 'uncertain');
      root.querySelector('[data-skip]').classList.toggle('hidden', attempt.status !== 'uncertain');
      root.querySelector('[data-dispute]').classList.toggle('hidden', attempt.status === 'uncertain');
      const options = root.querySelector('.reason-options'); options.replaceChildren();
      for (const reason of window.LocalGrader.wordErrorReasons(attempt.question.kind)) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'checkbox'; input.value = reason; input.checked = attempt.reasons.includes(reason);
        input.onchange = () => {
          attempt.reasons = [...options.querySelectorAll('input:checked')].map(element => element.value);
          this.error(); this.savePromise = this.savePromise.catch(() => {}).then(() => notebook.put(`attempt:${attempt.id}`, copy(attempt)));
          this.savePromise.then(() => this.renderHistory(), () => this.error('错因尚未保存，请稍后重试。'));
        };
        label.append(input, document.createTextNode(reason)); options.append(label);
      }
      const diff = attempt.diff; root.querySelector('.spelling-diff').classList.toggle('hidden', !diff || attempt.unknown);
      if (diff) for (const [selector, tokens] of [['[data-entered-diff]', diff.entered], ['[data-target-diff]', diff.target]]) {
        const line = root.querySelector(selector); line.replaceChildren();
        for (const token of tokens) { const span = document.createElement('span'); span.className = `letter-${token.kind}`; span.textContent = token.char === ' ' ? '␣' : token.char; line.append(span); }
      }
    }
    async edit(clear) {
      if (this.busy) return;
      this.attempt = null; if (clear) this.input.value = ''; this.revision++; this.hideResult(); this.input.readOnly = false;
      this.queueDraft(); this.input.focus();
    }
    async dispute() {
      if (this.busy || !this.attempt) return;
      const generation = this.generation, attempt = this.attempt;
      this.setBusy(true);
      try {
        attempt.status = 'uncertain'; attempt.disputed = true; attempt.reasons = [];
        attempt.explanation = '已记录判断疑问，本题暂不计对错。可以修改后重新提交，或暂存并下一题；原答案会保留。';
        await this.savePromise; await notebook.put(`attempt:${attempt.id}`, attempt); await this.queueDraft();
        if (generation === this.generation) { this.renderResult(); this.renderHistory(); }
      } catch { this.error('判断疑问未保存，请重试；本题尚未计分。'); }
      finally { if (generation === this.generation) this.setBusy(false); }
    }
    async finish(skip) {
      const attempt = this.attempt;
      if (this.busy || !attempt || attempt.counted || attempt.skipped || (attempt.status === 'uncertain') !== skip) return;
      if (!skip && attempt.status === 'wrong' && !attempt.reasons.length) { this.error('请选择错因；拿不准可选“暂不确定原因”，再保存并下一题。'); return; }
      const generation = this.generation, draftKey = this.draftKey(); this.setBusy(true); this.error();
      try {
        await this.savePromise; const saved = { ...copy(attempt), counted: !skip, skipped: skip };
        await notebook.put(`attempt:${attempt.id}`, saved);
        try { await notebook.put(draftKey, { answer: '', attemptId: null }); }
        catch (error) { await notebook.put(`attempt:${attempt.id}`, attempt); throw error; }
        if (generation !== this.generation) return;
        Object.assign(attempt, saved);
        this.dispatchEvent(new CustomEvent(skip ? 'answer-skipped' : 'answer-completed', { bubbles: true, detail: copy(attempt) }));
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
        if (!attempts.length) { const note = document.createElement('p'); note.className = 'muted'; note.textContent = '提交后的原答案、核对结果和错因会保留在这里。'; list.append(note); }
        this.historyLimit ||= 20;
        for (const attempt of attempts.slice(0, this.historyLimit)) {
          const item = document.createElement('details'); item.className = 'history-item';
          const summary = document.createElement('summary'); summary.textContent = `${attempt.question.prompt} · ${{ correct: '答对', wrong: '需复习', uncertain: '待核实' }[attempt.status] || '待核实'} · ${new Date(attempt.createdAt).toLocaleString('zh-CN')}`;
          const body = document.createElement('div'), answer = document.createElement('p'), reasons = document.createElement('p'), repeat = document.createElement('button');
          answer.textContent = `${attempt.inputMode === 'typed' ? '输入答案' : '旧版识别'}：${attempt.unknown ? '暂时不会' : attempt.answer || attempt.recognized || '未识别'}；参考答案：${attempt.expected}`;
          reasons.textContent = `错因：${(attempt.reasons || []).join('、') || '未记录'}。${attempt.explanation || ''}`;
          repeat.className = 'secondary'; repeat.textContent = '重新练这题'; repeat.disabled = this.busy;
          repeat.onclick = () => { if (!this.busy) this.dispatchEvent(new CustomEvent('answer-repeat', { bubbles: true, detail: copy(attempt.question) })); };
          body.append(answer, reasons, repeat); item.append(summary, body);
          if (attempt.inputMode !== 'typed' && attempt.strokes?.length) item.addEventListener('toggle', () => { if (item.open && !body.querySelector('img')) body.prepend(this.legacyImage(attempt.strokes)); });
          list.append(item);
        }
        if (attempts.length > this.historyLimit) { const more = document.createElement('button'); more.className = 'secondary'; more.textContent = '查看更早记录'; more.onclick = () => { this.historyLimit += 20; this.renderHistory(); }; list.append(more); }
      } catch { this.error('暂时无法读取答题记录，旧数据没有被清除。'); }
    }
  }
  customElements.define('word-answer-workspace', WordAnswerWorkspace);
})();
