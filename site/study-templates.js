(function () {
  window.SpeakingExamples = [
    ['I usually get up at around seven. After breakfast, I spend a little time studying English before I start work. This quiet time helps me feel prepared for the day.', '我通常七点左右起床，早餐后学一会儿英语，再开始工作。这段安静的时间让我做好一天的准备。'],
    ['Yes, I do, although I sometimes find it difficult. I enjoy learning useful expressions because I can use them straight away. For example, I try to describe my daily routine in English.', '喜欢，但有时也觉得难。我喜欢学能马上用上的表达，例如用英语描述日常生活。'],
    ['I come from a small city near a river. It is fairly quiet, and the people are friendly. What I like most is that I can get to most places quite easily.', '我来自一座临河的小城市，那里安静，人也友善。我最喜欢的一点是出行方便。'],
    ['I use my tablet almost every day, mainly for studying. I read short articles and practise English on it. It is convenient because I can take it with me when I travel.', '我几乎每天用平板，主要用来学习、读短文和练英语。出门也方便携带。'],
    ['I quite like gentle pop music. I often listen to it when I am relaxing at home. It helps me unwind, but I usually turn it off when I need to concentrate.', '我比较喜欢舒缓的流行音乐，在家放松时经常听。需要集中注意力时，我通常会关掉音乐。'],
    ['I would like to talk about a friend who helped me learn to cook. A few years ago, I could only make very simple meals, so I asked her for advice. She showed me how to prepare the ingredients and explained each step patiently. We started with a vegetable dish, and I made several mistakes at first. Instead of taking over, she encouraged me to try again. I felt proud when I finally cooked it on my own. The experience taught me that patient practice is more useful than being afraid of mistakes.', '示例思路：朋友教我做饭；交代时间、学习过程、困难和感受。Part 2 练习时可补充自己的具体细节，逐步展开。'],
    ['One place I enjoy visiting is a park near my home. It has a small lake and a path lined with trees. I usually go there at weekends, especially when the weather is pleasant. Sometimes I walk with a friend, and sometimes I go alone. My favourite part is a quiet corner beside the water, where I can sit and read. Although the park is not very large, it gives me a break from busy streets. I always feel more relaxed after spending an hour there.', '示例思路：家附近的公园；介绍位置、样子、去的时间、做的事情，以及喜欢它的原因。'],
    ['Technology has made learning more flexible. People can watch lessons and review difficult points whenever they have time. However, having access to information does not mean they understand it. They still need practice and feedback, so I think technology should support teachers rather than replace them entirely.', '先说技术让学习灵活，再指出获取信息不等于理解，最后说明练习和反馈仍然重要。'],
    ['A good teacher needs to explain ideas clearly and notice when students are struggling. For example, a teacher may use a different example instead of repeating the same explanation. Patience matters too, because students are more willing to ask questions when they do not feel embarrassed.', '清楚讲解、发现困难、换一种例子说明，以及耐心鼓励提问。'],
    ['Yes, I think public spaces are important because they give people somewhere to exercise and spend time together. This is particularly useful for families who do not have much space at home. However, cities also need to maintain these places, rather than only spending money on building new ones.', '支持增加公共空间，说明运动和交流的好处，同时补充维护现有空间的重要性。']
  ];
  window.createTemplateManager = function ({ state, saveState, todayKey, toast, renderProgress, promptFor, onPractice, getPractice, readAloud }) {
    const editors = {}, fields = ['Type', 'Title', 'Prompt', 'Keywords', 'Structure', 'Chunks', 'Answer'];
    let memoryTarget = null, returnFocus = null;
    const kindOf = template => /^写作/.test(template.type || '') ? 'writing' : 'speaking';
    const field = (editor, name) => editor.host.querySelector(`[data-field="${name}"]`);
    const selected = editor => state.templates.find(item => item.id === editor.selected && kindOf(item) === editor.kind);
    function fill(editor) {
      const template = selected(editor); editor.host.querySelector('.template-editor').classList.toggle('hidden', !template);
      if (template) for (const name of fields) field(editor, name).value = name === 'Prompt' ? promptFor(template) : template[name.toLowerCase()] || '';
    }
    function renderLists() {
      for (const editor of Object.values(editors)) {
        const items = state.templates.filter(item => kindOf(item) === editor.kind);
        if (!items.some(item => item.id === editor.selected)) editor.selected = items[0]?.id;
        const list = field(editor, 'List'); list.replaceChildren();
        if (!items.length) { const empty = document.createElement('p'); empty.textContent = '暂无模板'; list.append(empty); }
        for (const template of items) {
          const button = document.createElement('button'), title = document.createElement('strong'), status = document.createElement('small');
          button.className = `template-item${template.id === editor.selected ? ' active' : ''}`;
          title.textContent = template.title || '未命名模板'; status.textContent = `${template.type || '口语'} · ${template.review === 'good' ? '可脱稿' : template.review === 'hard' ? '需加强' : '待学习'}`;
          button.append(title, status); button.onclick = () => { editor.selected = template.id; renderLists(); fill(editor); }; list.append(button);
        }
      }
    }
    function save(editor, quiet = false) {
      const template = selected(editor); if (!template) return;
      for (const name of fields) template[name.toLowerCase()] = field(editor, name).value.trim();
      saveState(); renderLists(); if (!quiet) toast('模板已保存');
    }
    function create(editor, values = {}) {
      const template = { id: `t-${crypto.randomUUID()}`, type: editor.kind === 'speaking' ? '口语 Part 1' : '写作 Task 2', title: '', prompt: '', keywords: '', structure: '直接回答 → 理由 → 例子', chunks: '', answer: '', review: 'new', ...values };
      state.templates.unshift(template); editor.selected = template.id; saveState(); renderLists(); fill(editor); return template;
    }
    const close = () => { document.getElementById('memoryOverlay').classList.add('hidden'); returnFocus?.focus(); };
    function open(editor) {
      save(editor, true); const template = selected(editor); if (!template) return;
      memoryTarget = { id: template.id, kind: editor.kind }; returnFocus = document.activeElement;
      for (const [id, text] of Object.entries({ memoryType: template.type, memoryTitle: template.title, memoryKeywords: template.keywords, memoryStructure: template.structure, memoryAnswer: `${template.chunks || ''}\n\n${template.answer || ''}` })) document.getElementById(id).textContent = text || '';
      document.getElementById('memoryAnswer').classList.add('hidden'); document.getElementById('memoryRatings').classList.add('hidden'); document.getElementById('revealMemory').classList.remove('hidden');
      document.getElementById('memoryRecord').classList.toggle('hidden', editor.kind !== 'speaking'); document.getElementById('memoryOverlay').classList.remove('hidden'); document.getElementById('closeMemory').focus();
    }
    for (const kind of ['speaking', 'writing']) {
      const host = document.getElementById(`${kind}TemplateHost`); host.append(document.getElementById('templateEditorMarkup').content.cloneNode(true));
      const editor = editors[kind] = { host, kind, selected: null };
      field(editor, 'Heading').textContent = kind === 'speaking' ? '我的口语答案与背诵' : '写作模板';
      const types = kind === 'speaking' ? ['口语 Part 1', '口语 Part 2', '口语 Part 3'] : ['写作 Task 1', '写作 Task 2'];
      for (const template of state.templates.filter(item => kindOf(item) === kind)) if (template.type && !types.includes(template.type)) types.push(template.type);
      for (const type of types) { const option = document.createElement('option'); option.value = type; option.textContent = type; field(editor, 'Type').append(option); }
      field(editor, 'New').onclick = () => { create(editor); field(editor, 'Title').focus(); }; field(editor, 'Save').onclick = () => save(editor);
      for (const name of fields) field(editor, name).addEventListener(name === 'Type' ? 'change' : 'input', () => save(editor, true));
      field(editor, 'Memory').onclick = () => open(editor);
      field(editor, 'Listen').classList.toggle('hidden', kind !== 'speaking'); field(editor, 'Listen').onclick = () => readAloud(field(editor, 'Answer').value);
      field(editor, 'Practice').classList.toggle('hidden', kind !== 'speaking'); field(editor, 'Practice').onclick = () => { save(editor, true); onPractice(selected(editor)); };
    }
    document.getElementById('saveSpeakingAnswer').onclick = () => {
      const editor = editors.speaking, practice = getPractice();
      const template = state.templates.find(item => kindOf(item) === 'speaking' && (item.id === practice.id || promptFor(item) === practice.prompt));
      if (template) { editor.selected = template.id; renderLists(); fill(editor); } else create(editor, { type: practice.type, title: practice.prompt, prompt: practice.prompt });
      editor.host.scrollIntoView({ block: 'start', behavior: 'smooth' }); field(editor, 'Answer').focus();
    };
    document.getElementById('closeMemory').onclick = close;
    const overlay = document.getElementById('memoryOverlay');
    document.addEventListener('keydown', event => {
      if (overlay.classList.contains('hidden')) return;
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const buttons = [...overlay.querySelectorAll('button')].filter(button => !button.disabled && button.getClientRects().length);
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
      }
    });
    document.getElementById('memoryRecord').onclick = () => { const template = state.templates.find(item => item.id === memoryTarget?.id); if (template && onPractice(template)) { close(); document.getElementById('recordButton').focus(); } };
    document.getElementById('revealMemory').onclick = () => { document.getElementById('memoryAnswer').classList.remove('hidden'); document.getElementById('memoryRatings').classList.remove('hidden'); document.getElementById('revealMemory').classList.add('hidden'); };
    document.querySelectorAll('[data-memory]').forEach(button => button.onclick = () => {
      const template = state.templates.find(item => item.id === memoryTarget?.id); if (!template) return;
      template.review = button.dataset.memory; template.lastReview = todayKey(); state.templatesPracticed++; saveState(); close(); renderLists(); renderProgress(); toast('背诵结果已记录');
    });
    return { render: () => { renderLists(); Object.values(editors).forEach(fill); }, promptFor };
  };
})();
