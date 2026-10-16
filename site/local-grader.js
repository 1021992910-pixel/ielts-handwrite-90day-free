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
  // Typed answers never pass through OCR. Keep the legacy grader unchanged for other modules.
  function spellingDiff(answer, expected) {
    const a = [...normalizeSpelling(answer)], b = [...normalizeSpelling(expected)];
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i ? j ? 0 : i : j));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    const entered = [], target = [];
    let i = a.length, j = b.length;
    while (i || j) {
      if (i && j && matrix[i][j] === matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
        const kind = a[i - 1] === b[j - 1] ? 'same' : 'changed';
        entered.unshift({ char: a[--i], kind }); target.unshift({ char: b[--j], kind });
      } else if (i && matrix[i][j] === matrix[i - 1][j] + 1) entered.unshift({ char: a[--i], kind: 'extra' });
      else target.unshift({ char: b[--j], kind: 'missing' });
    }
    return { entered, target, distance: matrix[a.length][b.length] };
  }
  function gradeTyped(question, answer) {
    const recognized = String(answer || '').trim();
    if (!recognized) return { status: 'empty', recognized, explanation: '请先输入答案，再提交核对。' };
    if (recognized.length > 200) return { status: 'empty', recognized, explanation: '单词答案请控制在 200 个字符以内。' };
    if (!Array.isArray(question.expected) || !question.expected.length) throw new Error('本题缺少参考答案，暂不计对错。');
    if (question.kind === 'spelling') {
      const correct = question.expected.some(value => normalizeSpelling(value) === normalizeSpelling(recognized));
      const diffs = correct ? [] : question.expected.map(value => ({ expected: value, ...spellingDiff(recognized, value) })).sort((a, b) => a.distance - b.distance);
      return { status: correct ? 'correct' : 'wrong', recognized, diff: diffs[0] || null,
        explanation: correct ? '英文拼写正确。核对时忽略大小写、首尾空格和末尾句号；不会自动修正字母或词形。' : '拼写与本题要求不一致。下方标出了不同的字母；空格、连字符和词形也需要核对。' };
    }
    const key = String(question.prompt || '').toLowerCase();
    const expected = [...question.expected, ...(meaningAliases[key] || [])];
    const parts = recognized.split(/[；;,，、/／\n]+/u).map(value => value.trim()).filter(Boolean);
    const accepted = value => matchesAny(value, expected);
    if (parts.length && parts.every(accepted)) return { status: 'correct', recognized, explanation: '意思正确：接受本题已收录的合理同义表达，不要求与参考释义逐字相同。' };
    if (/^(不知道|不会|不记得|忘记了|忘了|没记住)$/u.test(recognized)) return { status: 'wrong', recognized, explanation: '已记录为需要复习。先看本题释义与例句，再记录错因。' };
    const unknown = parts.filter(value => !accepted(value));
    const clearlyDifferent = unknown.length && unknown.every(value => Object.entries(meaningAliases).some(([word, aliases]) => word !== key && matchesAny(value, aliases)));
    return { status: clearlyDifferent ? 'wrong' : 'uncertain', recognized, explanation: clearlyDifferent
      ? '答案中有与本题已收录词义不一致的内容。请对照释义和例句；如认为判断有误，可暂存待核实，不会记为答错。'
      : '这个表达尚未收录，当前无法可靠判断，暂不计对错。可修改表达后再次提交，或暂存并下一题。' };
  }
  function wordErrorReasons(kind) {
    return kind === 'spelling'
      ? ['没记住英文', '漏写或多写字母', '字母顺序混淆', '与其他单词混淆', '词形或空格错误', '输入失误', '暂不确定原因']
      : ['没记住词义', '与其他词义混淆', '只记住部分意思', '输入失误', '暂不确定原因'];
  }
  root.LocalGrader = Object.freeze({ normalize, matchesAny, normalizeSpelling, gradeRecognized, gradeTyped, spellingDiff, wordErrorReasons });
})(typeof window === "undefined" ? globalThis : window);
