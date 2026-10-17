const APP_KEY = "ieltsHandwriteStudyV1";
const todayKey = () => new Date().toISOString().slice(0, 10);
const defaultState = {
  startDate: todayKey(),
  completions: {},
  wordStats: {},
  wordReviewed: 0,
  spellingStats: {},
  spellingReviewed: 0,
  spellingSetIndex: 0,
  templatesPracticed: 0,
  templates: [],
  readingText: "",
  readingSteps: {},
  customWords: []
};

function loadState() {
  try { return { ...defaultState, ...JSON.parse(localStorage.getItem(APP_KEY) || "{}") }; }
  catch { return { ...defaultState }; }
}
let state = loadState();
state.spellingStats ||= {};
function saveState() { localStorage.setItem(APP_KEY, JSON.stringify(state)); }

const coreWords = [
  ["environment", "环境", "protect the environment", "We should protect the environment."],
  ["education", "教育", "access to education", "Everyone should have access to education."],
  ["benefit", "好处；使受益", "bring benefits", "Exercise brings many health benefits."],
  ["challenge", "挑战", "face a challenge", "Young people face many challenges."],
  ["community", "社区", "local community", "The project helps the local community."],
  ["develop", "发展；开发", "develop a skill", "Reading helps people develop useful skills."],
  ["improve", "改善；提高", "improve performance", "Practice can improve performance."],
  ["increase", "增加", "increase rapidly", "The number increased rapidly."],
  ["reduce", "减少", "reduce waste", "We need to reduce plastic waste."],
  ["important", "重要的", "play an important role", "Family plays an important role in education."],
  ["available", "可获得的", "widely available", "Online courses are widely available."],
  ["provide", "提供", "provide support", "Schools should provide more support."],
  ["require", "需要；要求", "require attention", "This problem requires immediate attention."],
  ["responsibility", "责任", "take responsibility", "People should take responsibility for their choices."],
  ["opportunity", "机会", "create opportunities", "Technology creates new opportunities."],
  ["experience", "经历；经验", "gain experience", "Students can gain practical experience."],
  ["quality", "质量", "quality of life", "Public parks improve quality of life."],
  ["society", "社会", "modern society", "Technology affects modern society."],
  ["government", "政府", "local government", "The local government funds the service."],
  ["technology", "技术", "modern technology", "Modern technology changes how we work."],
  ["communication", "沟通", "communication skills", "Teamwork improves communication skills."],
  ["traditional", "传统的", "traditional culture", "Museums help preserve traditional culture."],
  ["convenient", "方便的", "more convenient", "Online shopping is more convenient."],
  ["healthy", "健康的", "healthy lifestyle", "Sleep is part of a healthy lifestyle."],
  ["pollution", "污染", "air pollution", "Public transport can reduce air pollution."],
  ["solution", "解决办法", "practical solution", "We need a practical solution."],
  ["support", "支持", "financial support", "Some students need financial support."],
  ["research", "研究", "conduct research", "Scientists conduct research on climate change."],
  ["effect", "影响；效果", "positive effect", "Exercise has a positive effect on health."],
  ["reason", "原因", "main reason", "Cost is the main reason for this change."],
  ["result", "结果", "as a result", "The roads were busy; as a result, we were late."],
  ["choice", "选择", "make a choice", "Students need to make an informed choice."],
  ["change", "改变", "significant change", "The chart shows a significant change."],
  ["compare", "比较", "compared with", "Sales rose compared with last year."],
  ["similar", "相似的", "similar to", "The two figures are similar."],
  ["different", "不同的", "different from", "City life is different from village life."],
  ["advantage", "优点", "main advantage", "Flexibility is the main advantage."],
  ["disadvantage", "缺点", "major disadvantage", "Cost is a major disadvantage."],
  ["participate", "参与", "participate in", "Many students participate in sports."],
  ["achieve", "达到；实现", "achieve a goal", "A clear plan helps us achieve a goal."]
];

const speakingPrompts = [
  ["Part 1", "What do you usually do in the morning?"],
  ["Part 1", "Do you enjoy learning English? Why?"],
  ["Part 1", "What is your hometown like?"],
  ["Part 1", "How often do you use a tablet?"],
  ["Part 1", "What kind of music do you like?"],
  ["Part 2", "Describe a person who has helped you learn something."],
  ["Part 2", "Describe a place in your city that you enjoy visiting."],
  ["Part 3", "How has technology changed the way people learn?"],
  ["Part 3", "What makes a good teacher?"],
  ["Part 3", "Should cities provide more public spaces?"]
];
const writingPrompts = [
  ["基础句", "用 5–8 个英语句子介绍你的日常作息。"],
  ["基础段落", "写一个段落：你为什么想学好英语？"],
  ["基础段落", "写一个段落：描述你喜欢的学习方式。"],
  ["Task 2 单段", "Some people believe that technology makes learning easier. Write one paragraph explaining your view."],
  ["Task 2 单段", "Public transport should be improved in large cities. Write one paragraph with a reason and an example."]
];

const defaultTemplates = [
  { id: "t-home", type: "口语 Part 1", title: "我的家乡", keywords: "small city / riverside / friendly / convenient", structure: "直接回答 → 两个特点 → 个人感受", chunks: "I come from...\nWhat I like most is...\nIt is a good place to...", answer: "I come from a small city near a river. What I like most is that the people are friendly and daily life is quite convenient. It is a good place to live because it feels peaceful and familiar.", review: "new" },
  { id: "t-study", type: "口语 Part 1", title: "学习英语", keywords: "future / communicate / daily practice / confidence", structure: "回答 → 原因 → 当前行动", chunks: "I am learning English because...\nIt can help me...\nAt the moment, I...", answer: "I am learning English because I want more choices in the future. It can help me communicate with more people and understand useful information. At the moment, I practise every day to build my confidence.", review: "new" },
  { id: "t-opinion", type: "写作 Task 2", title: "观点段基本结构", keywords: "point / explain / example / link", structure: "观点 → 解释 → 例子 → 回扣", chunks: "One important reason is that...\nThis means that...\nFor example,...\nTherefore,...", answer: "One important reason is that [point]. This means that [explanation]. For example, [personal or social example]. Therefore, [link back to the question].", review: "new" }
];
if (!state.templates.length) { state.templates = defaultTemplates; saveState(); }

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 1900);
}
function localDay(date = new Date()) { const d = new Date(date); d.setHours(0,0,0,0); return d; }
function planDay() { return Math.min(90, Math.max(1, Math.floor((localDay() - localDay(state.startDate)) / 86400000) + 1)); }
function planWeek() { return Math.min(12, Math.ceil(planDay() / 7)); }
function dayRecord() {
  const key = todayKey();
  if (!state.completions[key]) state.completions[key] = {};
  return state.completions[key];
}

const taskDefs = [
  ["words", "单词与搭配", "30–40 个新词 + 到期复习"],
  ["reading", "阅读", "句子主干、段落大意、同义替换"],
  ["listening", "听力", "机经拼写 20 个 + 盲听、对照、跟读"],
  ["speaking", "口语", "准备、录音、回听、重说"],
  ["writing", "语法与写作", "正确句子、检查、重写"]
];

function showView(name) {
  if (name === 'templates') name = 'speaking';
  if (name !== 'speaking' && 'speechSynthesis' in window) speechSynthesis.cancel();
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => document.querySelectorAll("handwriting-pad").forEach(p => p.resize && p.resize()), 80);
}
document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => showView(btn.dataset.view));
document.querySelectorAll("[data-jump]").forEach(btn => btn.onclick = () => showView(btn.dataset.jump));

function renderToday() {
  const day = planDay(), week = planWeek(), rec = dayRecord();
  document.getElementById("todayDate").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
  document.getElementById("dayTitle").textContent = `第 ${day} 天 · ${week <= 4 ? "建立基础" : week <= 8 ? "专项训练" : "稳定提分"}`;
  const list = document.getElementById("todayTasks"); list.innerHTML = "";
  taskDefs.forEach(([id, title, desc]) => {
    const row = document.createElement("label"); row.className = `task-item ${rec[id] ? "done" : ""}`;
    row.innerHTML = `<input type="checkbox" ${rec[id] ? "checked" : ""} aria-label="完成${title}"><span><strong>${title}</strong><small>${desc}</small></span><button type="button">进入</button>`;
    row.querySelector("input").onchange = (e) => { rec[id] = e.target.checked; saveState(); renderToday(); renderProgress(); };
    row.querySelector("button").onclick = (e) => { e.preventDefault(); showView(id); };
    list.appendChild(row);
  });
  const done = taskDefs.filter(([id]) => rec[id]).length, percent = done * 20;
  document.getElementById("dailyPercent").textContent = `${percent}%`;
  document.getElementById("dailyRing").style.setProperty("--p", percent);
  document.getElementById("todayStat").textContent = `${done} / 5`;
  document.getElementById("totalStat").textContent = `${Object.values(state.completions).reduce((n,d) => n + Object.values(d).filter(Boolean).length, 0)} 项`;
  const phase = week <= 4 ? ["基础期", "发音、基础语法、高频词和简短句子。"] : week <= 8 ? ["技能期", "题型、场景、口语结构和写作段落。"] : ["提分期", "限时单项、错题回填、脱稿表达和重写。"];
  document.getElementById("phaseTitle").textContent = `${phase[0]} · 第 ${week} 周`;
  document.getElementById("phaseDescription").textContent = phase[1];
  document.getElementById("phaseBar").style.width = `${day / 90 * 100}%`;
  const dates = Object.entries(state.completions).filter(([,d]) => Object.values(d).filter(Boolean).length > 0).map(([k]) => k).sort().reverse();
  let streak = 0, cursor = localDay();
  if (!dates.includes(todayKey())) cursor.setDate(cursor.getDate() - 1);
  while (dates.includes(cursor.toISOString().slice(0,10))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  document.getElementById("streakStat").textContent = `${streak} 天`;
}

let direction = "en-zh", currentWord = null, wordToday = 0;
let wordSource = state.wordPracticeSource === 'review' ? 'review' : 'daily', wordBook = [], bookRenderVersion = 0;
let wordModeBusy = false;
state.wordSessions ||= {};
function words() { return [...new Map([...coreWords, ...state.customWords].map(word => [word[0].toLowerCase(), word])).values()]; }
function sessionKey(source = wordSource, mode = direction) { return `${source}:${mode}`; }
function wordSession() { return state.wordSessions[sessionKey()]; }
function createWordSession(preferred, adoptLegacy = false) {
  const all = wordSource === 'review' ? wordBook.map(entry => entry.word) : words();
  const session = window.WordPractice.create(all, { id: crypto.randomUUID(), direction, source: wordSource, day: todayKey(), limit: wordSource === 'review' ? all.length : 30, preferred, adoptLegacy });
  state.wordSessions[sessionKey()] = session; return session;
}
function nextWord(preferred = null) {
  let session = wordSession();
  if (!session?.id || !Array.isArray(session.items) || (wordSource === 'daily' && session.phase === 'done' && session.day !== todayKey())) session = createWordSession(preferred, !Object.keys(state.wordSessions).length);
  state.wordPracticeSource = wordSource; state.wordDirection = direction;
  document.querySelectorAll('[data-word-source]').forEach(button => button.classList.toggle('active', button.dataset.wordSource === wordSource));
  document.getElementById('wordBookPanel').classList.toggle('hidden', wordSource !== 'review');
  currentWord = window.WordPractice.current(session);
  const done = !currentWord;
  document.getElementById('wordPracticeGrid').classList.toggle('hidden', done);
  document.getElementById('wordSessionComplete').classList.toggle('hidden', !done);
  document.getElementById('newWordSession').classList.toggle('hidden', wordSource !== 'daily');
  document.getElementById('wordBookCatalog').open = done;
  if (done) {
    document.getElementById('wordCompleteTitle').textContent = session.items.length ? '本次练习完成' : '错词本暂时没有待练词';
    document.getElementById('wordCompleteDetail').textContent = session.items.length ? `本次 ${session.items.length} 个词均已独立答对，共完成 ${session.attempts} 次作答。` : '以后答错或选择“完全不会”的词，会自动收录在这里。';
    saveState(); return;
  }
  state.activeWord = currentWord[0]; state.wordDirection = direction; saveState();
  document.getElementById("wordPrompt").textContent = direction === "en-zh" ? currentWord[0] : currentWord[1];
  document.getElementById("wordMeaning").textContent = direction === "en-zh" ? currentWord[1] : currentWord[0];
  document.getElementById("wordCollocation").textContent = currentWord[2] || "暂无搭配";
  document.getElementById("wordExample").textContent = currentWord[3] || "请用这个词造句。";
  document.getElementById("wordAnswer").classList.add("hidden");
  document.getElementById("wordWorkspace").setQuestion({
    id: `${direction}:${currentWord[0].toLowerCase()}`, module: "words", kind: direction === "en-zh" ? "meaning" : "spelling",
    prompt: direction === "en-zh" ? currentWord[0] : currentWord[1],
    expected: direction === "en-zh" ? currentWord[1].split(/[；;,，、/]+/).filter(Boolean) : [currentWord[0]],
    title: direction === "en-zh" ? "输入中文意思" : "输入英文单词",
    sessionId: session.id, sessionKey: sessionKey(), turnId: `${session.id}:${session.round}:${currentWord[0].toLowerCase()}`,
    adoptLegacy: session.adoptLegacy && session.round === 1 && session.legacyWord === currentWord[0].toLowerCase()
  });
  renderWordMeta();
}
function renderWordMeta() {
  const session = wordSession(); if (!session) return;
  document.getElementById("wordProgress").textContent = session.phase === 'first' ? `首轮 ${session.seen.length} / ${session.items.length}` : `巩固第 ${session.round - 1} 轮 · 剩余 ${session.pending.length} 词`;
  document.getElementById("wordDue").textContent = `本次已答对 ${session.mastered.length} / ${session.items.length}`;
}

async function refreshWordBook() {
  const version = ++bookRenderVersion;
  try {
    const entries = await window.HandwritingNotebook.export(); if (version !== bookRenderVersion) return;
    wordBook = window.WordPractice.book(entries, words());
    document.getElementById('wordBookCount').textContent = String(wordBook.length);
    document.getElementById('wordBookSummary').textContent = `共 ${wordBook.length} 词 · 待巩固 ${wordBook.filter(entry => entry.open).length} 词`;
    const list = document.getElementById('wordBookList'); list.replaceChildren();
    if (!wordBook.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = '目前没有待练错词。原作答记录仍保留在“答题记录”中。'; list.append(empty); }
    for (const entry of wordBook) {
      const card = document.createElement('article'); card.className = `wordbook-item${entry.fullyUnknown ? ' fully-unknown' : ''}`;
      const title = document.createElement('h4'), badge = document.createElement('span'), meaning = document.createElement('p'), detail = document.createElement('p');
      title.textContent = entry.word[0]; badge.className = 'wordbook-badge'; badge.textContent = entry.fullyUnknown ? '完全不会' : entry.status === 'correct' ? '本次已答对' : '需要复习';
      meaning.textContent = entry.word[1]; detail.className = 'muted'; detail.textContent = `${entry.reasons.length ? entry.reasons.join('、') + ' · ' : ''}答错 ${entry.mistakes} 次`;
      card.append(title, badge, meaning, detail); list.append(card);
    }
  } catch { toast('错词本暂未读取成功，请稍后重试。原记录没有清除。'); throw new Error('Wordbook unavailable'); }
}
function applyWordAttempt(attempt) {
  const session = state.wordSessions[attempt.question.sessionKey || sessionKey()];
  if (!window.WordPractice.record(session, attempt)) return false;
  const word = attempt.question.id.slice(attempt.question.id.indexOf(':') + 1);
  if (attempt.status !== 'uncertain') {
    const correct = attempt.status === 'correct', next = new Date(); next.setDate(next.getDate() + (correct ? 4 : 1));
    state.wordStats[word] = { rating: correct ? 3 : 0, next: next.toISOString().slice(0, 10), last: todayKey(), reasons: attempt.reasons };
    state.wordReviewed++; wordToday++;
  }
  if (session.phase === 'done' && session.source === 'daily') dayRecord().words = true;
  saveState(); return true;
}
async function initializeWords() {
  try {
    const entries = await window.HandwritingNotebook.export();
    // Replay persisted completions after an interrupted save, once per attempt ID.
    for (const [, attempt] of entries.filter(([key, value]) => key.startsWith('attempt:') && value?.question?.sessionId && (value.counted || value.skipped)).sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt))) applyWordAttempt(attempt);
    await refreshWordBook(); nextWord(state.activeWord); window.WordPracticeReady = true;
  } catch { toast('单词记录未能读取，请检查存储权限后刷新。'); }
}
document.querySelectorAll('[data-word-source]').forEach(button => button.onclick = async () => {
  const workspace = document.getElementById('wordWorkspace');
  if (wordModeBusy || workspace.busy || wordSource === button.dataset.wordSource && !(wordSource === 'review' && wordSession()?.phase === 'done')) return;
  wordModeBusy = true;
  try { await workspace.savePromise; await refreshWordBook(); }
  catch { wordModeBusy = false; return; }
  wordSource = button.dataset.wordSource;
  if (wordSource === 'review') {
    direction = 'zh-en';
    const previous = wordSession();
    const open = new Set(wordBook.map(entry => entry.key));
    if (!previous || previous.phase === 'done' || [...previous.pending, ...previous.failed].some(key => !open.has(key)) || previous.attempts === 0 && wordBook.some(entry => !previous.items.some(word => word[0].toLowerCase() === entry.key))) createWordSession();
  }
  document.querySelectorAll('[data-direction]').forEach(item => item.classList.toggle('active', item.dataset.direction === direction)); nextWord();
  wordModeBusy = false;
});
document.getElementById('newWordSession').onclick = () => { if (wordSource === 'daily' && wordSession()?.phase === 'done') { createWordSession(); nextWord(); } };
document.querySelectorAll("[data-direction]").forEach(btn => btn.onclick = () => {
  if (wordModeBusy || document.getElementById("wordWorkspace").busy) return;
  if (direction === btn.dataset.direction) return;
  direction = btn.dataset.direction; document.querySelectorAll("[data-direction]").forEach(b => b.classList.toggle("active", b === btn)); nextWord();
});
document.getElementById("wordWorkspace").addEventListener("answer-graded", () => document.getElementById("wordAnswer").classList.remove("hidden"));
document.getElementById("wordWorkspace").addEventListener("answer-invalidated", () => document.getElementById("wordAnswer").classList.add("hidden"));
document.getElementById("wordWorkspace").addEventListener("answer-skipped", event => { applyWordAttempt(event.detail); nextWord(); refreshWordBook().catch(() => {}); });
document.getElementById("wordWorkspace").addEventListener("answer-repeat", event => {
  const question = event.detail; direction = question.kind === "meaning" ? "en-zh" : "zh-en";
  document.querySelectorAll("[data-direction]").forEach(button => button.classList.toggle("active", button.dataset.direction === direction));
  nextWord(question.id.slice(question.id.indexOf(":") + 1));
});
document.getElementById("wordWorkspace").addEventListener("answer-completed", event => {
  applyWordAttempt(event.detail); renderToday(); renderProgress(); nextWord(); refreshWordBook().catch(() => {});
});
document.getElementById("speakWord").onclick = () => {
  if (!currentWord) return; const utter = new SpeechSynthesisUtterance(currentWord[0]); utter.lang = "en-GB"; speechSynthesis.cancel(); speechSynthesis.speak(utter);
};

document.querySelectorAll(".complete-module").forEach(btn => btn.onclick = () => {
  dayRecord()[btn.dataset.module] = true; saveState(); renderToday(); renderProgress(); toast("已记录今日完成");
});

document.getElementById("wordImport").onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return; const text = await file.text();
  const parsed = text.split(/\r?\n/).map(line => {
    const [pair, coll = "", ex = ""] = line.split("|"); const parts = pair?.split(/[=,、]/); return parts && parts.length >= 2 ? [parts[0].trim(), parts.slice(1).join(" ").trim(), coll.trim(), ex.trim()] : null;
  }).filter(Boolean);
  const map = new Map(state.customWords.map(w => [w[0].toLowerCase(), w])); parsed.forEach(w => map.set(w[0].toLowerCase(), w)); state.customWords = [...map.values()]; saveState(); nextWord(); toast(`已导入 ${parsed.length} 个单词`);
};

const spellingSets = window.IELTSSpellingData?.sets || [];
let spellingMode = "audio", currentSpelling = null, spellingToday = 0, spellingQueue = [];

function spellingKey(word) { return word.toLowerCase(); }
function activeSpellingSet() { return spellingSets[state.spellingSetIndex] || spellingSets[0]; }
function rebuildSpellingQueue() {
  const set = activeSpellingSet();
  if (!set) { spellingQueue = []; return; }
  const due = set.words.filter(([word]) => {
    const stat = state.spellingStats[spellingKey(word)];
    return !stat || !stat.next || stat.next <= todayKey() || stat.rating !== "correct";
  });
  const pool = due.length ? due : set.words;
  spellingQueue = [...pool].sort(() => Math.random() - .5);
}
function renderSpellingMeta() {
  const set = activeSpellingSet();
  document.getElementById("spellingSetNote").textContent = set?.note || "";
  document.getElementById("spellingProgress").textContent = `今日 ${spellingToday} / 20`;
  const wrong = Object.values(state.spellingStats).filter(s => s.rating === "wrong" || s.rating === "close").length;
  document.getElementById("spellingWrong").textContent = `错词 ${wrong}`;
}
function playCurrentSpelling() {
  if (!currentSpelling) return;
  const utter = new SpeechSynthesisUtterance(currentSpelling[0]);
  utter.lang = "en-GB"; utter.rate = .82;
  speechSynthesis.cancel(); speechSynthesis.speak(utter);
}
function nextSpelling() {
  if (!spellingQueue.length) rebuildSpellingQueue();
  currentSpelling = spellingQueue.shift() || activeSpellingSet()?.words[0] || null;
  if (!currentSpelling) return;
  document.getElementById("spellingPrompt").textContent = spellingMode === "audio" ? "点击播放，听清后手写英文" : currentSpelling[1];
  document.getElementById("spellingEnglish").textContent = currentSpelling[0];
  document.getElementById("spellingChinese").textContent = currentSpelling[1];
  document.getElementById("spellingAnswer").classList.add("hidden");
  document.getElementById("spellingWorkspace").setQuestion({ id: `${spellingMode}:${currentSpelling[0].toLowerCase()}`, module: "listening", kind: "spelling", prompt: spellingMode === "audio" ? "听写英文单词" : currentSpelling[1], expected: [currentSpelling[0]], title: "机经拼写 · 本题答题纸" });
  renderSpellingMeta();
}
function initSpelling() {
  const select = document.getElementById("spellingSetSelect");
  spellingSets.forEach((set, index) => {
    const option = document.createElement("option"); option.value = index; option.textContent = set.title; select.appendChild(option);
  });
  if (state.spellingSetIndex >= spellingSets.length) state.spellingSetIndex = 0;
  select.value = String(state.spellingSetIndex);
  select.onchange = () => {
    state.spellingSetIndex = Number(select.value); saveState(); spellingQueue = []; nextSpelling();
  };
  document.querySelectorAll("[data-spelling-mode]").forEach(button => button.onclick = () => {
    spellingMode = button.dataset.spellingMode;
    document.querySelectorAll("[data-spelling-mode]").forEach(item => item.classList.toggle("active", item === button));
    nextSpelling();
  });
  document.getElementById("playSpelling").onclick = playCurrentSpelling;
  document.getElementById("spellingWorkspace").addEventListener("answer-graded", () => document.getElementById("spellingAnswer").classList.remove("hidden"));
  document.getElementById("spellingWorkspace").addEventListener("answer-invalidated", () => document.getElementById("spellingAnswer").classList.add("hidden"));
  document.getElementById("spellingWorkspace").addEventListener("answer-skipped", () => { nextSpelling(); toast("已暂存，本题不计对错，可在答题记录中重练"); });
  document.getElementById("spellingWorkspace").addEventListener("answer-repeat", event => {
    const question = event.detail, word = question.expected[0];
    spellingMode = question.id.startsWith("audio:") ? "audio" : "zh-en";
    document.querySelectorAll("[data-spelling-mode]").forEach(button => button.classList.toggle("active", button.dataset.spellingMode === spellingMode));
    const setIndex = spellingSets.findIndex(set => set.words.some(item => item[0] === word));
    if (setIndex >= 0) { state.spellingSetIndex = setIndex; select.value = String(setIndex); saveState(); }
    const entry = activeSpellingSet()?.words.find(item => item[0] === word);
    if (entry) { spellingQueue.unshift(entry); nextSpelling(); }
  });
  document.getElementById("spellingWorkspace").addEventListener("answer-completed", event => {
    const attempt = event.detail, rating = attempt.status === "correct" ? "correct" : "wrong", next = new Date();
    next.setDate(next.getDate() + (rating === "correct" ? 4 : 1));
    state.spellingStats[spellingKey(attempt.question.expected[0])] = { rating, next: next.toISOString().slice(0, 10), last: todayKey(), reasons: attempt.reasons };
    state.spellingReviewed = (state.spellingReviewed || 0) + 1; spellingToday++;
    if (spellingToday >= 20) dayRecord().listening = true;
    saveState(); renderToday(); renderProgress();
    nextSpelling();
  });
  nextSpelling();
}

const audioPlayer = document.getElementById("audioPlayer");
document.getElementById("audioFile").onchange = (e) => { const file = e.target.files[0]; if (!file) return; audioPlayer.src = URL.createObjectURL(file); document.getElementById("audioName").textContent = file.name; };
document.querySelectorAll("[data-speed]").forEach(btn => btn.onclick = () => { audioPlayer.playbackRate = Number(btn.dataset.speed); document.querySelectorAll("[data-speed]").forEach(b => b.classList.toggle("active", b === btn)); });
document.getElementById("backTen").onclick = () => { audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10); };

const readingText = document.getElementById("readingText"); readingText.value = state.readingText || "";
document.getElementById("saveReading").onclick = () => { state.readingText = readingText.value; saveState(); toast("阅读材料已保存"); };
document.getElementById("readingFocus").onclick = () => { const p = document.querySelector(".reading-panel"); p.classList.toggle("focus-mode"); document.getElementById("readingFocus").textContent = p.classList.contains("focus-mode") ? "退出大字" : "大字阅读"; };
document.querySelectorAll("[data-reading-step]").forEach(box => { box.checked = !!state.readingSteps[box.dataset.readingStep]; box.onchange = () => { state.readingSteps[box.dataset.readingStep] = box.checked; saveState(); }; });

let speakingIndex = 0, activeSpeakingTemplate = null;
function renderSpeaking(template = null) {
  const p = template ? [String(template.type || '').replace(/^口语\s*/, ''), templateManager.promptFor(template)] : speakingPrompts[speakingIndex % speakingPrompts.length];
  document.getElementById('speakingPart').textContent = p[0]; document.getElementById('speakingPrompt').textContent = p[1];
  const sample = window.SpeakingExamples[speakingPrompts.findIndex(item => item[1] === p[1])];
  document.getElementById('speakingExample').open = false;
  document.getElementById('speakingExample').classList.toggle('hidden', !sample);
  document.getElementById('speakingExampleText').textContent = sample?.[0] || '';
  document.getElementById('speakingExampleMeaning').textContent = sample?.[1] || '';
}
function readLocalEnglish(text) {
  if (!text.trim()) { toast('请先填写答案。'); return; }
  if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) { toast('当前浏览器不支持朗读。'); return; }
  const voice = speechSynthesis.getVoices().find(item => item.localService && /^en[-_]/i.test(item.lang));
  if (!voice) { toast('本机暂未提供英语朗读，可先阅读示例。'); return; }
  const utterance = new SpeechSynthesisUtterance(text); utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = .9;
  utterance.onerror = () => toast('朗读未完成，请检查设备声音。'); speechSynthesis.cancel(); speechSynthesis.speak(utterance);
}
document.getElementById('listenSpeakingExample').onclick = () => readLocalEnglish(document.getElementById('speakingExampleText').textContent);
document.getElementById('nextPrompt').onclick = () => { if (recorder?.state === 'recording') { toast('请先停止录音。'); return; } activeSpeakingTemplate = null; speakingIndex++; renderSpeaking(); };
let timerSeconds = 0, timerHandle = null;
function timerText() { document.getElementById("speakingTimer").textContent = `${String(Math.floor(timerSeconds/60)).padStart(2,"0")}:${String(timerSeconds%60).padStart(2,"0")}`; }
document.getElementById("timerButton").onclick = function() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; this.textContent = "重新计时"; }
  else { timerSeconds = 0; timerText(); timerHandle = setInterval(() => { timerSeconds++; timerText(); }, 1000); this.textContent = "停止计时"; }
};
let recorder = null, recordChunks = [];
document.getElementById("recordButton").onclick = async function() {
  if (recorder?.state === "recording") { recorder.stop(); return; }
  try {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); recordChunks = [];
    recorder = new MediaRecorder(stream); recorder.ondataavailable = e => recordChunks.push(e.data);
    recorder.onstop = () => { const blob = new Blob(recordChunks, { type: recorder.mimeType }); const player = document.getElementById('recordingPlayback'); if (player.src.startsWith('blob:')) URL.revokeObjectURL(player.src); player.src = URL.createObjectURL(blob); stream.getTracks().forEach(t => t.stop()); this.classList.remove("recording"); this.textContent = "● 再录一遍"; document.getElementById("recordStatus").textContent = "录音已完成，可回放或再录一遍。"; };
    recorder.start(); this.classList.add("recording"); this.textContent = "■ 停止录音";
  } catch { toast("需要允许网站使用麦克风"); }
};

let writingIndex = 0;
function renderWriting() { const p = writingPrompts[writingIndex % writingPrompts.length]; document.getElementById("writingType").textContent = p[0]; document.getElementById("writingPrompt").textContent = p[1]; }
document.getElementById("nextWriting").onclick = () => { writingIndex++; renderWriting(); };

const templateManager = window.createTemplateManager({ state, saveState, todayKey, toast, renderProgress,
  promptFor: template => template.prompt || ({ 't-home': speakingPrompts[2][1], 't-study': speakingPrompts[1][1] }[template.id]) || template.title || '',
  onPractice: template => {
    if (recorder?.state === 'recording') { toast('请先停止录音。'); return false; }
    activeSpeakingTemplate = template.id; renderSpeaking(template); showView('speaking');
    document.querySelector('.speaking-card').scrollIntoView({ block: 'start', behavior: 'smooth' }); return true;
  },
  getPractice: () => ({ id: activeSpeakingTemplate, type: '口语 ' + document.getElementById('speakingPart').textContent, prompt: document.getElementById('speakingPrompt').textContent }),
  readAloud: readLocalEnglish
});

function renderProgress() {
  const completedDays = Object.values(state.completions).filter(d => Object.values(d).filter(Boolean).length > 0).length;
  const completedTasks = Object.values(state.completions).reduce((n,d) => n + Object.values(d).filter(Boolean).length, 0);
  document.getElementById("progressDays").textContent = completedDays;
  document.getElementById("progressTasks").textContent = completedTasks;
  document.getElementById("progressWords").textContent = (state.wordReviewed || 0) + (state.spellingReviewed || 0);
  document.getElementById("progressTemplates").textContent = state.templatesPracticed;
  document.getElementById("startDate").value = state.startDate;
  const current = planWeek(), roadmap = document.getElementById("roadmap"); roadmap.innerHTML = "";
  for (let w=1; w<=12; w++) { const el = document.createElement("div"); el.className = `week-row ${w < current ? "done" : w === current ? "current" : ""}`; const phase = w <= 4 ? "基础期" : w <= 8 ? "技能期" : "提分期"; el.innerHTML = `<strong>第 ${w} 周</strong><span>${phase}</span><span>${w < current ? "已经过" : w === current ? "当前" : "未开始"}</span>`; roadmap.appendChild(el); }
}
document.getElementById("saveStartDate").onclick = () => { const v = document.getElementById("startDate").value; if (!v) return; state.startDate = v; saveState(); renderToday(); renderProgress(); toast("起始日期已保存"); };
document.getElementById("exportData").onclick = async () => {
  try {
    await Promise.all([...document.querySelectorAll("handwriting-pad")].map(pad => { pad.up(); return pad.savePromise; }));
    const data = { version: 2, state, pads: {}, notebook: await window.HandwritingNotebook.export() };
    Object.keys(localStorage).filter(k => k.startsWith(`${APP_KEY}:`) && !k.includes("review")).forEach(k => data.pads[k] = localStorage.getItem(k));
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.download = `雅思学习备份-${todayKey()}.json`; a.href = url; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast("笔迹、批改记录和进度已导出");
  } catch { toast("备份未完成，请检查存储权限后重试"); }
};
document.getElementById("importData").onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text()); if (!data.state || typeof data.state !== "object") throw new Error();
    if (data.notebook) await window.HandwritingNotebook.import(data.notebook);
    state = { ...defaultState, ...data.state }; saveState();
    Object.entries(data.pads || {}).filter(([k, v]) => k.startsWith(`${APP_KEY}:`) && !k.includes("review") && typeof v === "string").forEach(([k,v]) => localStorage.setItem(k,v));
    location.reload();
  } catch { toast("备份文件无法识别或存储失败，请重试"); }
};
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
direction = state.wordDirection === "zh-en" ? "zh-en" : "en-zh";
document.querySelectorAll("[data-direction]").forEach(button => button.classList.toggle("active", button.dataset.direction === direction));
renderToday(); initializeWords(); initSpelling(); renderSpeaking(); renderWriting(); templateManager.render(); renderProgress();
