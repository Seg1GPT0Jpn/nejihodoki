(() => {
'use strict';
// 囲碁工房 — Go on a 9x9, 13x13 or 19x19 board. The rules live in engine.js, the CPU (Monte-Carlo tree search, no outside libraries) in ai.js (run in worker.js through cpu.js),
// the life-and-death solver in tsumego.js (puzzles.js is its proven bank), SGF in sgf.js, online (common/turnroom.js) in online.js. This file is the table: board, stones, title, results, saves.
const T = KoboI18n.t;
KoboI18n.add({ en: {
  '囲碁工房': 'Go Workshop', '碁盤': 'Go board', 'ゲーム一覧へ戻る': 'Back to all games', 'ゲーム一覧へ': 'All games', 'メニュー': 'Menu', 'サウンド': 'Sound', '拡大': 'Zoom', '表示': 'View',
  '今日の詰碁': 'Daily tsumego', 'オンライン対戦': 'Online match', '友だちとコードで・クイックマッチ': 'With friends by code · Quick match', 'つづきから': 'Continue', 'CPUと対局': 'Play the CPU', 'ふたりで（1台）': 'Two players',
  '詰碁': 'Tsumego', '棋譜（SGF）': 'Record (SGF)', 'ルール': 'Rules', 'もう一度': 'Play again', '検討する': 'Review', '盤を見る': 'View board', 'タイトルへ': 'Title', 'とじる': 'Close',
  '書き出し（コピーして使えます）': 'Export (copy it)', '読みこみ（SGF を貼りつけ）': 'Import (paste SGF)', 'コピー': 'Copy', '読みこんで検討する': 'Load and review', '言語 / Language': '言語 / Language',
} });
const EN = KoboI18n.lang === 'en';
const L = (ja, en) => (EN ? en : ja);
const E = window.IgoEngine, AI = window.IgoAI, ART = window.IgoArt, SGF = window.IgoSGF, TS = window.IgoTsumego, PZ = window.IgoPuzzles, ON = window.IgoOnline;
const PF = window.KoboPlatform || null, A = window.KoboAudio || null, UI = window.KoboUI || null;
const KG = () => window.KoboGame || null;
const GAME = 'igo';
const SAVE_KEY = 'kusoge.igo.save';    // records and settings (registry: per-field merge)
const RUN_KEY = 'kusoge.igo.game';     // the unfinished game on this device (not synced)
const HOWTO_KEY = 'kusoge.igo.howto';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => Math.round(Number(n) || 0).toLocaleString(EN ? 'en-US' : 'ja-JP');
const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return { matches: false }; } })();
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
function emit(type, p) { const g = KG(); if (g) g.emit(type, p); }
function sfx(name, a) { if (A) A.sfx(name, a); }
const rndSeed = () => (Math.floor(Math.random() * 4294967295) + 1) >>> 0;
const SIZES = [9, 13, 19];
const LV_NAME = { 1: L('入門', 'Beginner'), 2: L('初級', 'Easy'), 3: L('中級', 'Medium'), 4: L('上級', 'Hard'), 5: L('強豪', 'Expert') };
const RULE_NAME = { jp: L('日本ルール', 'Japanese'), cn: L('中国ルール', 'Chinese') };
const RULE_SHORT = { jp: L('日本', 'JP'), cn: L('中国', 'CN') };
const KOMIS = [-1, 0, 0.5, 5.5, 6.5, 7.5];
const CLOCKS = [null, { main: 0, byo: 30, per: 1 }, { main: 300, byo: 20, per: 3 }, { main: 600, byo: 30, per: 5 }, { main: 1500, byo: 30, per: 5 }];
const clockName = k => (!CLOCKS[k] ? L('なし', 'None') : (CLOCKS[k].main ? L(Math.round(CLOCKS[k].main / 60) + '分＋', Math.round(CLOCKS[k].main / 60) + ' min + ') : '') + L('秒読み' + CLOCKS[k].byo + '秒×' + CLOCKS[k].per, CLOCKS[k].byo + ' s × ' + CLOCKS[k].per + ' byo-yomi'));
const BASE_STARS = [0, 1, 2, 3, 5, 8], SIZE_MULT = { 9: 1, 13: 2, 19: 3 };
const colName = k => (k === 2 ? L('白', 'White') : L('黒', 'Black'));
const sgfColor = k => (k === 2 ? 'W' : 'B');

// ---------- save ----------
function newSave() {
  return { v: 1, pts: 0, w: {}, stats: {}, set: { n: 9, rule: 'jp', level: 2, me: 'b', hc: 0, komi: -1, superko: 0, clock: 0, coords: 1, nums: 0, terr: 0, atari: 1, conf: 2, fast: 0, on: { n: 9, rule: 'jp', hc: 0 } }, pz: { done: {} }, dl: { last: 0, ok: 0, st: 0, bs: 0 }, tut: 0 };
}
function readSave() {
  let o = null;
  try { o = JSON.parse(store.get(SAVE_KEY) || 'null'); } catch (e) {}
  const s = newSave(), nz = v => Math.max(0, Math.floor(Number(v) || 0));
  if (o && typeof o === 'object') {
    s.pts = nz(o.pts);
    if (o.w && typeof o.w === 'object') for (const k of Object.keys(o.w)) if (/^(9|13|19)-[1-5]$/.test(k) && o.w[k] && typeof o.w[k] === 'object') s.w[k] = { p: nz(o.w[k].p), w: nz(o.w[k].w) };
    if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(o.stats)) { const v = Number(o.stats[k]); if (isFinite(v) && v >= 0) s.stats[k] = v; }
    if (o.set && typeof o.set === 'object') {
      const x = o.set;
      s.set.n = SIZES.includes(x.n) ? x.n : 9; s.set.rule = x.rule === 'cn' ? 'cn' : 'jp'; s.set.level = clamp(Math.round(x.level) || 2, 1, 5); s.set.me = ['b', 'w', 'r'].includes(x.me) ? x.me : 'b';
      s.set.hc = x.hc >= 2 && x.hc <= 9 ? x.hc | 0 : 0; s.set.komi = KOMIS.includes(x.komi) ? x.komi : -1; s.set.superko = x.superko ? 1 : 0; s.set.clock = x.clock >= 0 && x.clock < CLOCKS.length ? x.clock | 0 : 0;
      s.set.coords = x.coords === 0 ? 0 : 1; s.set.nums = x.nums ? 1 : 0; s.set.terr = x.terr ? 1 : 0; s.set.atari = x.atari === 0 ? 0 : 1; s.set.conf = [0, 1, 2].includes(x.conf) ? x.conf : 2; s.set.fast = x.fast ? 1 : 0;
      if (x.on && typeof x.on === 'object') { s.set.on.n = SIZES.includes(x.on.n) ? x.on.n : 9; s.set.on.rule = x.on.rule === 'cn' ? 'cn' : 'jp'; s.set.on.hc = x.on.hc >= 2 && x.on.hc <= 9 ? x.on.hc | 0 : 0; }
    }
    if (o.pz && o.pz.done && typeof o.pz.done === 'object') for (const k of Object.keys(o.pz.done)) if (/^g\d{3}$/.test(k) && o.pz.done[k]) s.pz.done[k] = 1;
    if (o.dl && typeof o.dl === 'object') { s.dl.last = nz(o.dl.last); s.dl.ok = o.dl.ok ? 1 : 0; s.dl.st = nz(o.dl.st); s.dl.bs = nz(o.dl.bs); }
    s.tut = o.tut ? 1 : 0;
  }
  return s;
}
let save = readSave();
function writeSave() { store.set(SAVE_KEY, JSON.stringify(save)); }
const wRec = k => (save.w[k] = save.w[k] || { p: 0, w: 0 });
const stat = k => Number(save.stats[k]) || 0;
function bump(k, n) { save.stats[k] = stat(k) + (n === undefined ? 1 : n); }
function bumpMax(k, v) { if (v > stat(k)) save.stats[k] = v; }

// =====================================================================================
// the board: n x n crossings (div, not button: only the cursor cell is a tab stop) and at most one stone element per crossing
// =====================================================================================
const boardEl = $('board'), stageEl = $('stage');
const B = { n: 0, cells: [], stones: [], tms: [], bs: 300, lab: [] };
const SPD = { v: 1 };       // 1 = normal; 0 = no animation and no waiting (tests)
let zoomOn = false, S = null;
document.querySelectorAll('.pl .dk').forEach(e => { e.style.backgroundImage = ART.faceURL(e.id === 'dkW' ? 2 : 1); });
const colLabel = (c, n) => 'ABCDEFGHJKLMNOPQRST'[c];
const pointName = (i, n) => (i < 0 ? L('パス', 'pass') : E.name(i, n));
function buildBoard(n) {
  if (B.n === n && B.cells.length === n * n) return;
  B.n = n; B.cells = []; B.stones = []; B.tms = []; B.lab = [];
  boardEl.innerHTML = ''; boardEl.style.setProperty('--n', n);
  const stars = new Set(E.geo(n).stars);
  for (let r = 0; r < n; r++) {
    const row = document.createElement('div'); row.className = 'row'; row.setAttribute('role', 'row');
    for (let c = 0; c < n; c++) {
      const el = document.createElement('div'); el.className = 'cell' + (c === 0 ? ' cl' : '') + (c === n - 1 ? ' cr' : '') + (r === 0 ? ' ct' : '') + (r === n - 1 ? ' cb' : '') + (stars.has(r * n + c) ? ' star' : '');
      el.setAttribute('role', 'gridcell'); el.dataset.i = r * n + c; el.tabIndex = -1;
      el.innerHTML = '<i class="gh"></i>';
      row.appendChild(el); B.cells.push(el); B.stones.push(null); B.tms.push(null); B.lab.push('');
    }
    boardEl.appendChild(row);
  }
  const co = document.createElement('div'); co.id = 'coords'; co.setAttribute('aria-hidden', 'true'); boardEl.appendChild(co);
  fit();
}
function placeCoords() {
  const co = $('coords'); if (!co) return; const n = B.n; co.innerHTML = '';
  if (!save.set.coords) { co.hidden = true; return; }
  co.hidden = false;
  const pad = parseFloat(getComputedStyle(boardEl).getPropertyValue('--pad')) || 4, inner = B.bs - 2 * pad;
  for (let j = 0; j < n; j++) {
    const a = document.createElement('span'); a.textContent = colLabel(j, n); a.style.left = (pad + inner * (j + .5) / n) + 'px'; a.style.top = (pad * .5) + 'px'; co.appendChild(a);
    const b = document.createElement('span'); b.textContent = n - j; b.style.left = (pad * .5) + 'px'; b.style.top = (pad + inner * (j + .5) / n) + 'px'; co.appendChild(b);
  }
}
function fit() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  const base = Math.max(120, Math.floor(Math.min(w, h)));
  B.bs = zoomOn ? Math.round(base * 1.75) : base;
  const pad = save.set.coords ? clamp(Math.round(B.bs * 0.036), 11, 18) : clamp(Math.round(B.bs * 0.012), 3, 8);
  boardEl.style.setProperty('--bs', B.bs + 'px'); boardEl.style.setProperty('--pad', pad + 'px');
  stageEl.classList.toggle('zoom', zoomOn);
  if (!zoomOn) { stageEl.scrollLeft = 0; stageEl.scrollTop = 0; }
  placeCoords();
}
function scrollToCell(i) {
  if (!zoomOn || i == null || i < 0) return;
  const c = B.cells[i]; if (!c) return;
  const sr = stageEl.getBoundingClientRect(), cr = c.getBoundingClientRect();
  stageEl.scrollLeft += cr.left + cr.width / 2 - (sr.left + sr.width / 2); stageEl.scrollTop += cr.top + cr.height / 2 - (sr.top + sr.height / 2);
}
function mkStone(color) {
  const d = document.createElement('div'); d.className = 'st ' + (color === 2 ? 'w' : 'b'); d.style.backgroundImage = ART.faceURL(color);
  return d;
}
const stoneMs = () => Math.round(240 * SPD.v);
// bring the stones in line with a board; extra: { anim, nums: Map, dead: Set, at: Map cell -> 'at'|'at2' }
function syncStones(b, o) {
  o = o || {}; const n = B.n, anim = !!o.anim && SPD.v > 0 && !reduceMotion.matches;
  boardEl.classList.toggle('inst', !anim);
  for (let i = 0; i < n * n; i++) {
    const v = b[i], d = B.stones[i];
    if (!v) { if (d) { d.remove(); B.stones[i] = null; } continue; }
    let el = d;
    if (!el || el.classList.contains('w') !== (v === 2)) {
      if (el) el.remove();
      el = mkStone(v); if (anim) el.classList.add('new'); B.cells[i].appendChild(el); B.stones[i] = el;
    } else if (!anim) el.classList.remove('new');
    const num = o.nums ? o.nums.get(i) : 0; let nm = el.firstChild;
    if (num) { if (!nm) { nm = document.createElement('span'); nm.className = 'nm'; el.appendChild(nm); } if (nm.textContent !== String(num)) nm.textContent = num; } else if (nm) nm.remove();
    el.classList.toggle('dd', !!(o.dead && o.dead.has(i)));
    const a = o.at ? o.at.get(i) : '';
    el.classList.toggle('at', a === 'at'); el.classList.toggle('at2', a === 'at2');
  }
  return anim ? stoneMs() + 30 : 0;
}
function syncTerr(map) { // map: Int8Array owner per cell (1 black, 2 white), est: draw lighter
  const n = B.n;
  for (let i = 0; i < n * n; i++) {
    const o = map ? map.own[i] : 0, el = B.tms[i];
    if (!o || B.stones[i] && !map.onStone) { if (el) { el.remove(); B.tms[i] = null; } continue; }
    let t = el; if (!t) { t = document.createElement('i'); B.cells[i].appendChild(t); B.tms[i] = t; }
    t.className = 'tm ' + (o === 2 ? 'w' : 'b') + (map.est ? ' est' : '');
  }
}
const live = $('live');
function announce(t) { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); }
function setStatus(text, you) { const el = $('status'); el.textContent = text; el.classList.toggle('you', !!you); }

// =====================================================================================
// the session: S is the game on the table (CPU, two on one device, online, review, tsumego)
// =====================================================================================
const cpu = window.IgoCPU ? IgoCPU.create({ workerUrl: 'worker.js' }) : null;
const cpuWait = ms => Math.round(ms * SPD.v * (save.set.fast ? 0.4 : 1));
const cpuOpts = () => (SPD.v === 0 ? { time: 150 } : {});
function mkSession(o) { return Object.assign({ mode: 'cpu', st: null, cfg: {}, me: 1, level: 2, over: false, busy: false, menu: false, hinted: 0, undone: 0, ms: 0, t0: Date.now(), hint: -1, pend: -1, pendWhy: '', cur: 0, last: -1, note: '', tok: 0, thinking: false, sugg: null, clk: null, sc: null, capNow: 0, koHit: 0 }, o); }
const centerCell = n => ((n - 1) >> 1) * n + ((n - 1) >> 1);
const ownColor = () => (!S ? 1 : S.mode === 'cpu' ? S.me : S.mode === 'online' ? S.myc : S.st.turn);
const useConfirm = () => save.set.conf === 1 || (save.set.conf === 2 && coarse());
function canAct() {
  if (!S || S.over || S.busy || S.menu || !S.st || S.st.phase !== 'play') return false;
  if (S.mode === 'pass' || S.mode === 'review') return true;
  if (S.mode === 'cpu') return S.st.turn === S.me && !S.thinking;
  if (S.mode === 'online') return S.st.turn === S.myc && !S.sending;
  return false;
}
const canMark = () => !!S && !S.over && !S.menu && !!S.st && S.st.phase === 'dead' && !S.busy && ['cpu', 'pass', 'online'].includes(S.mode);
function nameOf(k) {
  if (!S) return colName(k);
  if (S.mode === 'online') return (S.names && S.names[k - 1]) || colName(k);
  if (S.mode === 'cpu') return k === S.me ? L('あなた', 'You') : 'CPU';
  return colName(k);
}
function turnText() {
  if (!S) return '';
  const st = S.st;
  if (S.over || st.over) return L('対局が終わりました', 'The game is over');
  if (st.phase === 'dead') return L('死に石を選んでください', 'Mark the dead stones');
  const nm = nameOf(st.turn);
  if (S.mode === 'cpu') return st.turn === S.me ? L('あなたの番です', 'Your turn') : L('CPUが考えています…', 'The CPU is thinking…');
  if (S.mode === 'online') return st.turn === S.myc ? L('あなたの番です', 'Your turn') : L('{name}が考えています…', '{name} is thinking…').replace('{name}', nm);
  return L('{name}の番です', '{name} to move').replace('{name}', colName(st.turn));
}
function refreshStatus() {
  if (!S || S.mode === 'puzzle') return;
  if (S.st.phase === 'dead' && !S.over) { markStatus(); return; }
  setStatus((S.note ? S.note + ' ' : '') + turnText(), canAct());
}
function scoreLine(sc) {
  const w = sc.winner;
  return L('黒 ' + sc.b + ' ／ 白 ' + sc.w + '（コミ込み）→ ' + (w ? colName(w) + ' ' + sc.margin + (S && S.st.rule === 'cn' ? ' 点' : ' 目') + '勝ち' : '持碁（引き分け）'),
    'B ' + sc.b + ' / W ' + sc.w + ' (komi incl.) → ' + (w ? colName(w) + ' +' + sc.margin : 'jigo (draw)'));
}
function markStatus() {
  if (!S || S.st.phase !== 'dead') return;
  const sc = E.score(S.st, S.st.dead), cf = S.mode === 'online' ? S.cf || '00' : '';
  let t = L('死に石を選んでください（石をタップで切りかえ）。', 'Mark dead stones (tap a group). ') + scoreLine(sc);
  if (S.mode === 'online') {
    const me = S.myc - 1; t += ' ' + (cf[me] === '1' ? L('あなたは確認ずみ。相手を待っています', 'You agreed; waiting for the opponent') : cf[1 - me] === '1' ? L('相手は確認ずみ', 'The opponent agreed') : '');
  }
  setStatus(t, true);
}
// ---------- drawing ----------
function paint(anim) {
  if (!S || !S.st) return 0;
  const st = S.st, n = st.n; buildBoard(n);
  const phase = st.phase, dead = new Set(phase === 'dead' || phase === 'over' ? st.dead || [] : []);
  let nums = null; if (save.set.nums && S.mode !== 'puzzle') { nums = new Map(); st.moves.forEach((m, j) => { if (m[0] >= 0) nums.set(m[0], j + 1); }); }
  let at = null;
  if (save.set.atari && phase === 'play' && S.mode !== 'puzzle' && !S.over) { at = new Map(); const own = ownColor(); for (const c of E.atariCells(st, own)) at.set(c, 'at'); for (const c of E.atariCells(st, 3 - own)) at.set(c, 'at2'); }
  const wait = syncStones(st.b, { anim, nums, dead, at });
  let tm = null;
  if (S.mode === 'puzzle') tm = null;
  else if (phase === 'dead' || (phase === 'over' && st.result && st.result.by === 'score')) { const sc = E.score(st, st.dead || []); S.sc = sc; tm = { own: sc.terr, onStone: true, est: false }; }
  else if (save.set.terr && phase === 'play') { const es = E.estimate(st); tm = { own: es.own, est: true, onStone: false }; }
  syncTerr(tm);
  markers();
  return wait;
}
function markers() {
  if (!S || !S.st) return;
  const st = S.st, n = st.n, act = canAct() || (S.mode === 'puzzle' && !!S.pz && !S.pz.done && !S.busy) || canMark();
  const puz = S.mode === 'puzzle', koCell = st.phase === 'play' && st.ko >= 0 && !puz ? st.ko : -1, turnC = puz ? S.pz.p.hero : st.turn;
  boardEl.style.setProperty('--gh', turnC === 2 ? 'rgba(245, 240, 225, .8)' : 'rgba(20, 20, 30, .6)');
  for (let i = 0; i < n * n && i < B.cells.length; i++) {
    const el = B.cells[i], v = st.b[i], out = puz && S.pz.rg && S.pz.rg[i] !== '1';
    el.classList.toggle('lg', act && (canMark() ? !!v : !v && !out));
    el.classList.toggle('last', i === S.last && !!v);
    el.classList.toggle('ko', i === koCell && !v);
    el.classList.toggle('pv', i === S.pend && !v);
    el.classList.toggle('ht', i === S.hint && !v);
    el.classList.toggle('out', !!out);
    el.classList.toggle('bad', !!(puz && S.pz.bad === i));
    el.classList.toggle('cur', i === S.cur); el.tabIndex = i === S.cur ? 0 : -1;
    const lab = E.name(i, n) + (v ? ', ' + colName(v) : '') + (out ? ', ' + L('範囲外', 'outside') : '');
    if (B.lab[i] !== lab) { B.lab[i] = lab; el.setAttribute('aria-label', lab); }
  }
}
function fmtClock(c) { if (!c) return ''; const s = Math.max(0, Math.ceil((c.byo ? c.left : c.main) / 1000)); return c.byo ? s + 's×' + c.per : Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
function hud() {
  if (!S || !S.st) return;
  const st = S.st, over = !!S.over || st.over;
  $('cB').textContent = st.caps[1]; $('cW').textContent = st.caps[2];
  $('nB').textContent = nameOf(1); $('nW').textContent = nameOf(2);
  const lvl = S.mode === 'cpu' ? LV_NAME[S.level] : '';
  const komiTxt = L('コミ ', 'komi ') + st.komi;
  $('sB').textContent = (S.mode === 'cpu' && S.me === 2 ? lvl + ' · ' : '') + (st.hc ? L('置き石 ', 'handicap ') + st.hc : L('先手', 'First'));
  $('sW').textContent = (S.mode === 'cpu' && S.me === 1 ? lvl + ' · ' : '') + komiTxt;
  const turnOn = !over && S.mode !== 'puzzle' && st.phase === 'play';
  $('plB').classList.toggle('on', turnOn && st.turn === 1); $('plW').classList.toggle('on', turnOn && st.turn === 2);
  for (const [k, id] of [[1, 'bB'], [2, 'bW']]) {
    const bd = $(id); let txt = '', cls = 'bd';
    if (S.mode === 'online' && S.sl) {
      const ch = S.sl[k - 1];
      if (ch === 'd') { txt = L('切断', 'Offline'); cls += ' off'; } else if (ch === 'a') { txt = L('離席', 'Away'); cls += ' away'; } else if (ch === 'c' || ch === 'x') txt = 'CPU';
      if (turnOn && st.turn === k && S.tsec > 0 && ch === 'p') { txt = '⏱' + S.tsec; cls = 'bd tm'; }
    } else if (S.clk && S.clk[k] && !over) { txt = fmtClock(S.clk[k]); cls += ' tm' + (S.clk[k].byo && S.clk[k].left < 10000 ? ' low' : ''); }
    bd.hidden = !txt; bd.textContent = txt; bd.className = cls;
  }
  const gm = S.mode === 'cpu' ? L('CPU ' + LV_NAME[S.level], 'CPU ' + LV_NAME[S.level]) : S.mode === 'pass' ? L('ふたりで1台', 'Two players') : S.mode === 'online' ? L('オンライン', 'Online') : S.mode === 'review' ? L('検討', 'Review') : S.mode === 'puzzle' ? L('詰碁', 'Tsumego') : '';
  $('iGame').textContent = gm + ' · ' + st.n + L('路', '×' + st.n) + ' · ' + RULE_SHORT[st.rule];
  $('iTurn').classList.toggle('you', canAct());
  $('iTurn').textContent = S.mode === 'puzzle' ? (S.pz.p.id + ' · ' + (S.pz.p.ty === 'kill' ? L('取れ', 'Kill') : L('生きよ', 'Live'))) : over ? L('終局', 'Finished') : st.phase === 'dead' ? L('死に石えらび', 'Dead stones') : colName(st.turn) + L('の番', ' to move');
  $('iBest').textContent = '★ ' + fmtN(save.pts);
  $('zoomBtn').setAttribute('aria-pressed', String(zoomOn));
  renderCtl();
}
// ---------- the buttons under the board ----------
function renderCtl() {
  const ctl = $('ctl'); if (!S) { ctl.style.visibility = 'hidden'; return; }
  ctl.style.visibility = '';
  const st = S.st, conf = useConfirm();
  const kind = S.mode === 'puzzle' ? 'pz' + (S.pz.done ? 'd' : 'q') : S.over ? 'over' : S.mode === 'review' ? 'rv' : st.phase === 'dead' ? 'dead' : S.mode;
  const key = kind + ':' + EN + ':' + (conf ? 'c' : 'n') + ':' + (S.mode === 'online' ? 1 : 0);
  if (ctl.dataset.key !== key) {
    ctl.dataset.key = key; ctl.innerHTML = '';
    const mk = (id, label, sub, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'act' + (cls ? ' ' + cls : ''); b.dataset.id = id; b.innerHTML = esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : ''); b.addEventListener('click', () => ctlAct(id)); ctl.appendChild(b); return b; };
    if (kind === 'cpu' || kind === 'pass') { mk('pass', L('パス', 'Pass'), 'P'); mk('undo', L('もどす', 'Undo'), 'U'); mk('hint', L('ヒント', 'Hint'), 'H'); mk('resign', L('投了', 'Resign')); if (conf) mk('ok', L('おく', 'Place'), 'Enter', 'go'); }
    else if (kind === 'online') { mk('pass', L('パス', 'Pass'), 'P'); mk('resign', L('投了', 'Resign')); if (conf) mk('ok', L('おく', 'Place'), 'Enter', 'go'); }
    else if (kind === 'dead') {
      if (S.mode !== 'online') mk('suggest', L('自動で提案', 'Auto-mark'), 'A');
      mk('done', S.mode === 'online' ? L('この結果でOK', 'Agree') : L('確定して数える', 'Confirm & score'), 'F', 'go'); mk('resume', L('対局にもどる', 'Resume play'), 'R');
    }
    else if (kind === 'rv') { mk('rfirst', '⏮'); mk('rprev', '◀', '←'); mk('rnext', '▶', '→'); mk('rlast', '⏭'); mk('hint', L('ヒント', 'Hint'), 'H'); if (conf) mk('ok', L('おく', 'Place'), 'Enter', 'go'); mk('rexit', L('終了', 'Exit')); }
    else if (kind === 'over') { mk('result', L('結果', 'Result')); mk('review', L('検討', 'Review')); mk('sgf', 'SGF'); mk('title', L('タイトル', 'Title')); }
    else if (kind === 'pzq') { mk('phint', L('ヒント', 'Hint'), 'H'); mk('preset', L('やり直し', 'Retry'), 'R'); mk('plist', L('一覧', 'List')); if (conf) mk('ok', L('おく', 'Place'), 'Enter', 'go'); }
    else if (kind === 'pzd') { mk('preset', L('もう一度', 'Again'), 'R'); mk('pnext', L('つぎの問題', 'Next'), 'Enter', 'go'); mk('plist', L('一覧', 'List')); }
  }
  const dis = (id, v) => { const b = ctl.querySelector('[data-id="' + id + '"]'); if (b) b.disabled = !!v; };
  const act = canAct();
  dis('pass', !act); dis('hint', !(act || (S.mode === 'puzzle')) || !!S.thinking || S.hinting); dis('undo', undoTarget() < 0 || S.busy); dis('resign', !!S.over || (S.mode !== 'online' && !!S.busy));
  dis('ok', !(S.pend >= 0 && (act || (S.mode === 'puzzle' && !S.pz.done && !S.busy))));
  dis('rprev', !S.rv || !S.rv.cur.par); dis('rfirst', !S.rv || !S.rv.cur.par); dis('rnext', !S.rv || !S.rv.cur.kids.length); dis('rlast', !S.rv || !S.rv.cur.kids.length);
  dis('done', S.mode === 'online' ? !!(S.cf && S.cf[S.myc - 1] === '1') : !!S.busy); dis('resume', !!S.busy); dis('suggest', !!S.busy);
  fit();
}
function ctlAct(id) {
  if (id === 'pass') doPass(); else if (id === 'undo') doUndo(); else if (id === 'hint') doHint(); else if (id === 'resign') askResign();
  else if (id === 'ok') { if (S && S.pend >= 0) commit(S.pend); }
  else if (id === 'suggest') suggestDead(); else if (id === 'done') confirmDead(); else if (id === 'resume') resumePlay();
  else if (id === 'result') { if (S && S.mode === 'online') showOnlineResultAgain(); else showResult(); } else if (id === 'review') startReviewFromSession(); else if (id === 'sgf') openSgf(); else if (id === 'title') { if (S && S.mode === 'online') leaveOnline(); else showTitle(); }
  else if (id === 'rfirst') rvGo(rvRoot()); else if (id === 'rprev') rvGo(S.rv.cur.par); else if (id === 'rnext') rvGo(S.rv.cur.kids[S.rv.cur.sel || 0]); else if (id === 'rlast') rvGo(rvEnd()); else if (id === 'rexit') { showTitle(); }
  else if (id === 'phint') puzzleHint(); else if (id === 'preset') puzzleReset(true); else if (id === 'pnext') puzzleNext(); else if (id === 'plist') showPuzzleList();
}
function toggleZoom() {
  zoomOn = !zoomOn; fit(); $('ctl').dataset.key = ''; if (S) { hud(); markers(); scrollToCell(S.pend >= 0 ? S.pend : S.last >= 0 ? S.last : S.cur); }
  sfx('tap');
}

// ---------- starting, saving and resuming a game ----------
const OVERLAYS = ['ovTitle', 'ovResult', 'ovView', 'ovSgf', 'ovPuz', 'howto'];
function hideOverlays() { for (const id of OVERLAYS) $(id).hidden = true; }
function stopAll() { if (S) { S.tok++; S.thinking = false; } if (cpu) cpu.cancel(); clearInterval(clockT); clockT = 0; }
let clockT = 0;
function startGame(o) {
  o = o || {};
  stopAll(); if (S && S.mode === 'online' && TR && !S.over) TR.leave();
  hideOverlays();
  const set = save.set, mode = o.mode === 'pass' ? 'pass' : 'cpu';
  const cfg = { n: o.n || set.n, rule: o.rule || set.rule, level: o.level || set.level, hc: o.hc != null ? o.hc : set.hc, komi: o.komi != null ? o.komi : set.komi, superko: o.superko != null ? o.superko : set.superko, clock: o.clock != null ? o.clock : set.clock, me: o.me || set.me };
  const st = E.create({ n: cfg.n, rule: cfg.rule, hc: cfg.hc, komi: cfg.komi < 0 ? undefined : cfg.komi, superko: !!cfg.superko });
  const me = cfg.me === 'w' ? 2 : cfg.me === 'b' ? 1 : (Math.random() < 0.5 ? 1 : 2);
  S = mkSession({ mode, st, cfg: Object.assign({ mode }, cfg), level: cfg.level, me: mode === 'cpu' ? me : 1, seed: rndSeed() });
  S.cur = centerCell(cfg.n); initClocks();
  zoomOn = cfg.n === 19 && coarse() && Math.min(innerWidth, innerHeight) < 600;
  buildBoard(cfg.n); fit(); paint(false); hud();
  emit('play_start', { mode: mode === 'pass' ? 'practice' : 'normal' });
  const extra = st.hc ? L('置き石' + st.hc + '子。', st.hc + ' handicap stones. ') : '';
  setStatus((mode === 'cpu' ? L('あなたは', 'You play ') + colName(me) + L('番。', '. ') : '') + extra + turnText(), me === st.turn || mode === 'pass');
  persist(); loop();
  return S;
}
const runOf = () => ({ v: 1, mode: S.mode, cfg: S.cfg, me: S.me, level: S.level, moves: S.st.moves, hinted: S.hinted, undone: S.undone, ms: Math.round(S.ms + (Date.now() - S.t0)), clk: S.clk ? { 1: S.clk[1], 2: S.clk[2] } : null, at: Date.now() });
function persist() {
  if (!S || S.over || (S.mode !== 'cpu' && S.mode !== 'pass')) return;
  store.set(RUN_KEY, JSON.stringify(runOf()));
}
function clearRun() { store.del(RUN_KEY); }
function readRun() {
  let r = null;
  try { r = JSON.parse(store.get(RUN_KEY) || 'null'); } catch (e) {}
  if (!r || r.v !== 1 || !['cpu', 'pass'].includes(r.mode) || !Array.isArray(r.moves) || !r.cfg || !SIZES.includes(r.cfg.n)) return null;
  const c = r.cfg, o = { n: c.n, rule: c.rule === 'cn' ? 'cn' : 'jp', hc: c.hc >= 2 ? c.hc : 0, komi: c.komi >= 0 ? c.komi : undefined, superko: !!c.superko };
  const rep = E.fromMoves(o, r.moves.filter(m => Array.isArray(m) && m.length === 2));
  if (rep.failed >= 0 || rep.st.over) return null;
  return Object.assign(r, { st: rep.st });
}
function resumeGame(r) {
  stopAll(); hideOverlays();
  S = mkSession({ mode: r.mode, st: r.st, cfg: r.cfg, level: clamp(r.level | 0 || 2, 1, 5), me: r.me === 2 ? 2 : 1, hinted: r.hinted | 0, undone: r.undone | 0, ms: r.ms | 0 });
  if (r.clk) { S.clk = { 1: r.clk[1], 2: r.clk[2], last: Date.now() }; }
  const lm = r.st.moves.slice(-1)[0]; S.last = lm && lm[0] >= 0 ? lm[0] : -1; S.cur = S.last >= 0 ? S.last : centerCell(r.st.n);
  buildBoard(r.st.n); fit(); paint(false); hud(); refreshStatus();
  emit('play_start', { mode: r.mode === 'pass' ? 'practice' : 'normal', resumed: true });
  if (r.st.phase === 'dead') enterDead(); else loop();
}

// ---------- clocks (byo-yomi) ----------
function initClocks() {
  const c = CLOCKS[S.cfg.clock]; if (!c || (S.mode !== 'cpu' && S.mode !== 'pass')) { S.clk = null; return; }
  const mk = () => ({ main: c.main * 1000, per: c.per, left: c.byo * 1000, byo: c.main === 0 });
  S.clk = { 1: mk(), 2: mk(), last: Date.now() };
}
function clockTick() {
  if (!S || !S.clk || S.over || S.menu || S.st.phase !== 'play') { if (S && S.clk) S.clk.last = Date.now(); return; }
  const now = Date.now(), dt = now - S.clk.last; S.clk.last = now; const k = S.st.turn;
  if (S.mode === 'cpu' && k !== S.me) return;
  const c = S.clk[k], byoMs = CLOCKS[S.cfg.clock].byo * 1000;
  if (!c.byo) { c.main -= dt; if (c.main <= 0) { c.byo = true; c.main = 0; c.left = byoMs; } }
  else { c.left -= dt; if (c.left <= 0) { c.per--; if (c.per <= 0) { c.per = 0; c.left = 0; timeLoss(k); return; } c.left += byoMs; sfx('error'); } }
  hudClocks();
}
function hudClocks() {
  if (!S || !S.clk) return;
  for (const [k, id] of [[1, 'bB'], [2, 'bW']]) { const bd = $(id), c = S.clk[k]; bd.hidden = false; bd.textContent = fmtClock(c); bd.className = 'bd tm' + (c.byo && c.left < 10000 ? ' low' : ''); }
}
function timeLoss(k) {
  if (!S || S.over) return;
  E.timeout(S.st, k); announce(L(colName(k) + 'の時間切れです', colName(k) + ' ran out of time')); finish();
}
function startClock() { if (S && S.clk && !clockT) { S.clk.last = Date.now(); clockT = setInterval(clockTick, 250); } }
function moveClock(k) { if (S && S.clk && S.clk[k] && S.clk[k].byo) S.clk[k].left = CLOCKS[S.cfg.clock].byo * 1000; }

// ---------- the turn loop ----------
function loop() {
  if (!S || S.over || S.menu || S.mode === 'online' || S.mode === 'puzzle' || S.mode === 'review') return;
  startClock();
  if (S.mode === 'cpu' && S.st.phase === 'play' && S.st.turn !== S.me && !S.thinking) cpuTurn();
}
async function cpuTurn() {
  const st0 = S.st, tok = ++S.tok; S.thinking = true; S.pend = -1; S.hint = -1;
  setStatus(L('CPUが考えています…', 'The CPU is thinking…')); hud(); markers();
  const t0 = Date.now(); let r = null;
  try { r = await cpu.choose(JSON.parse(JSON.stringify(st0)), S.level, Object.assign({ seed: rndSeed() }, cpuOpts())); } catch (e) { r = null; }
  if (!S || S.tok !== tok || S.st !== st0 || S.over) return;
  const rest = cpuWait(380) - (Date.now() - t0);
  if (rest > 0) await new Promise(res => setTimeout(res, rest));
  if (!S || S.tok !== tok || S.st !== st0 || S.over || S.menu && false) return;
  S.thinking = false;
  let cell = r ? r.cell : -1;
  if (cell >= 0 && !E.attempt(st0, cell, st0.turn, false).ok) cell = -1;      // never an illegal move
  if (r && r.why === 'ignore') S.lastIgnore = true;
  if (cell < 0) { applyPass(false); } else applyMove(cell, false);
}
function applyMove(cell, byHuman) {
  const st = S.st, k = st.turn;
  const r = E.play(st, cell);
  if (!r.ok) { sfx('error'); return false; }
  S.hint = -1; S.pend = -1; S.pendWhy = ''; S.last = cell; S.cur = cell; S.note = '';
  moveClock(k);
  const mine = (S.mode === 'cpu' && k === S.me) || S.mode === 'pass';
  if (mine && r.captured.length) { bump('cap', r.captured.length); if (r.ko >= 0) bump('ko'); }
  const wait = paint(true);
  sfx(r.captured.length ? 'pop' : 'move');
  if (r.captured.length) { S.note = L(r.captured.length + '子を取りました。', 'Captured ' + r.captured.length + '. '); }
  else if (S.lastIgnore && !byHuman) { /* the beginner CPU's blind spot is explained after the move */ }
  announce(colName(k) + ' ' + E.name(cell, st.n) + (r.captured.length ? L('、' + r.captured.length + '子取り', ', captured ' + r.captured.length) : ''));
  persist(); hud(); scrollToCell(cell);
  S.busy = true;
  setTimeout(() => { if (!S) return; S.busy = false; afterMove(); }, wait);
  return true;
}
function applyPass(byHuman) {
  const st = S.st, k = st.turn; E.pass(st); moveClock(k);
  S.hint = -1; S.pend = -1; S.last = -1; S.note = L(colName(k) + 'はパスしました。', colName(k) + ' passed. ');
  sfx('tap'); announce(S.note); persist();
  paint(false); hud(); afterMove(); void byHuman;
}
function afterMove() {
  if (!S) return;
  const st = S.st;
  paint(false); hud(); refreshStatus();
  if (st.over) { finish(); return; }
  if (st.phase === 'dead') { enterDead(); return; }
  loop();
}
function illegalMsg(why) {
  return why === 'ko' ? L('コウです。すぐには取り返せません（ほかの場所に打ってから）', 'Ko: you cannot retake at once (play elsewhere first)') : why === 'suicide' ? L('自殺手は禁止です（打った石に呼吸点がありません）', 'Suicide is not allowed (the stone would have no liberties)')
    : why === 'superko' ? L('同じ盤面のくり返しは禁止です（スーパーコウ）', 'That repeats an earlier position (superko)') : L('そこには石があります', 'There is a stone there');
}
function illegal(i, why) {
  const el = B.cells[i]; if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 350); }
  sfx('error'); setStatus(illegalMsg(why), true); announce(illegalMsg(why)); markers();
}
// a tap or click on a crossing: with "confirm taps" (phones) the first tap only puts a marker there
function onCell(i) {
  if (!S || S.menu) return;
  S.cur = i;
  if (S.mode === 'puzzle') { puzzleTap(i); return; }
  if (S.mode === 'review') { rvTap(i); return; }
  if (canMark()) { markTap(i); return; }
  if (!canAct()) { markers(); return; }
  const st = S.st, rr = E.attempt(st, i, st.turn, false);
  if (!rr.ok) { illegal(i, rr.why); return; }
  let warn = '';
  if (save.set.atari && !rr.captured.length && AI.selfAtariAt(st, i, st.turn)) warn = 'self';
  if ((useConfirm() && S.pend !== i) || (warn && S.pend !== i)) {
    S.pend = i; S.pendWhy = warn; sfx('select'); markers(); renderCtl(); scrollToCell(i);
    setStatus(warn ? L('注意：ここに打つと、その石は「あたり」（呼吸点1）になります。もう一度タップで打ちます', 'Careful: that stone would be in atari (one liberty). Tap again to play') : L('ここに打ちますか？「おく」か、同じ場所をもう一度タップ', 'Play here? Press Place, or tap the same spot again'), true);
    return;
  }
  commit(i);
}
function commit(i) {
  if (!S) return;
  if (S.mode === 'puzzle') { puzzleTap(i, true); return; }
  if (S.mode === 'review') { rvPlay(i); return; }
  if (!canAct()) return;
  S.pend = -1;
  if (S.mode === 'online') { sendOnline(ON.toWire.mv(i)); return; }
  applyMove(i, true);
}
function markTap(i) {
  const st = S.st; if (!st.b[i]) return;
  if (S.mode === 'online') { sendOnline(ON.toWire.dd(i)); sfx('tap'); return; }
  E.toggleDead(st, i); sfx('tap'); S.sc = null; paint(false); markStatus(); renderCtl();
}
function doPass() {
  if (!S || !canAct()) { sfx('error'); return; }
  if (S.mode === 'online') { sendOnline(ON.toWire.ps()); return; }
  if (S.mode === 'review') return;
  applyPass(true);
}
// ---------- dead stones and scoring ----------
async function enterDead() {
  if (!S || S.st.over) return;
  const st = S.st; S.pend = -1; S.hint = -1;
  if (S.mode === 'online') { paint(false); hud(); markStatus(); announce(L('死に石を選びます', 'Mark the dead stones')); return; }
  if (S.st.dead && S.st.dead.length) { paint(false); hud(); markStatus(); return; }
  S.busy = true; setStatus(L('死に石を調べています…', 'Checking which stones are dead…')); hud();
  let res = null; const tok = ++S.tok;
  try { res = await cpu.dead(JSON.parse(JSON.stringify(st)), { time: SPD.v === 0 ? 150 : 450, seed: 5 }); } catch (e) { res = null; }
  if (!S || S.tok !== tok || S.st !== st || S.over) return;
  S.busy = false;
  if (res) { st.dead = res.dead.slice(); S.own = res.own; S.sugg = res.dead.slice(); }
  paint(false); hud(); markStatus(); sfx('ok');
  announce(L('死に石を提案しました。タップで直せます', 'Dead stones suggested. Tap a group to change it'));
}
async function suggestDead() {
  if (!S || S.st.phase !== 'dead' || S.busy) return;
  const st = S.st; S.busy = true; setStatus(L('死に石を調べています…', 'Checking which stones are dead…')); renderCtl();
  const tok = ++S.tok; let res = null;
  try { res = await cpu.dead(JSON.parse(JSON.stringify(st)), { time: SPD.v === 0 ? 150 : 450, seed: 5 }); } catch (e) {}
  if (!S || S.tok !== tok || S.st !== st) return;
  S.busy = false; if (res) { st.dead = res.dead.slice(); S.own = res.own; S.sugg = res.dead.slice(); }
  paint(false); markStatus(); renderCtl(); sfx('ok');
}
function confirmDead() {
  if (!S || S.st.phase !== 'dead' || S.busy) return;
  if (S.mode === 'online') { sendOnline(ON.toWire.ok()); return; }
  const st = S.st;
  if (S.mode === 'cpu' && S.own) {
    // the CPU does not agree to kill a group that its playouts say is alive
    const dead = new Set(st.dead), sugg = new Set(S.sugg || []); let dispute = false, done = new Set();
    for (const c of st.dead) {
      if (done.has(c) || sugg.has(c)) continue; const ch = E.chain(st.b, st.n, c); for (const x of ch.cells) done.add(x);
      let sum = 0; for (const x of ch.cells) sum += S.own[x]; const v = (sum / ch.cells.length) * (ch.color === 1 ? 1 : -1);
      if (v > 0.35) dispute = true;
    }
    void dead;
    if (dispute) {
      sfx('error'); if (UI) UI.toast(L('CPUは同意しません。そのグループは生きているようです。対局をつづけます', 'The CPU disagrees: that group looks alive. Play continues.'), { type: 'danger' });
      E.resume(st, 3 - S.me); S.sugg = null; S.own = null; S.note = ''; paint(false); hud(); refreshStatus(); loop(); return;
    }
  }
  E.confirm(st); paint(false); hud(); finish();
}
function resumePlay() {
  if (!S || S.st.phase !== 'dead' || S.busy) return;
  if (S.mode === 'online') { sendOnline(ON.toWire.rp()); return; }
  E.resume(S.st, S.mode === 'cpu' ? S.me : S.st.turn); S.sugg = null; S.own = null; S.sc = null;
  sfx('tap'); paint(false); hud(); refreshStatus(); loop();
}
// ---------- undo, hint, resign ----------
function undoTarget() {
  if (!S || !S.st || S.over || S.mode === 'online' || (S.mode !== 'cpu' && S.mode !== 'pass')) return -1;
  const mv = S.st.moves; if (!mv.length) return -1;
  if (S.mode === 'pass') return mv.length - 1;
  for (let k = mv.length - 1; k >= 0; k--) if (mv[k][1] === S.me) return k;
  return -1;
}
function doUndo() {
  const k = undoTarget(); if (k < 0) { sfx('error'); return; }
  stopAll(); const st = S.st, rep = E.fromMoves(st.cfg, st.moves.slice(0, k));
  if (rep.failed >= 0) return;
  S.st = rep.st; S.undone++; S.busy = false; S.thinking = false; S.pend = -1; S.hint = -1; S.sugg = null; S.own = null; S.note = L('一手もどしました。', 'Went back. ');
  const lm = S.st.moves.slice(-1)[0]; S.last = lm && lm[0] >= 0 ? lm[0] : -1;
  if (S.clk) S.clk.last = Date.now();
  sfx('tap'); paint(false); hud(); refreshStatus(); persist(); loop();
}
async function doHint() {
  if (!S || S.hinting) return;
  if (S.mode === 'puzzle') { puzzleHint(); return; }
  if (!canAct()) { sfx('error'); return; }
  const st = S.st, tok = ++S.tok; S.hinting = true; S.hinted++; renderCtl(); setStatus(L('考え中…', 'Thinking…'));
  let r = null;
  try { r = await cpu.choose(JSON.parse(JSON.stringify(st)), 5, Object.assign({ seed: rndSeed(), time: SPD.v === 0 ? 150 : 500 })); } catch (e) {}
  S.hinting = false; if (!S || S.tok !== tok || S.st !== st) return;
  if (!r || r.cell < 0) { S.hint = -1; setStatus(L('ヒント：もう打つ所がありません。パスでよさそうです', 'Hint: nothing left to play. Passing looks right'), true); renderCtl(); return; }
  const an = AI.analyze(st, r.cell); S.hint = r.cell; S.cur = r.cell; S.pend = -1;
  const why = {
    capture: L('敵の石' + (an.n || '') + '子を取れます', 'captures ' + (an.n || '') + ' stones'), save: L('あたりの味方を助けます', 'saves your stones in atari'), atari: L('敵の石をあたり（あと1手で取れる形）にします', 'puts enemy stones in atari'),
    corner: L('隅は、陣地を作りやすい大事な場所です', 'corners are the easiest place to make territory'), center: L('小さい盤では、天元が大きな場所です', 'the centre point is big on a small board'), cut: L('敵をわけます（切り）', 'cuts the enemy apart'),
    hane: L('敵の石の頭をおさえます（ハネ）', 'hane: blocks the head of the enemy stones'), block: L('敵の石に接して、伸びをおさえます', 'attaches to hold the enemy back'), connect: L('石をつなげて、弱点を消します', 'connects your stones'), area: L('陣地を広げる大きな場所です', 'a big point for your territory'),
  }[an.kind];
  setStatus(L('ヒント：' + E.name(r.cell, st.n) + '（' + why + '）', 'Hint: ' + E.name(r.cell, st.n) + ' (' + why + ')'), true);
  announce($('status').textContent); sfx('select'); paint(false); hud(); scrollToCell(r.cell);
}
async function askResign() {
  if (!S || S.over) return;
  const ok = UI ? await UI.confirm({ title: L('投了しますか？', 'Resign?'), ok: L('投了する', 'Resign'), cancel: L('やめる', 'Cancel'), danger: true }) : true;
  if (!ok || !S || S.over) return;
  if (S.mode === 'online') { sendOnline(ON.toWire.rg()); return; }
  stopAll(); const k = S.mode === 'cpu' ? S.me : S.st.turn; E.resign(S.st, k); paint(false); finish();
}

// ---------- the end of a game ----------
function resultText(res, rule) {
  if (!res) return '';
  const c = colName(res.w);
  if (!res.w) return L('持碁（引き分け）', 'Jigo (draw)');
  if (res.by === 'resign') return L(c + 'の中押し勝ち', c + ' wins by resignation');
  if (res.by === 'time') return L(c + 'の時間切れ勝ち', c + ' wins on time');
  return L(c + 'の' + res.margin + (rule === 'cn' ? '点' : '目') + '勝ち', c + ' wins by ' + res.margin);
}
function fillScores(ol, sc, st) {
  ol.innerHTML = '';
  const row = (k, tot, detail) => { const li = document.createElement('li'); li.innerHTML = '<span class="dk" style="background-image:' + ART.faceURL(k) + '"></span><span class="nm">' + esc(nameOf(k)) + '<br><small style="font-weight:500;color:var(--kb-dim)">' + esc(detail) + '</small></span><span class="sc"><b>' + tot + '</b></span>'; if (S && ((S.mode === 'cpu' && k === S.me) || (S.mode === 'online' && k === S.myc))) li.className = 'me'; ol.appendChild(li); };
  if (st.rule === 'cn') { row(1, sc.b, L('石 ' + sc.stB + ' ＋ 地 ' + sc.terB, 'stones ' + sc.stB + ' + area ' + sc.terB)); row(2, sc.w, L('石 ' + sc.stW + ' ＋ 地 ' + sc.terW + ' ＋ コミ ' + st.komi, 'stones ' + sc.stW + ' + area ' + sc.terW + ' + komi ' + st.komi)); }
  else { row(1, sc.b, L('地 ' + sc.terB + ' ＋ 取った石 ' + sc.caps[0] + ' ＋ 死に石 ' + sc.deadW, 'territory ' + sc.terB + ' + captures ' + sc.caps[0] + ' + dead ' + sc.deadW)); row(2, sc.w, L('地 ' + sc.terW + ' ＋ 取った石 ' + sc.caps[1] + ' ＋ 死に石 ' + sc.deadB + ' ＋ コミ ' + st.komi, 'territory ' + sc.terW + ' + captures ' + sc.caps[1] + ' + dead ' + sc.deadB + ' + komi ' + st.komi)); }
}
function finish() {
  if (!S || S.over) return;
  stopAll(); S.over = true; S.pend = -1; S.hint = -1;
  const st = S.st, res = st.result || { w: 0, by: 'score', margin: 0, text: '0' };
  const win = S.mode === 'cpu' && res.w === S.me, draw = !res.w;
  let gained = 0, note = '';
  if (S.mode === 'cpu') {
    bump('plays'); const key = st.n + '-' + S.level; wRec(key).p++;
    if (win) {
      bump('wins'); wRec(key).w++; if (S.level >= 3) bump('lv3'); if (S.level >= 5) bump('lv5'); if (st.n === 13) bump('w13'); if (st.n === 19) bump('w19'); if (st.rule === 'cn') bump('cn'); if (st.hc) bump('hcw');
      if (res.by === 'resign') bump('rsg'); if (st.moves.length >= 150) bump('long');
      if (!S.hinted && !S.undone && !st.hc) { gained = BASE_STARS[S.level] * SIZE_MULT[st.n]; save.pts += gained; bump('clean'); note = L('★ ' + gained + ' をもらいました', 'You earned ★ ' + gained); }
      else note = S.hinted ? L('ヒントを使ったので、★はつきません', 'You used a hint, so no ★') : S.undone ? L('もどすを使ったので、★はつきません', 'You used undo, so no ★') : L('置き石の対局は★に数えません', 'Handicap games do not count for ★');
    } else if (!draw) note = L('次はきっと勝てます', 'You will get it next time');
  } else if (S.mode === 'pass') { bump('twop'); note = L('ふたりで1台の対局は★に数えません', 'Two-player games do not count for ★'); }
  writeSave(); clearRun();
  emit('play_end', { mode: S.mode === 'pass' ? 'practice' : 'normal', score: gained, durationMs: Math.round(S.ms + (Date.now() - S.t0)), reason: win ? 'clear' : 'over' });
  if (win) sfx('win'); else sfx(draw ? 'ok' : 'over');
  hud(); markers(); refreshStatus();
  setTimeout(() => showResult(note), Math.round(500 * SPD.v));
}
function showResult(note) {
  if (!S || !S.over || S.mode === 'online') return;
  const st = S.st, res = st.result || { w: 0 }, win = S.mode === 'cpu' && res.w === S.me, draw = !res.w;
  $('rTitle').textContent = S.mode === 'cpu' ? (draw ? L('引き分け', 'A draw') : win ? L('あなたの勝ち！', 'You win!') : L('あなたの負け', 'You lose')) : draw ? L('引き分け', 'A draw') : L(colName(res.w) + 'の勝ち', colName(res.w) + ' wins');
  $('rSub').textContent = resultText(res, st.rule) + ' · ' + st.moves.length + L('手', ' moves');
  if (res.by === 'score') fillScores($('rRank'), E.score(st, st.dead || []), st); else $('rRank').innerHTML = '';
  $('rBig').textContent = ''; $('rNew').hidden = true;
  $('rNote').textContent = note != null ? note : ($('rNote').textContent || '');
  $('rAgain').disabled = false; $('rAgain').textContent = L('もう一度（色を入れかえ）', 'Play again (swap colours)'); $('rReview').hidden = false; $('rSgf').hidden = false; $('rBoard').hidden = false;
  hideOverlays(); $('ovResult').hidden = false;
  try { $('rAgain').focus({ preventScroll: true }); } catch (e) {}
}
function playAgain() {
  if (!S) return;
  if (S.mode === 'online') { onlineAgain(); return; }
  const c = S.cfg, me = S.mode === 'cpu' ? (c.me === 'r' ? 'r' : S.me === 1 ? 'w' : 'b') : 'b';
  startGame({ mode: S.mode, n: c.n, rule: c.rule, level: c.level, hc: c.hc, komi: c.komi, superko: c.superko, clock: c.clock, me });
}

// =====================================================================================
// title, rules, view options, menu
// =====================================================================================
function mkSeg(label, items, cur, pick, id) {
  const g = document.createElement('div'); g.className = 'og'; if (id) g.id = id;
  g.innerHTML = '<div class="ol">' + esc(label) + '</div>'; const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', label);
  for (const it of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.dataset.v = it.v; b.setAttribute('aria-pressed', String(it.v === cur));
    b.innerHTML = esc(it.t) + (it.s ? '<small>' + esc(it.s) + '</small>' : ''); b.addEventListener('click', () => { sfx('tap'); pick(it.v); }); seg.appendChild(b);
  }
  g.appendChild(seg); return g;
}
function mkSel(label, id, items, cur, pick) {
  const l = document.createElement('label'); l.innerHTML = esc(label); const s = document.createElement('select'); s.id = id;
  for (const it of items) { const o = document.createElement('option'); o.value = it.v; o.textContent = it.t; if (String(it.v) === String(cur)) o.selected = true; s.appendChild(o); }
  s.addEventListener('change', () => { sfx('tap'); pick(s.value); }); l.appendChild(s); return l;
}
function mkTog(label, sub, on, pick, id) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'tog'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!on)); if (id) b.id = id;
  b.innerHTML = '<span>' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><i></i>'; b.addEventListener('click', () => { sfx('tap'); pick(!on); }); return b;
}
const komiLabel = k => (k < 0 ? L('おまかせ', 'Auto') : String(k));
function renderTitle() {
  const set = save.set, box = $('tOpts'); box.innerHTML = '';
  box.appendChild(mkSeg(L('盤の大きさ', 'Board size'), [{ v: 9, t: '9' + L('路', '×9'), s: L('入門', 'quick') }, { v: 13, t: '13' + L('路', '×13'), s: L('中盤', 'medium') }, { v: 19, t: '19' + L('路', '×19'), s: L('本格', 'full') }], set.n, v => { set.n = v; writeSave(); renderTitle(); }, 'optN'));
  box.appendChild(mkSeg(L('ルール', 'Rules'), [{ v: 'jp', t: L('日本ルール', 'Japanese'), s: L('地＋取った石', 'territory') }, { v: 'cn', t: L('中国ルール', 'Chinese'), s: L('石＋地', 'area') }], set.rule, v => { set.rule = v; writeSave(); renderTitle(); }, 'optRu'));
  box.appendChild(mkSeg(L('CPUの強さ', 'CPU strength'), [1, 2, 3, 4, 5].map(v => ({ v, t: LV_NAME[v] })), set.level, v => { set.level = v; writeSave(); renderTitle(); }, 'optLv'));
  box.appendChild(mkSeg(L('あなたの色', 'Your colour'), [{ v: 'b', t: L('黒（先手）', 'Black') }, { v: 'w', t: L('白', 'White') }, { v: 'r', t: L('おまかせ', 'Random') }], set.me, v => { set.me = v; writeSave(); renderTitle(); }, 'optMe'));
  const row = document.createElement('div'); row.className = 'og selrow';
  row.appendChild(mkSel(L('置き石', 'Handicap'), 'selHc', [0, 2, 3, 4, 5, 6, 7, 8, 9].map(v => ({ v, t: v ? v + L('子', '') : L('なし', 'None') })), set.hc, v => { set.hc = +v; writeSave(); renderTitle(); }));
  row.appendChild(mkSel(L('コミ', 'Komi'), 'selKomi', KOMIS.map(v => ({ v, t: komiLabel(v) })), set.komi, v => { set.komi = +v; writeSave(); renderTitle(); }));
  box.appendChild(row);
  const row2 = document.createElement('div'); row2.className = 'og selrow';
  row2.appendChild(mkSel(L('持ち時間', 'Clock'), 'selClock', CLOCKS.map((c, i) => ({ v: i, t: clockName(i) })), set.clock, v => { set.clock = +v; writeSave(); renderTitle(); }));
  box.appendChild(row2);
  box.appendChild(mkTog(L('スーパーコウ（同じ盤面をくり返さない）', 'Superko (no repeated positions)'), L('ふつうは「取り返しの禁止」だけ。長いコウもふせぎます', 'By default only the simple ko rule applies'), !!set.superko, v => { set.superko = v ? 1 : 0; writeSave(); renderTitle(); }, 'togSk'));
  const k = set.n + '-' + set.level, w = save.w[k];
  $('tDesc').textContent = L(set.n + '路盤・' + RULE_NAME[set.rule] + '・' + (set.hc ? '置き石' + set.hc + '子' : 'コミ' + (set.komi < 0 ? (set.hc ? 0.5 : set.rule === 'cn' ? 7.5 : 6.5) : set.komi)) + '・CPU ' + LV_NAME[set.level], set.n + '×' + set.n + ' ' + RULE_NAME[set.rule] + ' · ' + (set.hc ? set.hc + ' handicap stones' : 'komi ' + (set.komi < 0 ? (set.rule === 'cn' ? 7.5 : 6.5) : set.komi)) + ' · CPU ' + LV_NAME[set.level]);
  $('tBest').textContent = w ? L(w.p + '回あそんで' + w.w + '回勝ち', 'Played ' + w.p + ', won ' + w.w) : L('まだ記録がありません', 'No record yet');
  const dk = dailyKey(), p = dailyPuzzle(dk), done = save.dl.last === dk && save.dl.ok;
  $('tDailySub').textContent = done ? L('今日の問題は解けました（連続 ' + save.dl.st + ' 日）', 'Solved today (streak ' + save.dl.st + ')') : L('毎日1問。最善手を見つけよう', 'One a day. Find the best move') + ' · ' + p.id;
  const r = readRun(); $('tResume').hidden = !r;
  if (r) $('tResumeSub').textContent = (r.mode === 'cpu' ? 'CPU ' + LV_NAME[clamp(r.level | 0, 1, 5)] : L('ふたりで', 'Two players')) + ' · ' + r.cfg.n + L('路', '×' + r.cfg.n) + ' · ' + r.moves.length + L('手', ' moves');
}
function showTitle() {
  if (S && S.mode === 'online' && !S.over && TR) { /* online sessions are left through the menu */ }
  if (S) { S.menu = true; S.tok++; S.thinking = false; if (cpu) cpu.cancel(); persist(); }
  hideOverlays(); renderTitle(); $('ovTitle').hidden = false;
  try { $('tPlay').focus({ preventScroll: true }); } catch (e) {}
}
$('tPlay').addEventListener('click', () => startGame({ mode: 'cpu' }));
$('tPass').addEventListener('click', () => startGame({ mode: 'pass' }));
$('tPuz').addEventListener('click', () => showPuzzleList());
$('tDaily').addEventListener('click', () => startPuzzle('daily'));
$('tSgf').addEventListener('click', () => openSgf(true));
$('tHow').addEventListener('click', () => showHowto(false));
$('tOnline').addEventListener('click', () => openOnline());
$('tResume').addEventListener('click', () => { const r = readRun(); if (r) resumeGame(r); });
$('rAgain').addEventListener('click', playAgain);
$('rReview').addEventListener('click', () => startReviewFromSession());
$('rSgf').addEventListener('click', () => openSgf());
$('rBoard').addEventListener('click', () => { $('ovResult').hidden = true; if (S) { S.menu = false; hud(); } });
$('rTitleBtn').addEventListener('click', () => { if (S && S.mode === 'online') leaveOnline(); else showTitle(); });
function howtoHtml() {
  const J = !EN;
  return '<p class="lead">' + (J ? '白と黒の石を交互に置き、石で囲んだ陣地（地）が多いほうが勝ちです。世界でいちばん古いボードゲームのひとつです。' : 'Place black and white stones in turn and surround more territory than your opponent. One of the oldest board games in the world.') + '</p>' +
    '<h3>' + (J ? '基本' : 'Basics') + '</h3><ul>' + (J ? '<li>石は線の交点に置きます。黒が先に打ちます（置き碁では白から）。</li><li>石の上下左右の空き（呼吸点）がなくなると、その石は取られます。</li><li>石をタップして置くだけ。スマホでは「おく」ボタンで確かめて置けます。</li>' : '<li>Stones go on the line crossings. Black moves first (White moves first in a handicap game).</li><li>A stone or chain with no empty neighbouring points (liberties) is captured.</li><li>Tap a crossing to play. On phones a Place button lets you check first.</li>') + '</ul>' +
    '<h3>' + (J ? '打てない手' : 'Illegal moves') + '</h3><ul>' + (J ? '<li><b>自殺手</b>：打った石に呼吸点がなくなる手は禁止です（相手の石を取れるときは打てます）。</li><li><b>コウ</b>：1個取られた石をすぐ取り返して同じ形に戻すことは禁止です。ほかの場所に打ってからなら取り返せます。「スーパーコウ」をオンにすると、同じ盤面のくり返しをぜんぶ禁止します。</li>' : '<li><b>Suicide</b> is forbidden unless the move captures.</li><li><b>Ko</b>: you may not immediately retake to repeat the position. Play elsewhere first. Turn on Superko to forbid any repeated position.</li>') + '</ul>' +
    '<h3>' + (J ? '終わり方と数え方' : 'Ending and scoring') + '</h3><ul>' + (J ? '<li>打つ所がなくなったら「パス」。2回続けてパスすると、死に石えらびになります。</li><li>死んでいる石をタップで選びます（CPUが自動で提案します）。<b>確定</b>で数えます。意見が合わなければ「対局にもどる」。</li><li><b>日本ルール</b>：地（囲った空き）＋取った石（死に石を含む）。セキ（お互いに手が出せない所）の中は数えません。</li><li><b>中国ルール</b>：盤上の石の数＋地。</li><li><b>コミ</b>：先手の有利を消すために白に足す点です。</li>' : '<li>Pass when nothing is left to play. Two passes in a row start the dead-stone phase.</li><li>Tap groups that are dead (the CPU suggests them), then press Confirm to count. If you disagree, resume play.</li><li><b>Japanese</b>: territory + captured stones (dead stones count too). Points inside seki are not counted.</li><li><b>Chinese</b>: stones on the board + territory.</li><li><b>Komi</b> is points added to White to offset Black\'s first move.</li>') + '</ul>' +
    '<h3>' + (J ? '便利な機能' : 'Tools') + '</h3><ul>' + (J ? '<li>ヒント（おすすめの手と理由）・もどす・手の番号・座標・地の見積もり・あたりの警告は「表示」ボタンで切りかえます。</li><li>詰碁：9路盤の隅や辺の「生き死に」の問題。毎日1問。</li><li>棋譜（SGF）の書き出しと読みこみ、枝わかれつきの検討ができます。</li><li>キーボード：矢印で移動、Enterで置く、Pでパス、Uでもどす、Hでヒント、Zで拡大。</li>' : '<li>Hints (with a short reason), undo, move numbers, coordinates, a territory estimate and atari warnings are in the View menu.</li><li>Tsumego: life-and-death puzzles in 9×9 corners and edges, one a day.</li><li>Export and import SGF records and review them with branches.</li><li>Keys: arrows move, Enter places, P passes, U undoes, H hints, Z zooms.</li>') + '</ul>';
}
function showHowto(first) {
  $('howtoTitle').textContent = L('囲碁のルール', 'How to play Go'); $('howBody').innerHTML = howtoHtml();
  hideOverlays(); $('howto').hidden = false;
  $('howtoGo').textContent = first ? L('はじめる', 'Start') : L('とじる', 'Close');
  $('howtoGo').onclick = () => { store.set(HOWTO_KEY, '1'); $('howto').hidden = true; if (first || (S === null)) showTitle(); else if (S && S.menu && !pm?.isOpen) { if (S.mode === 'puzzle' || S.mode === 'review') S.menu = false; else showTitle(); } };
}
function renderView() {
  const box = $('vBody'), set = save.set; box.innerHTML = '';
  const t = (label, sub, key, id) => box.appendChild(mkTog(label, sub, !!set[key], v => { set[key] = v ? 1 : 0; writeSave(); if (key === 'coords') fit(); if (S) { paint(false); hud(); } renderView(); }, id));
  t(L('座標を表示', 'Show coordinates'), L('盤のまわりに A〜T と数字', 'Letters and numbers around the board'), 'coords', 'vCoords');
  t(L('手の番号', 'Move numbers'), L('石に打った順の数字を書きます', 'Write the move order on the stones'), 'nums', 'vNums');
  t(L('地の見積もり', 'Territory estimate'), L('いまの形での陣地を、うすい四角で見せます', 'Show who holds what with faint squares'), 'terr', 'vTerr');
  t(L('あたりの警告', 'Atari warnings'), L('呼吸点1の石に赤い輪（自分）・緑の輪（相手）。自殺的な手は確認します', 'Red ring: your stones with one liberty; green: theirs'), 'atari', 'vAtari');
  box.appendChild(mkSeg(L('タップで決める', 'Confirm taps'), [{ v: 2, t: L('おまかせ', 'Auto'), s: L('タッチ画面だけ', 'touch only') }, { v: 1, t: L('する', 'On') }, { v: 0, t: L('しない', 'Off') }], set.conf, v => { set.conf = v; writeSave(); $('ctl').dataset.key = ''; if (S) hud(); renderView(); }, 'vConf'));
  t(L('CPUをはやく進める', 'Speed up the CPU'), L('CPUの待ち時間を短くします', 'Shorter pauses before CPU moves'), 'fast', 'vFast');
}
function openView() { renderView(); hideOverlaysKeep(); $('ovView').hidden = false; try { $('vClose').focus({ preventScroll: true }); } catch (e) {} }
function hideOverlaysKeep() { $('ovView').hidden = true; }
$('vClose').addEventListener('click', () => { $('ovView').hidden = true; });
$('viewBtn').addEventListener('click', openView);
$('zoomBtn').addEventListener('click', toggleZoom);
function renderSound() {
  const b = $('sndBtn'), muted = A ? A.muted : true;
  b.setAttribute('aria-pressed', String(!muted)); b.setAttribute('aria-label', muted ? L('サウンド オフ', 'Sound off') : L('サウンド オン', 'Sound on'));
  b.innerHTML = !muted
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  if (!A) b.hidden = true;
}
$('sndBtn').addEventListener('click', () => { if (!A) return; A.toggleMute(); if (!A.muted) sfx('ok'); });
if (A) A.onChange(renderSound);
function themeColor() { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', UI && UI.theme && UI.theme.resolved() === 'light' ? '#f3eee2' : '#16130f'); }
let pm = null;
function openMenu() {
  if (!UI) { showTitle(); return; }
  if (pm && pm.isOpen) return;
  const on = !!(S && !S.over && S.mode !== 'review'), extra = [{ label: L('ルール', 'Rules'), icon: 'help', onClick: () => { pm.close(); showHowto(false); } }, { label: L('表示', 'View'), icon: 'settings', onClick: () => { pm.close(); openView(); } }];
  if (S && S.st && (S.st.moves.length || S.rv)) extra.push({ label: L('棋譜（SGF）', 'Record (SGF)'), icon: 'list', onClick: () => { pm.close(); if (S) S.menu = false; openSgf(); } });
  if (S && S.mode !== 'online' && S.mode !== 'puzzle' && S.mode !== 'review' && S.st && S.st.moves.length) extra.push({ label: L('検討する', 'Review'), icon: 'list', onClick: () => { pm.close(); startReviewFromSession(); } });
  if (on && S.mode === 'online') extra.push({ label: L('試合を出る', 'Leave the match'), icon: 'close', onClick: () => { pm.close(); askLeaveOnline(); } });
  else if (on && S.mode !== 'puzzle') extra.push({ label: L('投了', 'Resign'), icon: 'close', onClick: () => { pm.close(); if (S) S.menu = false; askResign(); } });
  if (!(on && S.mode === 'online')) extra.push({ label: L('タイトルへ', 'Title'), icon: 'menu', onClick: () => { pm.close(); showTitle(); } });
  pm = UI.pauseMenu({
    title: on ? L('ひとやすみ', 'Paused') : L('メニュー', 'Menu'), home: '../', extra,
    onResume: () => { if (S) S.menu = false; const g = KG(); if (g) g.menuClosed(); if (S && !S.over) { hud(); markers(); loop(); } },
    onRestart: on && (S.mode === 'cpu' || S.mode === 'pass') ? () => { const c = S.cfg; startGame({ mode: S.mode, n: c.n, rule: c.rule, level: c.level, hc: c.hc, komi: c.komi, superko: c.superko, clock: c.clock, me: c.me }); } : undefined,
    onOpen: () => { if (S) S.menu = true; const g = KG(); if (g) g.menuOpened(); persist(); },
  });
  pm.open();
}
$('menuBtn').addEventListener('click', openMenu);
let rz = 0;
function relayout() { clearTimeout(rz); rz = setTimeout(fit, 60); }
window.addEventListener('resize', relayout);
if (window.ResizeObserver) new ResizeObserver(relayout).observe(stageEl);
{ const sel = KoboI18n.picker($('langPick')); if (sel) sel.id = 'langSel'; }
if (UI && UI.theme) UI.theme.onChange(() => setTimeout(themeColor, 0));
boardEl.addEventListener('click', e => { const c = e.target.closest && e.target.closest('.cell'); if (c) { document.body.classList.remove('kbd'); onCell(+c.dataset.i); } });
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (anyOverlay() || !S || !S.st) return;
  const tag = (e.target && e.target.tagName) || ''; if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
  const n = S.st.n, k = e.key; let c = S.cur, r = (c / n) | 0, q = c % n;
  if (k === 'ArrowLeft') q = Math.max(0, q - 1); else if (k === 'ArrowRight') q = Math.min(n - 1, q + 1); else if (k === 'ArrowUp') r = Math.max(0, r - 1); else if (k === 'ArrowDown') r = Math.min(n - 1, r + 1);
  else if (k === 'Enter' || k === ' ') { document.body.classList.add('kbd'); if (S.pend === S.cur) commit(S.cur); else onCell(S.cur); e.preventDefault(); return; }
  else if (k === 'Escape') { openMenu(); return; }
  else {
    const kk = k.toLowerCase();
    if (kk === 'p') doPass(); else if (kk === 'u') doUndo(); else if (kk === 'h') doHint(); else if (kk === 'z') toggleZoom(); else if (kk === 'a') suggestDead(); else if (kk === 'f') confirmDead(); else if (kk === 'r' && S.st.phase === 'dead') resumePlay();
    else if (kk === 'n') { save.set.nums = save.set.nums ? 0 : 1; writeSave(); paint(false); } else if (kk === 't') { save.set.terr = save.set.terr ? 0 : 1; writeSave(); paint(false); } else if (kk === 'c') { save.set.coords = save.set.coords ? 0 : 1; writeSave(); fit(); }
    else if (S.mode === 'review' && (k === '[' || k === ']')) rvBranch(k === ']' ? 1 : -1);
    else return;
    e.preventDefault(); return;
  }
  if (S.mode === 'review' && (k === 'ArrowLeft' || k === 'ArrowRight') && e.shiftKey) { if (k === 'ArrowLeft') rvGo(S.rv.cur.par); else rvGo(S.rv.cur.kids[S.rv.cur.sel || 0]); e.preventDefault(); return; }
  document.body.classList.add('kbd'); S.cur = r * n + q; markers(); scrollToCell(S.cur); e.preventDefault();
});
const anyOverlay = () => OVERLAYS.some(id => !$(id).hidden) || !!document.querySelector('.kb-layer:not([hidden]), .ktr-ov:not([hidden])');

// =====================================================================================
// SGF and review (a tree of moves with branches)
// =====================================================================================
const setupOf = st => { const out = []; if (!st.start) return out; for (let i = 0; i < st.start.length; i++) if (st.start[i]) out.push([i, st.start[i]]); return out; };
function metaOf(st) { return { n: st.n, rule: st.rule, komi: st.komi, hc: st.hc, setup: setupOf(st), pl: st.hc ? 2 : 1, superko: st.superko }; }
function sgfText() {
  if (!S || !S.st) return '';
  let meta, root;
  if (S.rv) { meta = Object.assign({}, S.rv.meta); root = S.rv.root; }
  else { meta = metaOf(S.st); root = SGF.linear(S.st.moves); }
  const res = S.st.result; const today = new Date();
  return SGF.write(Object.assign({}, meta, { root, black: S.mode === 'cpu' && S.me === 1 ? L('あなた', 'You') : S.mode === 'cpu' ? 'CPU' : undefined, white: S.mode === 'cpu' && S.me === 2 ? L('あなた', 'You') : S.mode === 'cpu' ? 'CPU' : undefined,
    result: res ? (res.by === 'score' ? (res.w ? sgfColor(res.w) + '+' + res.margin : '0') : sgfColor(res.w) + '+' + (res.by === 'time' ? 'T' : 'R')) : '', date: today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2) }));
}
function openSgf(importFirst) {
  const txt = !importFirst && S && S.st && (S.st.moves.length || S.rv) ? sgfText() : '';
  hideOverlays(); $('ovSgf').hidden = false; $('sOutBox').hidden = !txt; $('sOut').value = txt; $('sErr').textContent = '';
  if (txt) bump('sgf'), writeSave();
  try { (txt ? $('sCopy') : $('sIn')).focus({ preventScroll: true }); } catch (e) {}
}
$('sCopy').addEventListener('click', async () => {
  const t = $('sOut').value; let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (e) { try { $('sOut').select(); ok = document.execCommand('copy'); } catch (e2) {} }
  sfx(ok ? 'ok' : 'error'); if (UI) UI.toast(ok ? L('コピーしました', 'Copied') : L('選択したので、コピーしてください', 'Selected: please copy it'), { type: ok ? 'ok' : 'accent' });
});
$('sClose').addEventListener('click', () => { $('ovSgf').hidden = true; if (S && (S.over || S.mode === 'review')) { S.menu = false; } else if (!S) showTitle(); });
$('sLoad').addEventListener('click', () => {
  const r = SGF.parse($('sIn').value);
  if (!r.ok) { $('sErr').textContent = r.why === 'not-sgf' ? L('SGF として読めませんでした。(;GM[1]…) の形のテキストを貼ってください', 'This is not SGF text. Paste something like (;GM[1]…)') : r.why === 'no-moves' ? L('手がありません', 'No moves found') : r.why === 'size' ? L('盤の大きさが対応外です（2〜19路）', 'Unsupported board size') : L('読みこめませんでした：' + r.why, 'Could not read it: ' + r.why); sfx('error'); return; }
  const rule = r.rule, hc = r.hc;
  const meta = { n: r.n, rule, komi: r.komi != null ? r.komi : hc ? 0.5 : rule === 'cn' ? 7.5 : 6.5, hc, setup: r.setup, pl: r.pl || (hc ? 2 : 1), black: r.black, white: r.white };
  if (!SIZES.includes(r.n) && !(r.n >= 2 && r.n <= 19)) { $('sErr').textContent = L('盤の大きさが対応外です', 'Unsupported board size'); return; }
  // main line must be playable
  let nd = r.root, path = []; while (nd.kids.length) { nd = nd.kids[0]; path.push(nd.mv); }
  const test = E.fromMoves({ n: meta.n, rule, komi: meta.komi, hc, setup: r.setup, pl: meta.pl }, path);
  if (test.failed >= 0) { $('sErr').textContent = L((test.failed + 1) + '手目が反則です（打てない手）', 'Move ' + (test.failed + 1) + ' is illegal'); sfx('error'); return; }
  bump('sgfi'); writeSave(); $('ovSgf').hidden = true; startReview(r.root, meta, nd); sfx('ok');
});
const SGF_SIZES_OK = n => n >= 2 && n <= 19;
function startReviewFromSession() {
  if (!S || !S.st) return;
  const st = S.st, meta = metaOf(st), root = SGF.linear(st.moves); let nd = root; while (nd.kids.length) nd = nd.kids[0];
  if (S.mode === 'review') { S.menu = false; hideOverlays(); return; }
  startReview(root, meta, nd);
}
function startReview(root, meta, at) {
  stopAll(); hideOverlays();
  if (!SGF_SIZES_OK(meta.n)) return;
  S = mkSession({ mode: 'review', st: null, cfg: { mode: 'review' }, rv: { root, cur: root, meta } });
  bump('rev'); writeSave();
  const n = meta.n; B.n = 0; buildBoard(n);
  S.st = rvState(root); S.cur = centerCell(n); rvGo(at || root, true);
  emit('play_start', { mode: 'practice' });
}
function rvState(node) {
  const m = S.rv.meta, path = SGF.pathOf(node);
  const r = E.fromMoves({ n: m.n, rule: m.rule, komi: m.komi, hc: m.hc, setup: m.setup, pl: m.pl, superko: m.superko }, path);
  return r.failed >= 0 ? null : r.st;
}
const rvRoot = () => { let n = S.rv.cur; while (n.par) n = n.par; return n; };
const rvEnd = () => { let n = S.rv.cur; while (n.kids.length) n = n.kids[n.sel || 0]; return n; };
function rvGo(node, quiet) {
  if (!S || !S.rv || !node) return;
  const st = rvState(node); if (!st) { sfx('error'); if (UI) UI.toast(L('その手は打てません', 'That move is not legal'), { type: 'danger' }); return; }
  const prev = S.st; S.rv.cur = node; if (node.par) node.par.sel = node.par.kids.indexOf(node);
  S.st = st; S.pend = -1; S.hint = -1; const lm = st.moves[st.moves.length - 1]; S.last = lm && lm[0] >= 0 ? lm[0] : -1;
  const anim = !quiet && prev && prev.n === st.n && st.moves.length === prev.moves.length + 1;
  paint(anim); hud(); rvInfo(); if (!quiet) sfx(st.moves.length && S.last >= 0 ? 'move' : 'tap');
}
function rvInfo() {
  const cur = S.rv.cur, st = S.st, depth = st.moves.length; let total = depth, x = cur; while (x.kids.length) { x = x.kids[x.sel || 0]; total++; }
  const cm = cur.c ? ' ' + cur.c.replace(/\s+/g, ' ').slice(0, 80) : '';
  setStatus(L('検討：' + depth + ' / ' + total + '手目', 'Review: move ' + depth + ' of ' + total) + (cur.mv ? ' · ' + colName(cur.mv[1]) + ' ' + pointName(cur.mv[0], st.n) : '') + (cur.par && cur.par.kids.length > 1 ? L('（枝' + (cur.par.kids.indexOf(cur) + 1) + '）', ' (branch ' + (cur.par.kids.indexOf(cur) + 1) + ')') : '') + cm, false);
  const sub = $('sub'); sub.innerHTML = '';
  if (cur.kids.length > 1) cur.kids.forEach((k, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'brc'; b.setAttribute('aria-pressed', String(i === (cur.sel || 0))); b.textContent = (i + 1) + ': ' + colName(k.mv[1]) + ' ' + pointName(k.mv[0], st.n); b.addEventListener('click', () => { cur.sel = i; rvGo(k); }); sub.appendChild(b); });
}
function rvBranch(d) { const cur = S.rv.cur.par; if (!cur || cur.kids.length < 2) return; const i = (cur.kids.indexOf(S.rv.cur) + d + cur.kids.length) % cur.kids.length; rvGo(cur.kids[i]); }
function rvTap(i) {
  if (!S.rv) return; const st = S.st; if (st.b[i]) { illegal(i, 'occupied'); return; }
  const rr = E.attempt(st, i, st.turn, false); if (!rr.ok) { illegal(i, rr.why); return; }
  if (useConfirm() && S.pend !== i) { S.pend = i; sfx('select'); markers(); renderCtl(); scrollToCell(i); setStatus(L('ここに打ちますか？「おく」か、もう一度タップ', 'Play here? Press Place or tap again'), true); return; }
  rvPlay(i);
}
function rvPlay(i) {
  const cur = S.rv.cur, st = S.st, col = st.turn; S.pend = -1;
  const rr = E.attempt(st, i, col, false); if (!rr.ok) { illegal(i, rr.why); return; }
  let kid = cur.kids.find(k => k.mv[0] === i && k.mv[1] === col);
  if (!kid) { kid = SGF.node([i, col], cur); cur.kids.push(kid); S.rv.branches = (S.rv.branches || 0) + (cur.kids.length > 1 ? 1 : 0); }
  cur.sel = cur.kids.indexOf(kid); rvGo(kid);
}

// =====================================================================================
// tsumego (life-and-death): 9x9 corner / edge problems, every one proven by tsumego.js (see puzzles.js)
// =====================================================================================
const BANK = PZ ? PZ.bank : [];
const dateKeyNow = () => { if (PF && PF.jstDateKey) return Number(PF.jstDateKey()); const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const dailyKey = dateKeyNow;
const dailyPuzzle = dk => BANK[(((PF && PF.dailySeed) ? PF.dailySeed(GAME, dk) : dk) >>> 0) % BANK.length];
const prevDay = dk => { const y = Math.floor(dk / 10000), m = Math.floor(dk / 100) % 100, d = dk % 100, t = new Date(Date.UTC(y, m - 1, d) - 864e5); return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(); };
function pzState(p) {
  const st = E.create({ n: 9 });
  for (let i = 0; i < 81; i++) st.b[i] = p.b[i] === 'x' ? 1 : p.b[i] === 'o' ? 2 : 0;
  st.turn = p.hero; return st;
}
const pzStr = () => TS.toStr(S.st.b);
const pzLevel = p => (p.dp <= 2 ? L('やさしい', 'Easy') : p.dp <= 4 ? L('ふつう', 'Medium') : L('むずかしい', 'Hard'));
function startPuzzle(which, practice) {
  stopAll(); hideOverlays(); if (!BANK.length) return;
  let p, daily = false;
  if (which === 'daily') { p = dailyPuzzle(dailyKey()); daily = !practice; } else if (typeof which === 'string') p = BANK.find(x => x.id === which); else p = BANK[(which | 0) % BANK.length];
  if (!p) p = BANK[0];
  const st = pzState(p);
  S = mkSession({ mode: 'puzzle', st, cfg: { mode: 'puzzle' }, pz: { p, rg: p.rg, done: false, ok: false, bad: -1, tries: 0, hinted: 0, daily, moved: false, ko: -1 } });
  zoomOn = false; buildBoard(9); fit(); S.cur = p.a[0]; $('ctl').dataset.key = ''; paint(false); hud();
  const def = p.ty === 'kill' ? 3 - p.hero : p.hero;
  setStatus(L(colName(p.hero) + '番。' + (p.ty === 'kill' ? colName(def) + 'の石を取ろう' : colName(def) + 'の石を生かそう') + '（明るい範囲の中で。' + pzLevel(p) + '）',
    colName(p.hero) + ' to play: ' + (p.ty === 'kill' ? 'capture the ' + colName(def).toLowerCase() + ' stones' : 'make the ' + colName(def).toLowerCase() + ' stones live') + ' (inside the bright area; ' + pzLevel(p) + ')'), true);
  announce($('status').textContent);
  emit('play_start', { mode: daily ? 'daily' : 'practice' });
}
const sleep = ms => new Promise(r => setTimeout(r, Math.round(ms * SPD.v)));
function pzPut(cell, color) {
  const pos = TS.posOf(S.pz.p, pzStr(), S.pz.ko), q = pos.play(cell, color); if (!q) return false;
  S.st.b = Array.from(q.b); S.pz.ko = q.ko; S.last = cell; S.cur = cell; sfx(color === S.pz.p.hero ? 'move' : 'tap'); paint(true); hud(); return true;
}
async function puzzleTap(i, forced) {
  const pz = S.pz, p = pz.p; if (pz.done || S.busy) return;
  if (pz.rg[i] !== '1') { sfx('error'); setStatus(L('暗い部分には打てません。明るい範囲の中で考えましょう', 'You cannot play in the dim area. Think inside the bright area'), true); return; }
  if (S.st.b[i]) { illegal(i, 'occupied'); return; }
  if (pz.moved) { setStatus(L('「やり直し」を押すと、もう一度考えられます', 'Press Retry to try again'), true); return; }
  if (!forced && useConfirm() && S.pend !== i) { S.pend = i; sfx('select'); markers(); renderCtl(); setStatus(L('ここに打ちますか？「おく」か、もう一度タップ', 'Play here? Press Place or tap again'), true); return; }
  S.pend = -1;
  const pos = TS.posOf(p, pzStr()), q = pos.play(i, p.hero); if (!q) { illegal(i, 'suicide'); return; }
  S.busy = true; pz.moved = true; pz.tries++; S.hint = -1; pzPut(i, p.hero);
  const right = p.a.indexOf(i) >= 0, def = p.ty === 'kill' ? 3 - p.hero : p.hero;
  await sleep(380);
  if (!S || S.pz !== pz) return;
  if (!right) {
    pz.bad = i; bump('pzx');
    const o = TS.opponentMove(pzStr(), p);
    if (o && !o.pass && o.cell != null) { pzPut(o.cell, 3 - p.hero); }
    sfx('error'); S.busy = false; pz.failed = true; markers();
    setStatus(p.ty === 'kill' ? L('ちがいます。相手に ' + E.name(o && o.cell != null ? o.cell : i, 9) + ' と受けられて、生きられてしまいます。「やり直し」でもう一度', 'Not quite: White (the defender) answers at ' + E.name(o && o.cell != null ? o.cell : i, 9) + ' and lives. Press Retry') : L('ちがいます。相手に ' + E.name(o && o.cell != null ? o.cell : i, 9) + ' と攻められて、取られてしまいます。「やり直し」でもう一度', 'Not quite: the attacker answers at ' + E.name(o && o.cell != null ? o.cell : i, 9) + ' and your stones die. Press Retry'), true);
    announce($('status').textContent); hud(); return;
  }
  // correct: show how it goes on
  setStatus(L('正解！ そのあとの進み方を見てみましょう', 'Correct! Here is how it goes on'), true);
  for (let k = 0; k < 14 && S && S.pz === pz; k++) {
    if (TS.finished(p, pzStr())) break;
    const o = TS.opponentMove(pzStr(), p); if (!o || o.pass || o.cell == null) break;
    await sleep(420); if (!S || S.pz !== pz) return; if (!pzPut(o.cell, 3 - p.hero)) break;
    if (TS.finished(p, pzStr())) break;
    const h = TS.heroMove(p, pzStr(), 7); if (!h) break;
    await sleep(420); if (!S || S.pz !== pz) return; if (!pzPut(h.cell, p.hero)) break;
  }
  puzzleSolved(def);
}
function puzzleSolved(def) {
  const pz = S.pz, p = pz.p; pz.done = true; pz.ok = true; S.busy = false; void def;
  const first = !save.pz.done[p.id]; save.pz.done[p.id] = 1; if (first) bump('pz'); if (!pz.hinted && pz.tries === 1) bump('pzc');
  let extra = '';
  if (pz.daily) {
    const dk = dailyKey(); if (!(save.dl.last === dk && save.dl.ok)) { save.dl.st = save.dl.last === prevDay(dk) && save.dl.ok ? save.dl.st + 1 : 1; save.dl.bs = Math.max(save.dl.bs, save.dl.st); save.dl.last = dk; save.dl.ok = 1; bump('pzd'); }
    extra = L('（連続 ' + save.dl.st + ' 日）', ' (streak ' + save.dl.st + ' days)');
  }
  writeSave(); sfx('win');
  emit('stage_clear', { stage: p.id });
  if (pz.daily) emit('play_end', { mode: 'daily', score: 0, durationMs: Math.round(Date.now() - S.t0), reason: 'clear' });
  setStatus(L('正解です！' + (pz.hinted ? '（ヒントを使いました）' : pz.tries > 1 ? '（' + pz.tries + '回目）' : '') + extra, 'Solved!' + (pz.hinted ? ' (with a hint)' : pz.tries > 1 ? ' (attempt ' + pz.tries + ')' : '') + extra), true);
  announce($('status').textContent); hud();
}
function puzzleHint() {
  if (!S || S.mode !== 'puzzle' || S.pz.done) return;
  const pz = S.pz; if (pz.moved) { setStatus(L('「やり直し」を押してから、ヒントを見られます', 'Press Retry first, then ask for a hint'), true); return; }
  pz.hinted++; S.hint = pz.p.a[0]; S.cur = S.hint; sfx('select'); markers();
  setStatus(L('ヒント：光っている場所が急所です。ここを考えてみましょう', 'Hint: the glowing point is the vital point'), true);
}
function puzzleReset() {
  if (!S || S.mode !== 'puzzle') return;
  const pz = S.pz, p = pz.p; if (pz.done && pz.ok && false) return;
  S.st = pzState(p); pz.done = false; pz.ok = false; pz.moved = false; pz.bad = -1; pz.ko = -1; pz.failed = false; S.busy = false; S.hint = -1; S.pend = -1; S.last = -1;
  $('ctl').dataset.key = ''; sfx('tap'); paint(false); hud();
  setStatus(L('もう一度。' + colName(p.hero) + '番です', 'Again. ' + colName(p.hero) + ' to play'), true);
}
function puzzleNext() {
  if (!S || S.mode !== 'puzzle') return;
  const i = BANK.indexOf(S.pz.p); let j = -1;
  for (let k = 1; k <= BANK.length; k++) { const q = (i + k) % BANK.length; if (!save.pz.done[BANK[q].id]) { j = q; break; } }
  if (j < 0) j = (i + 1) % BANK.length;
  startPuzzle(BANK[j].id, true);
}
function showPuzzleList() {
  hideOverlays(); const box = $('pList'); box.innerHTML = '';
  const done = BANK.filter(p => save.pz.done[p.id]).length;
  $('pSub').textContent = L(BANK.length + '問のうち ' + done + '問 解けました。すべて自作の読みで、正解を確かめてあります', done + ' of ' + BANK.length + ' solved. Every answer is proven by the built-in solver');
  for (const [lab, f] of [[L('やさしい', 'Easy'), p => p.dp <= 2], [L('ふつう', 'Medium'), p => p.dp > 2 && p.dp <= 4], [L('むずかしい', 'Hard'), p => p.dp > 4]]) {
    const list = BANK.filter(f); if (!list.length) continue;
    const h = document.createElement('div'); h.className = 'pzh'; h.textContent = lab + ' (' + list.filter(p => save.pz.done[p.id]).length + '/' + list.length + ')'; box.appendChild(h);
    const g = document.createElement('div'); g.className = 'pzg';
    for (const p of list) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pzc' + (save.pz.done[p.id] ? ' ok' : ''); b.dataset.id = p.id; b.innerHTML = esc(p.id.slice(1)) + '<small>' + (p.ty === 'kill' ? L('取れ', 'kill') : L('生きよ', 'live')) + '</small>'; b.addEventListener('click', () => startPuzzle(p.id, true)); g.appendChild(b); }
    box.appendChild(g);
  }
  $('ovPuz').hidden = false; try { $('pClose').focus({ preventScroll: true }); } catch (e) {}
}
$('pClose').addEventListener('click', () => { $('ovPuz').hidden = true; if (!S || S.over) showTitle(); else if (S.mode === 'puzzle') S.menu = false; else showTitle(); });

// =====================================================================================
// online: common/turnroom.js (the lobby, the room) + online.js (the game side). The host's page runs the game; every page draws the model it gets.
// Dead stones: both seats may toggle groups; both press "Agree" on the same marks to score; either seat may resume play.
// =====================================================================================
let TR = null, octx = null;
const CPU_NAMES = [L('ゲン', 'Gen'), L('レイ', 'Rei')];
function ensureTR() {
  if (TR || !window.KoboTurnRoom || !window.IgoOnline) return TR;
  TR = KoboTurnRoom.create({
    game: GAME, host: ON.host, turnSec: 60, seats: [2], seatsMax: 2, alternate: true, dealMs: 500,
    cpuNames: k => CPU_NAMES[k % 2],
    getOpts: () => ({ n: 2 }),
    getCpu: () => Math.max(1, Math.min(3, save.set.level - 1)),
    cpuLabel: lv => LV_NAME[ON.cpuLevel(lv)],
    onModel, onTick: onlineTick,
    onClose: () => showTitle(),
    onIdleClose: () => { if (S && S.mode === 'online') { S.over = true; } hideOverlays(); showTitle(); },
  });
  return TR;
}
function openOnline() {
  if (!ensureTR()) { sfx('error'); return; }
  const set = save.set; ON.setCfg({ n: set.n, rule: set.rule, hc: set.hc, komi: set.komi < 0 ? null : set.komi, superko: set.superko });
  if (S && !S.over && S.mode !== 'online') { S.menu = true; persist(); }
  hideOverlays(); TR.open({ n: 2 });
}
function leaveOnline() {
  if (TR) TR.leave();
  if (S && S.mode === 'online') { S.over = true; S.menu = true; }
  showTitle();
}
async function askLeaveOnline() {
  const ok = UI ? await UI.confirm({ title: L('出ると、あなたの席はCPUに代わります。出ますか？', 'If you leave, a CPU takes your seat. Leave?'), ok: L('出る', 'Leave'), cancel: L('やめる', 'Cancel'), danger: true }) : true;
  if (ok) leaveOnline(); else if (S) S.menu = false;
}
function onlineAgain() {
  if (!TR || !S) return;
  const m = TR.model();
  if (!m || (m.why && m.why !== 'w')) { leaveOnline(); return; }
  if (TR.rematch()) { $('rAgain').disabled = true; sfx('tap'); onlineResultText(m); }
}
function sendOnline(a) {
  if (!S || S.mode !== 'online') return false;
  const guard = a.t !== 'dd';
  if (guard && S.sending && Date.now() - S.sending < 2500) return false;
  if (!TR || !TR.submit(a)) { sfx('error'); return false; }
  if (guard) { S.sending = Date.now(); S.hint = -1; setTimeout(() => { if (S && S.mode === 'online' && S.sending && Date.now() - S.sending >= 2400) { S.sending = 0; hud(); markers(); refreshStatus(); } }, 2500); }
  hud(); markers(); return true;
}
function onModel(m) {
  if (!ensureTR()) return;
  if (m.me < 0 || (m.replaced && (!S || S.mode !== 'online'))) {
    if (UI) UI.toast(m.me < 0 ? L('ゲームに入れませんでした', 'You could not join this game') : L('席がCPUに交代しました', 'Your seat was taken over by a CPU'), { type: 'danger' });
    TR.leave(); if (S) S.menu = true; showTitle(); return;
  }
  const ctx = m.fresh || !octx ? (octx = ON.newCtx()) : octx;
  const v = ON.view(m, ctx);
  if (m.fresh || !S || S.mode !== 'online' || S.gn !== m.gn) { startOnline(m, v); return; }
  const prevMoves = S.st.moves.length, prevPhase = S.st.phase;
  S.st = v.st; S.model = m; S.names = m.names; S.sl = m.sl; S.sending = 0; S.myc = v.color; S.cf = v.cf; S.hint = -1; S.pend = -1;
  if (v.last >= 0) { S.last = v.last; S.cur = v.last; } else if (v.last === -2 || v.st.moves.length === 0) S.last = -1;
  const wait = paint(v.placed.length > 0);
  let note = '';
  if (v.placed.length) { const k = v.st.b[v.placed[v.placed.length - 1]]; note = colName(k) + ' ' + E.name(v.placed[v.placed.length - 1], v.st.n) + (v.removed.length ? L('、' + v.removed.length + '子取り', ', captured ' + v.removed.length) : ''); sfx(v.removed.length ? 'pop' : 'move'); }
  else if (v.st.moves.length > prevMoves && v.last === -2) { note = L(colName(3 - v.st.turn) + 'はパスしました', colName(3 - v.st.turn) + ' passed'); sfx('tap'); }
  if (v.st.phase === 'dead' && prevPhase === 'play') sfx('ok');
  if (v.st.phase === 'play' && prevPhase === 'dead') note = L('対局を再開します', 'Play resumes');
  S.note = note; if (note) announce(note);
  if (m.replaced && !S.over) { S.over = true; if (UI) UI.toast(L('席がCPUに交代しました', 'Your seat was taken over by a CPU'), { type: 'danger' }); emit('play_end', { mode: 'versus', score: 0, durationMs: Math.round(S.ms + (Date.now() - S.t0)), reason: 'quit' }); TR.leave(); S.menu = true; setTimeout(showTitle, 800); return; }
  hud(); refreshStatus();
  if (m.ph === 'over' && !S.over) { S.busy = true; setTimeout(() => { if (S) { S.busy = false; finishOnline(m); } }, wait); }
}
function startOnline(m, v) {
  stopAll(); hideOverlays();
  S = mkSession({ mode: 'online', st: v.st, cfg: { mode: 'online', n: v.st.n }, level: m.cpu || 2 });
  S.gn = m.gn; S.model = m; S.names = m.names; S.sl = m.sl; S.myc = v.color; S.cf = v.cf; S.sending = 0; S.last = v.last >= 0 ? v.last : -1; S.cur = v.last >= 0 ? v.last : centerCell(v.st.n);
  zoomOn = v.st.n === 19 && coarse() && Math.min(innerWidth, innerHeight) < 600;
  $('rAgain').disabled = false; B.n = 0; buildBoard(v.st.n); fit(); paint(false); hud();
  emit('play_start', { mode: 'versus' });
  S.note = L('こんどは あなたが' + colName(v.color) + 'です。', 'This time you play ' + colName(v.color) + '. '); refreshStatus(); announce(S.note);
  if (m.ph === 'over') { S.over = false; finishOnline(m); }
}
function onlineTick(m) {
  if (!S || S.mode !== 'online' || !m) return;
  const sec = Math.ceil(Math.max(0, m.dl ? m.left : 0) / 1000);
  if (!S.over) { if (S.tsec !== sec) { S.tsec = sec; hud(); } }
  else if (!$('ovResult').hidden) onlineResultText(m);
}
function onlineResultText(m) {
  if (!m || (m.rs && m.rs.y !== 'w')) return;
  const sl = String(m.sl || ''), pu = m.pu || []; let total = 0; for (let k = 0; k < sl.length; k++) if (pu[k] >= 0 && sl[k] !== 'x') total++;
  const wished = Math.min(total, Object.keys(m.rm || {}).length);
  if ($('rAgain').disabled) $('rNote').textContent = L('もう一度を待っています（' + wished + '/' + Math.max(1, total) + '人）', 'Waiting for a rematch (' + wished + '/' + Math.max(1, total) + ')');
  else $('rAgain').textContent = wished ? L('もう一度（' + wished + '/' + Math.max(1, total) + '人）', 'Rematch (' + wished + '/' + Math.max(1, total) + ')') : L('もう一度', 'Play again');
}
function finishOnline(m) {
  if (!S || S.over) return;
  S.over = true; stopAll();
  const rs = m.rs || { r: [], w: -1, y: 'w' }, ranks = ON.arr(rs.r), me = m.me >= 0 ? m.me : 0;
  const ok = rs.y === 'w', draw = ok && rs.w < 0, win = ok && ranks[me] === 1 && !draw;
  if (ok) { bump('onl'); if (win) bump('onw'); writeSave(); }
  emit('play_end', { mode: 'versus', score: 0, durationMs: Math.round(S.ms + (Date.now() - S.t0)), reason: win ? 'clear' : 'over' });
  if (win) sfx('win'); else sfx(draw ? 'ok' : 'over');
  hud(); markers();
  setTimeout(() => showOnlineResult(m, rs, win, draw), Math.round(700 * SPD.v));
}
function showOnlineResult(m, rs, win, draw) {
  if (!S || S.mode !== 'online' || !S.over) return;
  const st = S.st, ok = rs.y === 'w';
  $('rTitle').textContent = !ok ? L('オンライン対戦が終わりました', 'The online match is over') : draw ? L('引き分け', 'A draw') : win ? L('勝ちました！', 'You won!') : L('負けました', 'You lost');
  $('rSub').textContent = resultText(st.result, st.rule) + ' · ' + L('オンライン', 'Online') + ' · ' + st.moves.length + L('手', ' moves');
  if (st.result && st.result.by === 'score') fillScores($('rRank'), E.score(st, st.dead || []), st); else $('rRank').innerHTML = '';
  $('rBig').textContent = ''; $('rNew').hidden = true;
  $('rNote').textContent = rs.y === 'hl' ? L('ホストが退出したので、ここで終了です', 'The host left, so the match ends here') : rs.y === 'hg' ? L('ホストとの接続が切れたので、ここで終了です', 'Lost the host, so the match ends here') : L('オンライン対戦は★に数えません', 'Online matches do not count for ★');
  $('rAgain').disabled = !ok || !!m.replaced; $('rAgain').textContent = L('もう一度', 'Play again'); $('rReview').hidden = false; $('rSgf').hidden = false; $('rBoard').hidden = false;
  hideOverlays(); $('ovResult').hidden = false;
  try { $('rAgain').disabled ? $('rTitleBtn').focus({ preventScroll: true }) : $('rAgain').focus({ preventScroll: true }); } catch (e) {}
}
function showOnlineResultAgain() { if (S && S.model) { const m = S.model; showOnlineResult(m, m.rs || { r: [], w: -1, y: 'w' }, false, false); } }

// ---------- boot ----------
renderSound(); themeColor();
KG() && KG().register({
  id: GAME,
  pause() {}, resume() {},
  save() { persist(); },
  isIdle: () => !S || S.over,
  dispose() { stopAll(); },
  daily: { start() { startPuzzle('daily'); } },
});
window.addEventListener('pagehide', () => { if (S) persist(); });
window.addEventListener('storage', e => { if (e.key === SAVE_KEY && (!S || S.over)) { save = readSave(); if (!$('ovTitle').hidden) renderTitle(); } });
{
  buildBoard(save.set.n);
  const launch = PF ? PF.launch() : { daily: null };
  $('iGame').textContent = L('囲碁工房', 'Go Workshop'); $('iTurn').hidden = true; $('iBest').textContent = '★ ' + fmtN(save.pts); $('status').textContent = ''; $('ctl').style.visibility = 'hidden';
  fit(); syncStones(new Array(save.set.n * save.set.n).fill(0), {});
  const first = store.get(HOWTO_KEY) == null && !save.tut;
  if (launch.daily && PF && !first) { /* KoboGame.register starts the daily puzzle */ }
  else if (first) { save.tut = 1; writeSave(); showHowto(true); } else showTitle();
}

// ---------- test hooks (?debug) ----------
if (DEBUG) {
  const sel = i => '.cell[data-i="' + i + '"]';
  const api = {
    ready: () => true,
    state: () => {
      const st = S && S.st, c = st ? E.counts(st) : { b: 0, w: 0, e: 0 };
      return {
        started: !!S, mode: S ? S.mode : '', over: !!(S && (S.over || (st && st.over))), n: st ? st.n : 0, rule: st ? st.rule : '', komi: st ? st.komi : 0, hc: st ? st.hc : 0, level: S ? S.level : 0, me: S ? (S.mode === 'online' ? S.myc : S.me) : 0,
        turn: st ? st.turn : 0, phase: st ? st.phase : '', human: !!(S && canAct()), marking: !!(S && canMark()), busy: !!(S && S.busy), thinking: !!(S && S.thinking), black: c.b, white: c.w, empty: c.e,
        moves: st ? st.moves.length : 0, caps: st ? st.caps.slice() : [], passes: st ? st.passes : 0, dead: st ? (st.dead || []).slice() : [], ko: st ? st.ko : -1, result: st && st.result ? Object.assign({}, st.result) : null,
        hinted: S ? S.hinted : 0, undone: S ? S.undone : 0, hint: S ? S.hint : -1, pend: S ? S.pend : -1, last: S ? S.last : -1, zoom: zoomOn, confirm: useConfirm(), worker: cpu ? cpu.kind : '',
        title: !$('ovTitle').hidden, resultOv: !$('ovResult').hidden, howto: !$('howto').hidden, sgfOv: !$('ovSgf').hidden, puzOv: !$('ovPuz').hidden, viewOv: !$('ovView').hidden, menu: !!(S && S.menu),
        status: $('status').textContent, pts: save.pts, save: JSON.parse(JSON.stringify(save)), board: st ? st.b.slice() : [],
        net: !!(S && S.mode === 'online'), sl: S && S.sl ? S.sl : '', names: S && S.names ? S.names.slice() : [], cf: S && S.cf ? S.cf : '',
        clk: S && S.clk ? { 1: fmtClock(S.clk[1]), 2: fmtClock(S.clk[2]) } : null,
        pz: S && S.pz ? { id: S.pz.p.id, ty: S.pz.p.ty, hero: S.pz.p.hero, done: !!S.pz.done, ok: !!S.pz.ok, tries: S.pz.tries, bad: S.pz.bad, moved: !!S.pz.moved, a: S.pz.p.a.slice(), daily: !!S.pz.daily } : null,
        rv: S && S.rv ? { depth: st.moves.length, kids: S.rv.cur.kids.length, branches: S.rv.branches || 0 } : null,
        stones: B.stones.filter(Boolean).length, nums: B.stones.filter(d => d && d.firstChild).length, tms: B.tms.filter(Boolean).length, atari: B.stones.filter(d => d && (d.classList.contains('at') || d.classList.contains('at2'))).length, dd: B.stones.filter(d => d && d.classList.contains('dd')).length,
        coords: document.querySelectorAll('#coords span').length, bs: B.bs,
      };
    },
  };
  window.__kb = Object.assign(window.__kb || {}, api);
  window.__igo = {
    api, E, AI, TS, SGF, ON, get S() { return S; }, get save() { return save; }, get tr() { return ensureTR(); }, get cpu() { return cpu; }, openOnline, leaveOnline, ensureTR, BANK,
    onlineState() {
      const m = TR ? TR.model() : null, tr = TR ? TR._S : null;
      return { phase: TR ? TR.phase : 'off', host: TR ? TR.isHost : false, code: tr ? tr.code : null, rid: tr ? tr.rid : null, uid: TR ? TR.uid : null, err: tr ? tr.err : null,
        model: m ? { gn: m.gn, v: m.v, ph: m.ph, me: m.me, n: m.n, tn: m.tn, sl: m.sl, names: m.names, why: m.why, left: m.left, pd: m.pd, rs: m.rs } : null, lobby: !!document.querySelector('.ktr-ov:not([hidden])') };
    },
    start(o) { startGame(o || {}); return api.state(); },
    puzzle(id, practice) { startPuzzle(id, practice); return api.state(); },
    setSpeed(m) { SPD.v = m; },
    set(k, v) { save.set[k] = v; writeSave(); if (S && S.st) { fit(); paint(false); hud(); } },
    cellPoint(i) { const r = B.cells[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
    // where to click: 'cpu' = a sensible move for the human (what the level-3 CPU would play), 'first' = a free point near the middle; in a puzzle: true = an answer, false = a wrong point inside the area
    plan(good) {
      if (!S || !S.st) return null;
      if (S.mode === 'puzzle') {
        const p = S.pz.p;
        if (good === false) { for (let i = 0; i < 81; i++) if (p.rg[i] === '1' && !S.st.b[i] && p.a.indexOf(i) < 0 && TS.posOf(p, pzStr()).play(i, p.hero)) return { cell: i, sel: sel(i) }; return null; }
        return { cell: p.a[0], sel: sel(p.a[0]) };
      }
      if (!canAct()) return null;
      const lg = E.legalMoves(S.st); if (!lg.length) return null;
      let c;
      if (good === 'cpu') { const r = AI.choose(JSON.parse(JSON.stringify(S.st)), 3, { time: 0, iters: 150, seed: 11 }); c = r.cell; if (c < 0) return { cell: -1, pass: true }; }
      else { const mid = centerCell(S.st.n); c = lg.slice().sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b)[0]; }
      return { cell: c, sel: sel(c) };
    },
    title: showTitle, howto: showHowto, openMenu, relayout: fit, persist, resume() { const r = readRun(); if (r) resumeGame(r); return !!r; },
    // set up a position (for tests): rows of '.', 'x' (black), 'o' (white); turn 1|2. Inside a CPU / two-player game
    rig(rows, turn, o) {
      if (!S || !S.st || S.mode === 'online') return null;
      const n = S.st.n, b = []; for (const row of rows) for (const ch of row) b.push(ch === 'x' ? 1 : ch === 'o' ? 2 : 0);
      if (b.length !== n * n) return null;
      stopAll(); const st = S.st; st.b = b; st.turn = turn || st.turn; st.ko = -1; st.moves = []; st.hs = []; st.start = b.slice(); st.passes = 0; st.phase = 'play'; st.over = false; st.result = null; st.dead = []; st.caps = [0, 0, 0];
      if (st.cfg) st.cfg.setup = b.map((v, i) => (v ? [i, v] : null)).filter(Boolean); if (st.cfg) st.cfg.pl = st.turn;
      S.over = false; S.busy = false; S.thinking = false; S.last = -1; S.pend = -1; S.hint = -1; if (o && o.me) S.me = o.me;
      paint(false); hud(); refreshStatus(); loop(); return api.state();
    },
    finish() { if (S && !S.over) { stopAll(); finish(); } },
    mark(i) { if (S && canMark()) markTap(i); }, review: startReviewFromSession, rvGo, get rv() { return S && S.rv; },
    thinkNow() { return cpu ? cpu.kind : ''; },
    thumbScene() { // a 9x9 game in progress, with the territory estimate on, for the hub thumbnail
      store.set(HOWTO_KEY, '1'); document.body.classList.add('thumb'); hideOverlays(); stopAll();
      const st = E.create({ n: 9, rule: 'jp' });
      const seq = [[2, 2], [6, 6], [2, 6], [6, 2], [4, 4], [3, 6], [3, 5], [2, 5], [3, 4], [6, 4], [4, 5], [5, 5], [4, 6], [5, 6], [1, 6], [4, 3], [5, 3], [5, 2], [4, 2], [6, 3], [3, 3], [7, 3], [2, 4], [7, 5]];
      for (const [r, c] of seq) E.play(st, r * 9 + c);
      S = mkSession({ mode: 'pass', st, cfg: { mode: 'pass', n: 9, rule: 'jp', level: 3, hc: 0, komi: -1, superko: 0, clock: 0, me: 'b' }, level: 3, me: 1 });
      const lm = st.moves.slice(-1)[0]; S.last = lm[0]; save.set.terr = 1; save.set.coords = 1; zoomOn = false;
      buildBoard(9); fit(); paint(false); hud(); return true;
    },
  };
}
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('../sw.js').catch(() => {});
