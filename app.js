/* PDF text is read in the browser. Nothing (answers or study history) leaves this device. */
const BOOKS = [
  ['law', '応用答練｜宅建業法', '26宅建_応答答練(_宅建業法)問題.pdf', '26宅建_応答答練(_宅建業法)解答.pdf'],
  ['civil', '応用答練｜民法等', '26宅建_応用答練（民法等）問題.pdf', '26宅建_応用答練（民法等）解説.pdf'],
  ['rules', '応用答練｜法令・その他', '26宅建_応用答練_法令・その他_問題.pdf', '26宅建_応用答練_法令・その他_解説.pdf'],
  ['mock', '全国公開模試', '26宅建_全国公開模試_問題.pdf', '26宅建_全国公開模試_解説.pdf'],
  ['final1', '直前答練 ①', '26宅建_直前答練①_問題・解答.pdf'],
  ['final2', '直前答練 ②', '26宅建_直前答練②_問題・解答.pdf'],
  ['final3', '直前答練 ③', '26宅建_直前答練③_問題・解答_.pdf'],
  ['final4', '直前答練 ④', '26宅建_直前答練④_問題・解答.pdf']
].map(([id, title, problem, answer = problem]) => ({ id, title, problem, answer }));
let loaded = {}, questions = [], index = 0, answers = [], selected = null;
let mistakes = JSON.parse(localStorage.getItem('takken-study-mistakes') || '[]');

document.addEventListener('DOMContentLoaded', () => {
  const select = document.querySelector('#pdf-select');
  BOOKS.forEach(book => select.add(new Option(book.title, book.id)));
  select.addEventListener('change', refreshHome);
  document.querySelector('#mode-select').addEventListener('change', refreshHome);
  document.querySelector('#start-button').addEventListener('click', startQuiz);
  document.querySelector('#judge-button').addEventListener('click', judge);
  document.querySelector('#next-button').addEventListener('click', next);
  refreshHome();
});
function book() { return BOOKS.find(item => item.id === document.querySelector('#pdf-select').value); }
function refreshHome() {
  const item = book(), mode = document.querySelector('#mode-select').value;
  document.querySelector('#pdf-description').textContent = `問題PDF：${item.problem}`;
  document.querySelector('#start-wrap').hidden = mode !== 'all';
  const start = document.querySelector('#start-select'); start.innerHTML = '';
  const count = loaded[item.id]?.questions.length || 50;
  for (let n = 1; n <= count; n++) start.add(new Option(`問${n} から始める`, n));
  document.querySelector('#saved-count').textContent = mistakes.filter(x => x.book === item.id).length;
}
async function extractText(filename) {
  if (!window.pdfjsLib) throw new Error('PDF読み込みライブラリを読み込めませんでした。通信状況を確認して再読み込みしてください。');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument(encodeURI(filename)).promise, pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await pdf.getPage(n).then(page => page.getTextContent());
    pages.push(content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim());
  }
  return pages.join('\n');
}
function parseQuestions(text, answerText) {
  const chunks = text.split(/(?=問\s*[0-9０-９]+\s)/).filter(part => /問\s*[0-9０-９]+/.test(part));
  const answerMap = new Map();
  [...answerText.matchAll(/問\s*([0-9０-９]+)[^\d１-４]{0,25}([1-4１-４])/g)].forEach(match => answerMap.set(toNumber(match[1]), toNumber(match[2]) - 1));
  return chunks.map((chunk, i) => {
    const num = toNumber((chunk.match(/問\s*([0-9０-９]+)/) || [, i + 1])[1]);
    const pieces = chunk.split(/(?=(?:肢)?[1-4１-４][\.．、\s])/).map(x => x.trim()).filter(Boolean);
    const optionStart = pieces.findIndex(x => /^(?:肢)?[1１][\.．、\s]/.test(x));
    const options = optionStart < 0 ? [] : pieces.slice(optionStart, optionStart + 4);
    return { id: num, text: (optionStart < 0 ? chunk : pieces.slice(0, optionStart).join(' ')).trim(), options, answer: answerMap.get(num), explanation: explanationFor(num, answerText) };
  }).filter(q => q.options.length >= 2);
}
function explanationFor(num, text) {
  const re = new RegExp(`問\\s*${num}(?=\\s|[：:]|　)[\\s\\S]{0,850}(?=問\\s*${num + 1}(?=\\s|[：:]|　)|$)`);
  const value = text.match(re)?.[0] || '';
  return value.length > 18 ? value : '解説は原文PDFで確認してください。';
}
function toNumber(value) { return Number(String(value).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248))); }
async function ensureLoaded(item) {
  if (loaded[item.id]) return loaded[item.id];
  document.querySelector('#load-message').textContent = 'PDFから問題と解答を読み込んでいます…';
  const [problem, answer] = await Promise.all([extractText(item.problem), extractText(item.answer)]);
  const parsed = parseQuestions(problem, answer);
  if (!parsed.length) throw new Error('問題を認識できませんでした。PDFを別タブで開いて内容をご確認ください。');
  loaded[item.id] = { questions: parsed }; refreshHome(); return loaded[item.id];
}
async function startQuiz() {
  const item = book(), button = document.querySelector('#start-button'); button.disabled = true;
  try {
    const data = await ensureLoaded(item), mode = document.querySelector('#mode-select').value;
    let source = [...data.questions];
    if (mode === 'random') source = source.sort(() => Math.random() - .5).slice(0, 10);
    if (mode === 'review') source = source.filter(q => mistakes.some(m => m.book === item.id && m.id === q.id));
    if (mode === 'all') source = source.filter(q => q.id >= Number(document.querySelector('#start-select').value));
    if (!source.length) throw new Error(mode === 'review' ? 'この問題集には復習待ちの問題がありません。' : '出題できる問題がありません。');
    questions = source; index = 0; answers = []; show('quiz'); document.querySelector('#quiz-title').textContent = item.title;
    document.querySelector('#pdf-viewer').src = encodeURI(item.problem) + '#page=1'; document.querySelector('#pdf-link').href = encodeURI(item.problem); renderQuestion();
  } catch (error) { document.querySelector('#load-message').textContent = error.message; } finally { button.disabled = false; }
}
function renderQuestion() {
  selected = null; const q = questions[index], pct = ((index + 1) / questions.length) * 100;
  document.querySelector('#progress').textContent = `QUESTION ${String(index + 1).padStart(2, '0')} / ${questions.length}`;
  document.querySelector('#progress-bar').style.width = `${pct}%`; document.querySelector('#question-number').textContent = `QUESTION ${String(q.id).padStart(2, '0')}`;
  document.querySelector('#question-text').textContent = q.text; const wrap = document.querySelector('#options'); wrap.innerHTML = '';
  q.options.forEach((text, option) => { const label = document.createElement('label'); label.className = 'option'; label.innerHTML = `<input type="radio" name="answer"><span class="option-text"></span><div class="memo-row"><small>一時メモ</small></div>`; label.querySelector('.option-text').textContent = text;
    label.querySelector('input').addEventListener('change', () => { selected = option; [...wrap.children].forEach(el => el.classList.remove('selected')); label.classList.add('selected'); document.querySelector('#judge-button').disabled = false; });
    ['正','正?','?','誤?','誤'].forEach(note => { const b = document.createElement('button'); b.type = 'button'; b.className = 'memo'; b.dataset.note = note; b.textContent = note; b.onclick = event => { event.preventDefault(); event.stopPropagation(); label.querySelectorAll('.memo').forEach(x => x.classList.remove('active')); b.classList.toggle('active'); }; label.querySelector('.memo-row').append(b); }); wrap.append(label); });
  document.querySelector('#judge-button').disabled = true; document.querySelector('#answer-card').hidden = true;
}
function judge() {
  const q = questions[index]; if (selected === null) return; if (q.answer === undefined) { alert('正答をPDFから取得できませんでした。原文PDFの解答をご確認ください。'); return; }
  const correct = selected === q.answer; answers.push({ q, selected, correct });
  mistakes = mistakes.filter(m => !(m.book === book().id && m.id === q.id)); if (!correct) mistakes.push({ book: book().id, id: q.id }); localStorage.setItem('takken-study-mistakes', JSON.stringify(mistakes));
  const card = document.querySelector('#answer-card'); card.hidden = false; card.classList.toggle('wrong', !correct); document.querySelector('#answer-state').textContent = correct ? 'CORRECT' : 'INCORRECT'; document.querySelector('#answer-heading').textContent = correct ? '正解です！' : `正解は ${q.options[q.answer] || `肢${q.answer + 1}`} です`;
  document.querySelector('#answer-explanation').textContent = q.explanation; document.querySelector('#judge-button').disabled = true; document.querySelector('#next-button').textContent = index === questions.length - 1 ? '結果を見る →' : '次の問題へ →';
}
function next() { if (++index < questions.length) renderQuestion(); else renderResults(); }
function renderResults() { show('results'); const count = answers.filter(a => a.correct).length, rate = Math.round(count / answers.length * 100); document.querySelector('#score-rate').textContent = `${rate}%`; document.querySelector('#score-detail').textContent = `${answers.length}問中 ${count}問正解`;
  document.querySelector('#review-list').innerHTML = answers.map((a, i) => `<article class="review"><div class="review-top"><span class="badge ${a.correct ? '' : 'wrong'}">${a.correct ? '● 正解' : '● 不正解'}</span><span>QUESTION ${String(a.q.id).padStart(2,'0')}</span></div><h3>${escapeHtml(a.q.text)}</h3><p>あなたの回答：${escapeHtml(a.q.options[a.selected])}<br>正解：${escapeHtml(a.q.options[a.q.answer])}</p><div class="explanation">${escapeHtml(a.q.explanation)}</div></article>`).join(''); }
function escapeHtml(text = '') { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function show(id) { document.querySelectorAll('.screen').forEach(x => x.classList.toggle('active', x.id === id)); window.scrollTo(0, 0); }
function showHome() { show('home'); refreshHome(); }
function confirmExit() { if (confirm('今回の途中経過は結果に保存されません。設定に戻りますか？')) showHome(); }
