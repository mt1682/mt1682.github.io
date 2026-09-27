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
  const pages = await extractPages(filename);
  return pages.map(page => page.text).join('\n');
}
async function extractPages(filename) {
  if (!window.pdfjsLib) throw new Error('PDF読み込みライブラリを読み込めませんでした。通信状況を確認して再読み込みしてください。');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument(encodeURI(filename)).promise, pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await pdf.getPage(n).then(page => page.getTextContent());
    pages.push({ page: n, text: keepPdfLineBreaks(content.items) });
  }
  return pages;
}
function keepPdfLineBreaks(items) {
  let previousY = null, result = '';
  items.forEach(item => {
    const y = item.transform?.[5];
    if (previousY !== null && y !== undefined && Math.abs(y - previousY) > 2) result += '\n';
    else if (result && !result.endsWith('\n')) result += ' ';
    result += item.str;
    if (item.hasEOL) result += '\n';
    previousY = y;
  });
  return result.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function parseQuestions(problemPages, answerText) {
  // 問題PDFには表紙・注意事項・解答用紙も含まれます。角括弧付きの「【問n】」だけを
  // 問題の開始点として扱い、本文ではない部分を出題対象から外します。
  const answerMap = parseAnswers(answerText);
  let sequentialId = 0;
  return problemPages.flatMap(({ text, page }) => {
    // PDFによっては問題番号の字形がテキスト化されないため、番号・閉じ括弧を必須にしない。
    const chunks = text.split(/(?=【\s*問(?:\s*[0-9０-９]+)?)/).filter(part => /^【\s*問/.test(part.trim()));
    return chunks.map(chunk => {
      const detected = chunk.match(/^【\s*問\s*([0-9０-９]+)/);
      const num = detected ? toNumber(detected[1]) : ++sequentialId;
      if (detected) sequentialId = Math.max(sequentialId + 1, num);
      const parsed = splitQuestionAndOptions(chunk);
      return { id: num, page, text: parsed.text, options: parsed.options, answer: answerMap.get(num), explanation: explanationFor(num, answerText) };
    }).filter(q => q.id && q.text.length > 20);
  }).sort((a, b) => a.id - b.id);
}
function parseAnswers(text) {
  const map = new Map();
  const chunks = text.split(/(?=【\s*問(?:\s*[0-9０-９]+)?)/).filter(part => /^【\s*問/.test(part.trim()));
  chunks.forEach((chunk, index) => {
    const number = chunk.match(/^【\s*問\s*([0-9０-９]+)/);
    const id = number ? toNumber(number[1]) : index + 1;
    const answer = chunk.match(/(?:正解|解答)\s*[：:]?\s*([1-4１-４])/);
    if (answer) map.set(id, toNumber(answer[1]) - 1);
  });
  return map;
}
function splitQuestionAndOptions(chunk) {
  const clean = chunk.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  // 「ア〜エ」の組合せを選ぶ形式（1 ア・イ / 2 ア・ウ …）を末尾から取得する。
  const combo = [...clean.matchAll(/(?:^|\s)([1-4１-４])\s*([ア-エ](?:[・、,\s]*[ア-エ]){0,3})(?=\s+[1-4１-４]\s*[ア-エ]|$)/g)];
  if (combo.length >= 4) {
    const choices = combo.slice(-4);
    const start = choices[0].index;
    return { text: clean.slice(0, start).trim(), options: choices.map(x => `${x[1]}. ${x[2].replace(/\s/g, '')}`) };
  }
  // 肢そのものを選ぶ形式（1. … / 2. …）にも対応する。
  const direct = [...clean.matchAll(/(?:^|\s)([1-4１-４])[\.．、]\s*([\s\S]*?)(?=\s+[1-4１-４][\.．、]\s|$)/g)];
  if (direct.length >= 4) {
    const choices = direct.slice(-4), start = choices[0].index;
    return { text: clean.slice(0, start).trim(), options: choices.map(x => `${x[1]}. ${x[2].trim()}`) };
  }
  // 表記ゆれで選択肢を分離できない場合も問題を欠落させない。原文の改行を保ったまま
  // 1〜4の回答番号を提示し、右側の該当PDFページで選択肢を確認できるようにする。
  return { text: clean, options: ['1', '2', '3', '4'] };
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
  const [problem, answer] = await Promise.all([extractPages(item.problem), extractText(item.answer)]);
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
    document.querySelector('#pdf-link').href = encodeURI(item.problem); renderQuestion();
  } catch (error) { document.querySelector('#load-message').textContent = error.message; } finally { button.disabled = false; }
}
function renderQuestion() {
  selected = null; const q = questions[index], pct = ((index + 1) / questions.length) * 100;
  document.querySelector('#progress').textContent = `QUESTION ${String(index + 1).padStart(2, '0')} / ${questions.length}`;
  document.querySelector('#progress-bar').style.width = `${pct}%`; document.querySelector('#question-number').textContent = `QUESTION ${String(q.id).padStart(2, '0')}`;
  document.querySelector('#pdf-viewer').src = encodeURI(book().problem) + `#page=${q.page}`;
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
