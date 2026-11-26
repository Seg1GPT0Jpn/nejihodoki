// あてっこ — the page. akin/engine.js is the pure logic (number questions, theme inference, save helpers) and akin/data/*.js hold the themes;
// this file is the chrome: screens, answering, results, learning new items, the two-player "pass the phone" mode, saving and the platform events.
(() => {
'use strict';
const I = window.KoboI18n, EN = !!I && I.lang === 'en';
const L = (ja, en) => (EN ? en : ja);
const E = window.AkinEngine;
const PF = window.KoboPlatform || null, AU = window.KoboAudio || null, UI = window.KoboUI || null;
const KG = () => window.KoboGame || null;
const GAME = 'akin', SAVE_KEY = E.SAVE_KEY, CUSTOM_KEY = E.CUSTOM_KEY, RUN_KEY = 'kusoge.akin.run', HOWTO_KEY = 'kusoge.akin.howto';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const emit = (type, p) => { const g = KG(); if (g) g.emit(type, p); };
const sfx = n => { if (AU) AU.sfx(n); };
const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const fmt = E.fmt;

// ---------- save ----------
function readSave() { try { const r = store.get(SAVE_KEY); return E.normalizeSave(r ? JSON.parse(r) : null); } catch (e) { return E.normalizeSave(null); } }
function readCustom() { try { const r = store.get(CUSTOM_KEY); return E.readCustom(r ? JSON.parse(r) : null); } catch (e) { return E.readCustom(null); } }
let save = readSave(), custom = readCustom();
const writeSave = () => store.set(SAVE_KEY, JSON.stringify(save));
const writeCustom = () => { store.set(CUSTOM_KEY, JSON.stringify(custom)); cache = {}; };

// ---------- themes ----------
let cache = {};
const defs = () => E.THEMES;
const defOf = id => defs().find(d => d.id === id);
const compiled = id => cache[id] || (cache[id] = E.compileTheme(defOf(id), custom.t[id]));
const tname = d => (EN ? d.en : d.ja);
const iname = it => E.itemName(it, EN ? 'en' : 'ja');
const qtext = (th, a) => th.attrs[a].q[EN ? 'en' : 'ja'];
const CODE_LABEL = { y: L('はい', 'Yes'), p: L('たぶんそう', 'Probably'), q: L('たぶんちがう', 'Probably not'), n: L('いいえ', 'No'), u: L('わからない', "Don't know") };

// ---------- state ----------
let scr = 'title';           // title numSetup themePick duoSetup duoPass duoEnd play result stats
let G = null;                // the round being played
let duo = null;              // the two-player match
const setup = { numKey: 'r100', lo: 1, hi: 500, hard: !!save.set.hard, peek: save.set.peek !== 0, duoNames: ['', ''], duoRounds: 3, duoMode: 'r100' };
let learnSel = -1, learnText = '', openHist = false;
const NUM_PRESETS = { r100: { lo: 1, hi: 100 }, r1k: { lo: 1, hi: 1000 }, r1m: { lo: 1, hi: 1000000 } };
const NUM_LABEL = { r100: '1〜100', r1k: '1〜1,000', r1m: '1〜1,000,000', cust: L('じぶんで決める', 'Custom range') };
const playing = () => !!(G && !G.over);

// ---------- art: the original mascot (a round little thinker with a light bulb) ----------
function mascot(mood, cls) {
  const eyes = {
    think: '<circle cx="38" cy="58" r="5" fill="#16202a"/><circle cx="62" cy="58" r="5" fill="#16202a"/><circle cx="39.6" cy="56.4" r="1.7" fill="#fff"/><circle cx="63.6" cy="56.4" r="1.7" fill="#fff"/>',
    guess: '<circle cx="38" cy="57" r="6.5" fill="#16202a"/><circle cx="62" cy="57" r="6.5" fill="#16202a"/><circle cx="40" cy="54.8" r="2.3" fill="#fff"/><circle cx="64" cy="54.8" r="2.3" fill="#fff"/>',
    happy: '<path d="M31 59q7-10 14 0M55 59q7-10 14 0" fill="none" stroke="#16202a" stroke-width="4" stroke-linecap="round"/>',
    sad: '<path d="M32 56q6 6 12 0M56 56q6 6 12 0" fill="none" stroke="#16202a" stroke-width="4" stroke-linecap="round"/>',
  }[mood] || '';
  const mouth = {
    think: '<path d="M43 74q7 4 14 0" fill="none" stroke="#16202a" stroke-width="3" stroke-linecap="round"/>',
    guess: '<path d="M42 72q8 9 16 0z" fill="#16202a"/>',
    happy: '<path d="M38 70q12 16 24 0z" fill="#16202a"/><path d="M44 76q6 5 12 0" fill="#ff8a8a"/>',
    sad: '<path d="M43 78q7-6 14 0" fill="none" stroke="#16202a" stroke-width="3" stroke-linecap="round"/><path d="M70 62q3 6 0 9q-3-3 0-9z" fill="#9fd8ff"/>',
  }[mood] || '';
  const glow = mood === 'guess' || mood === 'happy' ? '<path d="M50 -1v-5M36 3l-3-4M64 3l3-4M27 12l-5-2M73 12l5-2" stroke="#ffd45e" stroke-width="3" stroke-linecap="round"/>' : '';
  return `<svg class="mascot${mood === 'think' ? ' bob' : ''} ${cls || ''}" viewBox="0 -10 100 110" aria-hidden="true">${glow}<rect x="45" y="22" width="10" height="9" rx="2" fill="#8a96a3"/><circle cx="50" cy="14" r="10.5" fill="${mood === 'sad' ? '#c9c2a0' : '#ffd45e'}" stroke="#c99a1e" stroke-width="2"/><path d="M45 17l3-5 2 4 2-4 3 5" fill="none" stroke="#c99a1e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="50" cy="64" rx="38" ry="31" fill="#5aa9e6" stroke="#2f6fa8" stroke-width="2.5"/><ellipse cx="50" cy="73" rx="26" ry="19" fill="#a9d6f7" opacity=".55"/>${eyes}${mouth}<ellipse cx="29" cy="68" rx="5" ry="3.4" fill="#ff9aa8" opacity=".7"/><ellipse cx="71" cy="68" rx="5" ry="3.4" fill="#ff9aa8" opacity=".7"/><path d="M14 66q-8 2-9 11M86 66q8 2 9 11" fill="none" stroke="#2f6fa8" stroke-width="3" stroke-linecap="round"/></svg>`;
}

// ---------- confetti ----------
const fx = $('fx'), fctx = fx.getContext('2d');
let parts = [], fxRaf = 0;
function burst(count) {
  if (reduceMotion.matches || !fctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ['#f2b33d', '#4cc38a', '#6cb8ff', '#ff7aa8', '#ffe27a'];
  for (let i = 0; i < (count || 90); i++) parts.push({ x: W / 2 + (Math.random() - 0.5) * 100, y: H * 0.3, vx: (Math.random() - 0.5) * 9, vy: -4 - Math.random() * 8, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], s: 5 + Math.random() * 5, t: 0 });
  if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);
}
function fxLoop() {
  fctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => (p.t += 1) < 110);
  for (const p of parts) { p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; fctx.save(); fctx.globalAlpha = Math.min(1, (110 - p.t) / 30); fctx.translate(p.x, p.y); fctx.rotate(p.r); fctx.fillStyle = p.c; fctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); fctx.restore(); }
  fxRaf = parts.length ? requestAnimationFrame(fxLoop) : 0;
  if (!fxRaf) fctx.clearRect(0, 0, innerWidth, innerHeight);
}

// ---------- small view helpers ----------
const btn = (id, cls, html, act, extra) => `<button type="button" id="${id}" class="kb-btn ${cls}" data-act="${act}"${extra || ''}>${html}</button>`;
const tally = () => { const w = save.stats.wins || 0, l = save.stats.losses || 0; return L(`コンピュータの成績：${w}勝 ${l}敗`, `Computer's record: ${w} won, ${l} lost`); };
const quest = n => L(`${n}問`, n === 1 ? '1 question' : `${n} questions`);

function setTitle(t) { $('ttl').textContent = t; document.title = L('あてっこ', "I'll Guess It") + (scr === 'title' ? '' : ' · ' + t); }
function renderChip() {
  const c = $('cntChip'), on = scr === 'play' && G && !G.over;
  c.hidden = !on; if (on) c.innerHTML = `${L('しつもん', 'Questions')} <b id="cnt">${G.round.count}</b>`;
}
function renderSound() {
  const b = $('sndBtn'), on = !(AU && AU.muted);
  b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', L(on ? 'サウンド オン' : 'サウンド オフ', on ? 'Sound on' : 'Sound off'));
  b.innerHTML = on
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  if (!AU) b.hidden = true;
}

// ================================================================ screens
function render() {
  const el = $('screen'); const keep = el.scrollTop;
  renderChip();
  const fn = { title: vTitle, numSetup: vNumSetup, themePick: vThemePick, duoSetup: vDuoSetup, duoPass: vDuoPass, duoEnd: vDuoEnd, play: vPlay, result: vResult, stats: vStats, learn: vLearn }[scr] || vTitle;
  el.innerHTML = fn(); if (scr !== 'play') el.scrollTop = scr === 'title' ? 0 : keep;
  if (scr === 'learn') fillLearn();
}
function go(s) { scr = s; render(); $('screen').scrollTop = 0; }

function vTitle() {
  setTitle(L('あてっこ', "I'll Guess It"));
  const run = readRun(), th = defs().length;
  return `<div class="card hero">${mascot('think')}<div class="logo">${L('あてっこ', 'Guess It!')}</div>
    <p class="sub">${L('あなたが心にうかべた数やものを、コンピュータが質問して当てるよ。', 'Think of a number or a thing. The computer asks questions and guesses it.')}</p>
    <div class="menu">
      ${run ? btn('mResume', 'primary big col', `${L('つづきから', 'Continue')}<small>${esc(runLabel(run))}</small>`, 'resume') : ''}
      ${btn('mNum', run ? 'big col' : 'primary big col', `${L('数字あてっこ', 'Number guess')}<small>${L('1〜100・1〜1,000・100万まで', '1–100, 1–1,000, up to 1,000,000')}</small>`, 'numSetup')}
      ${btn('mTh', 'big col', `${L('いろんなあてっこ', 'Guess the thing')}<small>${L(`${th}つのテーマ（どうぶつ・たべもの…）`, `${th} themes (animals, foods…)`)}</small>`, 'themePick')}
      ${btn('mDuo', 'ghost big col', `${L('ふたりであてっこ', 'Two players')}<small>${L('スマホをまわして、どっちがよみにくい？', 'Pass the phone: who is harder to read?')}</small>`, 'duoSetup')}
      <div class="row">${btn('mStats', 'ghost', L('せいせき・おぼえたもの', 'Record & learned'), 'stats')}${btn('mHow', 'ghost', L('あそびかた', 'How to play'), 'howto')}</div>
    </div>
    <p class="note">${tally()}</p></div>`;
}

function vNumSetup() {
  setTitle(L('数字あてっこ', 'Number guess'));
  const opts = ['r100', 'r1k', 'r1m', 'cust'].map(k => `<button type="button" class="opt" data-act="numKey" data-k="${k}" aria-pressed="${setup.numKey === k}"><span class="ic">${k === 'r100' ? '🔢' : k === 'r1k' ? '🔟' : k === 'r1m' ? '🚀' : '✏️'}</span>${NUM_LABEL[k]}${save.num[k] && save.num[k].b ? `<small>${L(`さいこう ${save.num[k].b}問`, `best ${save.num[k].b}`)}</small>` : ''}</button>`).join('');
  const cust = setup.numKey === 'cust' ? `<div class="row"><div><label class="f" for="cLo">${L('いちばん小さい数', 'Smallest')}</label><input id="cLo" type="number" inputmode="numeric" min="1" max="999999" value="${setup.lo}"></div><div><label class="f" for="cHi">${L('いちばん大きい数（100万まで）', 'Largest (up to 1,000,000)')}</label><input id="cHi" type="number" inputmode="numeric" min="2" max="1000000" value="${setup.hi}"></div></div><p class="note" id="cNote"></p>` : '';
  return `<div class="card"><h2>${L('どの中から決める？', 'Pick your range')}</h2><div class="seg">${opts}</div>${cust}
    <label class="tog"><input type="checkbox" id="optHard"${setup.hard ? ' checked' : ''}> <span>${L('素数・平方数・けたの和などの「算数すきむけ」質問もOK', 'Allow maths-lover questions (primes, squares, digit sums…)')}</span></label>
    <label class="tog"><input type="checkbox" id="optPeek"${setup.peek ? ' checked' : ''}> <span>${L('コンピュータの考えをのぞく（のこりの数）', "Peek at the computer's thinking (how many are left)")}</span></label>
    <p class="note">${L('数をこころに決めて、「はい」「いいえ」で答えてね。わからない質問は「わからない」でOK。', 'Pick a number in your head and answer yes or no. Answer "Don\'t know" if you are unsure.')}</p>
    ${btn('bStart', 'primary big', L('決めたよ！ はじめる', "I've picked one — start!"), 'startNum')}
    ${btn('bBack', 'ghost', L('もどる', 'Back'), 'title')}</div>`;
}

function vThemePick() {
  setTitle(L('いろんなあてっこ', 'Guess the thing'));
  const cards = defs().map(d => { const th = compiled(d.id), r = save.th[d.id], mine = (custom.t[d.id] || []).length;
    return `<button type="button" class="tcard" data-act="startTheme" data-id="${d.id}"><span class="ic" aria-hidden="true">${d.icon}</span>${esc(tname(d))}<small>${L(`${th.items.length}こ`, `${th.items.length} items`)}${mine ? L(`（おぼえた ${mine}）`, ` (+${mine} learned)`) : ''}${r && r.p ? ` · ${r.w}/${r.p}` : ''}</small></button>`; }).join('');
  return `<div class="card"><h2>${L('テーマをえらぶ', 'Choose a theme')}</h2><p class="note">${L('そのテーマの中のものを、こころに決めてね。コンピュータが「はい・たぶん・いいえ」で答えられる質問をするよ。', 'Think of one thing from the theme. The computer asks questions you can answer yes, probably, probably not, no or don\'t know.')}</p>
    <div class="themes">${cards}</div>
    <label class="tog"><input type="checkbox" id="optPeek"${setup.peek ? ' checked' : ''}> <span>${L('コンピュータの考えをのぞく', "Peek at the computer's thinking")}</span></label>
    ${btn('bBack', 'ghost', L('もどる', 'Back'), 'title')}</div>`;
}

function roundTitle() {
  if (!G) return '';
  return G.kind === 'num' ? `${L('数字あてっこ', 'Number guess')} · ${G.key === 'cust' ? fmt(G.lo) + '〜' + fmt(G.hi) : NUM_LABEL[G.key]}` : tname(defOf(G.key));
}

function vPlay() {
  setTitle(roundTitle());
  const r = G.round, s = r.state();
  if (s.phase === 'won') return '';
  if (s.phase === 'contra' || s.phase === 'giveup') return vStumped(s);
  const th = G.th, isN = G.kind === 'num';
  let bubble, answers, mood = 'think', meter = 0, peek = '';
  if (isN) {
    meter = Math.round(100 * (1 - Math.log(Math.max(1, s.left)) / Math.log(Math.max(2, r.size))));
    if (setup.peek || G.peek) peek = L(`のこり <b>${fmt(s.left)}</b>こ（${fmt(s.min)}〜${fmt(s.max)}）`, `<b>${fmt(s.left)}</b> left (${fmt(s.min)}–${fmt(s.max)})`);
  } else {
    meter = Math.round(100 * s.conf);
    if (setup.peek || G.peek) { const top = r.top(r.w, 3); peek = top.map(t => `<span><b>${esc(iname(th.items[t.i]))}</b> ${Math.round(t.p * 100)}%</span>`).join(''); }
  }
  if (s.phase === 'guess') {
    mood = 'guess';
    const name = isN ? `<span class="big" id="guessName">${fmt(s.guess)}</span>` : `<span class="big" id="guessName" style="font-size:30px;font-family:var(--kb-font-body);font-weight:800">${esc(iname(th.items[s.guess]))}</span>`;
    bubble = `<span class="qn">${L('ひらめいた！', 'I think I know!')}</span>${L('それは…', 'Is it…')}${name}${L('ですか？', '?')}`;
    answers = `<div class="ans two">${btn('g-yes', 'ab y', `<span class="mk" aria-hidden="true">⭕</span>${L('そう！', "Yes, that's it!")}`, 'gYes')}${btn('g-no', 'ab n', `<span class="mk" aria-hidden="true">✖</span>${L('ちがう', 'No')}`, 'gNo')}</div>`;
  } else {
    const q = isN ? E.qText(s.q, EN ? 'en' : 'ja') : qtext(th, s.a);
    bubble = `<span class="qn">Q${s.count + 1}</span>${esc(q)}`;
    answers = isN
      ? `<div class="ans three">${btn('a-y', 'ab y', `<span class="mk" aria-hidden="true">⭕</span>${CODE_LABEL.y}`, 'ans', ' data-c="y"')}${btn('a-n', 'ab n', `<span class="mk" aria-hidden="true">✖</span>${CODE_LABEL.n}`, 'ans', ' data-c="n"')}${btn('a-u', 'ab u', `<span class="mk" aria-hidden="true">？</span>${CODE_LABEL.u}`, 'ans', ' data-c="u" style="grid-column:span 2"')}</div>`
      : `<div class="ans five">${btn('a-y', 'ab y', `<span class="mk" aria-hidden="true">⭕</span>${CODE_LABEL.y}`, 'ans', ' data-c="y"')}${btn('a-n', 'ab n', `<span class="mk" aria-hidden="true">✖</span>${CODE_LABEL.n}`, 'ans', ' data-c="n"')}${btn('a-p', 'ab p', `<span class="mk" aria-hidden="true">△</span>${CODE_LABEL.p}`, 'ans', ' data-c="p"')}${btn('a-q', 'ab q', `<span class="mk" aria-hidden="true">▽</span>${CODE_LABEL.q}`, 'ans', ' data-c="q"')}${btn('a-u', 'ab u', `<span class="mk" aria-hidden="true">？</span>${CODE_LABEL.u}`, 'ans', ' data-c="u"')}</div>`;
  }
  const hist = histHtml();
  return `<div class="stage">${mascot(mood)}<div class="bubble" id="bubble" aria-live="polite">${bubble}</div></div>
    <div class="meter" role="img" aria-label="${L('ひらめきゲージ', 'Insight meter')} ${meter}%"><i id="meterFill" style="width:${Math.max(3, meter)}%"></i></div>
    <div class="peek" id="peek">${peek || '&nbsp;'}</div>${answers}
    <div class="foot">${btn('btnBack', 'ghost', `← ${L('ひとつ前にもどる', 'Undo last answer')}`, 'undo', r.hist ? (r.hist.length ? '' : ' disabled') : (r.log.length ? '' : ' disabled'))}</div>
    ${hist}`;
}

function histHtml() {
  const r = G.round, rows = [];
  if (G.kind === 'num') r.hist.forEach((h, i) => rows.push([i, h.t === 'q' ? E.qText(h.q, EN ? 'en' : 'ja') : L(`予想：${fmt(h.n)}`, `Guess: ${fmt(h.n)}`), h.t === 'q' ? (h.a === null ? 'u' : h.a ? 'y' : 'n') : (h.a ? 'y' : 'n'), h.t === 'g']));
  else r.log.forEach((e, i) => rows.push([i, e.t === 'q' ? qtext(G.th, e.a) : L(`予想：${iname(G.th.items[e.i])}`, `Guess: ${iname(G.th.items[e.i])}`), e.t === 'q' ? e.c : e.ok ? 'y' : 'n', e.t === 'g']));
  if (!rows.length) return '';
  const lab = (c, g) => (g ? (c === 'y' ? L('あたり', 'Right') : L('ちがった', 'Wrong')) : CODE_LABEL[c]);
  return `<details class="hist" id="hist"${openHist ? ' open' : ''}><summary>${L('これまでの質問', 'Questions so far')} (${rows.length})</summary><ol>${rows.map(([i, t, c, g]) => `<li><span class="q">${esc(t)}</span><span class="a ${c === 'y' ? 'y' : c === 'n' ? 'n' : ''}">${lab(c, g)}</span><button type="button" data-act="rewind" data-i="${i}" aria-label="${L('この質問からやりなおす', 'Redo from this question')}">${L('ここからやりなおす', 'Redo from here')}</button></li>`).join('')}</ol></details>`;
}

function vStumped(s) {
  const isN = G.kind === 'num';
  return `<div class="stage">${mascot('sad')}<div class="bubble" id="bubble">${isN ? L('あれ？ 当てはまる数がなくなっちゃった…。どこかの答えをまちがえたかな？', "Hmm? No number fits any more… Did I get an answer wrong?") : L('う〜ん、わからない！ こうさんです…。', "Hmm, I can't work it out. I give up…")}</div></div>
    <div class="menu">${btn('bReveal', 'primary big', isN ? L('答えの数を教える', 'Tell the number') : L('なにを考えていたか教える', 'Tell what it was'), 'reveal')}
    ${btn('btnBack', 'ghost', `← ${L('ひとつ前にもどる（答えをなおす）', 'Undo the last answer')}`, 'undo')}</div>
    ${histHtml()}`;
}

// ---- result of a round (computer won or was stumped)
function vResult() {
  const R = G.result; setTitle(R.won ? L('あてた！', 'Got it!') : L('まいった！', 'You win!'));
  const isN = G.kind === 'num', best = (isN ? save.num : save.th)[G.key];
  const pts = G.duo ? `<div class="kv"><span>${L('このラウンドの点（少ないほどあてやすい）', 'Round points (lower = easier to read)')}</span><b>${R.pts}</b></div>` : '';
  const name = R.won ? (isN ? fmt(R.answer) : esc(iname(G.th.items[R.answer]))) : '';
  let body;
  if (R.won) {
    const rank = isN ? E.numRank(R.count, G.round.par) : E.themeRank(R.count);
    body = `${mascot('happy')}<div class="what" id="resWhat">${L(`答えは「${name}」！`, `It was “${name}”!`)}</div><div class="num" id="resCount">${R.count}</div><div class="what">${L('問であてたよ！', R.count === 1 ? 'question' : 'questions')}</div>
      <div class="stars" aria-hidden="true">${'★'.repeat(rank + 1)}${'☆'.repeat(4 - rank)}</div><div class="what">${esc(E.RANK_TEXT[rank][EN ? 'en' : 'ja'])}</div>
      ${isN ? `<p class="note">${L(`ふつうの「半分に分ける」作戦だと ${G.round.par + 1}問くらい`, `Pure halving would take about ${G.round.par + 1}`)}</p>` : ''}`;
  } else {
    body = `${mascot('sad')}<div class="what" id="resWhat">${L('コンピュータの負け！ あなたのかち！', 'The computer is stumped — you win!')}</div>${R.msg ? `<p class="note">${R.msg}</p>` : ''}${R.learned ? `<p class="win">${L(`「${esc(R.learned)}」をおぼえたよ！ 次はあてるぞ。`, `Learned “${esc(R.learned)}”! I'll get it next time.`)}</p>` : ''}`;
  }
  const extra = R.mismatch ? `<details class="hist" open><summary>${L('答えがちがっていたかも', 'Answers that did not fit')} (${R.mismatch.length})</summary><ol>${R.mismatch.map(m => `<li><span class="q">${esc(m.q)}</span><span class="a">${esc(m.a)}</span><span class="note">${esc(m.hint)}</span></li>`).join('')}</ol></details>` : '';
  const kv = `<div class="kv"><span>${L('このモードの成績', 'This mode')}</span><b>${best ? L(`${best.w}勝 ${best.p - best.w}敗`, `${best.w} won, ${best.p - best.w} lost`) : '-'}</b></div>${best && best.b ? `<div class="kv"><span>${L('さいこうの記録', 'Best')}</span><b>${L(`${best.b}問`, `${best.b}`)}</b></div>` : ''}<div class="kv"><span>${L('全体', 'Overall')}</span><b>${tally().replace(/^[^：:]*[：:]\s*/, '')}</b></div>${pts}`;
  const btns = G.duo
    ? btn('bNext', 'primary big', duoNextLabel(), 'duoNext')
    : `${btn('bAgain', 'primary big', L('もういちど', 'Play again'), 'again')}${btn('bMenu', 'ghost', L('メニューへ', 'Menu'), 'title')}`;
  return `<div class="card res">${body}${extra}<div style="text-align:left;margin-top:8px">${kv}</div></div><div class="menu">${btns}</div>`;
}

// ---- record and learn
function vStats() {
  setTitle(L('せいせき', 'Record'));
  const rows = [];
  for (const k of E.NUM_KEYS) { const r = save.num[k]; if (r && r.p) rows.push([L('数字 ', 'Number ') + NUM_LABEL[k], r]); }
  for (const d of defs()) { const r = save.th[d.id]; if (r && r.p) rows.push([d.icon + ' ' + tname(d), r]); }
  const tb = rows.length ? `<table class="sc"><thead><tr><th>${L('モード', 'Mode')}</th><th>${L('あてた', 'Won')}</th><th>${L('負け', 'Lost')}</th><th>${L('最少', 'Best')}</th></tr></thead><tbody>${rows.map(([n, r]) => `<tr><td>${esc(n)}</td><td>${r.w}</td><td>${r.p - r.w}</td><td>${r.b || '-'}</td></tr>`).join('')}</tbody></table>` : `<p class="note">${L('まだ遊んでいません。', 'Nothing played yet.')}</p>`;
  const learned = defs().map(d => (custom.t[d.id] || []).map((c, i) => `<li><span class="q">${esc(d.icon)} ${esc(c.n)}</span><button type="button" data-act="forget" data-id="${d.id}" data-i="${i}">${L('わすれる', 'Forget')}</button></li>`).join('')).join('');
  const st = save.stats;
  return `<div class="card"><h2>${L('あてっこの成績', 'Overall record')}</h2>
    <div class="kv"><span>${L('コンピュータがあてた', 'Guessed by the computer')}</span><b id="stWins">${st.wins || 0}</b></div><div class="kv"><span>${L('あなたの勝ち（あてられなかった）', 'Stumped the computer')}</span><b id="stLoss">${st.losses || 0}</b></div>
    <div class="kv"><span>${L('遊んだ回数', 'Rounds played')}</span><b>${st.plays || 0}</b></div><div class="kv"><span>${L('おしえたもの', 'Things you taught')}</span><b>${st.learn || 0}</b></div><div class="kv"><span>${L('ふたりあそびを最後まで', 'Two-player matches')}</span><b>${st.duo || 0}</b></div></div>
    <div class="card"><h2>${L('モードごと', 'By mode')}</h2>${tb}</div>
    <div class="card"><h2>${L('おぼえたもの', 'Things I learned')}</h2>${learned ? `<div class="hist"><ol>${learned}</ol></div>` : `<p class="note">${L('コンピュータが当てられなかったとき、答えを教えるとここに入ります。この端末にだけ保存されます。', 'When the computer gives up, tell it the answer and it is saved here (on this device only).')}</p>`}</div>
    <div class="menu">${btn('bBack', 'ghost', L('もどる', 'Back'), 'title')}</div>`;
}

// ---- two players
function duoLabel(cfgKey) { return cfgKey.startsWith('th:') ? tname(defOf(cfgKey.slice(3))) : L('数字 ', 'Number ') + NUM_LABEL[cfgKey]; }
function vDuoSetup() {
  setTitle(L('ふたりであてっこ', 'Two players'));
  const modes = ['r100', 'r1k'].map(k => ['num:' + k, '🔢 ' + NUM_LABEL[k]]).concat(defs().map(d => ['th:' + d.id, d.icon + ' ' + tname(d)]));
  const cur = setup.duoMode.indexOf(':') < 0 ? (setup.duoMode.startsWith('r') ? 'num:' + setup.duoMode : setup.duoMode) : setup.duoMode;
  return `<div class="card"><h2>${L('スマホをまわして対決！', 'Pass the phone and compete')}</h2>
    <p class="note">${L('ふたりが交代で、こころに決めたものをコンピュータに当てさせます。コンピュータが多くの質問をしないと当てられなかった人（当てられなかったら大きなボーナス）が勝ち。', 'Take turns thinking of something for the computer to guess. Whoever makes the computer ask more questions wins (being stumped counts as a big penalty for the computer).')}</p>
    <label class="f" for="n0">${L('1人目の名前', 'Player 1')}</label><input id="n0" type="text" maxlength="12" value="${esc(setup.duoNames[0])}" placeholder="${L('1P', 'P1')}">
    <label class="f" for="n1">${L('2人目の名前', 'Player 2')}</label><input id="n1" type="text" maxlength="12" value="${esc(setup.duoNames[1])}" placeholder="${L('2P', 'P2')}">
    <label class="f">${L('なにを当てさせる？', 'What to guess?')}</label>
    <div class="seg">${modes.map(([k, n]) => `<button type="button" class="opt" data-act="duoMode" data-k="${k}" aria-pressed="${cur === k}">${esc(n)}</button>`).join('')}</div>
    <label class="f">${L('ひとり何回？', 'Rounds each')}</label>
    <div class="seg">${[1, 2, 3, 5].map(n => `<button type="button" class="opt" data-act="duoRounds" data-n="${n}" aria-pressed="${setup.duoRounds === n}">${L(`${n}回`, `${n}`)}</button>`).join('')}</div>
    ${btn('bStart', 'primary big', L('対決スタート', 'Start the match'), 'duoStart')}${btn('bBack', 'ghost', L('もどる', 'Back'), 'title')}</div>`;
}
const duoName = i => duo.names[i];
const duoNextLabel = () => (duo && duo.turn + 1 >= duo.rounds * 2 ? L('けっかを見る', 'See the result') : L('つぎの人へ', 'Next player'));
function vDuoPass() {
  setTitle(L('ふたりであてっこ', 'Two players'));
  const p = duo.turn % 2, rn = Math.floor(duo.turn / 2) + 1;
  return `<div class="card res">${mascot('think')}<div class="what" id="duoWho">${L(`${esc(duoName(p))}さんの番`, `${esc(duoName(p))}'s turn`)}</div><p class="note">${L(`ラウンド ${rn}/${duo.rounds}・お題：${esc(duoLabel(duo.cfg))}`, `Round ${rn}/${duo.rounds} · ${esc(duoLabel(duo.cfg))}`)}</p>
    <p>${L('スマホを持つのは、答える人だけ。ほかの人は画面を見ないでね。', 'Only the player answering should look at the screen.')}</p>
    <p class="note">${duo.pts[0].length + duo.pts[1].length ? L(`いまの点：${esc(duoName(0))} ${sum(duo.pts[0])} ー ${sum(duo.pts[1])} ${esc(duoName(1))}`, `Score: ${esc(duoName(0))} ${sum(duo.pts[0])} – ${sum(duo.pts[1])} ${esc(duoName(1))}`) : ''}</p>
    ${btn('bStart', 'primary big', L('こころに決めた！ はじめる', "I've picked one — start!"), 'duoGo')}</div>`;
}
const sum = a => a.reduce((x, y) => x + y, 0);
function vDuoEnd() {
  setTitle(L('ふたりであてっこ', 'Two players'));
  const a = sum(duo.pts[0]), b = sum(duo.pts[1]), w = a === b ? -1 : a > b ? 0 : 1;
  const row = i => `<tr><td>${esc(duoName(i))}${w === i ? ' 🏆' : ''}</td>${duo.pts[i].map(p => `<td>${p}</td>`).join('')}<td><b>${i ? b : a}</b></td></tr>`;
  const head = `<tr><th></th>${duo.pts[0].map((_, i) => `<th>${i + 1}</th>`).join('')}<th>${L('合計', 'Total')}</th></tr>`;
  return `<div class="card res">${mascot(w < 0 ? 'think' : 'happy')}<div class="what" id="duoRes">${w < 0 ? L('ひきわけ！', "It's a draw!") : L(`${esc(duoName(w))}さんの勝ち！`, `${esc(duoName(w))} wins!`)}</div>
    <p class="note">${L('点が大きいほど、コンピュータが苦労した（よみにくかった）ということ。', 'More points means the computer struggled more (you were harder to read).')}</p>
    <table class="sc"><thead>${head}</thead><tbody>${row(0)}${row(1)}</tbody></table></div>
    <div class="menu">${btn('bAgain', 'primary big', L('もういちど対決', 'Rematch'), 'duoAgain')}${btn('bMenu', 'ghost', L('メニューへ', 'Menu'), 'title')}</div>`;
}

// ================================================================ the "what was it?" screen (also used for numbers)
function showLearn() { scr = 'learn'; learnSel = -1; learnText = ''; render(); $('screen').scrollTop = 0; }
function vLearn() {
  const isN = G.kind === 'num';
  setTitle(L('なにを考えてた？', 'What was it?'));
  return isN
    ? `<div class="card"><div class="stage">${mascot('sad')}<div class="bubble">${L('まいった！ いくつを考えてたの？', 'I give up! Which number was it?')}</div></div>
        <label class="f" for="lnNum">${L(`答えの数（${fmt(G.lo)}〜${fmt(G.hi)}）`, `The number (${fmt(G.lo)}–${fmt(G.hi)})`)}</label><input id="lnNum" type="number" inputmode="numeric" min="${G.lo}" max="${G.hi}" placeholder="?">
        <p class="note bad" id="lnErr" hidden></p>${btn('bLearnGo', 'primary big', L('これだった！', 'That was it!'), 'learnNum')}${btn('bLearnSkip', 'ghost', L('教えない', "I won't tell"), 'learnSkip')}</div>`
    : `<div class="card"><div class="stage">${mascot('sad')}<div class="bubble">${L('まいった！ なにを考えてたの？ 下から選ぶか、新しく名前を入れて教えてね。', 'I give up! What was it? Pick it from the list, or type a new name to teach me.')}</div></div>
        <label class="f" for="lnText">${L('名前', 'Name')}</label><input id="lnText" type="search" maxlength="24" autocomplete="off" placeholder="${L('さがす・または新しい名前', 'Search or type a new name')}">
        <div class="list" id="lnList" role="listbox" aria-label="${L('このテーマのもの', 'Items in this theme')}"></div>
        <p class="note bad" id="lnErr" hidden></p>${btn('bLearnGo', 'primary big', L('これだった！', 'That was it!'), 'learnGo', ' disabled')}${btn('bLearnSkip', 'ghost', L('教えない', "I won't tell"), 'learnSkip')}</div>`;
}
function fillLearn() {
  const th = G.th, q = learnText.trim().toLowerCase(), list = $('lnList'); if (!list) return;
  const rows = th.items.map((it, i) => [it, i]).filter(([it]) => !q || it.ja.toLowerCase().includes(q) || it.en.toLowerCase().includes(q)).sort((a, b) => (EN ? a[0].en.localeCompare(b[0].en) : a[0].ja.localeCompare(b[0].ja, 'ja'))).slice(0, 120);
  list.innerHTML = rows.map(([it, i]) => `<button type="button" role="option" data-act="pickItem" data-i="${i}" aria-pressed="${learnSel === i}">${esc(iname(it))}${it.custom ? `<span class="tagc">${L('おぼえた', 'learned')}</span>` : ''}</button>`).join('') || `<div class="note" style="padding:10px">${L('見つからないので、新しいものとして教えられるよ。', 'Not in the list — you can teach it as something new.')}</div>`;
  const go = $('bLearnGo'), exact = th.items.findIndex(it => it.ja.toLowerCase() === q || it.en.toLowerCase() === q);
  if (learnSel < 0 && exact >= 0 && q) learnSel = exact;
  go.disabled = !(learnSel >= 0 || q);
  go.innerHTML = learnSel >= 0 ? L('これだった！', 'That was it!') : q ? L(`新しく教える：「${esc(learnText.trim())}」`, `Teach me: “${esc(learnText.trim())}”`) : L('これだった！', 'That was it!');
}

// ================================================================ playing
function start(kind, cfg) {
  const rand = Math.random;
  if (kind === 'num') {
    G = { kind, key: cfg.key, lo: cfg.lo, hi: cfg.hi, hard: !!cfg.hard, round: new E.NumRound(cfg.lo, cfg.hi, { hard: cfg.hard, rand }) };
  } else {
    const th = compiled(cfg.key); G = { kind, key: cfg.key, th, round: new E.ThemeRound(th, { rand }) };
  }
  Object.assign(G, { back: 0, idk: 0, wrongSeen: false, over: false, t0: Date.now(), duo: !!cfg.duo, result: null });
  learnSel = -1; openHist = false; scr = 'play'; render();
  emit('play_start', { mode: 'normal' }); persistRun();
}
function startNum() {
  let lo, hi, key = setup.numKey;
  if (key === 'cust') {
    lo = Math.floor(Number($('cLo') ? $('cLo').value : setup.lo)); hi = Math.floor(Number($('cHi') ? $('cHi').value : setup.hi));
    const note = $('cNote'), bad = !(lo >= 1) || !(hi >= lo + 1) || hi > 1000000;
    if (bad) { if (note) { note.className = 'note bad'; note.textContent = L('1以上で、100万までの2つ以上の数のはんいにしてね。', 'Use a range of at least two numbers, from 1 up to 1,000,000.'); } return; }
    setup.lo = lo; setup.hi = hi;
  } else ({ lo, hi } = NUM_PRESETS[key]);
  setup.hard = $('optHard') ? $('optHard').checked : setup.hard; setup.peek = $('optPeek') ? $('optPeek').checked : setup.peek; saveSet();
  start('num', { key, lo, hi, hard: setup.hard });
}
function saveSet() { save.set.hard = setup.hard ? 1 : 0; save.set.peek = setup.peek ? 1 : 0; writeSave(); }

function answer(c) {
  if (!playing()) return; const r = G.round, s = r.state(); if (s.phase !== 'ask') return;
  if (G.kind === 'num') { r.answer(c === 'y' ? true : c === 'n' ? false : null); } else r.answer(c);
  if (c === 'u') G.idk++; sfx(c === 'y' ? 'ok' : c === 'n' ? 'tap' : 'select');
  after();
}
function guessAnswer(ok) {
  if (!playing()) return; const r = G.round; if (r.state().phase !== 'guess') return;
  if (!ok) G.wrongSeen = true;
  r.guessResult(ok); sfx(ok ? 'win' : 'fail'); after();
}
function undo() { if (!playing()) return; if (G.round.back()) { G.back++; sfx('tap'); } after(); }
function after() {
  const s = G.round.state(); persistRun();
  if (s.phase === 'won') { finish(true, {}); return; }
  render(); const f = $('screen'); if (f) f.scrollTop = 0;
}

// ---- finishing
function record(won, extra) {
  const r = G.round, rr = { kind: G.kind, key: G.key, won, count: r.count, par: G.kind === 'num' ? r.par : 0, back: G.back, idk: G.idk, learned: extra.learnedNew ? 1 : 0, recovered: G.wrongSeen };
  E.recordRound(save, rr); writeSave();
  const pts = won ? r.count : r.count + 10;
  G.over = true; clearRun();
  emit('play_end', { mode: 'normal', score: won ? Math.max(1, 30 - r.count) : 0, durationMs: Date.now() - G.t0, reason: won ? 'clear' : 'over', stats: { kind: G.kind, count: r.count } });
  return pts;
}
function finish(won, extra) {
  const r = G.round, pts = record(won, extra), R = { won, count: r.count, pts };
  if (won) {
    const s = r;
    if (G.kind === 'num') R.answer = s.hist[s.hist.length - 1].n;
    else {
      R.answer = s.log[s.log.length - 1].i; const it = G.th.items[R.answer];
      if (it.custom) { const c = custom.t[G.key][it.ci]; if (c) { E.learnItem(custom, G.key, c.n, r.learned()); writeCustom(); } }
    }
  } else Object.assign(R, extra);
  G.result = R;
  if (G.duo) duo.pts[duo.turn % 2].push(pts);
  scr = 'result'; render(); $('screen').scrollTop = 0;
  if (won) { burst(110); sfx('win'); } else sfx('coin');
  if (DEBUG) window.__lastResult = R;
}

// ---- reveal after being stumped
function reveal() { if (!playing()) return; showLearn(); }
function learnNum() {
  const v = Math.floor(Number($('lnNum').value)), err = $('lnErr');
  if (!(v >= G.lo && v <= G.hi)) { err.hidden = false; err.textContent = L(`${fmt(G.lo)}〜${fmt(G.hi)}の数を入れてね。`, `Enter a number from ${fmt(G.lo)} to ${fmt(G.hi)}.`); return; }
  const r = G.round, bad = r.mismatches(v), mm = bad.map(i => { const h = r.hist[i]; return { q: E.qText(h.q, EN ? 'en' : 'ja'), a: h.a ? CODE_LABEL.y : CODE_LABEL.n, hint: L(`${fmt(v)}なら「${E.evalQ(h.q, v) ? 'はい' : 'いいえ'}」`, `For ${fmt(v)} it is “${E.evalQ(h.q, v) ? 'yes' : 'no'}”`) }; });
  const rej = r.hist.find(h => h.t === 'g' && h.n === v && !h.a);
  const msg = rej ? L(`さっきの予想「${fmt(v)}」に「ちがう」と答えていたよ。`, `You said “no” to my guess of ${fmt(v)}.`) : mm.length ? L(`${mm.length}つの答えが、${fmt(v)}とくいちがっていたみたい。`, `${mm.length} of the answers do not fit ${fmt(v)}.`) : L('答えはぜんぶ合っていたのに、見つけられなかった…くやしい！', 'Every answer fit, yet I missed it. Annoying!');
  scr = 'play'; finish(false, { msg, mismatch: mm.length ? mm : null });
}
function learnItemGo() {
  const th = G.th, name = learnText.trim(), r = G.round; let sel = learnSel, learnedName = null, learnedNew = false, msg = '', mismatch = null;
  if (sel >= 0) {
    const it = th.items[sel], bad = r.mismatches(sel);
    if (it.custom) { const c = custom.t[G.key][it.ci]; if (c) { E.learnItem(custom, G.key, c.n, r.learned()); writeCustom(); } msg = L('おぼえていたものに、こたえをつけたしたよ。', 'I added more details to the thing I already knew.'); }
    else if (bad.length) { mismatch = bad.map(m => ({ q: qtext(th, m.a), a: CODE_LABEL[m.c], hint: L(`ふつうは「${m.v >= 0.99 ? 'はい' : 'いいえ'}」`, `Normally “${m.v >= 0.99 ? 'yes' : 'no'}”`) })); msg = L(`「${iname(it)}」は私の知っている答えとちがう答えが${bad.length}つあったよ。`, `${bad.length} of the answers differ from what I know about “${iname(it)}”.`); }
    else msg = L(`「${iname(it)}」の特ちょうと合っていたのに、決めきれなかった…。`, `The answers fit “${iname(it)}”, but I could not settle on it.`);
    learnedName = it.custom ? iname(it) : null;
  } else if (name) {
    const res = E.learnItem(custom, G.key, name, r.learned()); writeCustom();
    learnedName = name; learnedNew = !!(res && res.added); msg = L('はじめて知ったもの！ いまの答えから、特ちょうを覚えたよ。', 'Something new! I learned its features from your answers.');
  }
  scr = 'play'; finish(false, { msg: msg ? esc(msg) : '', learned: learnedName, learnedNew, mismatch });
}

// ---- two-player
function duoStart() {
  const n0 = ($('n0').value || '').trim() || L('1P', 'P1'), n1 = ($('n1').value || '').trim() || L('2P', 'P2');
  setup.duoNames = [$('n0').value, $('n1').value];
  duo = { names: [n0, n1], rounds: setup.duoRounds, turn: 0, cfg: setup.duoMode, pts: [[], []] }; scr = 'duoPass'; render();
}
function duoGo() {
  const c = duo.cfg;
  if (c.startsWith('th:')) start('th', { key: c.slice(3), duo: true });
  else start('num', Object.assign({ key: c, duo: true, hard: false }, NUM_PRESETS[c]));
}
// ---- a round in progress survives leaving the page
function persistRun() {
  if (!playing() || G.duo) return;
  const r = G.round, o = { v: 1, kind: G.kind, key: G.key, back: G.back, idk: G.idk, t: Date.now() };
  if (G.kind === 'num') Object.assign(o, { lo: G.lo, hi: G.hi, hard: G.hard, hist: r.hist.map(h => (h.t === 'q' ? { t: 'q', q: h.q, a: h.a } : { t: 'g', n: h.n, a: h.a })) });
  else o.log = r.log;
  store.set(RUN_KEY, JSON.stringify(o));
}
function clearRun() { store.del(RUN_KEY); }
function readRun() {
  try {
    const o = JSON.parse(store.get(RUN_KEY) || 'null'); if (!o || o.v !== 1) return null;
    if (o.kind === 'num' && (!(o.lo >= 1) || !(o.hi > o.lo) || o.hi > 1000000)) return null;
    if (o.kind === 'th' && !defOf(o.key)) return null;
    if (o.kind !== 'num' && o.kind !== 'th') return null;
    const n = o.kind === 'num' ? (o.hist || []).length : (o.log || []).length; if (!n) return null; o.n = n; return o;
  } catch (e) { return null; }
}
const runLabel = o => (o.kind === 'num' ? L('数字あてっこ', 'Number guess') + ' · ' + (o.key === 'cust' ? fmt(o.lo) + '〜' + fmt(o.hi) : NUM_LABEL[o.key]) : tname(defOf(o.key))) + ' · ' + L(`${o.n}こ答えた`, `${o.n} answered`);
function resume() {
  const o = readRun(); if (!o) return;
  if (o.kind === 'num') G = { kind: 'num', key: o.key, lo: o.lo, hi: o.hi, hard: !!o.hard, round: new E.NumRound(o.lo, o.hi, { hard: o.hard, rand: Math.random }).restore(o.hist) };
  else { const th = compiled(o.key); G = { kind: 'th', key: o.key, th, round: new E.ThemeRound(th, { rand: Math.random }).restore(o.log) }; }
  Object.assign(G, { back: o.back | 0, idk: o.idk | 0, wrongSeen: false, over: false, t0: Date.now(), duo: false, result: null });
  scr = 'play'; render(); emit('play_start', { mode: 'normal', resumed: true });
}

// ================================================================ how to play / menu / events
function showHowto(first) {
  const ov = $('ov');
  ov.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-label="${L('あそびかた', 'How to play')}"><h2>${L('あそびかた', 'How to play')}</h2>${mascot('think')}
    <ol>
      <li>${L('<b>こころに決める：</b>数や、ものを1つ思いうかべます（ゲームには入力しません）。', '<b>Think:</b> pick a number or a thing in your head (do not type it in).')}</li>
      <li>${L('<b>答える：</b>コンピュータが質問します。「はい」「いいえ」。ものあてでは「たぶんそう」「たぶんちがう」「わからない」も使えます。まちがえても大丈夫、コンピュータは多少のまちがいに強いよ。', '<b>Answer:</b> the computer asks questions. Yes or no; in thing mode you can also say probably, probably not or don\'t know. A wrong answer is not fatal — the computer copes with a few mistakes.')}</li>
      <li>${L('<b>当てる：</b>答えがしぼれたら「それは○○？」と聞きます。「そう！」で終わり。当たった問題の数がきろくになります。', '<b>Guess:</b> when it is sure it asks “Is it …?”. Say yes to finish. The number of questions it needed is your result.')}</li>
      <li>${L('<b>もどる：</b>まちがえたら「ひとつ前にもどる」。一覧からも好きなところまで戻れます。', '<b>Undo:</b> use “Undo last answer”, or jump back to any earlier question from the list.')}</li>
      <li>${L('<b>当てられなかったら：</b>答えを教えてね。ものあてなら、新しいものをおぼえて次から当てられるよ（この端末にだけ保存）。', '<b>If it gives up:</b> tell it the answer. In thing mode it learns new things for next time (saved on this device only).')}</li>
      <li>${L('<b>ふたりであてっこ：</b>スマホをまわして、コンピュータを困らせた人の勝ち。', '<b>Two players:</b> pass the phone; whoever makes the computer work harder wins.')}</li>
    </ol>${btn('bHowOk', 'primary big', first ? L('はじめる', "Let's go") : L('とじる', 'Close'), 'howClose')}</div>`;
  ov.hidden = false; const b = $('bHowOk'); if (b) b.focus();
}
function closeHowto() { $('ov').hidden = true; $('ov').innerHTML = ''; store.set(HOWTO_KEY, '1'); if (!save.tut) { save.tut = 1; writeSave(); } }

let pm = null;
function openMenu() {
  if (!UI) { go('title'); return; }
  if (pm && pm.isOpen) return;
  const extra = [{ label: L('あそびかた', 'How to play'), icon: 'help', onClick: () => { pm.close(); showHowto(false); } }, { label: L('せいせき・おぼえたもの', 'Record & learned'), icon: 'star', onClick: () => { pm.close(); go('stats'); } }];
  if (scr !== 'title') extra.push({ label: L('タイトルへ（今のゲームはやめる）', 'Title (quit this game)'), icon: 'menu', onClick: () => { pm.close(); quitToTitle(); } });
  pm = UI.pauseMenu({ title: L('メニュー', 'Menu'), home: '../', extra, onResume: () => { const g = KG(); if (g) g.menuClosed(); }, onOpen: () => { const g = KG(); if (g) g.menuOpened(); persistRun(); } });
  pm.open();
}
function quitToTitle() {
  if (playing()) { emit('play_end', { mode: 'normal', score: 0, durationMs: Date.now() - G.t0, reason: 'quit' }); if (!G.duo) persistRun(); G.over = true; }
  if (duo && scr !== 'duoEnd') duo = null; go('title');
}

// ---- clicks
function act(name, el) {
  switch (name) {
    case 'title': quitToTitle(); break;
    case 'numSetup': go('numSetup'); break;
    case 'themePick': go('themePick'); break;
    case 'duoSetup': go('duoSetup'); break;
    case 'stats': go('stats'); break;
    case 'howto': showHowto(false); break;
    case 'howClose': closeHowto(); break;
    case 'resume': resume(); break;
    case 'numKey': setup.numKey = el.dataset.k; setup.hard = $('optHard') ? $('optHard').checked : setup.hard; setup.peek = $('optPeek') ? $('optPeek').checked : setup.peek; render(); break;
    case 'startNum': startNum(); break;
    case 'startTheme': setup.peek = $('optPeek') ? $('optPeek').checked : setup.peek; saveSet(); start('th', { key: el.dataset.id }); break;
    case 'ans': answer(el.dataset.c); break;
    case 'gYes': guessAnswer(true); break;
    case 'gNo': guessAnswer(false); break;
    case 'undo': undo(); break;
    case 'rewind': { openHist = true; const i = +el.dataset.i; if (G.kind === 'num') G.round.rewind(i); else G.round.rewind(i); G.back++; after(); break; }
    case 'reveal': reveal(); break;
    case 'learnNum': learnNum(); break;
    case 'learnGo': learnItemGo(); break;
    case 'learnSkip': scr = 'play'; finish(false, { msg: '' }); break;
    case 'pickItem': { learnSel = +el.dataset.i; learnText = iname(G.th.items[learnSel]); $('lnText').value = learnText; fillLearn(); break; }
    case 'again': if (G.kind === 'num') start('num', { key: G.key, lo: G.lo, hi: G.hi, hard: G.hard }); else start('th', { key: G.key }); break;
    case 'forget': { const list = custom.t[el.dataset.id]; if (list) { list.splice(+el.dataset.i, 1); writeCustom(); render(); } break; }
    case 'duoMode': setup.duoMode = el.dataset.k.replace(/^num:/, ''); setup.duoNames = [$('n0').value, $('n1').value]; render(); break;
    case 'duoRounds': setup.duoRounds = +el.dataset.n; setup.duoNames = [$('n0').value, $('n1').value]; render(); break;
    case 'duoStart': duoStart(); break;
    case 'duoGo': duoGo(); break;
    case 'duoNext': {
      if (duo.turn + 1 >= duo.rounds * 2) { duo.turn++; save.stats.duo = (save.stats.duo || 0) + 1; writeSave(); scr = 'duoEnd'; render(); burst(60); } else { duo.turn++; scr = 'duoPass'; render(); }
      break;
    }
    case 'duoAgain': duo.turn = 0; duo.pts = [[], []]; scr = 'duoPass'; render(); break;
  }
}
const onClick = e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const hd = e.target.closest('details'); if (hd && hd.id === 'hist') openHist = true;
  act(el.dataset.act, el);
};
$('screen').addEventListener('click', onClick); $('ov').addEventListener('click', onClick);
$('screen').addEventListener('input', e => {
  if (e.target.id === 'lnText') { learnText = e.target.value; learnSel = -1; fillLearn(); }
  else if (e.target.id === 'cLo' || e.target.id === 'cHi') { const lo = Math.floor(Number($('cLo').value)), hi = Math.floor(Number($('cHi').value)); const n = $('cNote'); if (isFinite(lo)) setup.lo = lo; if (isFinite(hi)) setup.hi = hi; if (lo >= 1 && hi > lo && hi <= 1000000) { n.className = 'note'; n.textContent = L(`${fmt(hi - lo + 1)}この中から当てます。`, `The computer will search among ${fmt(hi - lo + 1)} numbers.`); } else { n.className = 'note bad'; n.textContent = L('1以上で、100万までの2つ以上の数のはんいにしてね。', 'Use a range of at least two numbers, from 1 up to 1,000,000.'); } }
});
$('screen').addEventListener('toggle', e => { if (e.target.id === 'hist') openHist = e.target.open; }, true);
$('screen').addEventListener('change', e => { if (e.target.id === 'optPeek') { setup.peek = e.target.checked; saveSet(); } else if (e.target.id === 'optHard') { setup.hard = e.target.checked; saveSet(); } });
document.addEventListener('keydown', e => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { if (e.key === 'Enter' && e.target.id === 'lnNum') learnNum(); return; }
  if (!$('ov').hidden) { if (e.key === 'Escape' || e.key === 'Enter') closeHowto(); return; }
  if (scr !== 'play' || !playing()) return;
  const s = G.round.state(), k = e.key.toLowerCase();
  if (k === 'backspace' || k === 'z') { undo(); e.preventDefault(); return; }
  if (s.phase === 'ask') { const m = { y: 'y', '1': 'y', n: 'n', '2': 'n', p: 'p', q: 'q', u: 'u', '?': 'u' }[k]; if (m && (G.kind === 'th' || m === 'y' || m === 'n' || m === 'u')) answer(m); }
  else if (s.phase === 'guess') { if (k === 'y' || k === '1' || k === 'enter') guessAnswer(true); else if (k === 'n' || k === '2') guessAnswer(false); }
});
$('menuBtn').addEventListener('click', openMenu);
$('sndBtn').addEventListener('click', () => { if (!AU) return; AU.toggleMute(); if (!AU.muted) sfx('ok'); });
if (AU && AU.onChange) AU.onChange(renderSound);
window.addEventListener('pagehide', persistRun);
document.addEventListener('visibilitychange', () => { if (document.hidden) persistRun(); });
window.addEventListener('storage', e => { if (e.key === SAVE_KEY && !playing()) { save = readSave(); if (scr === 'title' || scr === 'stats') render(); } });
if (window.KoboGame) KoboGame.register({ id: GAME, pause() {}, resume() {}, save() { persistRun(); }, isIdle: () => !playing(), dispose() { cancelAnimationFrame(fxRaf); } });
{ const b = $('homeLink'); b.setAttribute('aria-label', L('ゲーム一覧へ戻る', 'Back to games')); $('menuBtn').setAttribute('aria-label', L('メニュー', 'Menu')); }

// ---------- boot ----------
let booted = false;
renderSound(); render();
if (store.get(HOWTO_KEY) == null && !save.tut) showHowto(true);
booted = true;

// ---------- test hooks (?debug) ----------
if (DEBUG) {
  const cur = () => {
    if (!G) return null; const s = G.round.state();
    return { phase: s.phase, count: G.round.count, key: G.key, kind: G.kind, q: s.q || null, a: s.a == null ? null : s.a, guess: s.guess == null ? null : s.guess, left: s.left == null ? null : s.left, text: ($('bubble') || {}).textContent || '' };
  };
  const api = { ready: () => booted, state: () => ({ scr, cur: cur(), over: G ? G.over : null, result: G && G.result ? { won: G.result.won, count: G.result.count } : null, duo: duo ? { turn: duo.turn, pts: duo.pts } : null, save: JSON.parse(JSON.stringify(save)) }) };
  window.__kb = Object.assign(window.__kb || {}, api);
  window.__akin = {
    E, api, get G() { return G; }, get save() { return save; }, get custom() { return custom; }, get duo() { return duo; }, cur, go, start, setSave(o) { save = E.normalizeSave(o); writeSave(); render(); },
    resetCustom() { custom = E.readCustom(null); writeCustom(); }, closeHowto,
    thumbScene() {
      store.set(HOWTO_KEY, '1'); $('ov').hidden = true; document.body.classList.add('thumb');
      setup.peek = true; start('th', { key: 'animals' }); const th = G.th, ix = id => th.attrs.findIndex(a => a.id === id);
      for (const [id, c] of [['mammal', 'y'], ['legs4', 'y'], ['big', 'y'], ['africa', 'y']]) { const r = G.round; if (r.pend && r.pend.kind === 'q') { r.log.push({ t: 'q', a: ix(id), c }); r.plan(); } }
      render(); clearRun(); return true;
    },
  };
}
})();
