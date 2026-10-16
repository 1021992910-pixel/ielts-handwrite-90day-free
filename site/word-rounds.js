(function (root) {
  const key = word => word.toLowerCase();
  // Finish each scheduled word once before selecting a new review round.
  function select(rounds, direction, words, stats, today, preferred = null) {
    const valid = new Map(words.map(word => [key(word[0]), word]));
    let round = rounds[direction];
    if (!round || !Array.isArray(round.pending)) round = rounds[direction] = { number: 0, pending: [] };
    round.pending = [...new Set(round.pending)].filter(value => valid.has(value));
    if (!round.pending.length) {
      const due = words.filter(([word]) => { const stat = stats[word]; return !stat || stat.rating === 0 || !stat.next || stat.next <= today; });
      const pool = due.length ? due : words;
      round.pending = [...new Set(pool.map(word => key(word[0])))];
      for (let i = round.pending.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); [round.pending[i], round.pending[j]] = [round.pending[j], round.pending[i]];
      }
      round.number = (Number(round.number) || 0) + 1;
    }
    // Restore an unfinished question; completed words cannot jump back into this round.
    const selected = preferred && round.pending.includes(key(preferred)) ? key(preferred) : round.pending[0];
    if (selected && round.pending[0] !== selected) round.pending = [selected, ...round.pending.filter(value => value !== selected)];
    return valid.get(selected);
  }
  function complete(rounds, direction, word) {
    const round = rounds[direction];
    if (Array.isArray(round?.pending)) round.pending = round.pending.filter(value => value !== key(word));
  }
  root.WordRounds = Object.freeze({ select, complete });
})(typeof window === 'undefined' ? globalThis : window);
