(() => {
'use strict';
const E = window.ManabiEngine;
const T = KoboI18n.t;
const EN = KoboI18n.lang === 'en';
const UI = window.KoboUI || null;
const KG = () => window.KoboGame || null;
const GAME = 'manabi';
const SAVE_KEY = 'kusoge.manabi.save', REP_KEY = 'kusoge.manabi.rep', HOWTO_KEY = 'kusoge.manabi.howto';
const REPO_ISSUES = 'https://github.com/Seg1GPT0Jpn/nejihodoki/issues/new';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
function h(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids == null ? [] : kids)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

// ================================================================ state
let save = readSave();
let index = null, indexErr = false;
let today = E.dayNum();
let view = { cr: save.set.cr || 'JH', sub: save.set.sub || null, g: save.set.g || 0 };
let screen = 'home';
let L = null;       // lesson: { eng (Lesson), pool, kind, ui:{...}, xp, startXp, startedAt }
let M = null;       // mock exam
const reports = readReports();
function readSave() { let raw = null; try { raw = JSON.parse(store.get(SAVE_KEY) || 'null'); } catch (e) {} return E.normSave(raw); }
function readReports() { try { const o = JSON.parse(store.get(REP_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
const nowDate = () => new Date(window.__manabiNow || Date.now());
function persist() { store.set(SAVE_KEY, JSON.stringify(save)); }
function emit(type, p) { const g = KG(); if (g) g.emit(type, p); }

// ================================================================ KaTeX (cdnjs, pinned; raw TeX if it never loads)
let katexState = window.katex ? 'ok' : 'loading';
function loadKatex() {
  if (window.katex) { katexState = 'ok'; return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js';
  s.integrity = 'sha512-LQNxIMR5rXv7o+b1l8+N1EZMfhG7iFZ9HhnbJkTp4zjNr5Wvst75AqUeFDxeRUa7l5vEDyUiAip//r+EFLLCyA==';
  s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.async = true;
  s.onload = () => { katexState = window.katex ? 'ok' : 'failed'; document.documentElement.setAttribute('data-katex', katexState); rerenderMath(); };
  s.onerror = () => { katexState = 'failed'; document.documentElement.setAttribute('data-katex', 'failed'); };
  document.head.appendChild(s);
}
function renderMath(span) {
  const tex = span.getAttribute('data-tex'), disp = span.classList.contains('md');
  if (window.katex) {
    try { window.katex.render(tex, span, { displayMode: disp, throwOnError: false, strict: 'ignore', trust: false, output: 'html' }); span.classList.remove('raw'); span.classList.add('done'); return; } catch (e) {}
  }
  span.textContent = disp ? '$$' + tex + '$$' : '$' + tex + '$'; span.classList.add('raw');
}
function rerenderMath() { document.querySelectorAll('.m:not(.done)').forEach(renderMath); }

// ================================================================ rich text → DOM
function rich(src, o) {
  o = o || {};
  const box = h('span', { class: 'rich', lang: 'ja' });
  for (const t of E.tokenize(src)) {
    if (t.k === 't') box.append(t.v);
    else if (t.k === 'm') { const s = h('span', { class: 'm' + (t.d ? ' md' : ''), 'data-tex': t.v }); renderMath(s); box.append(s); }
    else if (t.k === 'u') box.append(h('u', { text: t.v }));
    else if (t.k === 'b') box.append(h('span', { class: 'blank', 'aria-label': T('空欄') }, t.v && t.v.trim() ? t.v : '　'));
    else if (t.k === 'k') box.append(h('span', { class: 'mk' }, [h('u', { text: t.v }), h('sup', { text: t.m })]));
  }
  return box;
}
function svgImg(f) {
  return h('figure', { class: 'fig' }, [
    h('span', { class: 'pic' }, h('img', { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.s), alt: f.a || '' })),
    f.c ? h('figcaption', null, rich(f.c)) : null,
  ]);
}
function tableEl(tb) {
  const t = h('table');
  if (tb.c) t.append(h('caption', null, rich(tb.c)));
  if (tb.h) t.append(h('thead', null, h('tr', null, tb.h.map(c => h('th', null, rich(c))))));
  t.append(h('tbody', null, tb.r.map(r => h('tr', null, r.map(c => h('td', null, rich(c)))))));
  return h('div', { class: 'tbl' }, t);
}
function stimEl(st) {
  const box = h('div', { class: 'stim', tabindex: '0' });
  if (st.ti) box.append(h('div', { class: 'st' }, rich(st.ti)));
  if (st.t === 'ls') box.append(h('div', { class: 'st' }, T('放送文') + '（' + T('音声はありません。放送文を読んで答えよう。') + '）'));
  if (st.c) box.append(rich(st.c));
  if (st.f) box.append(svgImg(st.f));
  if (st.tb) box.append(tableEl(st.tb));
  if (st.g && st.g.length) box.append(h('div', { class: 'hint' }, st.g.map(g => g[0] + '：' + g[1]).join(' / ')));
  return box;
}

// ================================================================ index / chunks
async function loadIndex() {
  try { index = await E.loadIndex(new URL('data/', location.href).href); indexErr = false; }
  catch (e) { indexErr = true; index = null; }
}
const chunkUrl = f => f;
async function chunk(file) { return E.loadChunk(new URL('data/', location.href).href, file); }
const subjectName = id => { const s = index && index.subjects.find(x => x.id === id); return s ? (EN ? s.en : s.ja) : id; };
const gradeLabel = (cr, g) => (cr === 'JH' ? T('中{n}', { n: g }) : T('高{n}', { n: g }));
function allSets() {
  const out = [];
  if (!index) return out;
  for (const c of index.courses) for (const s of c.subjects) for (const u of s.units) for (const st of u.sets) out.push(Object.assign({ unit: u, unitId: u.id, cr: c.id, sub: s.id }, st));
  return out;
}
function setStats(set) { return E.boxStats(E.parseBoxes(save.b[set.id], set.h, set.n), set.n, today); }
function unitStats(u, si) {
  const o = { n: u.n, fresh: 0, due: 0, learning: 0, mastered: 0 };
  if (si != null && u.sm) { // 小単元 si の問題だけ数える（箱は単元のセットごとに保存）
    o.n = 0; const s = u.sets[0], b = E.parseBoxes(save.b[s.id], s.h, s.n);
    for (let i = 0; i < s.n; i++) { if (u.sm[i] !== String(si)) continue; o.n++; const c = E.card(b, i); if (!c.box) o.fresh++; else { if (c.box >= 4) o.mastered++; else o.learning++; if (E.isDue(c, today)) o.due++; } }
    return o;
  }
  for (const s of u.sets) { const x = setStats(s); for (const k of ['fresh', 'due', 'learning', 'mastered']) o[k] += x[k]; }
  return o;
}
const subIdx = (u, si) => { const o = []; for (let i = 0; i < u.sm.length; i++) if (u.sm[i] === String(si)) o.push(i); return o; };

// ================================================================ header chips
const ICON = {
  lock: '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.500A1.500 1.500 0 0 1 20 11.500v8a1.500 1.500 0 0 1-1.500 1.500h-13A1.500 1.500 0 0 1 4 19.500v-8A1.500 1.500 0 0 1 5.500 10zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>',
  learn: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10z"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.200M4 4v5h5"/></svg>',
  quests: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.900 6.100 6.600.8-4.900 4.600 1.300 6.600L12 16.800 6.100 20.100l1.300-6.600L2.500 8.900l6.600-.8z"/></svg>',
  league: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 3h10v3h3v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 15.900V18h3v3H8v-3h3v-2.100A5 5 0 0 1 8.400 13H8a4 4 0 0 1-4-4V6h3zM6 8v1a2 2 0 0 0 1.200 1.800A9 9 0 0 1 7 9V8zm12 0h-1v1a9 9 0 0 1-.2 1.800A2 2 0 0 0 18 9z"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4.500"/><path d="M3.500 21a8.500 8.500 0 0 1 17 0z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9zM15.500 8.500a5 5 0 0 1 0 7M18 6a8.500 8.500 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M3 9v6h4l5 4V5L7 9z"/></svg>',
  crown: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M3 8l4.500 4L12 5l4.500 7L21 8l-2 11H5z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8-5.300-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 10c0 5.700-8 11-8 11z"/></svg>',
};
const FLAME = '<svg viewBox="0 0 24 24" width="34" height="34" fill="#ff8a1f" aria-hidden="true"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.4-1.8-1-2.6C16.5 9.5 19 11.5 19 15a7 7 0 0 1-14 0c0-5 5-6 7-13z"/></svg>';
const TABS = [['learn', '学ぶ'], ['review', '練習'], ['quests', 'クエスト'], ['league', 'リーグ'], ['profile', 'プロフィール']];
let tab = 'learn';
const G = window.ManabiGen, Fx = window.ManabiFx;
function renderBadge() {
  const sub = courseSub(view.cr), b = $('cBadge'); b.setAttribute('data-sub', sub); b.innerHTML = badgeSvg(sub); b.setAttribute('aria-label', T('コース') + '：' + (specialSub(view.cr) ? (G.COURSES.find(c => c.id === view.cr)[EN ? 'en' : 'ja']) : subjectName(view.sub)));
}
function renderChips() {
  try { renderBadge(); } catch (e) {}
  try { schedulePush(); } catch (e) {}
  const st = E.streakOf(save.d, today), xp = E.xpToday(save, today);
  $('nStreak').textContent = st;
  $('cStreak').title = T('れんぞく {n}日', { n: st });
  $('cStreak').setAttribute('aria-label', T('れんぞく {n}日', { n: st }));
  $('nGoal').textContent = xp + '/' + save.goal;
  $('cGoal').classList.toggle('met', xp >= save.goal);
  $('cGoal').title = xp >= save.goal ? T('今日のもくひょうをたっせい！') : T('今日 {a}/{b}', { a: xp, b: save.goal });
  $('cGem').title = T('ジェム'); $('cGem').setAttribute('aria-label', T('ジェム') + ' ' + save.gm); $('nGem').textContent = save.gm; $('cHeart').hidden = !save.hm; $('nHeart').textContent = save.hr;
}
function setTitle(t, content) { const e = $('ttl'); e.textContent = t || T('まなびの工房'); if (content) e.setAttribute('lang', 'ja'); else e.removeAttribute('lang'); }
function setBack(fn) { // fn: null → ゲーム一覧へ。関数 → その動作
  const a = $('backLink');
  if (!fn) { a.href = '../'; a.removeAttribute('role'); a.onclick = null; a.onkeydown = null; a.setAttribute('aria-label', T('ゲーム一覧へ戻る')); return; }
  a.removeAttribute('href'); a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0'); a.setAttribute('aria-label', T('もどる'));
  a.onclick = e => { e.preventDefault(); fn(); };
  a.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
}
function show(node, tabs) { const v = $('view'); v.replaceChildren(node); $('tabs').hidden = !tabs; if (Fx.motion()) { node.classList.remove('enter'); void node.offsetWidth; node.classList.add('enter'); } }
function drawTabs() {
  const nav = $('tabs'); nav.replaceChildren();
  for (const [id, ja] of TABS) {
    const dot = id === 'quests' && questsDone() < 3 && questsClaimable() ? h('span', { class: 'dot' }) : null;
    nav.append(h('button', { type: 'button', 'data-tab': id, 'aria-current': id === tab ? 'page' : null, 'aria-label': T(ja), onclick: () => { Fx.sfx.tap(); goTab(id); } }, [h('span', { html: ICON[id] }), h('span', { text: T(ja) }), dot]));
  }
}
function goTab(id) { tab = id; goHome(); }
const COURSE_IDS = ['JH', 'HS', 'mathlab', 'englab', 'kobun', 'science', 'social'];
const specialSub = cr => ({ kobun: 'kobun', science: 'science', social: 'social', mathlab: 'math', englab: 'english' }[cr] || null);

// ================================================================ prefs / day state / streak freeze
function ensureDay() {
  if (save.wg) { const r = settleWager(); if (r && UI) setTimeout(() => UI.toast(r === 'won' ? T('かけに勝った！ジェムが2倍でもどったよ') : T('かけは、おしくも失敗…'), { type: r === 'won' ? 'ok' : 'danger' }), 600); }
  if (save.ds.d !== today) save.ds = { d: today };
  if (save.dq.d !== today) save.dq = { d: today, c: [0, 0, 0] };
}
function applyFreezes() { // 昨日が空いていて、フリーズがあれば自動で使う（最大2日ぶん）
  let used = 0;
  for (let k = 0; k < 2; k++) {
    const y = today - 1 - k;
    if (save.d.includes(y) || save.fz <= 0 || !save.d.some(x => x < y)) break;
    if (!save.d.includes(y - 1) && !save.d.includes(y + 1)) break; // つながっていないなら使わない
    save.d.push(y); save.fd.push(y); save.fz--; used++;
  }
  if (used) { save.d.sort((a, b) => a - b); persist(); }
  return used;
}
const MOTIVE = ['ひとつずつ、すこしずつ。きょうも1レッスン！', 'まちがえた問題は、じつはいちばんのチャンス。', '5分だけでも、ちゃんと前に進んでるよ。', 'できなかった問題が、あしたのできるに変わる。', 'れんぞくは、むりのないペースで続けよう。', 'きょうの自分は、きのうより少し賢い！', '声に出して読むと、頭にのこりやすいよ。', 'むずかしいと感じたら、レベルが上がるサイン。', 'ゆっくりでも止まらなければ、ゴールに着く。', 'ほめ上手になろう。まずは自分から！'];
const motive = () => T(MOTIVE[(today + save.st.ls) % MOTIVE.length]);
const QDEF = [
  { id: 'xp', n: [20, 30, 40], ja: 'XPを{n}かせぐ', get: d => d.xp || 0 },
  { id: 'ls', n: [1, 2, 3], ja: 'レッスンを{n}回クリア', get: d => d.ls || 0 },
  { id: 'ok', n: [8, 12, 16], ja: '{n}問せいかいする', get: d => d.ok || 0 },
  { id: 'perfect', n: [1], ja: 'ノーミスでレッスンをクリア', get: d => d.perfect || 0 },
  { id: 'rev', n: [1], ja: 'ふくしゅうレッスンをする', get: d => d.rev || 0 },
  { id: 'sp', n: [1], ja: '古文・理科ラボ・社会ラボのレッスンをする', get: d => d.sp || 0 },
];
function questsFor(day) {
  const r = E.rng(E.seedOf('quest|' + day)), pool = E.shuffle(QDEF, r).slice(0, 3);
  return pool.map(d => { const n = d.n[Math.floor(r() * d.n.length)]; return { id: d.id, n, text: T(d.ja, { n }), get: d.get }; });
}
function questsDone() { ensureDay(); return questsFor(today).filter(q => q.get(save.ds) >= q.n).length; }
function questsClaimable() { ensureDay(); return questsFor(today).some((q, i) => q.get(save.ds) >= q.n && !save.dq.c[i]); }
const bumpDay = o => { ensureDay(); for (const k of Object.keys(o)) save.ds[k] = (save.ds[k] || 0) + o[k]; };

// ================================================================ 学ぶ
const crownOf = u => { // 道の上の「王冠」0〜5（通常の小単元は、やった問題と習得した問題から）。飛び級で通ったところは、少なくとも1
  const c = crownBase(u); return save.jp[u.id] ? Math.max(1, c) : c;
};
const crownBase = u => {
  if (u.special) return save.cw[u.id] || 0;
  const st = unitStats(u.unit, u.si), pr = st.n ? (st.n - st.fresh) / st.n : 0, ms = st.n ? st.mastered / st.n : 0;
  if (pr === 0) return 0;
  return Math.max(1, Math.min(5, Math.floor(7 * (0.6 * pr + 0.4 * ms))));
};
function goHome() {
  screen = 'home'; L = null; M = null; DL = null; ensureDay();
  setBack(null); renderChips(); drawTabs();
  if (!index) {
    show(indexErr ? h('div', { id: 'main' }, h('div', { class: 'err' }, [h('p', { text: T('読み込めませんでした。通信を確かめて、もう一度ためしてください。') }), h('button', { class: 'btn primary', type: 'button', onclick: () => { indexErr = false; goHome(); loadIndex().then(goHome); } }, T('もう一度よみこむ'))])) : h('div', { id: 'main' }, h('div', { class: 'err', text: '…' })), true);
    return;
  }
  ({ learn: viewLearn, review: viewReview, quests: viewQuests, league: viewLeague, profile: viewProfile })[tab]();
  if (store.get(HOWTO_KEY) == null) showHowto();
}
function viewLearn() {
  setTitle();
  const special = specialSub(view.cr);
  const app = $('app'); let main;
  if (!COURSE_IDS.includes(view.cr)) view.cr = 'JH';
  const courseUnits = special ? G.UNITS.filter(u => u.course === view.cr).map(u => Object.assign({ special: 1, sub: special }, u)) : null;
  let units = [], groups = [];
  const main0 = h('div', { id: 'main' }); main = main0;
  // コース
  const names = { JH: T('中学'), HS: T('高校'), mathlab: T('数学ラボ'), englab: T('英語ラボ'), kobun: T('古文・漢文'), science: T('理科ラボ'), social: T('社会ラボ') };
  main.append(h('div', { class: 'seg', role: 'group', 'aria-label': T('コース') }, COURSE_IDS.map(c => h('button', { type: 'button', 'data-cr': c, 'aria-pressed': String(c === view.cr), onclick: () => { Fx.sfx.tap(); view.cr = c; view.g = 0; saveView(); goHome(); } }, names[c]))));
  if (!special) {
    const course = index.courses.find(c => c.id === view.cr) || index.courses[0]; view.cr = course.id;
    if (!course.subjects.find(s => s.id === view.sub)) view.sub = (course.subjects.find(s => s.id === 'english') || course.subjects[0]).id;
    const subj = course.subjects.find(s => s.id === view.sub);
    const grades = [...new Set(subj.units.map(u => u.g))].sort();
    if (view.g && !grades.includes(view.g)) view.g = 0;
    app.dataset.sub = view.sub;
    main.append(h('div', { class: 'subs', role: 'group' }, course.subjects.map(s => h('button', { type: 'button', 'data-sub': s.id, 'aria-pressed': String(s.id === view.sub), onclick: () => { view.sub = s.id; view.g = 0; saveView(); goHome(); } }, subjectName(s.id)))));
    main.append(h('div', { class: 'grades', role: 'group' }, [0, ...grades].map(g => h('button', { type: 'button', 'data-g': g, 'aria-pressed': String(g === view.g), onclick: () => { view.g = g; saveView(); goHome(); } }, g ? gradeLabel(view.cr, g) : T('すべて')))));
    const us = subj.units.filter(u => !view.g || u.g === view.g);
    let sn = 0;
    for (const u of us) {
      sn++;
      const subs = u.subs && u.subs.length ? u.subs : [{ id: 'a', ti: u.ti, goal: u.dm || '', n: u.n }];
      const nodes = subs.map((sb, si) => ({ id: u.id + '-' + sb.id, ti: sb.ti || u.ti, goal: sb.goal || u.dm || '', unit: u, si, sub: u.sub, n: sb.n, ja: true }));
      groups.push({ title: T('セクション') + sn + '　' + gradeLabel(view.cr, u.g), co: u.co || '', sub: '', ja: true, unit: u, units: nodes });
      units = units.concat(nodes);
    }
  } else {
    app.dataset.sub = special;
    units = courseUnits; let last = null;
    for (const u of units) { if (u.sec !== last) { last = u.sec; groups.push({ title: T(u.sec), co: '', sub: '', units: [] }); } groups[groups.length - 1].units.push(u); }
    main.append(h('div', { class: 'hint', style: 'margin:0 0 6px', text: T('AI作成・未レビュー') + '：' + T('まちがいを見つけたら「まちがいを報告」を押してね。') }));
  }
  if (!units.length) main.append(h('div', { class: 'err', text: T('この学年にはまだ単元がありません') }));
  main.insertBefore(h('div', { class: 'note', id: 'motive', style: 'margin:0 0 6px;text-align:center' }, motive()), main.firstChild.nextSibling);
  const run = readRun();
  if (run) main.insertBefore(h('button', { class: 'banner review', id: 'btnResume', type: 'button', onclick: () => resumeRun() }, [h('span', { class: 't' }, [h('b', { text: T('つづきから') }), h('small', { text: T('とちゅうのレッスンがあります') })]), h('span', { class: 'pill', text: T('再開') })]), main.firstChild.nextSibling);
  { const xpT = E.xpToday(save, today); main.insertBefore(h('div', { class: 'goalstrip', id: 'goalStrip' }, [h('span', { text: T('今日の目標') }), h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.min(100, 100 * xpT / save.goal) + '%' })), h('b', { text: xpT >= save.goal ? '✓' : xpT + '/' + save.goal })]), main.firstChild); }
  const crowns = units.map(crownOf);
  let curIdx = crowns.findIndex(c => c === 0); if (curIdx < 0) curIdx = units.length - 1;
  const stateOf = i => (i === curIdx && crowns[i] === 0 ? 'cur' : crowns[i] >= 1 ? 'done' : i === curIdx ? 'cur' : 'locked');
  const allIds = units.map(u => u.id);
  let idx = 0, lastSec = null, secN = 0;
  for (const g of groups) {
    if (g.unit) { // 通常のコース：セクション（学年・コース）→ 単元 → レベル（小単元）
      const key = g.unit.g + '|' + g.co;
      if (key !== lastSec) { lastSec = key; secN++; main.append(h('div', { class: 'sect' }, [h('small', { text: T('セクション') + secN }), h('b', null, [gradeLabel(view.cr, g.unit.g), g.co ? h('span', { lang: 'ja', text: '　' + g.co }) : null])])); }
      main.append(h('div', { class: 'unitbar' }, [h('b', { lang: 'ja' }, rich(g.unit.ti)), g.unit.dm && g.unit.dm !== g.unit.ti ? h('small', { lang: 'ja', text: g.unit.dm }) : null]));
    } else main.append(h('div', { class: 'sect' }, [h('b', null, g.title)]));
    const path = h('div', { class: 'path' });
    let allDone = true;
    for (const u of g.units) { const i = idx++; if (crowns[i] < 1) allDone = false; path.append(nodeEl(u, i, crowns[i], stateOf(i), allIds, i)); }
    const ckey = g.unit ? 'c-' + g.unit.id : 'c-' + view.cr + '-' + (g.title || '').replace(/[^A-Za-z0-9\u3040-\u9fff]/g, '').length + '-' + idx;
    path.append(chestEl(ckey.replace(/[^A-Za-z0-9._-]/g, '_'), allDone, idx));
    main.append(path);
  }
  const f = h('div', { class: 'foot' }, [
    h('p', { id: 'credit', text: index.credit }),
    h('p', { id: 'notReviewed', text: T('問題はAIがつくったもので、まだ専門家の確認を受けていません。まちがいを見つけたら「まちがいを報告」を押してください。') }),
    h('p', { text: T('{n}問', { n: index.total + index.examTotal }) }),
  ]);
  main.append(f);
  show(main, true);
  // 「いまのところへ」ボタン
  const jump = h('button', { class: 'pbtn g', id: 'jumpCur', type: 'button', 'aria-label': T('いまのところへ'), hidden: true, onclick: () => { const el = main.querySelector('.unit.cur'); if (el) el.scrollIntoView({ block: 'center', behavior: Fx.motion() ? 'smooth' : 'auto' }); } }, h('span', { html: ICON.up }));
  $('view').append(jump);
  const upd = () => { const el = main.querySelector('.unit.cur'); if (!el) { jump.hidden = true; return; } const r = el.getBoundingClientRect(), m = main.getBoundingClientRect(); jump.hidden = r.bottom > m.top && r.top < m.bottom; };
  main.addEventListener('scroll', upd, { passive: true }); setTimeout(upd, 60);
  if (!view.scrolled) { view.scrolled = true; const el = main.querySelector('.unit.cur'); if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 30); }
}
function nodeEl(u, i, cl, state, allIds, pos) {
  const off = Math.round(Math.sin(i * 1.15) * 62);
  const R = 46, C = 2 * Math.PI * R, frac = cl / 5;
  const ring = h('span', { html: '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="50" rx="' + R + '" ry="' + R + '" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="6"/><ellipse cx="50" cy="50" rx="' + R + '" ry="' + R + '" fill="none" stroke="var(--py)" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (C * frac).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>' });
  const lid = 'lbl-' + u.id, cid = 'crw-' + u.id;
  const btn = h('button', { class: 'go', type: 'button', 'aria-labelledby': lid + ' ' + cid, onclick: () => { Fx.sfx.tap(); openPop(u, cl, state, allIds, pos); } }, [ring.firstChild, state === 'locked' ? h('span', { class: 'lockic', html: ICON.lock }) : h('span', { text: String(i + 1) }), h('span', { class: 'sr', id: cid, text: T('王冠') + cl + (state === 'locked' ? '（' + T('まだロック中') + '）' : '') })]);
  const wrap = h('span', { class: 'nodewrap' }, [btn, cl ? h('span', { class: 'crowns', 'aria-hidden': 'true' }, [h('span', { html: ICON.crown }), String(cl)]) : null, state === 'cur' ? h('span', { class: 'start', text: T('START') }) : null]);
  return h('div', { class: 'unit ' + state, 'data-unit': u.id, style: 'transform:translateX(' + off + 'px)' }, [wrap, h('div', { class: 'lbl', id: 'lbl-' + u.id }, [u.special ? h('span', { text: T(u.ti) }) : h('span', { lang: 'ja', text: u.ti }), h('small', { lang: u.special ? null : 'ja', text: u.special ? T(u.goal || '') : (u.goal || '') })])]);
}
function openPop(u, cl, state, allIds, pos) {
  closePop();
  const st = u.special ? null : unitStats(u.unit, u.si), locked = state === 'locked';
  const kids = [
    u.special ? h('h2', { id: 'popT', text: T(u.ti) }) : h('h2', { id: 'popT', lang: 'ja', text: u.ti }),
    h('p', null, [u.special ? T(u.goal || '') : h('span', { lang: 'ja', text: u.goal || '' }), st ? '　' + T('{n}問 ・ 習得 {m}', { n: st.n, m: st.mastered }) : '']),
    h('div', { class: 'row' }, [locked ? h('span', { class: 'lockic', style: 'color:var(--kb-dim)', html: ICON.lock }) : h('span', { class: 'crowns', style: 'position:static;transform:none' }, [h('span', { html: ICON.crown }), String(cl)])]),
  ];
  if (locked) {
    kids.push(h('p', { id: 'lockMsg', class: 'lockmsg', text: T('このレッスンは、前のレッスンをクリアすると開きます。') }));
    kids.push(h('button', { class: 'btn primary', id: 'popCur', type: 'button', onclick: () => { closePop(); const el = document.querySelector('.unit.cur'); if (el) el.scrollIntoView({ block: 'center' }); } }, T('いまのレッスンへ')));
    kids.push(h('button', { class: 'btn b', id: 'popJump', type: 'button', style: 'margin-top:10px', onclick: () => { closePop(); startJump(u, allIds, pos); } }, T('飛び級テストにちょうせん')));
    kids.push(h('p', { class: 'note', text: T('3回まちがえる前に、10問を解ききれば合格！ここまでのレッスンが ぜんぶクリアになるよ。') }));
  } else kids.push(h('button', { class: 'btn sc', id: 'popStart', type: 'button', onclick: () => { closePop(); u.special ? startSpecial(u) : startLesson(u.unit, u.si); } }, T('スタート')));
  kids.push(h('button', { class: 'btn sub', id: 'popClose', type: 'button', style: 'margin-top:10px', onclick: () => closePop() }, T('とじる')));
  const bg = h('div', { class: 'sheetbg', id: 'popBg', onclick: e => { if (e.target === bg) closePop(); } }, h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'popT', 'data-sub': u.sub }, kids));
  document.body.append(bg); const f = $('popStart') || $('popCur'); if (f) f.focus();
}
function closePop() { const p = $('popBg'); if (p) p.remove(); }

// ================================================================ 宝箱（ユニットをクリアすると開く）とごほうび
const ITEMS = { freeze: ['ストリーク・フリーズ', '❄'], heart: ['ハートかいふく', '♥'], boost: ['XPブースト（15分）', '⚡'], wager: ['れんぞくのかけ', '✦'], timer: ['タイマーのびる', '⏱'] };
function chestSvg(open) {
  return '<svg class="chestsvg' + (open ? ' open' : '') + '" viewBox="0 0 120 100" width="120" height="100" aria-hidden="true"><ellipse cx="60" cy="94" rx="40" ry="5" fill="rgba(0,0,0,.18)"/>'
    + '<g class="lid"><path d="M16 46V34a8 8 0 0 1 8-8h72a8 8 0 0 1 8 8v12z" fill="#e9923a" stroke="#8a4b12" stroke-width="4" stroke-linejoin="round"/><rect x="52" y="30" width="16" height="16" rx="3" fill="#ffd23f" stroke="#8a4b12" stroke-width="3"/></g>'
    + '<rect x="16" y="46" width="88" height="42" rx="6" fill="#c9701f" stroke="#8a4b12" stroke-width="4"/><rect x="16" y="56" width="88" height="6" fill="#8a4b12" opacity=".35"/><rect x="52" y="44" width="16" height="22" rx="3" fill="#ffd23f" stroke="#8a4b12" stroke-width="3"/><circle cx="60" cy="55" r="3" fill="#8a4b12"/>'
    + (open ? '<g class="glow"><path d="M24 46h72l10-34H14z" fill="#fff6b0" opacity=".7"/></g>' : '') + '</svg>';
}
function chestEl(key, unlocked, pos) {
  const claimed = !!save.ch[key], st = claimed ? 'claimed' : unlocked ? 'ready' : 'locked';
  const off = Math.round(Math.sin((pos + 0.5) * 1.15) * 62);
  const b = h('button', { class: 'chestbtn ' + st, id: 'chest-' + key, type: 'button', 'data-chest': key, 'aria-label': T('宝箱') + '：' + (claimed ? T('うけとりずみ') : unlocked ? T('あけられます') : T('まだロック中')), onclick: () => { Fx.sfx.tap(); if (claimed) { toast2(T('もううけとったよ')); return; } if (!unlocked) { toast2(T('このユニットをクリアすると、宝箱が開くよ！')); return; } openChestFlow(key); } }, [h('span', { html: chestSvg(claimed) }), !unlocked && !claimed ? h('span', { class: 'lockic sm', html: ICON.lock }) : null]);
  return h('div', { class: 'unit chest ' + st, style: 'transform:translateX(' + off + 'px)' }, [b, h('div', { class: 'lbl' }, [h('span', { text: T('宝箱') })])]);
}
function toast2(m) { if (UI) UI.toast(m); }
function chestRewards(key) {
  const r = E.rng(E.seedOf('chest|' + key)), list = [{ k: 'gm', n: 8 + Math.floor(r() * 13) }, { k: 'xp', n: 10 }];
  if (r() < 0.55) { const ids = Object.keys(ITEMS); list.push({ k: 'item', id: ids[Math.floor(r() * ids.length)], n: 1 }); }
  return list;
}
function applyRewards(list) {
  for (const x of list) {
    if (x.k === 'gm') save.gm += x.n;
    else if (x.k === 'xp') { save.xp += x.n; save.g[today] = (save.g[today] || 0) + x.n; if (!save.d.includes(today)) save.d.push(today); bumpDay({ xp: x.n }); }
    else if (x.k === 'item') save.iv[x.id] = Math.min(99, (save.iv[x.id] || 0) + x.n);
  }
  persist(); renderChips();
}
// 宝箱をあける：ゆれる → ふたが開く → ごほうびがとびだす → かぞえる数に飛んでいく
function showChest(o) {
  closePop(); const rewards = o.rewards;
  const ov = h('div', { class: 'overlay chestov', id: 'chestOv', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'chestT' });
  const box = h('div', { class: 'card', style: 'text-align:center' });
  const art = h('div', { class: 'chestart', html: chestSvg(false) });
  const list = h('div', { class: 'rewards', id: 'chestRewards', 'aria-live': 'polite' });
  const openBtn = h('button', { class: 'btn primary', id: 'chestOpen', type: 'button' }, T('あける！'));
  box.append(h('h2', { id: 'chestT', text: o.title || T('宝箱') }), art, list, openBtn); ov.append(box); document.body.append(ov); openBtn.focus();
  const reduce = !Fx.motion();
  openBtn.onclick = () => {
    openBtn.disabled = true; art.classList.add('wiggle'); Fx.sfx.tap();
    setTimeout(() => {
      art.classList.remove('wiggle'); art.innerHTML = chestSvg(true); art.classList.add('opened'); Fx.sfx.chest(); Fx.buzz([20, 30, 20]); Fx.confetti($('fx'), 30);
      rewards.forEach((x, k) => setTimeout(() => { const label = x.k === 'gm' ? '+' + x.n + ' ' + T('ジェム') : x.k === 'xp' ? '+' + x.n + ' XP' : T(ITEMS[x.id][0]) + ' ×' + x.n; list.append(h('div', { class: 'rw ' + x.k, 'data-k': x.k }, [h('span', { class: 'ic', text: x.k === 'gm' ? '◆' : x.k === 'xp' ? '★' : ITEMS[x.id][1] }), label])); Fx.sfx.coin(k); }, reduce ? 0 : 350 + k * 260));
      setTimeout(() => { const c = h('button', { class: 'btn primary', id: 'chestClaim', type: 'button', onclick: () => claim() }, T('うけとる')); box.append(c); c.focus(); }, reduce ? 10 : 400 + rewards.length * 260 + 200);
    }, reduce ? 0 : 750);
  };
  const claim = () => {
    $('chestClaim').disabled = true;
    const done = () => { ov.remove(); applyRewards(rewards); o.onClaim && o.onClaim(); tick(); };
    if (reduce) return done();
    // ごほうびが、上の数に向かって飛ぶ
    ov.querySelectorAll('.rw').forEach((el, k) => { const t = el.dataset.k === 'gm' ? $('cGem') : el.dataset.k === 'xp' ? $('cGoal') : $('tabs'); const a = el.getBoundingClientRect(), b = t.getBoundingClientRect(); const fly = el.cloneNode(true); fly.className = 'rw flyer'; fly.style.cssText = 'position:fixed;left:' + a.left + 'px;top:' + a.top + 'px;margin:0;z-index:90'; document.body.append(fly); el.style.visibility = 'hidden'; fly.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px) scale(.4)', opacity: .4 }], { duration: 650, delay: k * 90, easing: 'cubic-bezier(.5,-0.3,.7,1)', fill: 'forwards' }).onfinish = () => { fly.remove(); Fx.sfx.coin(k); }; });
    setTimeout(done, 700 + rewards.length * 90);
  };
  const tick = () => { for (const id of ['cGem', 'cGoal']) { const e = $(id); e.classList.remove('tick'); void e.offsetWidth; e.classList.add('tick'); } };
}
function openChestFlow(key) {
  const rewards = chestRewards(key);
  showChest({ title: T('宝箱をゲット！'), rewards, onClaim: () => { save.ch[key] = 1; persist(); emit('progress', { chest: key }); goHome(); } });
}

// ================================================================ 飛び級テスト（3回まちがえたら不合格：2回までのまちがいなら合格）
const JUMP_N = 10;
async function startJump(u, allIds, pos) {
  if (L) return;
  try {
    const skipIds = allIds.slice(0, pos + 1).filter(id => !save.jp[id]);
    let eng, pool;
    if (u.special) {
      const c = await loadContent(u), qs = G.make(u.id, 'jump|' + today + '|' + save.st.ls, c, JUMP_N), boxes = '000'.repeat(qs.length);
      pool = { items: [], qs, boxes, noBoxes: true }; eng = E.createLesson({ qs, boxes, today, seed: 'jump|' + u.id + '|' + save.st.ls, size: qs.length, maxRetry: 0 });
    } else {
      const set = pickSet(u.unit); pool = await buildPool([set]); const only = u.unit.sm ? subIdx(u.unit, u.si) : undefined;
      eng = E.createLesson({ qs: pool.qs, boxes: pool.boxes, today, seed: 'jump|' + u.id + '|' + save.st.ls + '|' + today, size: Math.min(JUMP_N, only ? only.length : JUMP_N), only, maxRetry: 0 });
    }
    beginLesson({ eng, pool, kind: 'jump', unit: u.special ? u : u.unit, si: u.si, jumpIds: skipIds, jumpArgs: { u, allIds, pos } });
  } catch (e) { loadFail(e); }
}
function jumpResult(pass) {
  const ids = L.jumpIds || [], miss = L.miss; clearRun();
  if (pass) { ids.forEach(id => { save.jp[id] = 1; }); save.gm += 5; persist(); renderChips(); Fx.sfx.done(); Fx.confetti($('fx'), 40); }
  else { Fx.sfx.ng(); }
  emit('play_end', { mode: 'normal', reason: pass ? 'clear' : 'over', score: pass ? 1 : 0 });
  screen = 'result'; setBack(() => goHome()); setTitle(T('飛び級テスト'));
  const body = h('div', { class: 'q', id: 'resBody' }, [h('div', { class: 'res' }, [
    h('span', { html: Fx.mascot(pass ? 'cheer' : 'think', 132, save.sk) }),
    h('h2', { id: 'jumpTitle', text: pass ? T('合格！飛び級だ！') : T('おしい！もう少し') }),
    h('p', { id: 'jumpMsg', text: pass ? T('{n}コのレッスンが クリアになったよ。', { n: ids.length }) + '　' + T('まちがい {n} 回', { n: miss }) : T('3回まちがえたのでここまで。いまのレッスンで練習してから、またちょうせんしよう。') }),
  ]), h('div', { class: 'acts' }, [h('button', { class: 'btn primary', id: 'btnHome', type: 'button', onclick: () => goHome() }, T('ホームへ')), pass ? null : h('button', { class: 'btn', id: 'btnJumpAgain', type: 'button', onclick: () => { const a = L.jumpArgs; L = null; startJump(a.u, a.allIds, a.pos); } }, T('もう一回'))])]);
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, body), false);
  L.over = true;
}

// ================================================================ ヘッダーのシート（コース・ストリーク・ジェム）
const BADGE = {
  english: '<path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="currentColor"/><text x="12" y="14.500" text-anchor="middle" font-size="7.500" font-weight="900" fill="var(--sc-ink,#000)" stroke="none">Aa</text>',
  math: '<path d="M6 12h12M12 6v12" stroke="currentColor" stroke-width="3.200" stroke-linecap="round" fill="none"/><path d="M5 19h14" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" fill="none"/>',
  japanese: '<path d="M4 18c4-1 6-5 8-12M9 12c3-1 7-1 10 0M13 15c1 3 4 4 7 3" stroke="currentColor" stroke-width="2.800" stroke-linecap="round" fill="none"/>',
  kobun: '<rect x="5" y="4" width="14" height="16" rx="2" fill="currentColor"/><path d="M8 9h8M8 13h8M8 17h5" stroke="var(--sc-ink,#000)" stroke-width="1.800" stroke-linecap="round"/>',
  science: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linejoin="round" stroke-linecap="round"/><path d="M8 15h8" stroke="currentColor" stroke-width="2.400"/>',
  social: '<circle cx="12" cy="12" r="8.500" fill="none" stroke="currentColor" stroke-width="2.400"/><path d="M3.500 12h17M12 3.500c3 3 3 14 0 17M12 3.500c-3 3-3 14 0 17" fill="none" stroke="currentColor" stroke-width="2"/>',
  information: '<rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2.400"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>',
};
const badgeSvg = sub => '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">' + (BADGE[sub] || BADGE.information) + '</svg>';
const courseSub = cr => specialSub(cr) || view.sub || 'english';
function subjectScore(cr, sub) { // 0〜100：習得した問題（65%）ともう取り組んだ問題（35%）の割合。ラボ・古文は王冠の平均
  if (specialSub(cr)) { const us = G.UNITS.filter(u => u.course === cr); return us.length ? Math.round(100 * us.reduce((a, u) => a + (save.cw[u.id] || 0) / 5, 0) / us.length) : 0; }
  const course = index.courses.find(c => c.id === cr), sj = course && course.subjects.find(x => x.id === sub); if (!sj) return 0;
  let n = 0, pr = 0, ms = 0; for (const u of sj.units) { const st = unitStats(u); n += st.n; pr += st.n - st.fresh; ms += st.mastered; }
  return n ? Math.round(100 * (0.35 * pr / n + 0.65 * ms / n)) : 0;
}
const scoreLabel = sc => (sc < 8 ? 'はじめて' : sc < 25 ? 'ビギナー' : sc < 50 ? 'ちゅうきゅう' : sc < 75 ? 'じょうきゅう' : 'マスター');
function closeSheet() { const b = $('sheetBg'); if (b) b.remove(); }
function openSheet(id, title, kids) {
  closePop(); closeSheet();
  const bg = h('div', { class: 'sheetbg', id: 'sheetBg', onclick: e => { if (e.target === bg) closeSheet(); } }, h('div', { class: 'sheet tall', id, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + 'T' }, [
    h('div', { class: 'sheethd' }, [h('h2', { id: id + 'T', text: title }), h('button', { class: 'icon', id: id + 'X', type: 'button', 'aria-label': T('とじる'), onclick: () => closeSheet() }, h('span', { text: '✕', style: 'font-size:20px;font-weight:800' }))]), ...kids]));
  document.body.append(bg); const x = $(id + 'X'); if (x) x.focus(); return bg;
}
const COURSE_LIST = () => {
  const l = [];
  for (const cr of ['JH', 'HS']) { const c = index.courses.find(x => x.id === cr); for (const sj of c.subjects) l.push({ cr, sub: sj.id, name: (cr === 'JH' ? T('中学') : T('高校')) + ' ' + subjectName(sj.id) }); }
  for (const c of G.COURSES) l.push({ cr: c.id, sub: c.sub, name: EN ? c.en : c.ja });
  return l;
};
function openCourseSheet() {
  const cur = COURSE_LIST().find(c => c.cr === view.cr && (specialSub(c.cr) || c.sub === view.sub)) || COURSE_LIST()[0];
  const sc = subjectScore(cur.cr, cur.sub), R = 40, C = 2 * Math.PI * R;
  const ring = h('div', { class: 'scorering', html: '<svg viewBox="0 0 100 100" width="108" height="108" aria-hidden="true"><circle cx="50" cy="50" r="' + R + '" fill="none" stroke="var(--kb-surface-2)" stroke-width="10"/><circle cx="50" cy="50" r="' + R + '" fill="none" stroke="var(--sc,var(--pb))" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (C * sc / 100).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 50 50)"/></svg>' });
  ring.append(h('span', { class: 'sv', id: 'subjScore', text: String(sc) }));
  const rows = COURSE_LIST().map(c => { const s2 = subjectScore(c.cr, c.sub), on = c === cur; return h('button', { class: 'crow' + (on ? ' on' : ''), type: 'button', 'data-cr': c.cr, 'data-sub': c.sub, 'aria-current': on ? 'true' : null, onclick: () => { Fx.sfx.tap(); view.cr = c.cr; if (!specialSub(c.cr)) view.sub = c.sub; view.g = 0; view.scrolled = false; saveView(); closeSheet(); tab = 'learn'; goHome(); } }, [h('span', { class: 'badge sm', 'data-sub': c.sub, html: badgeSvg(c.sub) }), h('span', { class: 't' }, [h('b', { text: c.name }), h('small', { text: s2 ? T(scoreLabel(s2)) + ' ・ ' + s2 : T('新しいコース') })])]); });
  openSheet('courseSheet', T('コース'), [h('div', { style: 'text-align:center' }, [ring, h('div', { class: 'note', id: 'subjLabel', text: T('{name} の実力：{lv}', { name: cur.name, lv: T(scoreLabel(sc)) }) })]), h('h3', { class: 'dom', text: T('コースをかえる・ふやす') }), h('div', { class: 'crows', id: 'courseRows' }, rows),
    h('p', { class: 'note', text: T('実力スコアは、習得した問題とやった問題の割合からつくっています（0〜100）。') })]);
}
// ---- ストリークのカレンダー
const DAYS = ['日', '月', '火', '水', '木', '金', '土'], DOWEN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
function dayToDate(d) { return new Date(d * 86400000 + new Date().getTimezoneOffset() * 60000); }
function repairable() { // きのうだけ空いて、その前までつながっていた（フリーズなし）
  const y = today - 1; if (save.d.includes(y) || save.d.includes(today)) return false;
  return save.d.includes(y - 1);
}
function monthGrid(off) {
  const t = dayToDate(today), first = new Date(t.getFullYear(), t.getMonth() + off, 1), dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const base = E.dayNum(first), cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 0; d < dim; d++) cells.push(base + d);
  return { first, cells };
}
function openStreakSheet(off) {
  off = off || 0; const st = E.streakOf(save.d, today), g = monthGrid(off), frozen = new Set(save.fd);
  const cal = h('div', { class: 'cal', id: 'streakCal', role: 'grid' }, DAYS.map((d, i) => h('span', { class: 'dow', lang: EN ? null : 'ja', text: EN ? DOWEN[i] : d })));
  g.cells.forEach(d => cal.append(d == null ? h('span') : h('span', { class: 'cd' + (save.d.includes(d) ? (frozen.has(d) ? ' fz' : ' on') : '') + (d === today ? ' today' : ''), 'data-day': d, role: 'gridcell', 'aria-label': (new Date(d * 86400000 + new Date().getTimezoneOffset() * 60000).getDate()) + (save.d.includes(d) ? (frozen.has(d) ? ' ' + T('フリーズ') : ' ' + T('学習した')) : '') }, String(new Date(d * 86400000 + new Date().getTimezoneOffset() * 60000).getDate()))));
  const mil = [3, 7, 14, 30, 50, 100, 200, 365], best = Math.max(st, save.st.best);
  const kids = [
    h('div', { class: 'streakhd' }, [h('span', { html: FLAME }), h('b', { id: 'streakNum', text: String(st) }), h('span', { text: ' ' + T('日れんぞく') })]),
    h('div', { class: 'calnav' }, [h('button', { class: 'icon', type: 'button', id: 'calPrev', 'aria-label': T('前の月'), onclick: () => openStreakSheet(off - 1) }, '‹'), h('b', { id: 'calMonth', text: g.first.getFullYear() + '/' + (g.first.getMonth() + 1) }), h('button', { class: 'icon', type: 'button', id: 'calNext', 'aria-label': T('次の月'), disabled: off >= 0 ? true : null, onclick: () => openStreakSheet(off + 1) }, '›')]),
    cal,
    h('div', { class: 'set' }, [h('span', { text: T('ストリーク・フリーズ') }), h('b', { id: 'fzOwned', text: save.fz + ' / 2 ' + T('そうび中') + (save.iv.freeze ? '　+' + save.iv.freeze + ' ' + T('もちもの') : '') })]),
    h('div', { class: 'miles', id: 'streakMiles' }, mil.map(m => h('span', { class: 'ms' + (best >= m ? ' got' : ''), 'data-m': m }, [h('b', { text: String(m) }), h('small', { text: T('日間') })]))),
  ];
  if (repairable()) { const cost = 50; kids.push(h('button', { class: 'btn ng', id: 'repairBtn', type: 'button', disabled: save.gm >= cost ? null : true, onclick: () => { save.gm -= cost; save.d.push(today - 1); save.fd.push(today - 1); save.d.sort((a, b) => a - b); persist(); renderChips(); Fx.sfx.streak(); closeSheet(); goHome(); } }, T('きのうの分を直す') + '（' + cost + ' ' + T('ジェム') + '）'), h('p', { class: 'note', text: T('きのうやすんでも、れんぞくをもどせるよ。今日のうちだけ。') })); }
  if (save.iv.freeze && save.fz < 2) kids.push(h('button', { class: 'btn b', id: 'equipFreeze', type: 'button', onclick: () => { save.iv.freeze--; if (!save.iv.freeze) delete save.iv.freeze; save.fz++; persist(); openStreakSheet(off); } }, T('フリーズをそうびする')));
  openSheet('streakSheet', T('れんぞく'), kids);
}
// ---- ジェム・お店・もちもの
const SHOP = [
  { id: 'freeze', ja: 'ストリーク・フリーズ', cost: 50, desc: '休んだ日のれんぞくを守る（2つまでそうび）' },
  { id: 'heart', ja: 'ハートかいふく', cost: 20, desc: 'ハートを5つにもどす' },
  { id: 'boost', ja: 'XPブースト（15分）', cost: 30, desc: '15分のあいだ、もらえるXPが2倍' },
  { id: 'wager', ja: 'れんぞくのかけ', cost: 40, desc: '7日れんぞくできたら、ジェムが2倍' },
  { id: 'timer', ja: 'タイマーのびる', cost: 25, desc: '模試の制限時間を5分ふやす' },
];
const SKIN_COST = 30;
function openGemSheet() {
  const own = new Set(save.ow);
  const items = SHOP.map(it => h('div', { class: 'qrow', 'data-item': it.id }, [h('div', { class: 't' }, [h('b', { text: T(it.ja) }), h('small', { class: 'note', text: T(it.desc) + (save.iv[it.id] ? '　' + T('もちもの') + ' ×' + save.iv[it.id] : '') })]), h('button', { class: 'btn b', type: 'button', 'data-buy': it.id, disabled: save.gm >= it.cost ? null : true, onclick: () => { save.gm -= it.cost; save.iv[it.id] = Math.min(99, (save.iv[it.id] || 0) + 1); persist(); renderChips(); Fx.sfx.coin(0); openGemSheet(); } }, '◆ ' + it.cost)]));
  const skins = h('div', { class: 'skins' }, Fx.SKINS.map((c, i) => h('button', { type: 'button', 'data-skin': i, style: 'background:' + c, 'aria-label': T('色') + (i + 1) + (own.has(i) ? '' : '（' + SKIN_COST + '）'), 'aria-pressed': String(i === save.sk), onclick: () => { if (!own.has(i)) { if (save.gm < SKIN_COST) { toast2(T('ジェムがたりないよ')); return; } save.gm -= SKIN_COST; save.ow.push(i); } save.sk = i; persist(); renderChips(); openGemSheet(); } }, own.has(i) ? '' : '◆')));
  openSheet('gemSheet', T('ジェムとお店'), [h('div', { class: 'gemhd' }, [h('b', { id: 'gemBig', text: '◆ ' + save.gm }), h('small', { text: T('レッスン・クエスト・宝箱でもらえるよ') })]), h('h3', { class: 'dom', text: T('アイテム') }), h('div', { id: 'shopList' }, items), h('h3', { class: 'dom', text: T('もちもの') }), inventoryEl(), h('h3', { class: 'dom', text: T('ねじまるの色（見た目だけ）') }), skins, h('p', { class: 'note', text: T('お店のものは、学習の点数には えいきょうしません。') })]);
}

// ================================================================ 時間・季節のチェスト、アイテムのつかいかた、れんぞくのかけ
const TIMED = [
  { id: 'early', ja: '早起きチェスト', cond: '朝8時前にレッスンをする', ok: ds => ds.early > 0, key: d => 'early-' + d },
  { id: 'night', ja: 'よふかしチェスト', cond: '夜10時すぎにレッスンをする', ok: ds => ds.night > 0, key: d => 'night-' + d },
  { id: 'weekend', ja: '週末チェスト', cond: '土曜か日曜にレッスンをする', ok: ds => ds.weekend > 0, key: () => 'weekend-' + E.weekOf(today) },
];
const SEASONS = [
  { id: 'spring', ja: '春のさくらチェスト', from: [3, 20], to: [4, 10] }, { id: 'summer', ja: '夏のひまわりチェスト', from: [7, 20], to: [8, 31] },
  { id: 'autumn', ja: '秋のつきみチェスト', from: [9, 10], to: [11, 15] }, { id: 'winter', ja: '冬のゆきチェスト', from: [12, 15], to: [1, 10] },
];
function seasonNow() {
  const d = nowDate(), m = d.getMonth() + 1, day = d.getDate(), v = m * 100 + day;
  for (const s of SEASONS) { const a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1]; if (a <= b ? v >= a && v <= b : v >= a || v <= b) return Object.assign({ year: d.getFullYear() - (a > b && v <= b ? 1 : 0) }, s); }
  return null;
}
function timedList() {
  ensureDay();
  const l = TIMED.map(t => ({ id: t.id, ja: t.ja, cond: t.cond, ready: t.ok(save.ds), key: t.key(today), limited: false }));
  const se = seasonNow(); if (se) l.push({ id: 'season-' + se.id, ja: se.ja, cond: 'きょう1回レッスンをする（{a}）', cp: se.from[0] + '/' + se.from[1] + '–' + se.to[0] + '/' + se.to[1], ready: (save.ds.ls || 0) > 0, key: 'season-' + se.id + '-' + se.year, limited: true });
  return l.map(x => Object.assign(x, { claimed: save.tc.includes(x.key) }));
}
function claimTimed(x) {
  if (x.claimed || !x.ready) return;
  const r = E.rng(E.seedOf('tc|' + x.key)), rewards = [{ k: 'gm', n: x.limited ? 25 : 12 }, { k: 'xp', n: 10 }]; if (x.limited || r() < 0.5) rewards.push({ k: 'item', id: Object.keys(ITEMS)[Math.floor(r() * 5)], n: 1 });
  showChest({ title: T(x.ja), rewards, onClaim: () => { save.tc.push(x.key); save.tc = save.tc.slice(-40); persist(); Fx.sfx.quest(); goHome(); } });
}
function useItem(id) {
  if (!save.iv[id]) return;
  if (id === 'freeze') { if (save.fz >= 2) { toast2(T('フリーズは2つまでそうびできるよ')); return; } save.fz++; }
  else if (id === 'heart') { if (save.hr >= 5) { toast2(T('ハートはいっぱいだよ')); return; } save.hr = 5; }
  else if (id === 'boost') { save.bx = Math.max(Date.now(), save.bx) + 15 * 60000; }
  else if (id === 'wager') { if (save.wg) { toast2(T('もう、かけている最中だよ')); return; } if (save.gm < 30) { toast2(T('ジェムがたりないよ')); return; } save.gm -= 30; save.wg = { s: today, bet: 30 }; }
  else if (id === 'timer') { if (M && !M.submitted) { M.t0 += 5 * 60000; } else { toast2(T('模試のとちゅうでつかえるよ')); return; } }
  save.iv[id]--; if (!save.iv[id]) delete save.iv[id]; persist(); renderChips(); Fx.sfx.quest(); Fx.confetti($('fx'), 14);
}
function settleWager() { // かけ：7日つづけたら、かけたジェムが2倍でもどる。とぎれたら、かけたぶんは なくなる
  const w = save.wg; if (!w) return null;
  const days = [1, 2, 3, 4, 5, 6, 7].map(k => w.s + k);
  if (today > w.s + 7 || days.slice(0, Math.max(0, today - w.s - 1)).some(d => !save.d.includes(d))) {
    const won = days.every(d => save.d.includes(d)); save.wg = null; if (won) save.gm += w.bet * 2; persist(); return won ? 'won' : 'lost';
  }
  return null;
}
function inventoryEl() {
  const rows = Object.keys(ITEMS).map(id => h('div', { class: 'qrow', 'data-inv': id }, [h('div', { class: 't' }, [h('b', { text: T(ITEMS[id][0]) + ' ×' + (save.iv[id] || 0) }), id === 'boost' && save.bx > Date.now() ? h('small', { class: 'note', id: 'boostLeft', text: T('のこり {m} 分', { m: Math.ceil((save.bx - Date.now()) / 60000) }) }) : id === 'wager' && save.wg ? h('small', { class: 'note', id: 'wagerInfo', text: T('かけ中：{n} 日め／7日', { n: Math.min(7, today - save.wg.s) }) }) : null]), h('button', { class: 'btn sub b', type: 'button', 'data-use': id, disabled: save.iv[id] ? null : true, onclick: () => { useItem(id); openGemSheet(); } }, T('つかう'))]));
  return h('div', { id: 'invList' }, rows);
}
function timedCard() {
  const c = h('div', { class: 'card', id: 'timedCard' }, [h('h3', { text: T('ひみつのチェスト') })]);
  timedList().forEach(x => c.append(h('div', { class: 'qrow', 'data-tc': x.id }, [h('span', { html: chestSvg(x.claimed) , style: 'width:44px;flex:none;' + (x.ready || x.claimed ? '' : 'filter:grayscale(1) opacity(.5)') }), h('div', { class: 't' }, [h('b', { text: T(x.ja) + (x.limited ? ' ' + T('（期間げんてい）') : '') }), h('small', { class: 'note', text: T(x.cond, { a: x.cp }) })]), h('button', { class: 'btn ' + (x.ready && !x.claimed ? 'primary' : ''), type: 'button', 'data-timed': x.id, disabled: x.ready && !x.claimed ? null : true, onclick: () => claimTimed(x) }, x.claimed ? T('うけとりずみ') : x.ready ? T('宝箱をあける') : T('まだ'))])));
  return c;
}
function saveView() { save.set = { cr: view.cr, sub: view.sub, g: view.g }; persist(); }
function reviewCount() {
  let n = 0;
  for (const s of allSets()) { if (!save.b[s.id]) continue; const b = E.parseBoxes(save.b[s.id], s.h, s.n); for (let i = 0; i < s.n; i++) { const c = E.card(b, i); if (c.box && (E.isDue(c, today) || c.box <= 2)) n++; } }
  return n;
}

// ================================================================ 復習
const specialUnit = id => G.UNITS.map(u => Object.assign({ special: 1, sub: specialSub(u.course) }, u)).find(u => u.id === id);
function collCard(id, ja, desc, fn, pill) { return h('button', { class: 'banner coll', type: 'button', 'data-coll': id, onclick: () => { Fx.sfx.tap(); fn(); } }, [h('span', { class: 't' }, [h('b', { text: T(ja) }), h('small', { text: T(desc) })]), pill != null ? h('span', { class: 'pill', text: String(pill) }) : null]); }
function viewReview() {
  setTitle(T('練習')); $('app').dataset.sub = 'english';
  const rv = reviewCount(), main = h('div', { id: 'main' });
  main.append(h('div', { style: 'text-align:center;padding:6px 0 10px' }, [h('span', { html: Fx.mascot(rv ? 'think' : 'happy', 110, save.sk) }), h('div', { class: 'note', text: rv ? T('まちがえた問題が待ってるよ。ゆっくりいこう！') : T('好きな練習をえらぼう！') })]));
  // 1. まちがえた問題
  main.append(h('h3', { class: 'dom', id: 'collMistakes', text: T('間違えた問題') }));
  main.append(h('button', { class: 'banner review', id: 'btnReview', type: 'button', disabled: rv ? null : true, onclick: () => startReview() }, [
    h('span', { class: 't' }, [h('b', { text: T('ふくしゅう') }), h('small', { text: rv ? T('まちがえた問題や、そろそろ復習の時期の問題') : T('復習する問題はまだありません') })]),
    rv ? h('span', { class: 'pill', text: T('{n}問', { n: rv }) }) : null,
  ]));
  if (save.mm.length) main.append(h('button', { class: 'banner review', id: 'btnMockMiss', type: 'button', onclick: () => startMockMiss() }, [h('span', { class: 't' }, [h('b', { text: T('模試のまちがい') }), h('small', { text: T('模試でまちがえた問題をもう一度') })]), h('span', { class: 'pill', text: T('{n}問', { n: save.mm.length }) })]));
  const exams = index.exams;
  main.append(h('button', { class: 'banner', id: 'btnMock', type: 'button', disabled: exams.length ? null : true, onclick: () => showMocks() }, [h('span', { class: 't' }, [h('b', { text: T('模試・共通テスト形式') }), h('small', { text: T('制限時間つきの模試') })]), h('span', { class: 'pill', text: String(exams.length) })]));
  if (save.hm) main.append(h('div', { class: 'card' }, [h('h3', { text: T('ハートモード') }), h('div', { class: 'hearts', 'aria-label': T('ハート') }, [h('span', { html: ICON.heart }), String(save.hr) + ' / 5']), h('p', { class: 'note', text: T('復習レッスンをクリアするとハートが2つ回復するよ。') })]));
  // 2. 単語練習
  main.append(h('h3', { class: 'dom', id: 'collVocab', text: T('単語練習') }));
  main.append(collCard('vocab-en', '英単語', '基本の英単語の意味をえらぶ', () => startSpecial(specialUnit('L2'))), collCard('vocab-irr', '不規則動詞', '過去形・過去分詞を覚える', () => startSpecial(specialUnit('L1'))), collCard('vocab-ko', '古語', '重要な古語と現代語を結ぶ', () => startSpecial(specialUnit('K2'))));
  // 3. リスニング・ラジオ
  main.append(h('h3', { class: 'dom', id: 'collListen', text: T('リスニング') }));
  main.append(collCard('listen', '聞き取り', '英文を聞いて、同じ文をえらぶ', () => startSpecial(specialUnit('L7'))));
  main.append(collCard('dict', 'ディクテーション', '英文を聞いて、語をならべる（Tatoeba・CC0）', () => startDictation()));
  const radio = h('div', { id: 'radioList' }); main.append(h('h3', { class: 'dom', id: 'collRadio', text: T('ラジオ') }), h('p', { class: 'note', text: T('文章を耳だけで聞いて、あとで問題にこたえよう（声が出ないときは、文字を見られるよ）。') }), radio);
  // 4. スピーキング
  main.append(h('h3', { class: 'dom', id: 'collSpeak', text: T('スピーキング') }));
  main.append(collCard('speak', '発音れんしゅう', 'お手本を聞いて、声に出して言う（点数が出るよ）', () => startSpeaking()));
  // 5. ストーリー
  const stories = h('div', { id: 'storyList' }); main.append(h('h3', { class: 'dom', id: 'collStory', text: T('ストーリー') }), stories);
  // 6. 会話強化
  main.append(h('h3', { class: 'dom', id: 'collConv', text: T('会話強化') }));
  const dh = h('div', { class: 'card', id: 'dlgHost' }, h('p', { class: 'note', text: '…' })), vh = h('div', { class: 'card', id: 'videoHost', style: 'margin-top:12px' }, h('p', { class: 'note', text: '…' }));
  main.append(dh, vh); dialogueList(dh); dialogueList(vh, true);
  Promise.all([loadJson('stories'), loadJson('aozora').catch(() => ({ works: [] }))]).then(([d, ao]) => { const aoSt = ao.works.map(w => ({ id: w.id, title: w.title + '（' + w.author + '）', level: w.level, lang: 'ja', lines: w.lines, qs: w.qs, credit: '青空文庫「' + (w.workTitle || w.title) + '」' + w.author + '（' + w.died.slice(0, 4) + '年没・パブリックドメイン） ' + w.url })); d.stories.concat(aoSt).forEach(st => { stories.append(h('button', { class: 'banner', type: 'button', 'data-story': st.id, onclick: () => startStory(st, false) }, [h('span', { class: 't' }, [h('b', { lang: 'ja', text: st.title }), h('small', { text: T('Lv{n}・{q}問', { n: st.level, q: st.qs.length }) })]), h('span', { class: 'pill', text: T('読む') })])); radio.append(h('button', { class: 'banner', type: 'button', 'data-radio': st.id, onclick: () => startStory(st, true) }, [h('span', { class: 't' }, [h('b', { lang: 'ja', text: st.title }), h('small', { text: T('聞いて答える') })]), h('span', { class: 'pill', style: 'background:var(--pb);color:var(--pb-ink)', text: T('聞く') })])); }); }).catch(() => { stories.append(h('p', { class: 'note', text: T('読み込めませんでした。通信を確かめて、もう一度ためしてください。') })); });
  show(main, true);
}

// 出典とライセンス（content/licenses.json）
function licenseEl() {
  const box = h('details', { id: 'licList', class: 'lic' }, [h('summary', { text: T('出典とライセンス') })]); let done = false;
  box.addEventListener('toggle', () => { if (!box.open || done) return; done = true; loadJson('licenses').then(d => { d.items.forEach(it => box.append(h('div', { class: 'licitem', lang: 'ja', 'data-lic': it.id }, [h('b', { text: it.name }), h('div', { text: it.by + ' / ' + it.licence }), it.note ? h('small', { text: it.note }) : null, it.url ? h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: it.url }) : null]))); }).catch(() => { done = false; box.append(h('p', { class: 'note', text: T('読み込めませんでした。通信を確かめて、もう一度ためしてください。') })); }); });
  return box;
}

// ディクテーション（Tatoeba の CC0 英文を聞いて、語をならべる）
async function startDictation() {
  if (L || DL || ST || SP) return;
  try {
    const d = await loadJson('tatoeba-en'), r = E.rng(E.seedOf('dict|' + today + '|' + save.st.ls)), pick = E.shuffle(d.sentences, r).slice(0, 6), all = d.sentences;
    const qs = pick.map((s, k) => {
      const words = s[1].replace(/[.!?]$/, '').split(/\s+/), other = E.shuffle(all, r).find(x => x[0] !== s[0]).slice(1, 2)[0].replace(/[.!?,]/g, '').split(/\s+/).filter(w => !words.includes(w)).slice(0, 2);
      const tiles = words.map((t, i) => ({ id: 'w' + i, t })).concat(other.map((t, i) => ({ id: 'd' + i, t })));
      return { t: 'wb', q: T('音声を聞いて、聞こえた英文を語をならべてつくろう。'), w: E.shuffle(tiles, r), a: words.map((_, i) => 'w' + i), alt: [], norm: 1, e: s[1] + '（Tatoeba #' + s[0] + ' CC0）', df: 2, i: 'dict:' + s[0], sp: s[1], lang: 'en', gen: 'dict' };
    });
    const eng = E.createLesson({ qs, boxes: '000'.repeat(qs.length), today, seed: 'dict|' + today + '|' + save.st.ls, size: qs.length });
    beginLesson({ eng, pool: { items: [], qs, boxes: '000'.repeat(qs.length), noBoxes: true }, kind: 'special', unit: { special: 1, sub: 'english', id: 'dict', ti: T('ディクテーション'), story: 1 } });
  } catch (e) { loadFail(e); }
}

// ================================================================ ストーリー・ラジオ（短い文章 → 理解の問題）
let ST = null;
async function startStory(st, radio) {
  if (L || DL || ST) return;
  ST = { st, radio, playing: false }; screen = 'story'; setBack(() => endStory()); setTitle(st.title, true);
  const SL = st.lang === 'ja' ? 'ja' : 'en', lines = h('div', { class: 'storylines', id: 'storyLines' }), showTxt = !radio || !Fx.canSpeak();
  st.lines.forEach((l, i) => {
    const row = h('div', { class: 'sline', 'data-i': i }, [
      Fx.canSpeak() ? h('button', { class: 'say-btn', type: 'button', 'aria-label': T('音声をきく'), onclick: () => Fx.speak(l[0], SL, 1) }, h('span', { html: ICON.speaker })) : null,
      h('div', { class: 'sl-t' }, [h('span', { class: 'sl-en', lang: SL, text: l[0], hidden: !showTxt }), h('span', { class: 'sl-ja', lang: 'ja', text: l[1], hidden: true })]),
      SL === 'ja' ? null : h('button', { class: 'ja-btn', type: 'button', onclick: e => { const x = e.currentTarget.parentNode.querySelector('.sl-ja'); x.hidden = !x.hidden; } }, T('訳'))]);
    lines.append(row);
  });
  const play = h('button', { class: 'btn b', id: 'storyPlay', type: 'button', onclick: () => { if (!Fx.canSpeak()) return; ST.playing = !ST.playing; play.textContent = ST.playing ? T('とめる') : T('▶ 聞く'); if (ST.playing) speakAll(0); else speechSynthesis.cancel(); } }, T('▶ 聞く'));
  const speakAll = i => { if (!ST || !ST.playing || i >= st.lines.length) { if (ST) { ST.playing = false; play.textContent = T('▶ 聞く'); } return; } const u = new SpeechSynthesisUtterance(st.lines[i][0]); u.lang = SL === 'ja' ? 'ja-JP' : 'en-US'; u.rate = 0.95; document.querySelectorAll('#storyLines .sline').forEach(r => r.classList.toggle('now', Number(r.dataset.i) === i)); u.onend = () => speakAll(i + 1); u.onerror = () => { if (ST) ST.playing = false; }; speechSynthesis.speak(u); };
  const body = h('div', { class: 'q', id: 'storyBody' }, [
    h('div', { class: 'hint', style: 'margin:0 0 8px', text: radio ? T('耳だけで聞いてみよう。聞きとれないときは「文を見る」。') : T('文をよんで、わからないところは「訳」をタップ。') }),
    Fx.canSpeak() ? play : h('p', { class: 'note', text: T('音声が使えないので、文を表示しています。') }),
    st.credit ? h('p', { class: 'note', id: 'storyCredit', lang: 'ja', text: st.credit }) : null,
    radio && Fx.canSpeak() ? h('button', { class: 'btn sub', id: 'storyShow', type: 'button', style: 'margin-top:8px', onclick: () => { document.querySelectorAll('#storyLines .sl-en').forEach(x => { x.hidden = !x.hidden; }); } }, T('文を見る')) : null, lines]);
  const go = h('div', { class: 'dock' }, h('button', { class: 'btn primary', id: 'storyQuiz', type: 'button', onclick: () => storyQuiz() }, T('もんだいへ')));
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, [h('div', { class: 'lh' }, [h('button', { class: 'icon', type: 'button', id: 'btnQuit', 'aria-label': T('とじる'), onclick: () => endStory() }, h('span', { text: '✕', style: 'font-size:20px;font-weight:800' }))]), body, go]), false);
}
function endStory() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} ST = null; goHome(); }
function storyQuestions(st) {
  const labs = ['ア', 'イ', 'ウ'], r = E.rng(E.seedOf(st.id + '|' + today));
  return st.qs.map((q, k) => {
    if (q.t === 'tt') { const tk = st.lines[q.ln][0].replace(/[.,"!?]/g, '').split(/\s+/), kw = new Set(q.kw.map(x => x.toLowerCase())); return { t: 'tt', q: q.q, tk, a: tk.map((w, i) => (kw.has(w.toLowerCase()) ? i : -1)).filter(i => i >= 0), e: q.ev, df: 2, i: 'story:' + st.id + ':' + k, gen: 'story', ai: 1 }; }
    const ch = E.shuffle(q.c, r); return { t: 'mc', q: q.q, c: ch.map((x, i) => [labs[i], x]), a: labs[ch.indexOf(q.a)], e: '“' + q.ev + '”', df: 2, i: 'story:' + st.id + ':' + k, gen: 'story', ai: 1, sp: ST && ST.radio ? undefined : undefined };
  });
}
function storyQuiz() {
  const st = ST.st, qs = storyQuestions(st), boxes = '000'.repeat(qs.length);
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  const eng = E.createLesson({ qs, boxes, today, seed: 'story|' + st.id + '|' + today + '|' + save.st.ls, size: qs.length });
  ST = null; screen = 'home';
  beginLesson({ eng, pool: { items: [], qs, boxes, noBoxes: true }, kind: 'special', unit: { special: 1, sub: 'english', id: st.id, ti: st.title, story: 1 } });
}

// ================================================================ 発音れんしゅう（お手本をきいて、声に出す。点数は ManabiDlg.scoreSpeech）
let SP = null;
async function startSpeaking() {
  if (L || DL || ST || SP) return;
  try {
    const c = await loadJson('english'), r = E.rng(E.seedOf('speak|' + today + '|' + save.st.ls)), items = E.shuffle(c.sentences, r).slice(0, 5);
    SP = { items, i: 0, scores: [], startedAt: Date.now() }; screen = 'speak'; setBack(() => endSpeaking()); setTitle(T('発音れんしゅう')); speakStep();
  } catch (e) { loadFail(e); }
}
function endSpeaking() { SP = null; goHome(); }
function speakStep() {
  if (SP.i >= SP.items.length) return speakDone();
  const it = SP.items[SP.i], res = h('div', { class: 'speakres', id: 'speakRes', role: 'status', 'aria-live': 'polite' });
  const finish = heard => { const sc = ManabiDlg.scoreSpeech(it[0], heard, 'en'), ok = sc >= ManabiDlg.PASS; SP.scores[SP.i] = Math.max(SP.scores[SP.i] || 0, sc); res.replaceChildren(h('div', { class: 'score ' + (ok ? 'good' : 'bad') }, [T('ぴったり度') + '：', h('b', { id: 'speakScore', text: sc + '%' })]), h('div', { class: 'okline', lang: 'en', text: '“' + heard + '”' })); reactSfx(ok); if (ok) { next.hidden = false; next.textContent = SP.i + 1 >= SP.items.length ? T('おわり') : T('つぎへ'); } };
  const next = h('button', { class: 'btn primary', id: 'speakNext', type: 'button', hidden: true, onclick: () => { SP.i++; speakStep(); } }, T('つぎへ'));
  const inp = h('input', { class: 'ans', id: 'speakInput', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': T('答えを入力'), onkeydown: e => { if (e.key === 'Enter') { e.stopPropagation(); if (inp.value.trim()) finish(inp.value); } } });
  const mic = Fx.canListen() ? h('button', { class: 'btn b', id: 'btnMic', type: 'button', onclick: () => { mic.disabled = true; res.replaceChildren(h('span', { text: T('聞いています…') })); Fx.listen('en', alts => { mic.disabled = false; finish(alts.reduce((a, b) => (ManabiDlg.scoreSpeech(it[0], b, 'en') > ManabiDlg.scoreSpeech(it[0], a, 'en') ? b : a))); }, () => { mic.disabled = false; res.replaceChildren(h('span', { text: T('聞きとれませんでした。もう一度か、入力で答えてね。') })); }); } }, [h('span', { html: ICON.speaker }), T('話す')]) : null;
  const body = h('div', { class: 'q', id: 'speakBody' }, [
    h('div', { class: 'pbar', style: 'margin:0 0 10px' }, h('i', { style: 'width:' + Math.round(100 * SP.i / SP.items.length) + '%' })),
    h('div', { class: 'hint', text: T('お手本を聞いて、同じように言ってみよう') + '（' + (SP.i + 1) + '/' + SP.items.length + '）' }),
    h('div', { class: 'speaktarget', id: 'speakTarget', lang: 'en', text: it[0] }), h('div', { class: 'note', lang: 'ja', text: it[1] }),
    Fx.canSpeak() ? h('div', { class: 'speaker' }, [h('button', { class: 'btn b', id: 'btnSpeak', type: 'button', 'aria-label': T('音声をきく'), onclick: () => Fx.speak(it[0], 'en', 1) }, h('span', { html: ICON.speaker })), h('button', { class: 'btn b slow', id: 'btnSlow', type: 'button', 'aria-label': T('ゆっくりきく'), onclick: () => Fx.speak(it[0], 'en', 0.6) }, T('ゆっくり'))]) : h('p', { class: 'note', text: T('音声が使えないので、文を表示しています。') }),
    mic || h('div', { class: 'hint', id: 'noMic', text: T('このブラウザでは声の入力が使えないので、文字で入力してね。') }), inp, h('div', { class: 'mini' }, [h('button', { type: 'button', id: 'speakSend', onclick: () => { if (inp.value.trim()) finish(inp.value); } }, T('おくる')), h('button', { type: 'button', id: 'speakSkip', onclick: () => { SP.i++; speakStep(); } }, T('とばす'))]), res, next]);
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, [h('div', { class: 'lh' }, [h('button', { class: 'icon', type: 'button', id: 'btnQuit', 'aria-label': T('とじる'), onclick: () => endSpeaking() }, h('span', { text: '✕', style: 'font-size:20px;font-weight:800' }))]), body]), false);
}
function speakDone() {
  const passed = SP.scores.filter(x => x >= ManabiDlg.PASS).length, xp = passed * 2 + 3, avg = SP.scores.length ? Math.round(SP.scores.reduce((a, b) => a + b, 0) / SP.items.length) : 0;
  save.xp += xp; save.g[today] = (save.g[today] || 0) + xp; if (!save.d.includes(today)) save.d.push(today); save.gm += 3; save.st.ls++; bumpDay({ xp, ls: 1, sp: 1 }); persist(); renderChips(); Fx.sfx.done();
  const main = h('div', { class: 'q', id: 'speakSummary' }, [h('div', { class: 'res' }, [h('span', { html: Fx.mascot(passed >= 4 ? 'cheer' : 'happy', 110, save.sk) }), h('h2', { text: T('発音れんしゅう おわり！') }), h('div', { class: 'stats' }, [h('div', null, [h('b', { text: '+' + xp }), h('small', { text: 'XP' })]), h('div', null, [h('b', { id: 'speakAvg', text: avg + '%' }), h('small', { text: T('平均') })]), h('div', null, [h('b', { text: passed + '/' + SP.items.length }), h('small', { text: T('合格') })])])]), h('div', { class: 'acts' }, [h('button', { class: 'btn primary', id: 'btnHome', type: 'button', onclick: () => endSpeaking() }, T('ホームへ'))])]);
  SP = null; show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, main), false);
}

// ================================================================ クエスト
// 月間クエスト：その月に学習した日が 15 日になったらバッジ（毎月ちがうデザイン）
const MONTH_TARGET = 15;
const monthKey = () => { const t = dayToDate(today); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'); };
const monthDays = () => { const t = dayToDate(today), y = t.getFullYear(), m = t.getMonth(); return save.d.filter(d => { const x = dayToDate(d); return x.getFullYear() === y && x.getMonth() === m; }).length; };
const MONTH_COL = ['#7cd6ff', '#ff9ec4', '#9be564', '#ffd23f', '#6fd6a0', '#59b8ff', '#ff9a62', '#f5c04a', '#c3a0ff', '#ff8f4d', '#c89b6a', '#9fb4ff'];
function monthBadge(key, size) {
  const m = Number(key.slice(5)) - 1, c = MONTH_COL[m], dk = Fx.shade(c, 0.7);
  return '<svg viewBox="0 0 64 64" width="' + (size || 56) + '" height="' + (size || 56) + '" role="img" aria-label="' + key + '"><path d="M32 4l22 12v26L32 60 10 42V16z" fill="' + c + '" stroke="' + dk + '" stroke-width="4" stroke-linejoin="round"/><path d="M32 12l15 8.500v18L32 52 17 38.500v-18z" fill="rgba(255,255,255,.28)"/><text x="32" y="39" text-anchor="middle" font-size="22" font-weight="900" fill="' + dk + '">' + (m + 1) + '</text></svg>';
}
// 友だちクエスト：ボットの友だち（ミカン）といっしょに、今週 150 XP。ほんもののユーザーではない（オンライン版は設計だけ：firestore.rules（kbLg・kbFeed・kbPairs））
const FRIEND_GOAL = 150;
const friendBot = () => ({ name: 'ミカン', xp: rivalXp(E.weekOf(today), 0, 0, today) });
function myCode() { if (!save.fc) { const r = E.rng(E.seedOf('fc|' + (store.get('kobo.dev') || '') + Date.now())), A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += A[Math.floor(r() * A.length)]; save.fc = c; persist(); } return save.fc; }
function viewQuests() {
  setTitle(T('クエスト')); $('app').dataset.sub = 'math'; ensureDay(); settleLeague();
  const qs = questsFor(today), main = h('div', { id: 'main' });
  const goal = E.xpToday(save, today), met = goal >= save.goal;
  main.append(h('div', { class: 'card' }, [h('h3', { text: T('今日の目標') }), h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(Math.min(100, Math.round(100 * goal / save.goal))) }, h('i', { style: 'width:' + Math.min(100, 100 * goal / save.goal) + '%' })), h('p', { class: 'note', text: (met ? T('今日のもくひょうをたっせい！') : T('今日 {a}/{b}', { a: goal, b: save.goal })) + '　' + T('れんぞく {n}日', { n: E.streakOf(save.d, today) }) })]));
  const card = h('div', { class: 'card', id: 'questList' }, [h('h3', { text: T('デイリークエスト') })]);
  qs.forEach((q, i) => {
    const v = Math.min(q.n, q.get(save.ds)), done = v >= q.n, claimed = save.dq.c[i];
    card.append(h('div', { class: 'qrow', 'data-q': q.id }, [
      h('div', { class: 't' }, [h('span', { text: q.text }), h('div', { class: 'bar' }, h('i', { style: 'width:' + (100 * v / q.n) + '%' })), h('small', { class: 'note', text: v + ' / ' + q.n })]),
      h('button', { class: 'btn ' + (done && !claimed ? 'primary' : ''), type: 'button', 'data-claim': i, disabled: done && !claimed ? null : true, onclick: () => claimQuest(i) }, claimed ? T('うけとりずみ') : done ? T('宝箱をあける') : T('進行中')),
    ]));
  });
  main.append(card);
  // 月間
  const mk = monthKey(), md = monthDays(), mdone = md >= MONTH_TARGET, mclaimed = save.bd.includes(mk), dim = new Date(dayToDate(today).getFullYear(), dayToDate(today).getMonth() + 1, 0).getDate();
  const mc = h('div', { class: 'card', id: 'monthCard' }, [h('h3', { text: T('月間クエスト') }),
    h('div', { class: 'qrow' }, [h('span', { class: 'mbadge' + (mclaimed ? '' : ' dim'), html: monthBadge(mk, 64) }), h('div', { class: 't' }, [h('span', { text: T('この月に {n} 日、学習しよう', { n: MONTH_TARGET }) }), h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(Math.round(100 * Math.min(md, MONTH_TARGET) / MONTH_TARGET)) }, h('i', { style: 'width:' + 100 * Math.min(md, MONTH_TARGET) / MONTH_TARGET + '%' })), h('small', { class: 'note', id: 'monthProg', text: Math.min(md, MONTH_TARGET) + ' / ' + MONTH_TARGET + '（' + T('のこり{n}日', { n: dim - dayToDate(today).getDate() }) + '）' })]),
      h('button', { class: 'btn ' + (mdone && !mclaimed ? 'primary' : ''), type: 'button', id: 'monthClaim', disabled: mdone && !mclaimed ? null : true, onclick: () => claimMonth(mk) }, mclaimed ? T('バッジ ゲット') : mdone ? T('宝箱をあける') : T('進行中'))]),
    save.bd.length ? h('div', { class: 'badges', id: 'badgeShelf' }, save.bd.map(k => h('span', { class: 'mbadge', html: monthBadge(k, 44) }))) : h('p', { class: 'note', text: T('毎月、ちがうデザインのバッジがもらえるよ。') })]);
  main.append(mc);
  // 友だちクエスト（ボット）
  const bot = friendBot(), mine = weekXp(today), tot = mine + bot.xp, fdone = tot >= FRIEND_GOAL, wk = E.weekOf(today), fclaimed = save.fq === wk;
  const fcard = h('div', { class: 'card', id: 'friendCard' }, [h('h3', { text: T('友だちクエスト') }),
    h('div', { class: 'qrow' }, [h('span', { class: 'av', style: 'width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:' + Fx.SKINS[0] + ';color:#1b1b1b;font-weight:900;flex:none', text: T(bot.name)[0] }), h('div', { class: 't' }, [h('span', { text: T('{name}（ボット）と、今週ふたりで {n} XP', { name: T(bot.name), n: FRIEND_GOAL }) }), h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.min(100, 100 * tot / FRIEND_GOAL) + '%' })), h('small', { class: 'note', id: 'friendProg', text: T('あなた {a} + {name} {b} = {t} / {n}', { a: mine, name: T(bot.name), b: bot.xp, t: tot, n: FRIEND_GOAL }) })]),
      h('button', { class: 'btn ' + (fdone && !fclaimed ? 'primary' : ''), type: 'button', id: 'friendClaim', disabled: fdone && !fclaimed ? null : true, onclick: () => claimFriend(wk) }, fclaimed ? T('うけとりずみ') : fdone ? T('宝箱をあける') : T('進行中'))]),
    h('p', { class: 'note', id: 'friendNote', text: T('これはボットの友だちです（ほんもののユーザーではありません）。ログインして友だちを足すと、ほんものの友だちとできます。') }),
    h('div', { class: 'set' }, [h('span', { text: T('あなたのフレンドコード') }), h('b', { id: 'myCode', style: 'letter-spacing:.15em', text: (FR() && FR().myCode && FR().myCode()) || myCode() })])]);
  main.append(fcard); upgradeFriendCard(fcard, wk);
  const feedList = h('div', { id: 'feedList' }, h('p', { class: 'note', text: '…' })); main.append(h('div', { class: 'card', id: 'feedCard' }, [h('h3', { text: T('友だちのできごと') }), feedList])); loadFeed(feedList).catch(() => {});
  main.append(timedCard());
  main.append(h('button', { class: 'banner', id: 'openShop', type: 'button', onclick: () => openGemSheet() }, [h('span', { class: 't' }, [h('b', { text: T('ジェムとお店') }), h('small', { text: T('フリーズ・ハート・ブースト・色') })]), h('span', { class: 'pill', style: 'background:var(--pp);color:var(--pp-ink)', text: '◆ ' + save.gm })]));
  show(main, true);
}
function claimQuest(i) {
  const qs = questsFor(today), q = qs[i]; if (!q || save.dq.c[i] || q.get(save.ds) < q.n) return;
  const r = E.rng(E.seedOf('qc|' + today + '|' + i)), rewards = [{ k: 'gm', n: 10 }]; if (r() < 0.3) rewards.push({ k: 'item', id: Object.keys(ITEMS)[Math.floor(r() * 5)], n: 1 });
  showChest({ title: T('クエスト達成！'), rewards, onClaim: () => { save.dq.c[i] = 1; persist(); Fx.sfx.quest(); goHome(); } });
}
function claimMonth(mk) {
  if (save.bd.includes(mk) || monthDays() < MONTH_TARGET) return;
  showChest({ title: T('月間クエスト達成！'), rewards: [{ k: 'gm', n: 50 }, { k: 'xp', n: 20 }, { k: 'item', id: 'freeze', n: 1 }], onClaim: () => { save.bd.push(mk); save.bd.sort(); persist(); feedEv('ach', T('{m}月のバッジをゲット！', { m: Number(mk.slice(5)) })); Fx.sfx.quest(); goHome(); } });
}
function claimFriend(wk) {
  const other = NET.pairLive && NET.pair ? NET.pair.theirs : friendBot().xp, mine = NET.pairLive && NET.pair ? NET.pair.mine : weekXp(today);
  if (save.fq === wk || mine + other < FRIEND_GOAL) return;
  showChest({ title: T('友だちクエスト達成！'), rewards: [{ k: 'gm', n: 20 }, { k: 'xp', n: 10 }], onClaim: () => { save.fq = wk; persist(); Fx.sfx.quest(); goHome(); } });
}


// ================================================================ オンライン（ほんもののリーグ・フィード・友だちクエスト）
// ログインしてニックネームを登録していて、Firestore のルール（firestore.rules（kbLg・kbFeed・kbPairs））が入っているときだけ動く。
// どれかが欠けたら、いままでどおりのこの端末のシミュレーションにもどる（エラーは出さない）。
const NET = { room: '', rows: null, state: 'idle', reason: '', sentT: 0, timer: 0, feed: null, feedAt: 0, pair: null, pairAt: 0 };
const nowMs = () => (window.__manabiNow ? Number(window.__manabiNow) : Date.now());
const dbg = () => /[?&]debug/.test(location.search);
const FR = () => (dbg() && window.__manabiFriends) || window.KoboFriends;
async function socialDb() {
  if (dbg() && window.__manabiNet) return window.__manabiNet();
  const C = window.KoboCloud, S = window.ManabiSocial;
  if (!C || !S || !window.firebase) return { reason: 'nocloud' };
  let uid = null; try { uid = C.me && C.me(); } catch (e) {}
  if (!uid) return { reason: 'signin' };
  const name = C.nickname && C.nickname(); if (!name) return { reason: 'nick' };
  try { if (!(await C.ready()) || !window.firebase.firestore) return { reason: 'nocloud' }; return { db: window.firebase.firestore(), uid, name }; } catch (e) { return { reason: 'nocloud' }; }
}
const fsTs = () => { try { return window.firebase.firestore.FieldValue.serverTimestamp(); } catch (e) { return nowMs(); } };
function botRows(week, tier, day) { return RIVALS.map((n, k) => ({ n, xp: rivalXp(week, tier, k, day), k })); }
// 先週の本物の組で順位を決めて段を上下する（読めなければ段はそのまま）
let settling = null;
function settleReal() {
  if (settling) return settling;
  const w = E.weekOf(today);
  if (!save.lg.rm || save.lg.w === w || save.lg.w <= 0) return Promise.resolve(false);
  settling = (async () => {
    try {
      const ctx = await socialDb(); let moved = 0;
      if (!ctx.db) return false;
      const pw = save.lg.w, lastDay = pw * 7 - 3 + 6, r = await ManabiSocial.members(ctx.db, save.lg.rm);
      if (!r.ok || !r.rows.length) { save.lg.rm = undefined; save.lg.sx = undefined; save.lg.w = w; persist(); return false; }
      const rows = ManabiSocial.board(r.rows, ctx.uid, botRows(pw, save.lg.t, lastDay), 10), z = ManabiSocial.zones(rows.length), rank = rows.findIndex(x => x.me) + 1;
      if (rank <= z.up && save.lg.t < TIERS.length - 1) { save.lg.t++; moved = 1; } else if (rank >= z.dnFrom && save.lg.t > 0) { save.lg.t--; moved = -1; }
      save.lg.rm = undefined; save.lg.sx = undefined; save.lg.w = w; persist();
      if (moved > 0) feedEv('promo', T('{t}リーグに上がった！', { t: T(TIERS[save.lg.t]) }));
      return true;
    } catch (e) { return false; } finally { settling = null; }
  })();
  return settling;
}
// 自分の組に入る（なければ作る）→ 順位表
async function loadRealLeague() {
  const w = E.weekOf(today); NET.state = 'loading';
  const ctx = await socialDb(); if (!ctx.db) { NET.state = 'off'; NET.reason = ctx.reason; return null; }
  if (save.lg.rm && save.lg.w !== w) await settleReal();
  if (save.lg.w !== w) settleLeague();
  let room = save.lg.rm; const wantPrefix = 'w' + w + '-t' + save.lg.t + '-';
  if (!room || !room.startsWith(wantPrefix)) {
    const j = await ManabiSocial.join(ctx.db, { uid: ctx.uid, name: ctx.name, week: w, tier: save.lg.t, xp: weekXp(today), ts: fsTs });
    if (!j.ok) { NET.state = 'off'; NET.reason = j.reason === 'write' ? 'denied' : j.reason; return null; }
    room = j.room; save.lg.rm = room; save.lg.sx = j.x != null ? j.x : save.lg.sx; persist();
  }
  const r = await ManabiSocial.members(ctx.db, room); if (!r.ok) { NET.state = 'off'; NET.reason = r.reason || 'read'; return null; }
  NET.room = room; NET.state = 'on'; NET.reason = '';
  const mine = weekXp(today); r.rows.forEach(x => { if (x.uid === ctx.uid) x.xp = Math.max(x.xp, Math.min(mine, 12000)); });
  NET.rows = ManabiSocial.board(r.rows, ctx.uid, botRows(w, save.lg.t, today), 10);
  return NET.rows;
}
// XP が増えたら、60 秒以上あけて自分の分だけ送る
function schedulePush() {
  if (!save.lg.rm || NET.timer || !window.ManabiSocial) return;
  const wait = Math.max(1500, ManabiSocial.GAP_MS + 1000 - (nowMs() - NET.sentT));
  NET.timer = setTimeout(async () => {
    NET.timer = 0; const ctx = await socialDb(); if (!ctx.db || !save.lg.rm) return;
    const xp = weekXp(today); if (xp <= (save.lg.sx || 0)) return;
    const r = await ManabiSocial.push(ctx.db, { room: save.lg.rm, uid: ctx.uid, name: ctx.name, xp, prevX: save.lg.sx || 0, prevT: NET.sentT, now: nowMs(), ts: fsTs });
    if (r.ok && r.x) { save.lg.sx = r.x; NET.sentT = nowMs(); persist(); if (xp > r.x) schedulePush(); }
  }, wait);
}
// フィード：自分のできごとを送る（ログインしているときだけ。失敗しても何も起きない）
async function feedEv(ty, tx) {
  try { const ctx = await socialDb(); if (!ctx.db) return; await ManabiSocial.feedPush(ctx.db, { uid: ctx.uid, ev: { ty, tx: Array.from(tx).slice(0, 60).join(''), at: Math.floor(nowMs() / 1000) }, now: nowMs(), ts: fsTs }); } catch (e) {}
}
const palUid = () => { const L = FR() && FR().list ? FR().list() : []; let sel = ''; try { sel = store.get('kusoge.manabi.pal') || ''; } catch (e) {} return L.find(f => f.uid === sel) || L[0] || null; };
async function loadFeed(box) {
  const ctx = await socialDb(), L = FR() && FR().list ? FR().list() : [];
  if (!ctx.db || !L.length) { box.replaceChildren(h('p', { class: 'note', text: ctx.db ? T('友だちを足すと、ここに友だちのできごとが出ます。') : T('ログインして友だちを足すと、ここに友だちのできごとが出ます。') })); return; }
  if (!NET.feed || nowMs() - NET.feedAt > 300000) { NET.feed = await ManabiSocial.feedRead(ctx.db, L); NET.feedAt = nowMs(); }
  box.replaceChildren(...(NET.feed.length ? NET.feed.map(e => h('div', { class: 'feedrow', 'data-ty': e.ty }, [h('b', { lang: 'ja', text: e.n || '' }), h('span', { lang: 'ja', text: ' ' + e.tx })])) : [h('p', { class: 'note', text: T('まだできごとがありません。') })]));
}
// 友だちクエスト（ほんものの友だち）
async function loadPair() {
  const ctx = await socialDb(), pal = palUid(); if (!ctx.db || !pal) return null;
  if (NET.pair && NET.pair.other === pal.uid && nowMs() - NET.pairAt < 120000) return NET.pair;
  const w = E.weekOf(today), r = await ManabiSocial.pairSync(ctx.db, { me: ctx.uid, other: pal.uid, week: w, xp: weekXp(today), ts: fsTs });
  if (!r.ok) return null;
  NET.pair = { other: pal.uid, name: pal.n, mine: r.mine, theirs: r.theirs }; NET.pairAt = nowMs(); return NET.pair;
}

// 友だちクエストのカードを、ほんものの友だち（フレンドコードで足した人）に切りかえる。足していなければ、ボットのまま＋コードを足す欄
function upgradeFriendCard(card, wk) {
  const add = h('div', { class: 'set', id: 'friendAdd' }, [h('input', { class: 'ans', id: 'friendCodeIn', type: 'text', maxlength: '8', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: T('友だちのコード（8文字）'), 'aria-label': T('友だちのコード（8文字）'), style: 'flex:1;min-width:0' }),
    h('button', { class: 'btn sub', style: 'width:auto', id: 'friendAddBtn', type: 'button', onclick: async () => { const K = FR(); if (!K) return; const msg = $('friendAddMsg'); const r = await K.add($('friendCodeIn').value); msg.textContent = r.ok ? T('友だちを足しました。') : T(FRIEND_ERR[r.reason] || FRIEND_ERR.error); if (r.ok) { NET.pair = null; NET.feed = null; goTab('quests'); } } }, T('足す'))]);
  if (FR()) { card.append(add, h('p', { class: 'note', id: 'friendAddMsg', role: 'status' })); }
  loadPair().then(p => {
    if (!p || !card.isConnected) return;
    NET.pairLive = true; const tot = p.mine + p.theirs, mine = p.mine;
    card.querySelector('.t span').textContent = T('{name}と、今週ふたりで {n} XP', { name: p.name || T('友だち'), n: FRIEND_GOAL }); card.querySelector('.t span').lang = 'ja';
    card.querySelector('.bar i').style.width = Math.min(100, 100 * tot / FRIEND_GOAL) + '%';
    $('friendProg').textContent = T('あなた {a} + {name} {b} = {t} / {n}', { a: mine, name: p.name || T('友だち'), b: p.theirs, t: tot, n: FRIEND_GOAL });
    const btn = $('friendClaim'), claimed = save.fq === wk, done = tot >= FRIEND_GOAL; btn.disabled = !(done && !claimed); btn.className = 'btn ' + (done && !claimed ? 'primary' : ''); btn.textContent = claimed ? T('うけとりずみ') : done ? T('宝箱をあける') : T('進行中');
    $('friend' + 'Note').textContent = T('ほんものの友だちとのクエストです。相手が今週学習すると、ここの数字が増えます（数分ごとに更新）。');
    card.querySelector('.av').textContent = Array.from(p.name || '友')[0];
  }).catch(() => {});
}
const FRIEND_ERR = { 'bad-code': 'コードは8文字です。', notfound: 'そのコードの人が見つかりません。', self: '自分のコードです。', exists: 'もう友だちです。', full: '友だちがいっぱいです。', db: 'いまは接続できません。', denied: 'いまは足せません（準備中）。', signin: 'ログインしてください。', error: 'うまくいきませんでした。' };
const NETWHY = { signin: 'ログインすると、ほんもののプレイヤーと競えます。いまはこの端末の中のシミュレーションです。', nick: 'ニックネームを登録すると、ほんもののプレイヤーと競えます（トップページのログイン欄）。いまはシミュレーションです。', nocloud: 'オンラインに接続できないので、いまはこの端末の中のシミュレーションです。', denied: 'オンラインのリーグはまだ準備中です。いまはこの端末の中のシミュレーションです。', read: 'オンラインのリーグを読み込めませんでした。いまはこの端末の中のシミュレーションです。', full: 'リーグの組がいっぱいでした。いまはシミュレーションです。' };

// ================================================================ リーグ（ログインしていなければ、この端末だけのシミュレーション）
const TIERS = ['ねじ', 'ボルト', 'ナット', 'はぐるま', 'ぜんまい', '金のはぐるま'];
const RIVALS = ['ミカン', 'タクミ', 'ソラ', 'ハルカ', 'リク', 'ユイ', 'ダイチ', 'ノア', 'サクラ'];
const rivalXp = (week, tier, k, day) => { // 1人ぶんの、その日までの今週のXP（日ごとの量は決まった乱数）
  const dayIx = ((day + 3) % 7); let s = 0;
  for (let d = 0; d <= dayIx; d++) { const r = E.rng(E.seedOf('lg|' + week + '|' + k + '|' + d)); const base = 14 + tier * 6 + (k * 7) % 17; s += Math.round((d === dayIx ? 0.5 : 1) * base * (0.4 + r() * 1.3)); }
  return s;
};
function weekXp(day) { let s = 0; const w = E.weekOf(day); for (const k of Object.keys(save.g)) { if (E.weekOf(Number(k)) === w) s += save.g[k]; } return s; }
function leagueRows(week, tier, day, mine) { return RIVALS.map((n, k) => ({ n, xp: rivalXp(week, tier, k, day), k })).concat([{ n: 'あなた', xp: mine, me: 1 }]).sort((a, b) => b.xp - a.xp || (a.me ? -1 : 1)); }
function settleLeague() { // 週がかわったら、先週の順位で段を上下する
  const w = E.weekOf(today);
  if (save.lg.w === w) return;
  if (save.lg.rm && save.lg.w > 0) { settleReal(); return; } // 本物の組に入っていたら、その順位で（読めたとき）
  if (save.lg.w > 0) {
    const pw = save.lg.w, lastDay = pw * 7 - 3 + 6; // 先週の日曜
    const rows = leagueRows(pw, save.lg.t, lastDay, weekXp(lastDay)); const rank = rows.findIndex(r => r.me) + 1;
    if (rank <= 3 && save.lg.t < TIERS.length - 1) save.lg.t++; else if (rank >= 8 && save.lg.t > 0) save.lg.t--;
    save.lg.last = undefined;
  }
  save.lg.w = w; persist();
}
function viewLeague() {
  setTitle(T('リーグ')); $('app').dataset.sub = 'social'; settleLeague();
  const w = E.weekOf(today), mine = weekXp(today), rows = leagueRows(w, save.lg.t, today, mine), main = h('div', { id: 'main' });
  const left = 6 - ((today + 3) % 7);
  main.append(h('div', { class: 'card' }, [h('h3', { id: 'tierName', text: T('今週のリーグ') + '：' + T(TIERS[save.lg.t]) }), h('p', { class: 'note', text: T('あと{n}日で今週がおわります。上位3人は次のリーグへ！', { n: left }) })]));
  const list = h('div', { class: 'card', id: 'leagueList' });
  rows.forEach((r, i) => list.append(h('div', { class: 'lg' + (r.me ? ' me' : '') + (i < 3 ? ' up' : i >= 7 ? ' dn' : ''), 'data-me': r.me ? '1' : null }, [h('span', { class: 'rk', text: String(i + 1) }), h('span', { class: 'av', style: 'background:' + Fx.SKINS[(r.k == null ? save.sk : r.k) % 6], text: T(r.n)[0] }), h('span', { class: 'nm', text: T(r.n) }), h('span', { class: 'xp', text: T('{n} XP', { n: r.xp }) })])));
  main.append(list);
  const note = h('p', { class: 'note', id: 'leagueNote', text: T('これは、この端末の中だけのシミュレーションです。ほんもののユーザーではありません（ライバルは決まった数式で動きます）。') });
  main.append(note);
  show(main, true);
  loadRealLeague().then(real => {
    if (tab !== 'league' || !$('leagueList')) return;
    if (!real) { note.textContent = T(NETWHY[NET.reason] || NETWHY.nocloud); note.dataset.net = NET.reason || 'off'; return; }
    const z = ManabiSocial.zones(real.length), nReal = real.filter(r => !r.bot).length; list.replaceChildren();
    real.forEach((r, i) => list.append(h('div', { class: 'lg' + (r.me ? ' me' : '') + (i < z.up ? ' up' : i + 1 >= z.dnFrom ? ' dn' : ''), 'data-me': r.me ? '1' : null, 'data-bot': r.bot ? '1' : null }, [h('span', { class: 'rk', text: String(i + 1) }), h('span', { class: 'av', style: 'background:' + Fx.SKINS[(r.k == null ? save.sk : r.k) % 6], text: Array.from(r.bot ? T(r.n) : r.n)[0] || '?' }), h('span', { class: 'nm', lang: 'ja', text: r.me ? T('あなた') : r.bot ? T(r.n) + T('（ボット）') : r.n }), h('span', { class: 'xp', text: T('{n} XP', { n: r.xp }) })])));
    note.dataset.net = 'on'; note.textContent = T('ほんもののプレイヤー {n} 人の組です。足りない席は（ボット）がうめています。XP はプレイヤーが自分で送るので、気楽な競争として楽しんでね。', { n: nReal });
  }).catch(() => {});
}

// ================================================================ プロフィール
function viewProfile() {
  setTitle(T('プロフィール')); $('app').dataset.sub = 'kobun';
  const main = h('div', { id: 'main' }), acc = save.st.q ? Math.round(100 * save.st.ok / save.st.q) : 0;
  main.append(h('div', { style: 'text-align:center;padding:4px 0' }, [h('span', { id: 'profMascot', html: Fx.mascot('happy', 128, save.sk) }), h('div', { style: 'font-weight:900;font-size:20px', text: T('ねじまる') })]));
  const LV = E.levelOf(save.xp);
  main.append(h('div', { class: 'card', id: 'profLevel' }, [h('h3', { text: T('レベル') + ' ' + LV.lv }), h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(Math.round(LV.frac * 100)) }, h('i', { style: 'width:' + Math.round(LV.frac * 100) + '%' })), h('p', { class: 'note', text: T('次のレベルまで {n} XP', { n: LV.hi - LV.xp }) })]));
  main.append(h('div', { class: 'stat4', id: 'profStats' }, [
    h('div', null, [h('b', { text: String(save.xp) }), h('small', { text: T('合計XP') })]), h('div', null, [h('b', { text: String(save.st.best) }), h('small', { text: T('最高のれんぞく') })]),
    h('div', null, [h('b', { text: String(save.st.ls) }), h('small', { text: T('レッスン') })]), h('div', null, [h('b', { text: acc + '%' }), h('small', { text: T('せいかい率') + '（' + save.st.q + '）' })]),
  ]));
  main.append(h('div', { class: 'card' }, [h('h3', { text: T('ねじまるの色') }), h('div', { class: 'skins' }, Fx.SKINS.map((c, i) => h('button', { type: 'button', style: 'background:' + c, 'aria-label': T('色') + (i + 1) + (save.ow.includes(i) ? '' : '（' + SKIN_COST + '）'), 'aria-pressed': String(i === save.sk), disabled: save.ow.includes(i) ? null : true })))]));
  const sw = (id, label, on, fn) => h('div', { class: 'set' }, [h('span', { text: label }), h('span', { class: 'sw-wrap' }, h('button', { class: 'sw', id, type: 'button', role: 'switch', 'aria-label': label, 'aria-pressed': String(!!on), onclick: e => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); fn(v); } }))]);
  main.append(h('div', { class: 'card' }, [h('h3', { text: T('せってい') }),
    sw('swSnd', T('効果音'), Fx.prefs.snd, v => { Fx.setPref('snd', v); if (v) Fx.sfx.ok(); }),
    h('div', { class: 'set' }, [h('label', { for: 'volRange', text: T('音量') }), h('input', { id: 'volRange', type: 'range', min: '0', max: '100', value: String(Math.round((Fx.prefs.vol == null ? 0.8 : Fx.prefs.vol) * 100)), style: 'flex:1;max-width:180px;min-height:44px', oninput: e => Fx.setPref('vol', e.target.value / 100), onchange: () => Fx.sfx.ok() }), h('button', { class: 'btn sub', style: 'width:auto', id: 'btnTestSnd', type: 'button', onclick: () => { Fx.sfx.chest(); } }, T('ためす'))]),
    sw('swHap', T('しんどう（ハプティクス）'), Fx.prefs.hap, v => { Fx.setPref('hap', v); if (v) Fx.buzz(20); }),
    sw('swAnim', T('アニメーション'), Fx.prefs.anim, v => { Fx.setPref('anim', v); document.body.classList.toggle('noanim', !v); }),
    sw('swSay', T('読み上げ'), Fx.prefs.say, v => Fx.setPref('say', v)),
    sw('swHeart', T('ハートモード（まちがえるとハートが減る・オフでOK）'), save.hm, v => { save.hm = v ? 1 : 0; if (v && save.hr < 1) save.hr = 5; persist(); renderChips(); }),
    h('div', { class: 'set' }, [h('span', { text: T('1日の目標') }), h('span', null, [10, 20, 30, 50].map(n => h('button', { class: 'btn sub', style: 'display:inline-flex;width:auto;min-width:52px;margin-left:4px', type: 'button', 'data-goal': n, onclick: () => { save.goal = n; persist(); renderChips(); goHome(); } }, (save.goal === n ? '● ' : '') + n)))]),
    h('div', { class: 'set' }, [h('span', { text: T('テーマ・言語') }), h('button', { class: 'btn sub', style: 'width:auto', id: 'btnSettings', type: 'button', onclick: () => openMenu() }, T('ひらく'))]),
    h('div', { class: 'set' }, [h('span', { text: T('使い方') }), h('button', { class: 'btn sub', style: 'width:auto', type: 'button', onclick: () => showHowto() }, T('ひらく'))]),
  ]));
  main.append(h('div', { class: 'foot' }, [h('p', { text: index.credit }), h('p', { text: T('問題はAIがつくったもので、まだ専門家の確認を受けていません。') }), h('p', { text: T('地図：Natural Earth（パブリックドメイン）をもとにした自作の簡略図。古文：著作権の保護期間が満了した古典。') }), licenseEl()]));
  show(main, true);
}

// ================================================================ lesson (practice / review)
async function buildPool(sets) { // sets: [set meta] → { items:[{set, qs, S, off, n}], qs, boxes }
  const items = []; let off = 0, qs = [], boxes = '';
  for (const s of sets) {
    const ch = await chunk(s.f);
    items.push({ set: s, qs: ch.q, S: ch.S, off, n: ch.q.length });
    qs = qs.concat(ch.q); boxes += E.parseBoxes(save.b[s.id], s.h, s.n); off += ch.q.length;
  }
  return { items, qs, boxes };
}
function pickSet(u) { // いちばん学ぶものが残っているセット
  const sets = u.sets.slice();
  sets.sort((a, b) => { const x = setStats(a), y = setStats(b); return (y.due + y.fresh) - (x.due + x.fresh); });
  return sets[0];
}
async function startLesson(u, si) {
  if (L) return;
  try {
    const set = pickSet(u);
    const pool = await buildPool([set]);
    const lessonNo = save.st.ls;
    if (si == null && u.sm && u.subs && u.subs.length) { si = u.subs.findIndex((x, i) => { const st = unitStats(u, i); return st.n && (st.n - st.fresh) / st.n < 0.5; }); if (si < 0) si = 0; }
    const only = u.sm && si != null ? subIdx(u, si) : undefined;
    const seed = 'l|' + today + '|' + u.id + '|' + (si == null ? '' : si) + '|' + lessonNo;
    const eng = E.createLesson({ qs: pool.qs, boxes: pool.boxes, today, seed, size: E.LESSON_SIZE, only });
    beginLesson({ eng, pool, kind: 'unit', unit: u, desc: { k: 'unit', u: u.id, s: set.id, seed, today, b0: pool.boxes, size: E.LESSON_SIZE, only }, si });
  } catch (e) { loadFail(e); }
}
async function startReview() {
  if (L) return;
  try {
    const cand = [];
    for (const s of allSets()) {
      if (!save.b[s.id]) continue;
      const b = E.parseBoxes(save.b[s.id], s.h, s.n); let due = 0, weak = 0;
      for (let i = 0; i < s.n; i++) { const c = E.card(b, i); if (c.box && E.isDue(c, today)) due++; else if (c.box && c.box <= 2) weak++; }
      if (due + weak) cand.push({ s, due, weak });
    }
    if (!cand.length) return;
    cand.sort((a, b) => (b.due * 2 + b.weak) - (a.due * 2 + a.weak) || (a.s.id < b.s.id ? -1 : 1));
    const pool = await buildPool(cand.slice(0, 3).map(c => c.s));
    const only = [];
    for (let i = 0; i < pool.qs.length; i++) { const c = E.card(pool.boxes, i); if (c.box && (E.isDue(c, today) || c.box <= 2)) only.push(i); }
    const seed = 'r|' + today + '|' + save.st.ls, size = Math.min(E.LESSON_SIZE, only.length);
    const eng = E.createLesson({ qs: pool.qs, boxes: pool.boxes, today, seed, size, only, mode: 'review' });
    beginLesson({ eng, pool, kind: 'review', desc: { k: 'review', ss: pool.items.map(it => it.set.id), seed, today, b0: pool.boxes, size, only } });
  } catch (e) { loadFail(e); }
}
async function startMockMiss() {
  if (L || !save.mm.length) return;
  try {
    const take = save.mm.slice(-8), ids = [...new Set(take.map(x => x[0]))], items = []; let off = 0, qs = [];
    for (const id of ids) { const x = index.exams.find(e => e.id === id); if (!x) continue; const ch = await chunk(x.f); items.push({ set: { id }, qs: ch.q, S: ch.S, off, n: ch.q.length }); qs = qs.concat(ch.q); off += ch.q.length; }
    const only = []; qs.forEach((q, i) => { if (take.some(x => x[1] === q.i)) only.push(i); });
    if (!only.length) { save.mm = []; persist(); return goHome(); }
    const boxes = '000'.repeat(qs.length);
    const eng = E.createLesson({ qs, boxes, today, seed: 'mm|' + today + '|' + save.st.ls, size: Math.min(8, only.length), only, mode: 'review' });
    beginLesson({ eng, pool: { items, qs, boxes, noBoxes: true }, kind: 'mockmiss' });
  } catch (e) { loadFail(e); }
}
const contentCache = {};
async function loadJson(name) { if (!contentCache[name]) contentCache[name] = fetch(new URL('content/' + name + '.json', location.href).href).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(e => { delete contentCache[name]; throw e; }); return contentCache[name]; }
async function loadContent(u) {
  const c = {};
  if (u.need) c[u.need] = await loadJson(u.need);
  if (u.maps === 'jp') c.mapJp = await loadJson('map-jp');
  if (u.maps === 'world') c.mapWorld = await loadJson('map-world');
  return c;
}
async function startSpecial(u) {
  if (L) return;
  try {
    const c = await loadContent(u);
    const qs = G.make(u.id, 'sp|' + today + '|' + save.st.ls + '|' + (save.cw[u.id] || 0), c, 8);
    const boxes = '000'.repeat(qs.length);
    const gseed = 'sp|' + today + '|' + save.st.ls + '|' + (save.cw[u.id] || 0), seed = 'sp|' + u.id + '|' + save.st.ls + '|' + today;
    const eng = E.createLesson({ qs, boxes, today, seed, size: qs.length });
    beginLesson({ eng, pool: { items: [], qs, boxes }, kind: 'special', unit: u, desc: { k: 'special', u: u.id, gseed, seed, today } });
  } catch (e) { loadFail(e); }
}
// ---- レッスンの途中の保存（この端末だけ）。決まった結果なので、「はじめの状態＋答えた記録」を入れて、読み込み直したら同じ順で再現する
const RUN_KEY = 'kusoge.manabi.run';
function saveRun() { if (!L || !L.desc) return; store.set(RUN_KEY, JSON.stringify({ d: L.desc, log: L.log || [], xp: L.xp, t: L.startedAt, ft: L.firstToday ? 1 : 0, miss: L.miss })); }
function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch (e) {} }
function readRun() { try { const r = JSON.parse(store.get(RUN_KEY) || 'null'); return r && r.d && Array.isArray(r.log) && r.d.today >= today - 1 ? r : null; } catch (e) { return null; } }
async function resumeRun() {
  const r = readRun(); if (!r || L) return false;
  try {
    const d = r.d; let pool, eng, unit = null;
    if (d.k === 'special') {
      unit = G.UNITS.map(u => Object.assign({ special: 1, sub: specialSub(u.course) }, u)).find(u => u.id === d.u);
      const c = await loadContent(unit), qs = G.make(unit.id, d.gseed, c, 8), boxes = '000'.repeat(qs.length);
      pool = { items: [], qs, boxes }; eng = E.createLesson({ qs, boxes, today: d.today, seed: d.seed, size: qs.length });
    } else {
      const sets = d.k === 'unit' ? allSets().filter(s => s.id === d.s) : d.ss.map(id => allSets().find(s => s.id === id));
      if (d.k === 'unit') unit = sets[0] && sets[0].unit;
      pool = await buildPool(sets);
      eng = E.createLesson({ qs: pool.qs, boxes: d.b0, today: d.today, seed: d.seed, size: d.size, only: d.only, mode: d.k === 'review' ? 'review' : undefined });
    }
    for (const kind of r.log) E.answer(eng, kind);
    beginLesson({ eng, pool, kind: d.k, unit, desc: d, resumed: true });
    L.log = r.log.slice(); L.xp = r.xp || 0; L.miss = r.miss || 0; L.startedAt = r.t || Date.now(); L.firstToday = !!r.ft; L.prevProg = Math.round(E.progressOf(eng) * 100);
    if (!eng.cur) { finishLesson(); return true; }
    renderQuestion(); return true;
  } catch (e) { clearRun(); loadFail(e); return false; }
}
function loadFail(e) {
  if (UI) UI.toast(T('読み込めませんでした。通信を確かめて、もう一度ためしてください。'), { type: 'danger' });
  console.warn('manabi load', e);
}
function beginLesson(o) {
  L = Object.assign(o, { log: [], xp: 0, startedAt: Date.now(), results: 0, ui: {}, done: false, firstToday: !save.d.includes(today), miss: 0, heartOk: false });
  $('app').dataset.sub = o.unit && o.unit.special ? o.unit.sub : (o.unit && o.unit.sub) || view.sub || 'english';
  screen = 'lesson';
  emit('play_start', { mode: 'normal' });
  Fx.sfx.tap();
  renderQuestion();
}
function poolIndex(i) { // 通し番号 → { it（プールの1セット）, k（セット内の位置）}
  for (const it of L.pool.items) if (i < it.off + it.n) return { it, k: i - it.off };
  return null;
}
function cur() { return L && L.eng.cur ? L.eng.cur : null; }
function qEnv(c) {
  if (L.kind === 'special') return { q: c.e.q, S: {}, set: { id: c.e.q.gen || 'gen' } };
  const p = poolIndex(c.e.i); return { q: c.e.q, S: p.it.S, set: p.it.set };
}
// 英語の短答は、ことばタイル・聞いて選ぶ・空らん選びに自動で変わる（答えは元の問題から）
function maybeVariant(q) {
  if ((L.kind !== 'unit' && L.kind !== 'review') || Fx.prefs.variety === 0) return null;
  const r = E.rng(E.seedOf('vr|' + q.i + '|' + today));
  if (r() > 0.75) return null;
  return G.variantOf(q, L.pool.qs, today);
}

function renderQuestion() {
  const c = cur();
  if (!c) return finishLesson();
  const env = qEnv(c), S = env.S, set = env.set;
  const v = maybeVariant(env.q), q = v || env.q;
  const eng = L.eng;
  setBack(() => askQuit());
  setTitle(T('レッスン'));
  const ui = L.ui = { q, c, sel: null, multi: [], order: [], checked: false, input: null, self: false, result: null, set, tiles: [], tsel: [], hs: null, pairs: [], errs: 0, left: null, ft: {}, variant: !!v };
  const bar = h('div', { class: 'lh' }, [
    h('button', { class: 'icon', type: 'button', id: 'btnQuit', 'aria-label': T('とじる'), onclick: () => askQuit() }, h('span', { text: '✕', style: 'font-size:20px;font-weight:800' })),
    h('div', { class: 'pbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(E.progressOf(eng) * 100)) }, h('i', { id: 'pbarFill', style: 'width:' + (L.prevProg || 0) + '%' })),
    L.kind === 'jump' ? h('span', { class: 'hearts', id: 'jumpHearts', 'aria-label': T('のこりのチャンス') }, [h('span', { html: ICON.heart }), String(Math.max(0, 3 - L.miss))]) : save.hm ? h('span', { class: 'hearts', id: 'lessonHearts' }, [h('span', { html: ICON.heart }), String(save.hr)]) : null,
  ]);
  const prog = Math.round(E.progressOf(eng) * 100); L.prevProg = prog;
  requestAnimationFrame(() => requestAnimationFrame(() => { const f = $('pbarFill'); if (f) f.style.width = prog + '%'; }));
  const body = h('div', { class: 'q', id: 'qbody' });
  const tags = h('div', { class: 'tags' }, [
    h('span', { class: 'tag', text: typeLabel(q.t) }),
    h('span', { class: 'tag', text: 'Lv' + (q.df || 2) }),
    c.retry ? h('span', { class: 'tag retry', id: 'tagRetry', text: T('もう一度！') }) : null,
    L.kind === 'review' ? h('span', { class: 'tag', text: T('ふくしゅう') }) : null,
  ]);
  body.append(tags);
  if (q.st && S[q.st]) body.append(stimEl(S[q.st]));
  if (q.f) body.append(svgImg(q.f));
  if (q.tb) body.append(tableEl(q.tb));
  if (q.sp) body.append(speakerEl(q));
  if (q.svg && q.t !== 'hs') { const hb = h('div', { class: 'hsbox', 'aria-label': q.f && q.f.a || '' }); hb.innerHTML = q.svg; hb.querySelectorAll('.rg').forEach(g => g.removeAttribute('tabindex')); body.append(hb); }
  body.append(h('div', { class: 'stem', id: 'stem' }, rich(q.q + (q.sp && !Fx.canSpeak() ? '\n' + q.sp : ''))));
  body.append(answerArea(ui));
  const dock = h('div', { class: 'dock', id: 'dock', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, [bar, body, dock]), false);
  ui.dock = dock; ui.body = body;
  drawDock();
  const first = body.querySelector('input.ans'); if (first && !('ontouchstart' in window)) first.focus({ preventScroll: true });
  else { const st0 = $('stem'); if (st0) { st0.setAttribute('tabindex', '-1'); st0.focus({ preventScroll: true }); } }
  body.scrollTop = 0;
  if (q.sp && Fx.canSpeak()) setTimeout(() => { if (L && L.ui === ui) Fx.speak(q.sp, q.lang || 'en'); }, 350);
}
function speakerEl(q) {
  if (!Fx.canSpeak()) return h('div', { class: 'hint', text: T('音声が使えないので、文を表示しています。') });
  return h('div', { class: 'speaker' }, [
    h('button', { class: 'btn b', id: 'btnSpeak', type: 'button', 'aria-label': T('音声をきく'), onclick: () => Fx.speak(q.sp, q.lang || 'en', 1) }, h('span', { html: ICON.speaker })),
    h('button', { class: 'btn b slow', id: 'btnSlow', type: 'button', 'aria-label': T('ゆっくりきく'), onclick: () => Fx.speak(q.sp, q.lang || 'en', 0.6) }, T('ゆっくり')),
  ]);
}
const TYPE_JA = { mc: '選択', ms: '複数選択', or: '並べ替え', nu: '数値', sa: '短答', de: '記述', pr: '証明', mp: '組み合わせ', wb: 'ことばタイル', tt: 'タップで見つける', hs: '図をタップ', ft: '表をうめる' };
const TYPE_EN = { mc: 'Choice', ms: 'Multi-select', or: 'Ordering', nu: 'Number', sa: 'Short answer', de: 'Written', pr: 'Proof', mp: 'Match pairs', wb: 'Word bank', tt: 'Tap to find', hs: 'Tap the figure', ft: 'Fill the table' };
const typeLabel = t => (EN ? TYPE_EN : TYPE_JA)[t] || t;

function answerArea(ui) {
  const q = ui.q, box = h('div', { id: 'answer' });
  if (q.t === 'mc' || q.t === 'ms') {
    box.append(h('div', { class: 'hint', style: 'margin:0 0 6px', text: q.t === 'mc' ? T('記号をえらぼう') : T('当てはまるものをすべてえらぼう') }));
    const ul = h('div', { class: 'choices', role: q.t === 'mc' ? 'radiogroup' : 'group' });
    q.c.forEach((ch, i) => {
      const b = h('button', { class: 'ch', type: 'button', 'data-label': ch[0], 'data-i': i, 'aria-pressed': 'false', onclick: () => pick(ch[0]) }, [h('span', { class: 'k', lang: 'ja', text: ch[0] }), h('span', { class: 'x' }, rich(ch[1]))]);
      ul.append(b);
    });
    box.append(ul);
  } else if (q.t === 'or') {
    box.append(h('div', { class: 'hint', style: 'margin:0 0 6px', text: T('タップして順番にならべよう') }));
    ui.rowEl = h('div', { class: 'ordrow', id: 'ordrow', 'aria-live': 'polite' }); ui.poolEl = h('div', { class: 'ordpool', id: 'ordpool' });
    box.append(ui.rowEl, ui.poolEl);
    box.append(h('div', { class: 'mini' }, [h('button', { type: 'button', id: 'ordUndo', onclick: () => orderUndo() }, T('1つもどす')), h('button', { type: 'button', id: 'ordClear', onclick: () => orderClear() }, T('クリア'))]));
    drawOrder();
  } else if (q.t === 'nu' || q.t === 'sa') {
    const inp = h('input', { class: 'ans', id: 'ansInput', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': T('答えを入力'), placeholder: q.t === 'nu' ? T('数やことばを入力') : T('答えを入力'), oninput: () => drawDock() });
    if (q.un && q.t === 'nu') inp.setAttribute('placeholder', T('数やことばを入力') + '（' + q.un + '）');
    box.append(inp);
    if (/\$|\\/.test(q.a) || /\$/.test(q.q)) box.append(h('div', { class: 'hint', text: T('分数は 3/5、べき乗は x^2 のように書けます') }));
    ui.input = inp;
  } else if (q.t === 'mp') {
    ui.left = null;
    const lefts = q.pairs.map(p => p[0]), rights = q.rs;
    const cl = h('div'), cr = h('div');
    lefts.forEach(l => cl.append(h('button', { class: 'ch', type: 'button', 'data-l': l, 'aria-pressed': 'false', onclick: e => mpLeft(l, e.currentTarget) }, h('span', { class: 'x' }, rich(l)))));
    rights.forEach(r => cr.append(h('button', { class: 'ch', type: 'button', 'data-r': r, onclick: e => mpRight(r, e.currentTarget) }, h('span', { class: 'x' }, rich(r)))));
    box.append(h('div', { class: 'hint', style: 'margin:0 0 6px', text: T('左と右をタップして、なかまを結ぼう') }), h('div', { class: 'mpcols', id: 'mpcols' }, [cl, cr]));
  } else if (q.t === 'wb') {
    ui.rowEl = h('div', { class: 'wbrow', id: 'wbrow', 'aria-live': 'polite' }); ui.poolEl = h('div', { class: 'wbbank', id: 'wbbank' });
    box.append(ui.rowEl, ui.poolEl, h('div', { class: 'mini' }, [h('button', { type: 'button', id: 'wbClear', onclick: () => { if (!ui.checked) { ui.tiles = []; drawTiles(); drawDock(); } } }, T('クリア'))]));
    drawTiles();
  } else if (q.t === 'tt') {
    box.append(h('div', { class: 'hint', style: 'margin:0 0 8px', text: T('あてはまる語をすべてタップ') }));
    const w = h('div', { id: 'ttwrap' });
    q.tk.forEach((t, i) => w.append(h('button', { class: 'tok', lang: 'ja', type: 'button', 'data-i': i, 'aria-pressed': 'false', onclick: () => { if (ui.checked) return; const k = ui.tsel.indexOf(i); k >= 0 ? ui.tsel.splice(k, 1) : ui.tsel.push(i); Fx.sfx.tap(); w.querySelectorAll('.tok').forEach(b => b.setAttribute('aria-pressed', String(ui.tsel.includes(Number(b.dataset.i))))); drawDock(); } }, t)));
    box.append(w);
  } else if (q.t === 'hs') {
    const hb = h('div', { class: 'hsbox', id: 'hsbox' }); hb.innerHTML = q.svg; box.append(hb);
    const pickR = id => { if (ui.checked) return; ui.hs = id; Fx.sfx.tap(); hb.querySelectorAll('.rg').forEach(g => g.classList.toggle('picked', g.dataset.r === id)); box.querySelectorAll('.hslist button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === id))); drawDock(); };
    hb.querySelectorAll('.rg').forEach(g => { { const tt = document.createElementNS('http://www.w3.org/2000/svg', 'title'); tt.textContent = q.rg[g.dataset.r] || ''; tt.setAttribute('lang', 'ja'); g.insertBefore(tt, g.firstChild); } g.addEventListener('click', () => pickR(g.dataset.r)); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pickR(g.dataset.r); } }); });
    const names = Object.entries(q.rg).sort((a, b) => (a[1] < b[1] ? -1 : 1));
    box.append(h('details', { class: 'hslist' }, [h('summary', { text: T('リストから選ぶ') }), h('div', { class: 'grid' }, names.map(([id, nm]) => h('button', { type: 'button', 'data-r': id, 'aria-pressed': 'false', onclick: () => pickR(id) }, nm)))]));
  } else if (q.t === 'ft') {
    const tbl = h('table'), thr = h('tr', null, [h('th', { text: '' })].concat(q.hd.map((x, i) => h('th', { lang: 'ja', id: 'fth' + i, text: x }))));
    const tr = h('tr', null, [h('th', { lang: 'ja', text: q.row.n })]);
    q.cells.forEach((c, i) => tr.append(h('td', null, !c ? h('span', { class: 'ftfix', text: '―' }) : c.ask ? h('input', { class: 'ftin', 'data-c': i, type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-labelledby': 'fth' + i, oninput: e => { ui.ft[i] = e.target.value; drawDock(); } }) : h('span', { class: 'ftfix', lang: 'ja', text: (q.row.pre || '') + c.v[0] }))));
    tbl.append(h('thead', null, thr), h('tbody', null, tr));
    box.append(h('div', { class: 'hint', style: 'margin:0 0 6px' }, q.row.pre ? [T('語幹「{s}」のあとの活用語尾を入れよう', { s: '\u0001' }).split('\u0001')[0], h('span', { lang: 'ja', text: q.row.pre }), T('語幹「{s}」のあとの活用語尾を入れよう', { s: '\u0001' }).split('\u0001')[1]] : T('活用語尾をひらがなで入れよう')), h('div', { class: 'fttable', id: 'fttable' }, tbl));
  } else {
    box.append(h('div', { class: 'sgq', text: T('記述の問題です。自分のノートに書いてから「答えを見る」を押そう。') }));
  }
  return box;
}
// ---- つなぐ（左→右）
function mpLeft(l, el) {
  const ui = L.ui; if (ui.checked || el.classList.contains('matched')) return;
  ui.left = l; Fx.sfx.tap();
  document.querySelectorAll('#mpcols [data-l]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.l === l)));
}
function mpRight(r, el) {
  const ui = L.ui, q = ui.q; if (ui.checked || ui.left == null) return;
  if (!q.ru && el.classList.contains('matched')) return;
  const ok = q.pairs.some(p => p[0] === ui.left && p[1] === r);
  const lb = document.querySelector('#mpcols [data-l="' + CSS.escape(ui.left) + '"]');
  if (ok) {
    ui.pairs.push([ui.left, r]); lb.classList.add('matched'); lb.setAttribute('aria-pressed', 'false'); lb.disabled = true; if (!q.ru) { el.classList.add('matched'); el.disabled = true; }
    Fx.sfx.pair(); Fx.buzz(8); ui.left = null;
    if (ui.pairs.length === q.pairs.length) mpDone();
  } else {
    ui.errs++; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake', 'bad'); setTimeout(() => el.classList.remove('bad'), 500); Fx.sfx.ng(); Fx.buzz(30);
  }
}
function mpDone() {
  const ui = L.ui, r = E.check(ui.q, ui.pairs);
  ui.checked = true; ui.result = { ok: r.ok && ui.errs === 0, mistakes: ui.errs }; ui.yours = null;
  reactSfx(ui.result.ok); drawDock();
}
// ---- ことばタイル
function drawTiles() {
  const ui = L.ui, q = ui.q, row = ui.rowEl, bank = ui.poolEl;
  row.replaceChildren(); bank.replaceChildren();
  ui.tiles.forEach((id, n) => { const w = q.w.find(x => x.id === id); row.append(h('button', { class: 'tile', type: 'button', 'data-id': id, disabled: ui.checked ? true : null, onclick: () => { if (ui.checked) return; ui.tiles.splice(n, 1); Fx.sfx.tap(); drawTiles(); drawDock(); } }, rich(w.t))); });
  q.w.forEach(w => { bank.append(h('button', { class: 'tile' + (ui.tiles.includes(w.id) ? ' used' : ''), type: 'button', 'data-id': w.id, tabindex: ui.tiles.includes(w.id) ? '-1' : null, disabled: ui.checked ? true : null, onclick: () => { if (ui.checked || ui.tiles.includes(w.id)) return; ui.tiles.push(w.id); Fx.sfx.tap(); drawTiles(); drawDock(); } }, rich(w.t))); });
}
function reactSfx(ok) {
  const combo = L && L.eng ? L.eng.streak : 0;
  if (ok) { Fx.sfx.ok(combo); Fx.buzz(12); if (combo >= 3 && combo % 3 === 0) setTimeout(() => Fx.sfx.combo(combo), 220); const d = $('dock') || $('reply'); if (d) { Fx.floatText(d, '+' + (combo >= 1 ? 2 : 2) + ' XP', 'ok'); } const sh = document.querySelector('#pbarFill'); if (sh) { sh.classList.remove('shine'); void sh.offsetWidth; sh.classList.add('shine'); } }
  else { Fx.sfx.ng(); Fx.buzz([30, 40, 30]); Fx.shake($('qbody') || $('chat')); }
}
function pick(label) {
  const ui = L.ui; if (ui.checked) return;
  const q = ui.q;
  if (q.t === 'mc') ui.sel = label;
  else { const i = ui.multi.indexOf(label); if (i >= 0) ui.multi.splice(i, 1); else ui.multi.push(label); }
  document.querySelectorAll('#answer .ch').forEach(b => { const on = q.t === 'mc' ? b.dataset.label === ui.sel : ui.multi.includes(b.dataset.label); b.setAttribute('aria-pressed', String(on)); });
  drawDock();
}
function drawOrder() {
  const ui = L.ui, q = ui.q, row = ui.rowEl, pool = ui.poolEl;
  row.replaceChildren(); pool.replaceChildren();
  ui.order.forEach((l, n) => {
    const ch = q.c.find(c => c[0] === l);
    row.append(h('button', { class: 'ch', type: 'button', 'data-label': l, disabled: ui.checked ? true : null, onclick: () => { if (ui.checked) return; ui.order.splice(n, 1); drawOrder(); drawDock(); } }, [h('span', { class: 'k', text: String(n + 1) }), h('span', { class: 'x' }, rich(ch[1]))]));
  });
  q.c.forEach((ch, i) => {
    if (ui.order.includes(ch[0])) return;
    pool.append(h('button', { class: 'ch', type: 'button', 'data-label': ch[0], 'data-i': i, disabled: ui.checked ? true : null, onclick: () => orderAdd(ch[0]) }, [h('span', { class: 'k', lang: 'ja', text: ch[0] }), h('span', { class: 'x' }, rich(ch[1]))]));
  });
}
function orderAdd(l) { const ui = L.ui; if (ui.checked || ui.order.includes(l)) return; ui.order.push(l); drawOrder(); drawDock(); }
function orderUndo() { const ui = L.ui; if (ui.checked) return; ui.order.pop(); drawOrder(); drawDock(); }
function orderClear() { const ui = L.ui; if (ui.checked) return; ui.order = []; drawOrder(); drawDock(); }

function currentInput() {
  const ui = L.ui, q = ui.q;
  if (q.t === 'mc') return ui.sel;
  if (q.t === 'ms') return ui.multi.slice();
  if (q.t === 'or') return ui.order.slice();
  if (q.t === 'wb') return ui.tiles.slice();
  if (q.t === 'tt') return ui.tsel.slice();
  if (q.t === 'hs') return ui.hs;
  if (q.t === 'ft') return Object.assign({}, ui.ft);
  if (q.t === 'mp') return ui.pairs.slice();
  if (q.t === 'nu' || q.t === 'sa') return ui.input ? ui.input.value : '';
  return null;
}
function hasInput() {
  const ui = L.ui, q = ui.q;
  if (E.isSelfGrade(q)) return true;
  if (q.t === 'mc') return !!ui.sel;
  if (q.t === 'ms') return ui.multi.length > 0;
  if (q.t === 'or') return ui.order.length === q.c.length;
  if (q.t === 'wb') return ui.tiles.length > 0;
  if (q.t === 'tt') return ui.tsel.length > 0;
  if (q.t === 'hs') return !!ui.hs;
  if (q.t === 'ft') return Object.values(ui.ft).some(v => String(v).trim());
  if (q.t === 'mp') return false;
  return !!(ui.input && ui.input.value.trim());
}
function drawDock() {
  const ui = L.ui, q = ui.q, dock = ui.dock;
  if (!dock) return;
  dock.className = 'dock'; dock.replaceChildren();
  if (!ui.checked) {
    const self = E.isSelfGrade(q);
    if (q.t === 'mp') { dock.append(h('div', { class: 'hint', style: 'text-align:center', text: T('ぜんぶ結ぶと自動で進みます') })); return; }
    dock.append(h('button', { class: 'btn primary', id: 'btnCheck', type: 'button', disabled: hasInput() ? null : true, onclick: () => (self ? revealSelf() : checkNow()) }, self ? T('答えを見る') : T('こたえあわせ')));
    return;
  }
  const r = ui.result;
  if (ui.self && !ui.graded) { // 自己採点
    dock.append(feedbackBody(null));
    dock.append(h('div', { class: 'hint', style: 'margin:0 0 6px', text: T('自分の答えと見くらべて、どうだった？') }));
    dock.append(h('div', { class: 'three', id: 'selfBtns' }, [
      h('button', { class: 'btn ok', type: 'button', 'data-g': 'ok', onclick: () => grade('sg-ok') }, T('できた')),
      h('button', { class: 'btn', type: 'button', 'data-g': 'unsure', onclick: () => grade('sg-unsure') }, T('あやしい')),
      h('button', { class: 'btn ng', type: 'button', 'data-g': 'no', onclick: () => grade('sg-no') }, T('できなかった')),
    ]));
    return;
  }
  dock.classList.add(r.ok ? 'ok' : 'ng');
  const expr = r.ok ? (L.eng && L.eng.streak >= 3 ? 'cheer' : 'happy') : 'sad';
  dock.append(h('div', { class: 'fbhead' }, [h('span', { html: Fx.mascot(expr, 56, save.sk) }), h('div', { class: 'fbtitle', id: 'fbTitle', text: ui.self ? T({ 'sg-ok': 'できた', 'sg-unsure': 'あやしい', 'sg-no': 'できなかった' }[r.kind] || 'できた') : r.ok ? T(L.eng && L.eng.streak >= 3 ? 'すごい！れんぞく正解！' : 'せいかい！') : T('ドンマイ！つぎでとりかえそう') })]));
  dock.append(feedbackBody(r));
  dock.append(h('button', { class: 'btn ' + (r.ok ? 'ok' : 'ng'), id: 'btnNext', type: 'button', onclick: () => nextQuestion() }, T('つぎへ')));
  const nb = $('btnNext'); if (nb) nb.focus({ preventScroll: true });
}
function feedbackBody(r) {
  const ui = L.ui, q = ui.q, box = h('div', { class: 'fbbody', id: 'fbBody' });
  const you = ui.yours;
  if (r && !r.ok && you && !E.isSelfGrade(q)) box.append(h('div', { class: 'row' }, [h('span', { class: 'lab', text: T('あなたの答え') }), you]));
  box.append(h('div', { class: 'row' }, [h('span', { class: 'lab', text: T('正解') }), ...E.answerText(q).map(t => h('div', { class: 'rich' }, rich(t)))]));
  if (q.e) box.append(h('div', { class: 'row' }, [h('span', { class: 'lab', text: T('なぜ？') }), rich(q.e)]));
  if (q.ea || (q.es && q.es.length)) {
    const d = h('details', { id: 'detail' }, [h('summary', { text: T('くわしい解説') })]);
    if (q.ea) d.append(h('div', { class: 'row' }, [h('span', { class: 'lab', text: T('考え方') }), rich(q.ea)]));
    if (q.es && q.es.length) d.append(h('div', { class: 'row' }, [h('span', { class: 'lab', text: T('手順') }), h('ol', null, q.es.map(s => h('li', null, rich(s))))]));
    box.append(d);
  }
  const mini = h('div', { class: 'mini' });
  if (r && !r.ok && !r.self && (q.t === 'nu' || q.t === 'sa') && !ui.overridden) {
    mini.append(h('button', { type: 'button', id: 'btnMine', onclick: () => overrideCorrect() }, T('自分の答えは合っていた')));
  }
  mini.append(reportLink(q, ui.set));
  box.append(mini);
  return box;
}
function reportLink(q, set) {
  const done = !!reports[q.i];
  const title = '[まなび] 問題の誤りの報告: ' + q.i;
  const body = ['問題ID: `' + q.i + '`', 'セット: `' + (set ? set.id : '') + '`', '', '気づいたこと（どこがまちがっていると思いますか？）:', '', '', '---', '（このページの内容は、まなびの工房の「まちがいを報告」ボタンから作られました。個人情報は含まれません）'].join('\n');
  const a = h('a', { class: done ? 'done' : '', id: 'btnReport', href: REPO_ISSUES + '?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body), target: '_blank', rel: 'noopener noreferrer', 'data-qid': q.i,
    onclick: () => { reports[q.i] = today; store.set(REP_KEY, JSON.stringify(reports)); a.classList.add('done'); a.textContent = T('報告ずみ'); } }, done ? T('報告ずみ') : T('まちがいを報告'));
  return a;
}

// ---- check / grade（エンジンへの記録は「つぎへ」を押したときに確定する：flushPending）
function checkNow() {
  const ui = L.ui, q = ui.q;
  if (ui.checked || !hasInput()) return;
  const input = currentInput();
  const r = E.check(q, input);
  ui.checked = true; ui.result = r;
  ui.yours = (q.t === 'nu' || q.t === 'sa') ? h('div', { class: 'rich', text: String(input) }) : null;
  markChoices(r);
  if (r.unit && UI) UI.toast(T('単位をたしかめよう'));
  if (ui.input) ui.input.disabled = true;
  reactSfx(r.ok);
  drawDock();
  if (q.t === 'or') drawOrder();
  if (q.t === 'wb') drawTiles();
}
function markChoices(r) {
  const ui = L.ui, q = ui.q;
  if (q.t === 'tt') document.querySelectorAll('#ttwrap .tok').forEach(b => { const i = Number(b.dataset.i); b.disabled = true; if (q.a.includes(i)) b.classList.add('good'); else if (ui.tsel.includes(i)) b.classList.add('bad'); });
  if (q.t === 'hs') document.querySelectorAll('#hsbox .rg').forEach(g => { g.classList.remove('picked'); if (g.dataset.r === q.a) g.classList.add('good'); else if (g.dataset.r === ui.hs) g.classList.add('picked'); });
  if (q.t === 'ft') document.querySelectorAll('#fttable .ftin').forEach(i => { i.disabled = true; const c = q.cells[Number(i.dataset.c)]; i.classList.add(c.v.some(x => E.sameText(x, i.value)) ? 'good' : 'bad'); });
  if (q.t !== 'mc' && q.t !== 'ms') return;
  const right = Array.isArray(q.a) ? q.a : [q.a], mine = q.t === 'mc' ? [ui.sel] : ui.multi;
  document.querySelectorAll('#answer .ch').forEach(b => { b.disabled = true; const l = b.dataset.label; if (right.includes(l)) b.classList.add('good'); else if (mine.includes(l)) b.classList.add('bad'); });
}
function revealSelf() {
  const ui = L.ui; if (ui.checked) return;
  ui.checked = true; ui.self = true; ui.result = { self: true, ok: false };
  Fx.sfx.tap(); drawDock();
}
function grade(kind) {
  const ui = L.ui; if (ui.graded) return;
  ui.graded = true; ui.gradeKind = kind; ui.result = { ok: kind === 'sg-ok', self: true, kind };
  reactSfx(kind === 'sg-ok'); drawDock();
}
function overrideCorrect() { // 自動採点で×だった短答・数値を「合っていた」に直す（まだ確定していないので、結果を書き換えるだけ）
  const ui = L.ui; if (!ui.checked || ui.overridden || ui.result.ok || ui.committed) return;
  ui.overridden = true; ui.result = { ok: true, overridden: true };
  if (UI) UI.toast(T('合っていたことにしました'), { type: 'ok' });
  drawDock();
}
// 採点を確定：エンジンに渡し、箱・XP を保存する
function commit() {
  const ui = L && L.ui; if (!ui || !ui.checked || ui.committed || !ui.result) return false;
  if (ui.self && !ui.graded) return false;
  const eng = L.eng, c = ui.c, firstTry = !c.retry;
  const kind = ui.self ? ui.gradeKind : (ui.result.ok ? 'ok' : 'miss');
  ui.committed = true;
  const out = E.answer(eng, kind);
  if (save.bx > Date.now() && out.xp) out.xp *= 2; // XPブースト中は2倍
  L.log.push(kind); L.xp += out.xp;
  if (firstTry) {
    const res = eng.results[eng.results.length - 1];
    L.pool.boxes = E.applyResults(L.pool.boxes, [res], today);
    if (!L.pool.noBoxes) for (const it of L.pool.items) save.b[it.set.id] = E.packBoxes(it.set.h, L.pool.boxes.slice(it.off * 3, (it.off + it.n) * 3));
  }
  save.xp += out.xp;
  save.g[today] = (save.g[today] || 0) + out.xp;
  if (!save.d.includes(today)) save.d.push(today);
  bumpDay({ xp: out.xp });
  if (firstTry) { save.st.q++; if (kind === 'ok' || kind === 'sg-ok') { save.st.ok++; bumpDay({ ok: 1 }); } else if (kind === 'miss') L.miss++; }
  if (L.kind === 'mockmiss' && firstTry && (kind === 'ok' || kind === 'sg-ok')) save.mm = save.mm.filter(x => x[1] !== L.ui.q.i);
  if (save.hm && firstTry && kind === 'miss' && L.kind !== 'review' && L.kind !== 'mockmiss' && L.kind !== 'jump') save.hr = Math.max(0, save.hr - 1);
  save.st.best = Math.max(save.st.best, E.streakOf(save.d, today));
  persist(); renderChips(); saveRun();
  return true;
}
function nextQuestion() {
  if (!L || !L.eng) return;
  commit();
  if (L.kind === 'jump' && L.miss >= 3) return jumpResult(false);
  if (!L.eng.cur) return L.kind === 'jump' ? jumpResult(L.miss <= 2) : finishLesson();
  if (save.hm && save.hr === 0 && !L.heartOk && L.kind !== 'review' && L.kind !== 'mockmiss') return heartOverlay();
  renderQuestion();
}
function heartOverlay() {
  const ov = h('div', { class: 'overlay', id: 'heartOv', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'heartT' }, h('div', { class: 'card', style: 'text-align:center' }, [
    h('span', { html: Fx.mascot('sad', 110, save.sk) }), h('h2', { id: 'heartT', text: T('ハートがなくなったよ') }), h('p', { class: 'note', text: T('ほかのゲームにはえいきょうしません。ふくしゅうをすると回復できるよ。') }),
    h('div', { class: 'acts' }, [
      h('button', { class: 'btn primary', id: 'hrReview', type: 'button', onclick: () => { ov.remove(); goHome(); tab = 'review'; goHome(); } }, T('ふくしゅうで回復する')),
      h('button', { class: 'btn b', id: 'hrGem', type: 'button', disabled: save.gm >= 20 ? null : true, onclick: () => { save.gm -= 20; save.hr = 5; persist(); renderChips(); ov.remove(); renderQuestion(); } }, T('ジェム20で全回復')),
      h('button', { class: 'btn', id: 'hrGo', type: 'button', onclick: () => { L.heartOk = true; ov.remove(); renderQuestion(); } }, T('ハートなしで続ける')),
      h('button', { class: 'btn', id: 'hrOff', type: 'button', onclick: () => { save.hm = 0; persist(); renderChips(); L.heartOk = true; ov.remove(); renderQuestion(); } }, T('ハートモードをオフにする')),
    ])]));
  document.body.append(ov); $('hrReview').focus();
}
function askQuit() {
  if (!L) return;
  const go = () => { commit(); clearRun(); const xp = L ? L.xp : 0; goHome(); emit('play_end', { mode: 'normal', reason: 'quit', score: xp }); };
  if (!UI) return go();
  UI.confirm({ title: T('レッスンをやめますか？'), message: T('ここまでの進み具合は保存されています。'), ok: T('やめる'), cancel: T('つづけて学ぶ') }).then(ok => { if (ok) go(); });
}
function finishLesson() {
  if (L.kind === 'jump') return jumpResult(L.miss <= 2);
  const eng = L.eng, sum = E.lessonSummary(eng, L.xp);
  const lvBefore = E.levelOf(save.xp - L.xp).lv;
  const bonus = sum.bonus, secs = Math.max(1, Math.round((Date.now() - L.startedAt) / 1000));
  const kind = L.kind, unit = L.unit, firstToday = L.firstToday, si = L.si; clearRun();
  save.xp += bonus; save.g[today] = (save.g[today] || 0) + bonus; save.st.ls++;
  if (!save.d.includes(today)) save.d.push(today);
  save.st.best = Math.max(save.st.best, E.streakOf(save.d, today));
  const gemGain = 5 + (sum.perfect ? 3 : 0); save.gm += gemGain;
  { const hr = nowDate().getHours(), dow = nowDate().getDay(); bumpDay({ early: hr < 8 ? 1 : 0, night: hr >= 22 ? 1 : 0, weekend: dow === 0 || dow === 6 ? 1 : 0 }); }
  bumpDay({ xp: bonus, ls: 1, perfect: sum.perfect ? 1 : 0, rev: kind === 'review' || kind === 'mockmiss' ? 1 : 0, sp: kind === 'special' ? 1 : 0 });
  if (kind === 'special' && unit && !unit.story && sum.acc >= 0.7) save.cw[unit.id] = Math.min(5, (save.cw[unit.id] || 0) + 1);
  if ((kind === 'review' || kind === 'mockmiss') && save.hm) save.hr = Math.min(5, save.hr + 2);
  persist(); renderChips();
  emit('play_end', { mode: 'normal', reason: 'clear', score: sum.xp });
  emit('progress', { xp: save.xp });
  screen = 'result'; setBack(() => goHome()); setTitle(T('レッスンかんりょう！'));
  const goalNow = E.goalMet(save, today), streak = E.streakOf(save.d, today);
  if (goalNow && [3, 7, 14, 30, 50, 100, 200, 365].includes(streak) && NET.sf !== today + ':' + streak && (NET.sf = today + ':' + streak)) feedEv('streak', T('{n}日れんぞく！', { n: streak }));
  const expr = sum.perfect ? 'cheer' : sum.acc >= 0.6 ? 'happy' : 'think';
  const main = h('div', { class: 'q', id: 'resBody' }, [
    h('div', { class: 'res' }, [
      h('span', { html: Fx.mascot(expr, 132, save.sk) }),
      h('h2', { id: 'resTitle', text: sum.perfect ? T('かんぺき！すごい！') : sum.acc >= 0.6 ? T('レッスンかんりょう！') : T('よくがんばった！つぎは もっとできる！') }),
      h('div', { class: 'stats' }, [
        h('div', null, [h('b', { id: 'resXp', text: '+' + sum.xp }), h('small', { text: 'XP' })]),
        h('div', null, [h('b', { id: 'resAcc', text: Math.round(sum.acc * 100) + '%' }), h('small', { text: T('正答率') })]),
        h('div', null, [h('b', { id: 'resTime', text: Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') }), h('small', { text: T('時間') })]),
      ]),
      firstToday ? h('div', { class: 'streakpop', id: 'streakPop' }, [h('span', { class: 'fl', html: FLAME }), ' ' + T('れんぞく {n}日！', { n: streak })]) : null,
      goalNow ? h('p', { id: 'resGoal', text: T('今日のもくひょうをたっせい！') }) : h('p', { text: T('今日 {a}/{b}', { a: E.xpToday(save, today), b: save.goal }) }),
      h('p', { class: 'note', text: '+' + gemGain + ' ' + T('ジェム') }),
      sum.missed.length ? h('p', { class: 'hint', text: T('まちがえた問題は、あとで「ふくしゅう」に出ます。') }) : null,
    ]),
    h('div', { class: 'acts' }, [
      (kind === 'unit' || kind === 'special') && !(unit && unit.story) ? h('button', { class: 'btn primary', id: 'btnAgain', type: 'button', onclick: () => { const u = unit; L = null; kind === 'special' ? startSpecial(u) : startLesson(u, si); } }, T('もう1レッスン')) : null,
      h('button', { class: 'btn' + ((kind === 'unit' || kind === 'special') && !(unit && unit.story) ? '' : ' primary'), id: 'btnHome', type: 'button', onclick: () => goHome() }, T('ホームへ')),
    ]),
  ]);
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, main), false);
  L.over = true;
  Fx.sfx.done(); Fx.buzz([20, 30, 20]);
  if (E.levelOf(save.xp).lv > lvBefore) setTimeout(() => Fx.sfx.levelup(), 700);
  if (E.levelOf(save.xp).lv > lvBefore && UI) UI.toast(T('レベルアップ！ Lv{n}', { n: E.levelOf(save.xp).lv }), { type: 'ok' });
  if (sum.perfect || goalNow || firstToday) Fx.confetti($('fx'), sum.perfect ? 40 : 24);
  if (firstToday) { setTimeout(() => Fx.sfx.streak(), 600); const f = $('cStreak'); f.classList.add('bump'); setTimeout(() => f.classList.remove('bump'), 1200); }
}

// ================================================================ 会話（ロールプレイ。サーバーも鍵もなし：台本どおりに分かれ道を進む）
let DL = null; let dlgScenes = null;
const DLG_LV = { 1: '入門', 2: '標準', 3: '発展' };
async function loadDialogues() { if (!dlgScenes) dlgScenes = (await loadJson('dialogues')).scenes; return dlgScenes; }
function dialogueList(host, video) {
  loadDialogues().then(scenes => {
    host.replaceChildren(h('h3', { text: video ? T('ビデオ通話') : T('会話ロールプレイ') }), h('p', { class: 'note', text: video ? T('画面のなかの相手と、通話のように会話するよ。あらかじめ決められた台本で、AI との自由な会話ではありません。AI作成・未レビュー。') : T('相手のせりふを聞いて、あなたの返事をえらぼう。声・タイル・選択のどれでも答えられるよ。AI作成・未レビュー。') }));
    for (const [lang, name] of [['en', T('英語の会話')], ['ja', T('日本語の敬語の場面')]]) {
      const lv = lang === 'en' ? [1, 2, 3] : [2];
      for (const l of lv) {
        const list = scenes.filter(s => s.lang === lang && s.level === l); if (!list.length) continue;
        const d = h('details', { class: 'dgroup', open: l === 1 || lang === 'ja' ? true : null }, [h('summary', { text: name + ' ・ ' + T(DLG_LV[l]) + '（' + list.length + '）' })]);
        list.forEach(sc => { const best = save.dl[sc.id]; d.append(h('button', { class: 'banner', type: 'button', [video ? 'data-vscene' : 'data-scene']: sc.id, onclick: () => startDialogue(sc, video) }, [h('span', { class: 't' }, [h('b', { lang: 'ja', text: sc.title }), h('small', { lang: 'ja', text: sc.partner.name + (sc.partner.who ? '（' + sc.partner.who + '）' : '') })]), best != null ? h('span', { class: 'pill', text: best + '%' }) : h('span', { class: 'pill', style: 'background:var(--kb-surface-2);color:var(--kb-ink)', text: T('新') })])); });
        host.append(d);
      }
    }
  }).catch(() => host.replaceChildren(h('p', { class: 'note', text: T('読み込めませんでした。通信を確かめて、もう一度ためしてください。') })));
}
const dlgOk = n => n.choices.find(c => c.ok);
async function startDialogue(sc, video) {
  if (L || DL) return;
  screen = 'dialogue'; setBack(() => quitDialogue()); setTitle(sc.title, true);
  DL = { video: !!video, sc, node: sc.start, mistakes: [], first: {}, correct: 0, turns: 0, total: Math.max(1, ManabiDlg.maxTurns(sc)), xp: 0, startedAt: Date.now(), done: false };
  emit('play_start', { mode: 'normal' });
  const chat = h('div', { class: 'chat', id: 'chat', role: 'log', 'aria-live': 'polite' }), reply = h('div', { class: 'reply', id: 'reply' });
  const bar = h('div', { class: 'lh' }, [h('button', { class: 'icon', type: 'button', id: 'btnQuit', 'aria-label': T('とじる'), onclick: () => quitDialogue() }, h('span', { text: '✕', style: 'font-size:20px;font-weight:800' })), h('div', { class: 'pbar' }, h('i', { id: 'dlgBar', style: 'width:0%' }))]);
  let avatar = null;
  if (video) { avatar = h('div', { class: 'vcall', id: 'vcall' }, [h('span', { class: 'vav', id: 'vavatar', html: Fx.mascot('happy', 120, (sc.partner.name.length * 7) % 6) }), h('div', { class: 'vname' }, [h('b', { lang: 'ja', text: sc.partner.name }), h('small', { id: 'vtimer', text: '0:00' })]), h('div', { class: 'vnote', id: 'vnote', text: T('台本どおりの通話です。AI との自由な会話ではありません。') })]); DL.tmr = setInterval(() => { const t = $('vtimer'); if (!t || !DL) return clearInterval(DL && DL.tmr); const sec = Math.floor((Date.now() - DL.startedAt) / 1000); t.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }, 1000); }
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, [bar, avatar, chat, reply].filter(Boolean)), false);
  DL.chat = chat; DL.reply = reply; dlgAdvance();
}
function quitDialogue() { if (!DL) return; if (!UI || DL.done) { endDialogue(); return; } UI.confirm({ title: T('会話をやめますか？'), message: '', ok: T('やめる'), cancel: T('つづけて学ぶ') }).then(ok => { if (ok) endDialogue(); }); }
function endDialogue() { if (DL && DL.tmr) clearInterval(DL.tmr); DL = null; goHome(); }
function bubble(who, text, ja, cls) {
  const sc = DL.sc, me = who === 'you';
  const b = h('div', { class: 'bub ' + (me ? 'me ' : 'her ') + (cls || '') }, [
    me ? null : h('span', { class: 'av', html: Fx.mascot('happy', 40, (sc.partner.name.length * 7) % 6) }),
    h('div', { class: 'tx' }, [h('span', { class: 'say', lang: sc.lang === 'en' && !me ? 'en' : 'ja', text }),
      (!me && sc.lang === 'en' && Fx.canSpeak()) ? h('button', { class: 'say-btn', type: 'button', 'aria-label': T('音声をきく'), onclick: () => Fx.speak(text, 'en', 1) }, h('span', { html: ICON.speaker })) : null,
      ja ? h('button', { class: 'ja-btn', type: 'button', onclick: e => { const x = e.currentTarget.nextSibling; x.hidden = !x.hidden; } }, T('訳')) : null, ja ? h('span', { class: 'ja', lang: 'ja', hidden: true, text: ja }) : null]),
  ]);
  DL.chat.append(b); DL.chat.scrollTop = DL.chat.scrollHeight;
  if (DL.video && !me) { const av = $('vavatar'); if (av) { av.classList.add('talk'); setTimeout(() => av.classList.remove('talk'), Math.min(6000, 500 + text.length * 70)); } }
  return b;
}
function dlgAdvance() {
  const sc = DL.sc;
  for (let guard = 0; guard < 50; guard++) {
    const n = sc.nodes[DL.node];
    if (n.end) { bubble('her', n.say, n.ja); if (sc.lang === 'en') Fx.speak(n.say, 'en', 1); return dlgFinish(); }
    if (n.choices) { if (n.say) { bubble('her', n.say, n.ja); if (sc.lang === 'en') Fx.speak(n.say, 'en', 1); } return dlgChoices(n); }
    bubble('her', n.say, n.ja); DL.node = n.next;
    if (sc.lang === 'en' && !n.choices) { /* 続きの番まで読み上げは最後のせりふだけ */ const nx = sc.nodes[n.next]; if (nx && (nx.choices || nx.end) && n.say) Fx.speak(n.say, 'en', 1); }
  }
}
function dlgChoices(n) {
  const sc = DL.sc, r = DL.reply; r.replaceChildren();
  DL.cur = { n, tried: false, mode: 'choice' };
  r.append(h('div', { class: 'hint', style: 'margin:0 0 6px', text: T('あなたの返事は？') }));
  const box = h('div', { class: 'choicebubs', id: 'choiceBubs' });
  const order = E.shuffle(n.choices.map((c, i) => i), E.rng(E.seedOf(sc.id + '|' + DL.node)));
  order.forEach((i, k) => { const c = n.choices[i]; box.append(h('button', { class: 'cb', type: 'button', 'data-i': i, 'data-ok': c.ok ? '1' : '0', onclick: () => dlgPick(i) }, [h('span', { class: 'k', text: String(k + 1) }), h('span', { lang: sc.lang === 'en' ? 'en' : 'ja', text: c.text })])); });
  r.append(box);
  const tools = h('div', { class: 'mini' });
  if (sc.lang === 'en') {
    tools.append(h('button', { type: 'button', id: 'btnTiles', onclick: () => dlgTiles(n) }, T('ことばタイルで答える')));
    tools.append(h('button', { type: 'button', id: 'btnSpeak2', onclick: () => dlgSpeak(n) }, T('声で答える')));
  }
  if (DL.video) {
    const out = h('div', { class: 'speakres', id: 'voiceRes', role: 'status', 'aria-live': 'polite' });
    const pickBy = heard => { let best = -1, bi = -1; n.choices.forEach((c, i) => { const v = ManabiDlg.scoreSpeech(c.text, heard, sc.lang); if (v > best) { best = v; bi = i; } }); if (best >= 60) { out.replaceChildren(h('span', { text: '“' + heard + '” → ' + best + '%' })); dlgPick(bi); } else out.replaceChildren(h('span', { text: T('どの返事か わかりませんでした。もう一度か、タップでえらんでね。') })); };
    if (Fx.canListen()) tools.append(h('button', { type: 'button', id: 'btnVoiceAns', onclick: () => { out.replaceChildren(h('span', { text: T('聞いています…') })); Fx.listen(sc.lang, alts => pickBy(alts[0]), () => out.replaceChildren(h('span', { text: T('聞きとれませんでした。タップでえらんでね。') }))); } }, T('声で返事する')));
    else tools.append(h('span', { class: 'hint', id: 'noMic2', text: T('このブラウザでは声の入力が使えないので、タップでえらんでね。') }));
    r.append(tools, out); return;
  }
  r.append(tools);
}
function dlgMark(correct, firstTry, text, fb, okText) {
  const cur = DL.cur; DL.turns += cur.tried ? 0 : 1;
  if (correct) { if (!cur.tried) { DL.correct++; DL.xp += 2; } save.dm = save.dm.filter(x => !(x[0] === DL.sc.id && x[1] === DL.node)); }
  else if (!cur.tried) { DL.mistakes.push({ node: DL.node, text, fb, ok: okText }); if (!save.dm.some(x => x[0] === DL.sc.id && x[1] === DL.node)) save.dm = save.dm.concat([[DL.sc.id, DL.node]]).slice(-40); }
  cur.tried = true;
}
function dlgPick(i) {
  const n = DL.cur.n, c = n.choices[i], ok = !!c.ok, okc = dlgOk(n);
  const b = bubble('you', c.text, c.ja, ok ? 'good' : 'bad');
  dlgMark(ok, !DL.cur.tried, c.text, c.fb || '', okc.text); reactSfx(ok);
  document.querySelectorAll('#choiceBubs .cb').forEach(x => { x.disabled = true; if (x.dataset.ok === '1') x.classList.add('good'); else if (Number(x.dataset.i) === i) x.classList.add('bad'); });
  if (!ok) { DL.chat.append(h('div', { class: 'fbnote', role: 'status' }, [h('b', { text: T('ちがうよ') + '：' }), h('span', { lang: 'ja', text: c.fb }), h('div', { class: 'okline' }, [T('正しい答え') + '：', h('span', { lang: DL.sc.lang === 'en' ? 'en' : 'ja', text: okc.text })])])); DL.chat.scrollTop = DL.chat.scrollHeight; }
  dlgContinue(c.next, ok);
}
function dlgContinue(next, ok) {
  const r = DL.reply; $('dlgBar').style.width = Math.min(100, Math.round(100 * DL.turns / DL.total)) + '%';
  persist(); renderChips();
  const go = () => { DL.node = next; dlgAdvance(); };
  if (ok) { r.replaceChildren(h('button', { class: 'btn primary', id: 'dlgNext', type: 'button', onclick: go }, T('つづける'))); setTimeout(() => { const b = $('dlgNext'); if (b) b.focus(); }, 0); }
  else r.replaceChildren(h('button', { class: 'btn ng', id: 'dlgNext', type: 'button', onclick: go }, T('つづける')));
  const b = $('dlgNext'); if (b) b.focus({ preventScroll: true });
}
// ---- ことばタイル：正しい返事を、単語のタイルでならべる
function dlgTiles(n) {
  const okc = dlgOk(n), words = okc.text.split(/\s+/), r = DL.reply; r.replaceChildren();
  const extra = E.shuffle(n.choices.filter(c => !c.ok).flatMap(c => c.text.replace(/[.?!,]/g, '').split(/\s+/)).filter(w => !okc.text.toLowerCase().includes(w.toLowerCase())), E.rng(7)).slice(0, 2);
  const tiles = E.shuffle(words.map((t, i) => ({ id: 'w' + i, t })).concat(extra.map((t, i) => ({ id: 'd' + i, t }))), E.rng(E.seedOf(okc.text))); const picked = [];
  const row = h('div', { class: 'wbrow', id: 'dlgRow' }), bank = h('div', { class: 'wbbank', id: 'dlgBank' });
  const draw = () => { row.replaceChildren(...picked.map((id, k) => h('button', { class: 'tile', type: 'button', onclick: () => { picked.splice(k, 1); draw(); } }, tiles.find(x => x.id === id).t))); bank.replaceChildren(...tiles.map(t => h('button', { class: 'tile' + (picked.includes(t.id) ? ' used' : ''), type: 'button', 'data-id': t.id, tabindex: picked.includes(t.id) ? '-1' : null, onclick: () => { if (!picked.includes(t.id)) { picked.push(t.id); Fx.sfx.tap(); draw(); } } }, t.t))); chk.disabled = !picked.length; };
  const chk = h('button', { class: 'btn primary', id: 'dlgCheck', type: 'button', onclick: () => {
    const got = picked.map(id => tiles.find(x => x.id === id).t).join(' '), ok = got.toLowerCase().replace(/[.?!,]/g, '') === okc.text.toLowerCase().replace(/[.?!,]/g, '');
    if (!ok) { dlgMark(false, !DL.cur.tried, got, T('語順や単語をもう一度たしかめよう'), okc.text); reactSfx(false); chk.textContent = T('もう一度'); picked.length = 0; draw(); return; }
    bubble('you', okc.text, okc.ja, 'good'); dlgMark(true, !DL.cur.tried, okc.text, '', okc.text); reactSfx(true); dlgContinue(okc.next, true);
  } }, T('こたえあわせ'));
  r.append(h('div', { class: 'hint', text: T('下の単語をタップして、返事をつくろう') + '：' + (okc.ja || '') }), row, bank, chk, h('div', { class: 'mini' }, [h('button', { type: 'button', onclick: () => dlgChoices(n) }, T('えらぶにもどる'))]));
  draw();
}
// ---- 声で答える：SpeechRecognition があれば声で、なければ入力。ゆるく比べて点数（70点以上でOK）
function dlgSpeak(n) {
  const okc = dlgOk(n), r = DL.reply, lang = DL.sc.lang; r.replaceChildren();
  const result = h('div', { class: 'speakres', id: 'speakRes', role: 'status', 'aria-live': 'polite' });
  const finish = (heard) => {
    const sc = ManabiDlg.scoreSpeech(okc.text, heard, lang), ok = sc >= ManabiDlg.PASS;
    result.replaceChildren(h('div', { class: 'score ' + (ok ? 'good' : 'bad') }, [T('ぴったり度') + '：', h('b', { id: 'speakScore', text: sc + '%' })]), h('div', { class: 'okline', lang: 'en' }, ['“' + heard + '”']));
    if (ok) { bubble('you', okc.text, okc.ja, 'good'); DL.chat.append(h('div', { class: 'note', style: 'margin:-4px 0 10px 8px', 'aria-live': 'polite' }, [T('ぴったり度') + '：', h('b', { id: 'speakScore', text: sc + '%' }), ' ', '“' + heard + '”'])); dlgMark(true, !DL.cur.tried, okc.text, '', okc.text); reactSfx(true); dlgContinue(okc.next, true); }
    else { dlgMark(false, !DL.cur.tried, heard, T('もう少し はっきり言ってみよう'), okc.text); reactSfx(false); }
  };
  const target = h('div', { class: 'speaktarget', lang: 'en', text: okc.text });
  r.append(h('div', { class: 'hint', text: T('この文を声に出して言おう') + '：' + (okc.ja || '') }), target, result);
  const row = h('div', { class: 'acts' });
  if (Fx.canListen()) {
    const mic = h('button', { class: 'btn b', id: 'btnMic', type: 'button', onclick: () => { mic.disabled = true; result.replaceChildren(h('span', { text: T('聞いています…') })); Fx.listen(lang, alts => { mic.disabled = false; finish(alts.reduce((a, b) => (ManabiDlg.scoreSpeech(okc.text, b, lang) > ManabiDlg.scoreSpeech(okc.text, a, lang) ? b : a))); }, err => { mic.disabled = false; result.replaceChildren(h('span', { text: T('聞きとれませんでした。もう一度か、入力で答えてね。') })); }); } }, [h('span', { html: ICON.speaker }), T('話す')]);
    row.append(mic);
  } else row.append(h('div', { class: 'hint', id: 'noMic', text: T('このブラウザでは声の入力が使えないので、文字で入力してね。') }));
  const inp = h('input', { class: 'ans', id: 'speakInput', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': T('答えを入力'), onkeydown: e => { if (e.key === 'Enter') { e.stopPropagation(); if (inp.value.trim()) finish(inp.value); } } });
  row.append(inp, h('button', { class: 'btn', id: 'speakSend', type: 'button', onclick: () => { if (inp.value.trim()) finish(inp.value); } }, T('おくる')), h('div', { class: 'mini' }, [h('button', { type: 'button', onclick: () => dlgChoices(n) }, T('えらぶにもどる'))]));
  r.append(row);
}
function dlgFinish() {
  const sc = DL.sc; DL.done = true;
  const pct = DL.turns ? Math.round(100 * DL.correct / DL.turns) : 100, secs = Math.max(1, Math.round((Date.now() - DL.startedAt) / 1000)), xp = DL.xp + 3, gem = 3 + (pct === 100 ? 2 : 0);
  save.xp += xp; save.g[today] = (save.g[today] || 0) + xp; if (!save.d.includes(today)) save.d.push(today); save.gm += gem; save.dl[sc.id] = Math.max(save.dl[sc.id] || 0, pct);
  save.st.ls++; bumpDay({ xp, ls: 1, sp: 1, perfect: pct === 100 ? 1 : 0 }); save.st.best = Math.max(save.st.best, E.streakOf(save.d, today)); persist(); renderChips();
  emit('play_end', { mode: 'normal', reason: 'clear', score: xp });
  Fx.sfx.done(); if (pct === 100) Fx.confetti($('fx'), 36);
  const r = DL.reply; r.replaceChildren();
  const sum = h('div', { class: 'dsum', id: 'dlgSummary' }, [
    h('div', { class: 'res' }, [h('span', { html: Fx.mascot(pct === 100 ? 'cheer' : pct >= 60 ? 'happy' : 'think', 96, save.sk) }), h('h2', { text: pct === 100 ? T('かんぺきな会話！') : T('会話おつかれさま！') }),
      h('div', { class: 'stats' }, [h('div', null, [h('b', { text: '+' + xp }), h('small', { text: 'XP' })]), h('div', null, [h('b', { id: 'dlgPct', text: pct + '%' }), h('small', { text: T('正答率') })]), h('div', null, [h('b', { text: Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') }), h('small', { text: T('時間') })])])]),
  ]);
  if (DL.mistakes.length) { const ul = h('div', { class: 'card', id: 'dlgMist' }, [h('h3', { text: T('まちがえたところ') })]); DL.mistakes.forEach(m => ul.append(h('div', { class: 'row', style: 'margin:0 0 8px' }, [h('div', { lang: sc.lang === 'en' ? 'en' : 'ja', text: '× ' + m.text }), h('div', { lang: 'ja', class: 'note', text: m.fb }), h('div', { lang: sc.lang === 'en' ? 'en' : 'ja', style: 'font-weight:800', text: '○ ' + m.ok })]))); sum.append(ul); }
  sum.append(h('div', { class: 'acts', style: 'margin-top:10px' }, [h('button', { class: 'btn primary', id: 'dlgAgain', type: 'button', onclick: () => { const s0 = DL.sc; DL = null; startDialogue(s0); } }, T('もういちど')), h('button', { class: 'btn', id: 'btnHome', type: 'button', onclick: () => endDialogue() }, T('ホームへ'))]));
  DL.chat.append(sum); DL.chat.scrollTop = DL.chat.scrollHeight; $('dlgBar').style.width = '100%';
}

// ================================================================ mock exams
async function showMocks() {
  screen = 'mocks'; setBack(() => goHome()); setTitle(T('模試'));
  const exams = index.exams.filter(x => view.cr !== 'JH' && view.cr !== 'HS' ? true : x.cr === view.cr);
  const main = h('div', { id: 'main' });
  for (const sub of index.subjects) {
    const xs = exams.filter(x => x.sub === sub.id);
    if (!xs.length) continue;
    main.append(h('div', { class: 'dom', text: subjectName(sub.id) }));
    for (const x of xs) {
      const best = save.mk[x.id];
      main.append(h('div', { class: 'unit', 'data-exam': x.id }, [
        h('div', { class: 't' }, [h('b', null, rich(x.ti)), h('small', { text: T('{n}問', { n: x.n }) + ' · ' + T('{n}分', { n: x.min }) + (best != null ? ' · ' + T('ベスト {n}%', { n: best }) : '') })]),
        h('button', { class: 'go', type: 'button', onclick: () => startMock(x) }, T('はじめる')),
      ]));
    }
  }
  show(main);
}
async function startMock(x) {
  try {
    const ch = await chunk(x.f);
    M = { x, ch, i: 0, ans: {}, self: {}, left: x.min * 60, t0: Date.now(), submitted: false, timer: null, sel: {} };
    screen = 'mock'; emit('play_start', { mode: 'normal' });
    M.timer = setInterval(tickMock, 500);
    renderMock();
  } catch (e) { loadFail(e); }
}
function tickMock() {
  if (!M || M.submitted) return;
  const left = Math.max(0, M.x.min * 60 - Math.floor((Date.now() - M.t0) / 1000));
  M.left = left;
  const t = $('mockTimer'); if (t) { t.textContent = fmtTime(left); t.classList.toggle('low', left <= 60); }
  if (left <= 0) { if (UI) UI.toast(T('時間です！'), { type: 'danger' }); submitMock(); }
}
const fmtTime = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
function mockAnswered(q) { const a = M.ans[q.i]; return a != null && (Array.isArray(a) ? a.length > 0 : String(a).trim() !== ''); }
function renderMock() {
  const q = M.ch.q[M.i], S = M.ch.S;
  setBack(() => askQuitMock()); setTitle(T('模試'));
  const sec = M.ch.sec.find(s => s.id === q.sec);
  const ui = { q, sel: null, multi: [], order: [], input: null, checked: false };
  const stored = M.ans[q.i];
  if (q.t === 'mc') ui.sel = stored || null; else if (q.t === 'ms') ui.multi = stored ? stored.slice() : []; else if (q.t === 'or') ui.order = stored ? stored.slice() : [];
  L = { ui, pool: null, eng: null, kind: 'mock' }; // 回答欄の部品を共有するための入れもの
  const body = h('div', { class: 'q', id: 'qbody' });
  body.append(h('div', { class: 'qnav', id: 'qnav' }, M.ch.q.map((qq, k) => h('button', { type: 'button', class: (k === M.i ? 'cur ' : '') + (mockAnswered(qq) ? 'done' : ''), 'aria-label': T('設問') + ' ' + (k + 1), onclick: () => { saveMockInput(); M.i = k; renderMock(); } }, String(k + 1)))));
  if (sec && (!M.ch.q[M.i - 1] || M.ch.q[M.i - 1].sec !== q.sec)) body.append(h('div', { class: 'sec' }, [h('b', null, rich(sec.ti || '')), sec.ins ? h('div', null, rich(sec.ins)) : null]));
  else if (sec) body.append(h('div', { class: 'sec' }, h('b', null, rich(sec.ti || ''))));
  body.append(h('div', { class: 'tags' }, [h('span', { class: 'tag', text: (q.n || (M.i + 1)) }), h('span', { class: 'tag', text: typeLabel(q.t) }), q.p ? h('span', { class: 'tag', text: q.p + '点' }) : null]));
  if (q.st && S[q.st]) body.append(stimEl(S[q.st]));
  if (q.f) body.append(svgImg(q.f));
  if (q.tb) body.append(tableEl(q.tb));
  body.append(h('div', { class: 'stem', id: 'stem' }, rich(q.q)));
  if (E.isSelfGrade(q)) {
    const ta = h('textarea', { class: 'ans', id: 'ansText', rows: '4', 'aria-label': T('答えを入力'), oninput: e => { M.ans[q.i] = e.target.value; } });
    ta.value = stored || ''; body.append(ta);
  } else body.append(answerAreaMock(ui, q));
  const dock = h('div', { class: 'dock' }, [
    h('div', { class: 'two', style: 'margin-bottom:8px' }, [
      h('button', { class: 'btn sub', id: 'mPrev', type: 'button', disabled: M.i === 0 ? true : null, onclick: () => { saveMockInput(); M.i--; renderMock(); } }, T('前へ')),
      h('button', { class: 'btn sub', id: 'mNext', type: 'button', disabled: M.i === M.ch.q.length - 1 ? true : null, onclick: () => { saveMockInput(); M.i++; renderMock(); } }, T('次へ')),
    ]),
    h('button', { class: 'btn primary', id: 'mSubmit', type: 'button', onclick: () => confirmSubmit() }, T('提出する')),
  ]);
  const top = h('div', { class: 'lh' }, [h('span', { class: 'chip timer', id: 'mockTimer', text: fmtTime(M.left) }), h('span', { class: 'chip', text: (M.i + 1) + ' / ' + M.ch.q.length })]);
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, [top, body, dock]));
  L.ui.dock = null; L.ui.body = body; L.ui.input = body.querySelector('#ansInput');
  tickMock();
}
function answerAreaMock(ui, q) {
  L.ui = ui; // pick / orderAdd などが L.ui を見る
  const a = answerArea(ui);
  // 模試では入力を覚える
  if (q.t === 'mc' || q.t === 'ms') requestAnimationFrame(() => document.querySelectorAll('#answer .ch').forEach(b => { const on = q.t === 'mc' ? b.dataset.label === ui.sel : ui.multi.includes(b.dataset.label); b.setAttribute('aria-pressed', String(on)); }));
  if (q.t === 'nu' || q.t === 'sa') { const inp = a.querySelector('input'); inp.value = M.ans[q.i] || ''; inp.oninput = () => { M.ans[q.i] = inp.value; }; ui.input = inp; }
  return a;
}
function saveMockInput() {
  if (!M || M.submitted) return;
  const ui = L.ui, q = ui.q;
  if (q.t === 'mc') M.ans[q.i] = ui.sel; else if (q.t === 'ms') M.ans[q.i] = ui.multi.slice(); else if (q.t === 'or') M.ans[q.i] = ui.order.length === q.c.length ? ui.order.slice() : (ui.order.length ? ui.order.slice() : undefined);
  else if (q.t === 'nu' || q.t === 'sa') M.ans[q.i] = ui.input ? ui.input.value : '';
}
function confirmSubmit() {
  saveMockInput();
  const un = M.ch.q.filter(q => !E.isSelfGrade(q) && !mockAnswered(q)).length;
  if (!UI) return submitMock();
  UI.confirm({ title: T('提出しますか？'), message: un ? T('答えていない問題が {n} 問あります。', { n: un }) : '', ok: T('提出'), cancel: T('見なおす') }).then(ok => { if (ok) submitMock(); });
}
function askQuitMock() {
  if (!UI) { endMock(); return; }
  UI.confirm({ title: T('レッスンをやめますか？'), message: '', ok: T('やめる'), cancel: T('つづけて学ぶ') }).then(ok => { if (ok) endMock(); });
}
function endMock() { if (M && M.timer) clearInterval(M.timer); M = null; L = null; goHome(); }
function submitMock() {
  if (!M || M.submitted) return;
  saveMockInput();
  M.submitted = true; clearInterval(M.timer);
  renderMockResult();
}
function renderMockResult() {
  const sc = E.scoreExam(M.ch, M.ans, M.self);
  const first = !M.recorded;
  if (first) {
    M.recorded = true;
  }
  const best = Math.max(save.mk[M.x.id] || 0, sc.pct);
  const autoCorrect = sc.rows.filter(r => r.frac === 1).length;
  if (first) {
    const missed = M.ch.q.filter((q, k) => !E.isSelfGrade(q) && sc.rows[k].frac < 1).map(q => [M.x.id, q.i]);
    save.mm = save.mm.filter(x => !missed.some(m => m[1] === x[1])).concat(missed).slice(-60);
    const xp = Math.min(30, Math.max(1, autoCorrect));
    const s2 = E.recordLesson(save, { today, xp, n: M.ch.q.length, ok: autoCorrect, kind: 'mock' });
    s2.mm = save.mm; save = s2; M.xp = xp;
  }
  save.mk[M.x.id] = best; persist(); renderChips();
  emit('play_end', { mode: 'normal', reason: 'clear', score: Math.round(sc.pct) });
  screen = 'mockresult'; setBack(() => endMock()); setTitle(T('模試のおわり'));
  const main = h('div', { class: 'q', id: 'mockRes' }, [
    h('div', { class: 'res' }, [h('h2', { text: T('得点') }), h('div', { class: 'stats' }, [
      h('div', null, [h('b', { id: 'mockPct', text: sc.pct + '%' }), h('small', { text: T('正答率') })]),
      h('div', null, [h('b', { text: T('{a} / {b} 点', { a: Math.round(sc.got * 10) / 10, b: sc.total }) }), h('small', { text: T('得点') })]),
      h('div', null, [h('b', { text: T('ベスト {n}%', { n: best }) }), h('small', { text: T('{n}分', { n: M.x.min }) })]),
    ])]),
    h('div', { class: 'dom', text: T('各問の結果') }),
  ]);
  M.ch.q.forEach((q, k) => {
    const r = sc.rows[k], self = E.isSelfGrade(q);
    const ok = r.frac === 1, blank = r.res == null && !self;
    const det = h('details', { class: 'rrow ' + (ok ? 'ok' : 'ng'), 'data-qi': k }, [
      h('summary', null, [h('span', { class: 'mark', text: self ? '✎' : ok ? '○' : blank ? '–' : '×' }), h('span', { text: (q.n || String(k + 1)) + '　' + typeLabel(q.t) + (blank ? '（' + T('未回答') + '）' : '') })]),
    ]);
    const body = h('div', { class: 'body' });
    body.append(h('div', { class: 'stem', style: 'font-size:15px' }, rich(q.q)));
    const yours = M.ans[q.i];
    if (yours != null && yours !== '' && !(Array.isArray(yours) && !yours.length)) body.append(h('div', { class: 'row' }, [h('span', { class: 'lab', text: T('あなたの答え') }), h('div', { class: 'rich', text: Array.isArray(yours) ? yours.join(' ') : String(yours) })]));
    body.append(h('div', { class: 'row' }, [h('span', { class: 'lab', text: T('正解') }), ...E.answerText(q).map(t => h('div', { class: 'rich' }, rich(t)))]));
    if (q.e) body.append(h('div', { class: 'row' }, [h('span', { class: 'lab', text: T('解説') }), rich(q.e)]));
    if (self) body.append(h('div', { class: 'three', 'data-self': q.i }, [['ok', 'できた'], ['unsure', 'あやしい'], ['no', 'できなかった']].map(([g, l]) => h('button', { class: 'btn sub' + (M.self[q.i] === g ? ' primary' : ''), type: 'button', 'data-g': g, onclick: () => { M.self[q.i] = g; renderMockResult(); } }, T(l)))));
    body.append(h('div', { class: 'mini' }, reportLink(q, { id: M.x.id })));
    det.append(body); main.append(det);
  });
  main.append(h('div', { class: 'acts', style: 'margin-top:12px' }, [h('button', { class: 'btn primary', id: 'btnHome', type: 'button', onclick: () => endMock() }, T('ホームへ'))]));
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, main));
  document.querySelectorAll('.rrow').forEach(d => { if (M.openRows && M.openRows[d.dataset.qi]) d.open = true; d.addEventListener('toggle', () => { M.openRows = M.openRows || {}; M.openRows[d.dataset.qi] = d.open; }); });
}

// ================================================================ menu / how to
function showHowto() {
  store.set(HOWTO_KEY, '1');
  const ov = h('div', { class: 'overlay', id: 'howto', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'howtoT' }, h('div', { class: 'card' }, [
    h('h2', { id: 'howtoT', text: T('はじめに') }),
    h('ul', null, ['1レッスンは8問。まちがえた問題は、同じレッスンの中でもう一度出て、あした以降のふくしゅうにも出ます。', 'ハートや回数制限はありません。何度でも、好きなだけ。', '記述・証明の問題は、模範解答と見くらべて自己採点します。', '問題はAIがつくったもので、まだ専門家の確認を受けていません。まちがいを見つけたら「まちがいを報告」を押してください。'].map(s => h('li', { text: T(s) }))),
    h('button', { class: 'btn primary', id: 'howtoGo', type: 'button', onclick: () => ov.remove() }, T('わかった')),
  ]));
  document.body.append(ov);
  const b = $('howtoGo'); if (b) b.focus();
}
function openMenu() {
  if (!UI) return;
  const goalSeg = UI.segmented({ options: [10, 20, 30, 50].map(n => ({ value: String(n), label: T('{n} XP', { n }) })), value: String(save.goal), block: true, onChange: v => { save.goal = Number(v); persist(); renderChips(); } });
  const goalRow = h('div', { class: 'kb-set__row kb-set__row--stack' }, [h('div', { class: 'kb-set__k', text: T('1日の目標を選ぶ') }), goalSeg]);
  const how = h('button', { class: 'kb-btn kb-btn--ghost kb-btn--block', type: 'button', id: 'menuHow', onclick: () => { showHowto(); } }, T('使い方'));
  UI.openSettings({ title: T('メニュー'), audio: false, extra: [goalRow, how] });
}

// ================================================================ keyboard
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.kb-layer:not([hidden])')) return;
  if ($('heartOv') || $('chestOv')) return;
  if (e.key === 'Escape' && $('popBg')) { closePop(); return; }
  if (e.key === 'Escape' && $('sheetBg')) { closeSheet(); return; }
  const ov = $('howto'); if (ov) { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); ov.remove(); } return; }
  const inInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  if (screen === 'lesson' && L && L.ui) {
    const ui = L.ui, q = ui.q;
    if (e.key === 'Enter') {
      if (e.target && e.target.tagName === 'BUTTON' && e.target.id !== 'btnCheck' && e.target.id !== 'btnNext') return; // ボタンの Enter はそのボタンへ
      e.preventDefault();
      if (!ui.checked) { if (hasInput()) (E.isSelfGrade(q) ? revealSelf() : checkNow()); }
      else if (ui.self && !ui.graded) { /* 3つのボタンから選ぶ */ }
      else nextQuestion();
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); askQuit(); return; }
    if (inInput) return;
    if (ui.self && !ui.graded && /^[1-3]$/.test(e.key)) { grade(['sg-ok', 'sg-unsure', 'sg-no'][Number(e.key) - 1]); return; }
    if (ui.checked) return;
    if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key) - 1;
      if (q.t === 'mc' || q.t === 'ms') { if (q.c[n]) { e.preventDefault(); pick(q.c[n][0]); } }
      else if (q.t === 'or') { const rest = q.c.filter(c => !ui.order.includes(c[0])); if (rest[n]) { e.preventDefault(); orderAdd(rest[n][0]); } }
      else if (q.t === 'wb') { const rest = q.w.filter(w => !ui.tiles.includes(w.id)); if (rest[n]) { e.preventDefault(); ui.tiles.push(rest[n].id); drawTiles(); drawDock(); } }
      else if (q.t === 'tt') { const b = document.querySelectorAll('#ttwrap .tok')[n]; if (b) { e.preventDefault(); b.click(); } }
      else if (q.t === 'mp') { const bl = [...document.querySelectorAll('#mpcols [data-l]:not(.matched)')], br = [...document.querySelectorAll('#mpcols [data-r]:not(.matched)')]; if (ui.left == null ? bl[n] : br[n]) { e.preventDefault(); (ui.left == null ? bl[n] : br[n]).click(); } }
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (q.t === 'mc')) {
      e.preventDefault(); const i = q.c.findIndex(c => c[0] === ui.sel), d = e.key === 'ArrowDown' ? 1 : -1;
      pick(q.c[(i < 0 ? (d > 0 ? 0 : q.c.length - 1) : (i + d + q.c.length) % q.c.length)][0]);
    } else if (e.key === 'Backspace' && q.t === 'or') { e.preventDefault(); orderUndo(); }
    else if (e.key === 'Backspace' && q.t === 'wb') { e.preventDefault(); ui.tiles.pop(); drawTiles(); drawDock(); }
  } else if (screen === 'dialogue' && DL) {
    if (e.key === 'Escape') { e.preventDefault(); quitDialogue(); return; }
    if (inInput) return;
    if (/^[1-4]$/.test(e.key)) { const b = document.querySelectorAll('#choiceBubs .cb:not([disabled])')[Number(e.key) - 1]; if (b) { e.preventDefault(); b.click(); } }
    else if (e.key === 'Enter' && $('dlgNext') && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); $('dlgNext').click(); }
  } else if (screen === 'mock' && M && !M.submitted && !inInput) {
    const ui = L.ui, q = ui.q;
    if (e.key === 'ArrowRight' && M.i < M.ch.q.length - 1) { saveMockInput(); M.i++; renderMock(); }
    else if (e.key === 'ArrowLeft' && M.i > 0) { saveMockInput(); M.i--; renderMock(); }
    else if (/^[1-9]$/.test(e.key) && (q.t === 'mc' || q.t === 'ms') && q.c[Number(e.key) - 1]) { pick(q.c[Number(e.key) - 1][0]); }
  } else if (screen === 'result' && e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) { const b = $('btnAgain') || $('btnHome'); if (b) b.click(); }
});
// 模試でも pick() は L.ui を使う（回答欄の部品は共通）
$('btnMenu').addEventListener('click', openMenu);
$('cBadge').addEventListener('click', () => { Fx.sfx.tap(); if (index) openCourseSheet(); });
$('cStreak').addEventListener('click', () => { Fx.sfx.tap(); openStreakSheet(0); });
$('cGem').addEventListener('click', () => { Fx.sfx.tap(); openGemSheet(); });
$('cGoal').addEventListener('click', openMenu);

// 他の端末の保存が届いたとき（cloud.js が localStorage を書き換える）
window.addEventListener('storage', e => { if (e.key === SAVE_KEY && screen === 'home') { save = readSave(); renderChips(); goHome(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { const t = E.dayNum(); if (t !== today) { today = t; renderChips(); if (screen === 'home') goHome(); } } });

if (window.KoboGame) KoboGame.register({
  id: GAME,
  pause() { commit(); persist(); }, resume() {}, save() { commit(); persist(); },
  isIdle: () => screen !== 'lesson' && screen !== 'mock' && screen !== 'dialogue',
  dispose() { if (M && M.timer) clearInterval(M.timer); },
});

// ================================================================ boot
loadKatex();
if (!Fx.prefs.anim || (DEBUG && !/[?&]anim\b/.test(location.search))) document.body.classList.add('noanim'); // テストでは無限のアニメーションを止める（?debug&anim で動かす）
applyFreezes(); ensureDay();
renderChips();
let booted = false;
loadIndex().then(() => { goHome(); booted = true; });
goHome();
if (DEBUG) {
  const api = {
    ready: () => booted,
    state: () => ({
      screen, save: JSON.parse(JSON.stringify(save)), katex: katexState, view: Object.assign({}, view), today,
      q: L && L.ui && L.ui.q ? { i: L.ui.q.i, t: L.ui.q.t, retry: !!(L.ui.c && L.ui.c.retry), checked: !!L.ui.checked, ok: L.ui.result ? !!L.ui.result.ok : null, self: !!L.ui.self } : null,
      lesson: L && L.eng ? { resolved: L.eng.resolved, size: L.eng.size, asked: L.eng.asked, retry: L.eng.retry.length, over: L.eng.over, xp: L.xp, kind: L.kind } : null,
      mock: M ? { i: M.i, n: M.ch.q.length, submitted: !!M.submitted, left: M.left } : null,
    }),
  };
  window.__kb = Object.assign(window.__kb || {}, { ready: api.ready, state: api.state });
  window.__manabi = {
    addXp(n) { save.xp += n; save.g[today] = (save.g[today] || 0) + n; persist(); renderChips(); },
    api, E, get L() { return L; }, get M() { return M; }, get save() { return save; },
    // いま出ている問題の「正しい入力」と「まちがった入力」（テストが本物のクリックで答えるため）
    peek() {
      const q = L && L.ui && L.ui.q; if (!q) return null;
      let right = q.t === 'nu' || q.t === 'sa' ? q.a.replace(/\$/g, '') : q.a;
      let wrong;
      if (q.t === 'mp') return { t: 'mp', pairs: q.pairs, wrongPair: [q.pairs[0][0], (q.rs.find(r => r !== q.pairs[0][1]) || '')], id: q.i, right: q.pairs, wrong: null, un: '' };
      if (q.t === 'wb') { const ids = q.a.slice(), bad = q.w.map(w => w.id).filter(id => !q.a.includes(id)); return { t: 'wb', right: ids, wrong: bad.length ? [bad[0]] : ids.slice().reverse(), id: q.i, un: '', order: ids }; }
      if (q.t === 'tt') return { t: 'tt', right: q.a, wrong: [q.tk.map((_, i) => i).find(i => !q.a.includes(i))], id: q.i, un: '' };
      if (q.t === 'hs') return { t: 'hs', right: q.a, wrong: Object.keys(q.rg).find(k => k !== q.a), id: q.i, un: '' };
      if (q.t === 'ft') { const cells = {}; q.cells.forEach((c, i) => { if (c && c.ask) cells[i] = c.v[0]; }); return { t: 'ft', right: cells, wrong: Object.fromEntries(Object.keys(cells).map(k => [k, 'x'])), id: q.i, un: '' }; }
      if (q.t === 'mc') wrong = q.c.map(c => c[0]).find(l => l !== q.a);
      else if (q.t === 'ms') wrong = [q.c.map(c => c[0]).find(l => !q.a.includes(l))];
      else if (q.t === 'or') wrong = q.a.slice().reverse().concat([]); else wrong = '？？？';
      return { t: q.t, right, wrong, labels: q.c ? q.c.map(c => c[0]) : null, order: q.t === 'or' ? q.a : null, id: q.i, un: q.un || '' };
    },
    setToday(n) { today = n; renderChips(); },
    setSave(o) { save = E.normSave(o); persist(); renderChips(); },
    unlockAll() { for (const c of index.courses) for (const sb of c.subjects) for (const u of sb.units) for (const x of u.subs) save.jp[u.id + '-' + x.id] = 1; for (const u of G.UNITS) save.jp[u.id] = 1; persist(); goHome(); }, startJump, openChestFlow,
    goHome, startLesson, startReview, startDialogue, loadDialogues, get DL() { return DL; }, showMocks, reviewCount, openMenu, startSpecial, G, Fx, tab: id => goTab(id), get tabName() { return tab; }, questsFor, claimQuest, leagueRows, weekXp,
    special(id) { return G.UNITS.map(u => Object.assign({ special: 1, sub: specialSub(u.course) }, u)).find(u => u.id === id); },
    unit(id) { for (const c of index.courses) for (const s of c.subjects) for (const u of s.units) if (u.id === id) return u; return null; },
    startMock,
  };
}
})();
