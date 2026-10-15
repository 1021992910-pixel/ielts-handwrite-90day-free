(function (root) {
  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[’‘]/g, "'")
      .replace(/[。！？!?，,；;：:\s]+/g, "")
      .trim();
  }

  function matchesAny(answer, expectedAnswers) {
    const normalized = normalize(answer);
    return normalized.length > 0 && expectedAnswers.some(item => normalize(item) === normalized);
  }

  const meaningAliases = {
    environment: ['环境', '周围环境', '外界环境'], education: ['教育', '教学'], benefit: ['好处', '益处', '利益', '受益', '有益'],
    challenge: ['挑战', '难题'], community: ['社区', '社群'], develop: ['发展', '开发', '培养'], improve: ['改善', '改进', '提高', '提升'],
    increase: ['增加', '增长', '增多', '上升'], reduce: ['减少', '降低', '缩减'], important: ['重要', '重要的', '要紧'],
    available: ['可获得', '可获得的', '可用', '可用的', '有空', '有空的'], provide: ['提供', '供给'], require: ['需要', '要求'],
    responsibility: ['责任', '职责'], opportunity: ['机会', '机遇'], experience: ['经验', '经历', '体验'], quality: ['质量', '品质'],
    society: ['社会'], government: ['政府'], technology: ['技术', '科技'], communication: ['沟通', '交流', '通讯', '通信'],
    traditional: ['传统', '传统的'], convenient: ['方便', '方便的', '便利', '便利的'], healthy: ['健康', '健康的'], pollution: ['污染'],
    solution: ['解决办法', '解决方法', '解决方案', '解答', '溶液'], support: ['支持', '支撑', '帮助'], research: ['研究', '调查研究'],
    effect: ['影响', '效果', '作用'], reason: ['原因', '理由'], result: ['结果', '成果'], choice: ['选择', '选项'], change: ['改变', '变化', '更改'],
    compare: ['比较', '对比'], similar: ['相似', '相似的', '类似', '类似的'], different: ['不同', '不同的', '不一样', '不一样的', '相异', '有区别'],
    advantage: ['优点', '优势', '有利条件'], disadvantage: ['缺点', '劣势', '不利条件'], participate: ['参与', '参加'], achieve: ['实现', '达到', '达成']
  };
  function normalizeSpelling(value) {
    return String(value || '').normalize('NFKC').toLowerCase().trim().replace(/[。.!！?？]+$/u, '').trim().replace(/\s+/g, ' ');
  }
  function gradeRecognized(question, items) {
    if (!Array.isArray(items)) throw new Error('识别结果格式异常，未计分');
    const lines = items.filter(item => typeof item.text === 'string' && item.text.trim());
    const recognized = lines.map(item => item.text.trim()).join(question.kind === 'meaning' ? '' : ' ');
    if (!lines.length || lines.some(item => !Number.isFinite(item.score) || item.score < .85)) return { status: 'uncertain', recognized, explanation: '有些笔迹未能可靠辨认，请重写后再提交。本题暂不计对错。' };
    if (question.kind === 'spelling') {
      const correct = question.expected.some(answer => normalizeSpelling(answer) === normalizeSpelling(recognized));
      return { status: correct ? 'correct' : 'wrong', recognized, explanation: correct ? '英文拼写与参考答案一致。' : `识别到“${recognized}”，参考拼写为“${question.expected.join(' / ')}”。请检查字母、顺序与空格；如与原笔迹不符，可标记“识别有误”。` };
    }
    const expected = [...question.expected, ...(meaningAliases[question.prompt.toLowerCase()] || [])];
    const parts = recognized.split(/[；;,，、/]+/).filter(Boolean);
    const correct = parts.length > 0 && parts.every(part => matchesAny(part, expected));
    if (correct) return { status: 'correct', recognized, explanation: '您的表达在本题已收录的正确释义中，不要求与参考答案逐字相同。' };
    const knownOtherMeaning = Object.entries(meaningAliases).some(([word, aliases]) => word !== question.prompt.toLowerCase() && matchesAny(recognized, aliases));
    return { status: knownOtherMeaning ? 'wrong' : 'uncertain', recognized, explanation: knownOtherMeaning ? '识别出的意思与本题收录的词义不一致。请查看参考答案；如原笔迹被识别错，可标记“识别有误”。' : '这个表达尚未收录，暂时无法可靠判断。先标为待核实，不算答错；可换一种表达重写。' };
  }
  root.LocalGrader = Object.freeze({ normalize, matchesAny, normalizeSpelling, gradeRecognized });
})(typeof window === "undefined" ? globalThis : window);
