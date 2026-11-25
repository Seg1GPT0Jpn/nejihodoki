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
function unitStats(u) {
  const o = { n: u.n, fresh: 0, due: 0, learning: 0, mastered: 0 };
  for (const s of u.sets) { const x = setStats(s); for (const k of ['fresh', 'due', 'learning', 'mastered']) o[k] += x[k]; }
  return o;
}

// ================================================================ header chips
const ICON = {
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
const TABS = [['learn', '学ぶ'], ['review', '復習'], ['quests', 'クエスト'], ['league', 'リーグ'], ['profile', 'プロフィール']];
let tab = 'learn';
const G = window.ManabiGen, Fx = window.ManabiFx;
function renderChips() {
  const st = E.streakOf(save.d, today), xp = E.xpToday(save, today);
  $('nStreak').textContent = st;
  $('cStreak').title = T('れんぞく {n}日', { n: st });
  $('cStreak').setAttribute('aria-label', T('れんぞく {n}日', { n: st }));
  $('nGoal').textContent = xp + '/' + save.goal;
  $('cGoal').classList.toggle('met', xp >= save.goal);
  $('cGoal').title = xp >= save.goal ? T('今日のもくひょうをたっせい！') : T('今日 {a}/{b}', { a: xp, b: save.goal });
  $('cGem').title = T('ジェム'); $('nGem').textContent = save.gm; $('cHeart').hidden = !save.hm; $('nHeart').textContent = save.hr;
}
function setTitle(t) { $('ttl').textContent = t || T('まなびの工房'); }
function setBack(fn) { // fn: null → ゲーム一覧へ。関数 → その動作
  const a = $('backLink');
  if (!fn) { a.href = '../'; a.removeAttribute('role'); a.onclick = null; a.onkeydown = null; a.setAttribute('aria-label', T('ゲーム一覧へ戻る')); return; }
  a.removeAttribute('href'); a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0'); a.setAttribute('aria-label', T('もどる'));
  a.onclick = e => { e.preventDefault(); fn(); };
  a.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
}
function show(node, tabs) { $('view').replaceChildren(node); $('tabs').hidden = !tabs; }
function drawTabs() {
  const nav = $('tabs'); nav.replaceChildren();
  for (const [id, ja] of TABS) {
    const dot = id === 'quests' && questsDone() < 3 && questsClaimable() ? h('span', { class: 'dot' }) : null;
    nav.append(h('button', { type: 'button', 'data-tab': id, 'aria-current': id === tab ? 'page' : null, 'aria-label': T(ja), onclick: () => { Fx.sfx.tap(); goTab(id); } }, [h('span', { html: ICON[id] }), h('span', { text: T(ja) }), dot]));
  }
}
function goTab(id) { tab = id; goHome(); }
const COURSE_IDS = ['JH', 'HS', 'kobun', 'science', 'social'];
const specialSub = cr => ({ kobun: 'kobun', science: 'science', social: 'social' }[cr] || null);

// ================================================================ prefs / day state / streak freeze
function ensureDay() {
  if (save.ds.d !== today) save.ds = { d: today };
  if (save.dq.d !== today) save.dq = { d: today, c: [0, 0, 0] };
}
function applyFreezes() { // 昨日が空いていて、フリーズがあれば自動で使う（最大2日ぶん）
  let used = 0;
  for (let k = 0; k < 2; k++) {
    const y = today - 1 - k;
    if (save.d.includes(y) || save.fz <= 0 || !save.d.some(x => x < y)) break;
    if (!save.d.includes(y - 1) && !save.d.includes(y + 1)) break; // つながっていないなら使わない
    save.d.push(y); save.fz--; used++;
  }
  if (used) { save.d.sort((a, b) => a - b); persist(); }
  return used;
}
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
const crownOf = u => { // 道の上の「王冠」0〜5（通常の単元は、やった問題と習得した問題から）
  if (u.special) return save.cw[u.id] || 0;
  const st = unitStats(u), pr = st.n ? (st.n - st.fresh) / st.n : 0, ms = st.n ? st.mastered / st.n : 0;
  if (pr === 0) return 0;
  return Math.max(1, Math.min(5, Math.floor(7 * (0.6 * pr + 0.4 * ms))));
};
function goHome() {
  screen = 'home'; L = null; M = null; ensureDay();
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
  const names = { JH: T('中学'), HS: T('高校'), kobun: T('古文・漢文'), science: T('理科ラボ'), social: T('社会ラボ') };
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
    units = subj.units.filter(u => !view.g || u.g === view.g);
    let last = null, sn = 0;
    for (const u of units) { const key = u.g + '|' + u.co; if (key !== last) { last = key; sn++; groups.push({ title: T('セクション') + sn + '　' + gradeLabel(view.cr, u.g), co: u.co || '', sub: u.dm || '', ja: true, units: [] }); } groups[groups.length - 1].units.push(u); }
  } else {
    app.dataset.sub = special;
    units = courseUnits; let last = null;
    for (const u of units) { if (u.sec !== last) { last = u.sec; groups.push({ title: T(u.sec), co: '', sub: '', units: [] }); } groups[groups.length - 1].units.push(u); }
    main.append(h('div', { class: 'hint', style: 'margin:0 0 6px', text: T('AI作成・未レビュー') + '：' + T('まちがいを見つけたら「まちがいを報告」を押してね。') }));
  }
  if (!units.length) main.append(h('div', { class: 'err', text: T('この学年にはまだ単元がありません') }));
  const run = readRun();
  if (run) main.insertBefore(h('button', { class: 'banner review', id: 'btnResume', type: 'button', onclick: () => resumeRun() }, [h('span', { class: 't' }, [h('b', { text: T('つづきから') }), h('small', { text: T('とちゅうのレッスンがあります') })]), h('span', { class: 'pill', text: T('再開') })]), main.firstChild.nextSibling);
  const crowns = units.map(crownOf);
  let curIdx = crowns.findIndex(c => c === 0); if (curIdx < 0) curIdx = units.length - 1;
  let idx = 0;
  for (const g of groups) {
    main.append(h('div', { class: 'sect' }, [h('b', null, [g.title, g.co ? h('span', { lang: 'ja', text: '　' + g.co }) : null]), g.sub ? h('small', { lang: g.ja ? 'ja' : null, text: g.sub }) : null]));
    const path = h('div', { class: 'path' });
    for (const u of g.units) {
      const i = idx++, cl = crowns[i], st = i < curIdx || cl >= 1 ? (cl >= 1 ? 'done' : '') : i === curIdx ? 'cur' : 'locked';
      path.append(nodeEl(u, i, cl, i === curIdx ? 'cur' : cl >= 1 ? 'done' : 'locked'));
    }
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
function nodeEl(u, i, cl, state) {
  const off = Math.round(Math.sin(i * 1.15) * 62);
  const R = 46, C = 2 * Math.PI * R, frac = cl / 5;
  const ring = h('span', { html: '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="50" rx="' + R + '" ry="' + R + '" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="6"/><ellipse cx="50" cy="50" rx="' + R + '" ry="' + R + '" fill="none" stroke="var(--py)" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (C * frac).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>' });
  const lid = 'lbl-' + u.id, cid = 'crw-' + u.id;
  const btn = h('button', { class: 'go', type: 'button', 'aria-labelledby': lid + ' ' + cid, onclick: () => { Fx.sfx.tap(); openPop(u, cl, state); } }, [ring.firstChild, h('span', { text: String(i + 1) }), h('span', { class: 'sr', id: cid, text: T('王冠') + cl + (state === 'locked' ? '（' + T('まだロック中') + '）' : '') })]);
  const wrap = h('span', { class: 'nodewrap' }, [btn, cl ? h('span', { class: 'crowns', 'aria-hidden': 'true' }, [h('span', { html: ICON.crown }), String(cl)]) : null, state === 'cur' ? h('span', { class: 'start', text: T('START') }) : null]);
  return h('div', { class: 'unit ' + state, 'data-unit': u.id, style: 'transform:translateX(' + off + 'px)' }, [wrap, h('div', { class: 'lbl', id: 'lbl-' + u.id }, [u.special ? h('span', { text: T(u.ti) }) : h('span', null, rich(u.ti)), h('small', { lang: u.special ? null : 'ja', text: u.special ? T(u.goal || '') : (u.dm || '') })])]);
}
function openPop(u, cl, state) {
  closePop();
  const st = u.special ? null : unitStats(u);
  const bg = h('div', { class: 'sheetbg', id: 'popBg', onclick: e => { if (e.target === bg) closePop(); } }, h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'popT', 'data-sub': u.sub }, [
    u.special ? h('h2', { id: 'popT', text: T(u.ti) }) : h('h2', { id: 'popT' }, rich(u.ti)),
    h('p', null, [u.special ? T(u.goal || '') : h('span', { lang: 'ja', text: u.dm || '' }), st ? '　' + T('{n}問 ・ 習得 {m}', { n: u.n, m: st.mastered }) : '']),
    h('div', { class: 'row' }, [h('span', { class: 'crowns', style: 'position:static;transform:none' }, [h('span', { html: ICON.crown }), String(cl)]), state === 'locked' ? h('span', { class: 'hint', text: T('前のレッスンからやるのがおすすめ。ここから始めてもOK！') }) : null]),
    h('button', { class: 'btn sc', id: 'popStart', type: 'button', onclick: () => { closePop(); u.special ? startSpecial(u) : startLesson(u); } }, T('スタート')),
    h('button', { class: 'btn sub', id: 'popClose', type: 'button', style: 'margin-top:10px', onclick: () => closePop() }, T('とじる')),
  ]));
  document.body.append(bg); $('popStart').focus();
}
function closePop() { const p = $('popBg'); if (p) p.remove(); }
function saveView() { save.set = { cr: view.cr, sub: view.sub, g: view.g }; persist(); }
function reviewCount() {
  let n = 0;
  for (const s of allSets()) { if (!save.b[s.id]) continue; const b = E.parseBoxes(save.b[s.id], s.h, s.n); for (let i = 0; i < s.n; i++) { const c = E.card(b, i); if (c.box && (E.isDue(c, today) || c.box <= 2)) n++; } }
  return n;
}

// ================================================================ 復習
function viewReview() {
  setTitle(T('復習')); $('app').dataset.sub = 'english';
  const rv = reviewCount(), main = h('div', { id: 'main' });
  main.append(h('div', { style: 'text-align:center;padding:6px 0 10px' }, [h('span', { html: Fx.mascot(rv ? 'think' : 'happy', 120, save.sk) }), h('div', { class: 'note', text: rv ? T('まちがえた問題が待ってるよ。ゆっくりいこう！') : T('復習する問題はまだありません') })]));
  main.append(h('button', { class: 'banner review', id: 'btnReview', type: 'button', disabled: rv ? null : true, onclick: () => startReview() }, [
    h('span', { class: 't' }, [h('b', { text: T('ふくしゅう') }), h('small', { text: rv ? T('まちがえた問題や、そろそろ復習の時期の問題') : T('復習する問題はまだありません') })]),
    rv ? h('span', { class: 'pill', text: T('{n}問', { n: rv }) }) : null,
  ]));
  if (save.mm.length) main.append(h('button', { class: 'banner review', id: 'btnMockMiss', type: 'button', onclick: () => startMockMiss() }, [h('span', { class: 't' }, [h('b', { text: T('模試のまちがい') }), h('small', { text: T('模試でまちがえた問題をもう一度') })]), h('span', { class: 'pill', text: T('{n}問', { n: save.mm.length }) })]));
  const exams = index.exams;
  main.append(h('button', { class: 'banner', id: 'btnMock', type: 'button', disabled: exams.length ? null : true, onclick: () => showMocks() }, [
    h('span', { class: 't' }, [h('b', { text: T('模試・共通テスト形式') }), h('small', { text: T('制限時間つきの模試') })]),
    h('span', { class: 'pill', text: String(exams.length) }),
  ]));
  if (save.hm) main.append(h('div', { class: 'card' }, [h('h3', { text: T('ハートモード') }), h('div', { class: 'hearts', 'aria-label': T('ハート') }, [h('span', { html: ICON.heart }), String(save.hr) + ' / 5']), h('p', { class: 'note', text: T('復習レッスンをクリアするとハートが2つ回復するよ。') })]));
  show(main, true);
}

// ================================================================ クエスト
function viewQuests() {
  setTitle(T('クエスト')); $('app').dataset.sub = 'math'; ensureDay();
  const qs = questsFor(today), main = h('div', { id: 'main' });
  const goal = E.xpToday(save, today), met = goal >= save.goal;
  main.append(h('div', { class: 'card' }, [h('h3', { text: T('今日の目標') }), h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(Math.min(100, Math.round(100 * goal / save.goal))) }, h('i', { style: 'width:' + Math.min(100, 100 * goal / save.goal) + '%' })), h('p', { class: 'note', text: (met ? T('今日のもくひょうをたっせい！') : T('今日 {a}/{b}', { a: goal, b: save.goal })) + '　' + T('れんぞく {n}日', { n: E.streakOf(save.d, today) }) })]));
  const card = h('div', { class: 'card', id: 'questList' }, [h('h3', { text: T('デイリークエスト') })]);
  qs.forEach((q, i) => {
    const v = Math.min(q.n, q.get(save.ds)), done = v >= q.n, claimed = save.dq.c[i];
    card.append(h('div', { class: 'qrow', 'data-q': q.id }, [
      h('div', { class: 't' }, [h('span', { text: q.text }), h('div', { class: 'bar' }, h('i', { style: 'width:' + (100 * v / q.n) + '%' })), h('small', { class: 'note', text: v + ' / ' + q.n })]),
      h('button', { class: 'btn ' + (done && !claimed ? 'primary' : ''), type: 'button', 'data-claim': i, disabled: done && !claimed ? null : true, onclick: () => claimQuest(i) }, claimed ? T('うけとりずみ') : done ? T('+10 ジェム') : T('進行中')),
    ]));
  });
  main.append(card);
  main.append(h('div', { class: 'card' }, [
    h('h3', { text: T('ジェムのお店（見た目だけ。学習にはえいきょうなし）') }),
    h('div', { class: 'qrow' }, [h('div', { class: 't', text: T('ストリーク・フリーズ（休んだ日をカバー）') + ' ' + save.fz + '/2' }), h('button', { class: 'btn b', id: 'buyFreeze', type: 'button', disabled: save.gm >= 50 && save.fz < 2 ? null : true, onclick: () => { save.gm -= 50; save.fz++; persist(); renderChips(); goHome(); } }, '50')]),
    h('div', { class: 'qrow' }, [h('div', { class: 't', text: T('ハートを1つ回復') }), h('button', { class: 'btn b', id: 'buyHeart', type: 'button', disabled: save.gm >= 20 && save.hr < 5 ? null : true, onclick: () => { save.gm -= 20; save.hr++; persist(); renderChips(); goHome(); } }, '20')]),
  ]));
  show(main, true);
}
function claimQuest(i) {
  const qs = questsFor(today), q = qs[i]; if (!q || save.dq.c[i] || q.get(save.ds) < q.n) return;
  save.dq.c[i] = 1; save.gm += 10; persist(); renderChips(); Fx.sfx.done(); Fx.buzz(20); Fx.confetti($('fx'), 24); goHome();
}

// ================================================================ リーグ（ほんもののユーザーではない、この端末だけのシミュレーション）
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
  main.append(h('p', { class: 'note', id: 'leagueNote', text: T('これは、この端末の中だけのシミュレーションです。ほんもののユーザーではありません（ライバルは決まった数式で動きます）。') }));
  show(main, true);
}

// ================================================================ プロフィール
function viewProfile() {
  setTitle(T('プロフィール')); $('app').dataset.sub = 'kobun';
  const main = h('div', { id: 'main' }), acc = save.st.q ? Math.round(100 * save.st.ok / save.st.q) : 0;
  main.append(h('div', { style: 'text-align:center;padding:4px 0' }, [h('span', { id: 'profMascot', html: Fx.mascot('happy', 128, save.sk) }), h('div', { style: 'font-weight:900;font-size:20px', text: T('ねじまる') })]));
  main.append(h('div', { class: 'stat4', id: 'profStats' }, [
    h('div', null, [h('b', { text: String(save.xp) }), h('small', { text: T('合計XP') })]), h('div', null, [h('b', { text: String(save.st.best) }), h('small', { text: T('最高のれんぞく') })]),
    h('div', null, [h('b', { text: String(save.st.ls) }), h('small', { text: T('レッスン') })]), h('div', null, [h('b', { text: acc + '%' }), h('small', { text: T('せいかい率') + '（' + save.st.q + '）' })]),
  ]));
  main.append(h('div', { class: 'card' }, [h('h3', { text: T('ねじまるの色') }), h('div', { class: 'skins' }, Fx.SKINS.map((c, i) => h('button', { type: 'button', style: 'background:' + c, 'aria-label': T('色') + (i + 1), 'aria-pressed': String(i === save.sk), onclick: () => { save.sk = i; persist(); goHome(); } })))]));
  const sw = (id, label, on, fn) => h('div', { class: 'set' }, [h('span', { text: label }), h('span', { class: 'sw-wrap' }, h('button', { class: 'sw', id, type: 'button', role: 'switch', 'aria-label': label, 'aria-pressed': String(!!on), onclick: e => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); fn(v); } }))]);
  main.append(h('div', { class: 'card' }, [h('h3', { text: T('せってい') }),
    sw('swSnd', T('効果音'), Fx.prefs.snd, v => { Fx.setPref('snd', v); if (v) Fx.sfx.ok(); }),
    sw('swHap', T('しんどう（ハプティクス）'), Fx.prefs.hap, v => { Fx.setPref('hap', v); if (v) Fx.buzz(20); }),
    sw('swAnim', T('アニメーション'), Fx.prefs.anim, v => { Fx.setPref('anim', v); document.body.classList.toggle('noanim', !v); }),
    sw('swSay', T('読み上げ'), Fx.prefs.say, v => Fx.setPref('say', v)),
    sw('swHeart', T('ハートモード（まちがえるとハートが減る・オフでOK）'), save.hm, v => { save.hm = v ? 1 : 0; if (v && save.hr < 1) save.hr = 5; persist(); renderChips(); }),
    h('div', { class: 'set' }, [h('span', { text: T('1日の目標') }), h('span', null, [10, 20, 30, 50].map(n => h('button', { class: 'btn sub', style: 'display:inline-flex;width:auto;min-width:52px;margin-left:4px', type: 'button', 'data-goal': n, onclick: () => { save.goal = n; persist(); renderChips(); goHome(); } }, (save.goal === n ? '● ' : '') + n)))]),
    h('div', { class: 'set' }, [h('span', { text: T('テーマ・言語') }), h('button', { class: 'btn sub', style: 'width:auto', id: 'btnSettings', type: 'button', onclick: () => openMenu() }, T('ひらく'))]),
    h('div', { class: 'set' }, [h('span', { text: T('使い方') }), h('button', { class: 'btn sub', style: 'width:auto', type: 'button', onclick: () => showHowto() }, T('ひらく'))]),
  ]));
  main.append(h('div', { class: 'foot' }, [h('p', { text: index.credit }), h('p', { text: T('問題はAIがつくったもので、まだ専門家の確認を受けていません。') }), h('p', { text: T('地図：Natural Earth（パブリックドメイン）をもとにした自作の簡略図。古文：著作権の保護期間が満了した古典。') })]));
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
async function startLesson(u) {
  if (L) return;
  try {
    const set = pickSet(u);
    const pool = await buildPool([set]);
    const lessonNo = save.st.ls;
    const seed = 'l|' + today + '|' + u.id + '|' + lessonNo;
    const eng = E.createLesson({ qs: pool.qs, boxes: pool.boxes, today, seed, size: E.LESSON_SIZE });
    beginLesson({ eng, pool, kind: 'unit', unit: u, desc: { k: 'unit', u: u.id, s: set.id, seed, today, b0: pool.boxes, size: E.LESSON_SIZE } });
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
    save.hm ? h('span', { class: 'hearts', id: 'lessonHearts' }, [h('span', { html: ICON.heart }), String(save.hr)]) : null,
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
      const b = h('button', { class: 'ch', type: 'button', 'data-label': ch[0], 'data-i': i, 'aria-pressed': 'false', onclick: () => pick(ch[0]) }, [h('span', { class: 'k', text: ch[0] }), h('span', { class: 'x' }, rich(ch[1]))]);
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
function reactSfx(ok) { if (ok) { Fx.sfx.ok(); Fx.buzz(12); } else { Fx.sfx.ng(); Fx.buzz([30, 40, 30]); } }
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
    pool.append(h('button', { class: 'ch', type: 'button', 'data-label': ch[0], 'data-i': i, disabled: ui.checked ? true : null, onclick: () => orderAdd(ch[0]) }, [h('span', { class: 'k', text: ch[0] }), h('span', { class: 'x' }, rich(ch[1]))]));
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
  if (save.hm && firstTry && kind === 'miss' && L.kind !== 'review' && L.kind !== 'mockmiss') save.hr = Math.max(0, save.hr - 1);
  save.st.best = Math.max(save.st.best, E.streakOf(save.d, today));
  persist(); renderChips(); saveRun();
  return true;
}
function nextQuestion() {
  if (!L || !L.eng) return;
  commit();
  if (!L.eng.cur) return finishLesson();
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
  const eng = L.eng, sum = E.lessonSummary(eng, L.xp);
  const bonus = sum.bonus, secs = Math.max(1, Math.round((Date.now() - L.startedAt) / 1000));
  const kind = L.kind, unit = L.unit, firstToday = L.firstToday; clearRun();
  save.xp += bonus; save.g[today] = (save.g[today] || 0) + bonus; save.st.ls++;
  if (!save.d.includes(today)) save.d.push(today);
  save.st.best = Math.max(save.st.best, E.streakOf(save.d, today));
  const gemGain = 5 + (sum.perfect ? 3 : 0); save.gm += gemGain;
  bumpDay({ xp: bonus, ls: 1, perfect: sum.perfect ? 1 : 0, rev: kind === 'review' || kind === 'mockmiss' ? 1 : 0, sp: kind === 'special' ? 1 : 0 });
  if (kind === 'special' && unit && sum.acc >= 0.7) save.cw[unit.id] = Math.min(5, (save.cw[unit.id] || 0) + 1);
  if ((kind === 'review' || kind === 'mockmiss') && save.hm) save.hr = Math.min(5, save.hr + 2);
  persist(); renderChips();
  emit('play_end', { mode: 'normal', reason: 'clear', score: sum.xp });
  emit('progress', { xp: save.xp });
  screen = 'result'; setBack(() => goHome()); setTitle(T('レッスンかんりょう！'));
  const goalNow = E.goalMet(save, today), streak = E.streakOf(save.d, today);
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
      kind === 'unit' || kind === 'special' ? h('button', { class: 'btn primary', id: 'btnAgain', type: 'button', onclick: () => { const u = unit; L = null; kind === 'special' ? startSpecial(u) : startLesson(u); } }, T('もう1レッスン')) : null,
      h('button', { class: 'btn' + (kind === 'unit' || kind === 'special' ? '' : ' primary'), id: 'btnHome', type: 'button', onclick: () => goHome() }, T('ホームへ')),
    ]),
  ]);
  show(h('div', { style: 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0' }, main), false);
  L.over = true;
  Fx.sfx.done(); Fx.buzz([20, 30, 20]);
  if (sum.perfect || goalNow || firstToday) Fx.confetti($('fx'), sum.perfect ? 40 : 24);
  if (firstToday) { setTimeout(() => Fx.sfx.streak(), 600); const f = $('cStreak'); f.classList.add('bump'); setTimeout(() => f.classList.remove('bump'), 1200); }
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
  if ($('heartOv')) return;
  if (e.key === 'Escape' && $('popBg')) { closePop(); return; }
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
  } else if (screen === 'mock' && M && !M.submitted && !inInput) {
    const ui = L.ui, q = ui.q;
    if (e.key === 'ArrowRight' && M.i < M.ch.q.length - 1) { saveMockInput(); M.i++; renderMock(); }
    else if (e.key === 'ArrowLeft' && M.i > 0) { saveMockInput(); M.i--; renderMock(); }
    else if (/^[1-9]$/.test(e.key) && (q.t === 'mc' || q.t === 'ms') && q.c[Number(e.key) - 1]) { pick(q.c[Number(e.key) - 1][0]); }
  } else if (screen === 'result' && e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) { const b = $('btnAgain') || $('btnHome'); if (b) b.click(); }
});
// 模試でも pick() は L.ui を使う（回答欄の部品は共通）
$('btnMenu').addEventListener('click', openMenu);
$('cGoal').addEventListener('click', openMenu);

// 他の端末の保存が届いたとき（cloud.js が localStorage を書き換える）
window.addEventListener('storage', e => { if (e.key === SAVE_KEY && screen === 'home') { save = readSave(); renderChips(); goHome(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { const t = E.dayNum(); if (t !== today) { today = t; renderChips(); if (screen === 'home') goHome(); } } });

if (window.KoboGame) KoboGame.register({
  id: GAME,
  pause() { commit(); persist(); }, resume() {}, save() { commit(); persist(); },
  isIdle: () => screen !== 'lesson' && screen !== 'mock',
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
    goHome, startLesson, startReview, showMocks, reviewCount, openMenu, startSpecial, G, Fx, tab: id => goTab(id), get tabName() { return tab; }, questsFor, claimQuest, leagueRows, weekXp,
    special(id) { return G.UNITS.map(u => Object.assign({ special: 1, sub: specialSub(u.course) }, u)).find(u => u.id === id); },
    unit(id) { for (const c of index.courses) for (const s of c.subjects) for (const u of s.units) if (u.id === id) return u; return null; },
    startMock,
  };
}
})();
