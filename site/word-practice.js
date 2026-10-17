(function (root) {
  const key = value => String(value || '').toLowerCase().trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  function shuffle(values) {
    const items = [...values];
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  }
  function create(words, { id, direction = 'zh-en', source = 'daily', day, limit = 30, preferred, random = true, adoptLegacy = false } = {}) {
    let items = [...new Map(words.filter(word => word?.[0]).map(word => [key(word[0]), clone(word)])).values()];
    if (random) items = shuffle(items);
    if (preferred) items.sort((a, b) => Number(key(b[0]) === key(preferred)) - Number(key(a[0]) === key(preferred)));
    items = items.slice(0, limit);
    return { id, direction, source, day, items, pending: items.map(word => key(word[0])), failed: [], mastered: [], seen: [], processed: [], round: 1, phase: items.length ? 'first' : 'done', attempts: 0, initialErrors: 0, adoptLegacy, legacyWord: preferred ? key(preferred) : '' };
  }
  function current(session) { return session?.phase !== 'done' ? session?.items.find(word => key(word[0]) === session.pending[0]) || null : null; }
  function record(session, attempt) {
    if (!session || session.phase === 'done' || session.processed.includes(attempt.id)) return false;
    const word = key(attempt.question.id.slice(attempt.question.id.indexOf(':') + 1));
    if (attempt.question.sessionId && attempt.question.sessionId !== session.id) return false;
    if (session.pending[0] !== word) return false;
    session.processed.push(attempt.id); session.attempts++;
    if (session.round === 1) { session.seen.push(word); if (attempt.status !== 'correct') session.initialErrors++; }
    if (attempt.status === 'correct') { if (!session.mastered.includes(word)) session.mastered.push(word); }
    else if (!session.failed.includes(word)) session.failed.push(word);
    session.pending.shift();
    if (!session.pending.length) {
      if (session.failed.length) { session.pending = shuffle(session.failed); session.failed = []; session.round++; session.phase = 'review'; }
      else { session.phase = 'done'; session.completedAt = attempt.createdAt; }
    }
    return true;
  }
  function book(entries, words) {
    const dictionary = new Map(words.map(word => [key(word[0]), word])), records = new Map();
    const attempts = entries.filter(([name, value]) => name.startsWith('attempt:') && value?.question?.module === 'words')
      .map(([, value]) => value).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const attempt of attempts) {
      const question = attempt.question, wordKey = key(question.id.slice(question.id.indexOf(':') + 1));
      if (!wordKey || !['correct', 'wrong', 'uncertain'].includes(attempt.status)) continue;
      if (attempt.status === 'correct') {
        if (attempt.counted && records.has(wordKey)) Object.assign(records.get(wordKey), { open: false, fullyUnknown: false, status: 'correct', reviewedAt: attempt.createdAt });
        continue;
      }
      const fallback = question.kind === 'meaning' ? [wordKey, question.expected?.join('；') || attempt.expected || '', '', ''] : [question.expected?.[0] || wordKey, question.prompt || '', '', ''];
      const entry = records.get(wordKey) || { key: wordKey, word: clone(dictionary.get(wordKey) || fallback), mistakes: 0 };
      entry.open = true; entry.mistakes += attempt.status === 'wrong' ? 1 : 0;
      entry.fullyUnknown = Boolean(attempt.unknown || attempt.reasons?.includes('完全不会'));
      entry.status = attempt.status; entry.reasons = attempt.reasons || []; entry.answer = attempt.answer ?? attempt.recognized ?? '';
      entry.updatedAt = attempt.createdAt; records.set(wordKey, entry);
    }
    return [...records.values()].sort((a, b) => Number(b.fullyUnknown) - Number(a.fullyUnknown) || Number(b.open) - Number(a.open) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  root.WordPractice = Object.freeze({ create, current, record, book });
})(typeof window === 'undefined' ? globalThis : window);
