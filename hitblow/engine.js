// ヒットアンドブローの「ルール」と「ミッション」の中身（node でも動く）。画面・CPU対戦の進行・オンライン対戦は hitblow/index.html。
// ・ルール：H（ヒット）と B（ブロー）の判定・全部の並び・答えの作り方・点数（ランキングの値の計算。意味は変えていない）・CPUの「つよい」の選び方
// ・ミッション：12個（3ワールド×4）。ふつうの遊びとは別で、記号の数・桁・同じ記号の有無・ヒントの見え方（fb）・はじめから出ているヒント（given）・
//   回数の上限（max）・★の基準（par）が決まっている。ランキング・実績・ベストには入らない（KoboGame には practice で報告）。
//   fb：full＝H と B の両方　hit＝H だけ（Bは見えない）　blow＝B だけ（Hは見えない）
//   ★：解けたら1、par[0] 回以内で2、par[1] 回以内で3。「ひらめきヒント」を使うと★は2まで。
// ・保存 kusoge.hitblow.x = { v:1, s:[12ミッションの星0〜3], b:[ベストの回数×12], ws（ひとりの連勝）, wm（最高の連勝） }（端末だけ・同期しない・ランキングに入らない）
// 読み込み：ブラウザでは <script src="engine.js"></script>（window.HitblowEngine）、node では require('./hitblow/engine.js')。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HitblowEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const DIFFS = {
    e: { len: 3, max: 8, mult: 1, ja: 'かんたん' },
    n: { len: 4, max: 10, mult: 2, ja: 'ふつう' },
    h: { len: 5, max: 12, mult: 3, ja: 'むずかしい' },
  };
  function mkCfg(sym, d, dup) {
    const dd = DIFFS[d] ? d : 'n', D = DIFFS[dd], col = sym === 'col';
    return { sym: col ? 'col' : 'num', d: dd, dup: !!dup, len: D.len, max: D.max, mult: D.mult, n: col ? 8 : 10 };
  }
  const chOf = i => String.fromCharCode(48 + i);
  const idxOf = ch => ch.charCodeAt(0) - 48;

  function mkRng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // H*10+B with reusable counters (fast enough for the CPU's search)
  const CA = new Int8Array(10), CB = new Int8Array(10);
  function hb(a, b) {
    let h = 0; CA.fill(0); CB.fill(0);
    for (let i = 0; i < a.length; i++) { const x = a.charCodeAt(i) - 48, y = b.charCodeAt(i) - 48; if (x === y) h++; else { CA[x]++; CB[y]++; } }
    let bl = 0; for (let k = 0; k < 10; k++) bl += CA[k] < CB[k] ? CA[k] : CB[k];
    return h * 10 + bl;
  }
  function judge(secret, guess) { const v = hb(secret, guess); return { h: Math.floor(v / 10), b: v % 10 }; }
  // what a player sees of H*10+B: everything, only H, or only B
  function fbKey(fb, v) { return fb === 'hit' ? Math.floor(v / 10) : fb === 'blow' ? v % 10 : v; }
  const codeCache = {};
  function allCodes(cfg) {
    const k = cfg.n + ':' + cfg.len + ':' + (cfg.dup ? 1 : 0);
    if (codeCache[k]) return codeCache[k];
    const out = [], buf = [];
    (function rec(depth, used) {
      if (depth === cfg.len) { out.push(buf.join('')); return; }
      for (let i = 0; i < cfg.n; i++) {
        if (!cfg.dup && (used & (1 << i))) continue;
        buf[depth] = chOf(i); rec(depth + 1, used | (1 << i));
      }
    })(0, 0);
    return (codeCache[k] = out);
  }
  function makeSecret(cfg, rnd) {
    let s = '';
    const pool = Array.from({ length: cfg.n }, (_, i) => i);
    for (let i = 0; i < cfg.len; i++) {
      if (cfg.dup) s += chOf(Math.floor(rnd() * cfg.n));
      else { const j = Math.floor(rnd() * pool.length); s += chOf(pool[j]); pool.splice(j, 1); }
    }
    return s;
  }
  function validCode(cfg, s) {
    if (typeof s !== 'string' || s.length !== cfg.len) return false;
    for (let i = 0; i < s.length; i++) { const x = idxOf(s[i]); if (!(x >= 0 && x < cfg.n)) return false; if (!cfg.dup && s.indexOf(s[i]) !== i) return false; }
    return true;
  }
  // the answers that fit every clue as the player sees it
  const filterBy = (list, rows, fb) => list.filter(c => rows.every(r => fbKey(fb, hb(c, r.g)) === fbKey(fb, r.h * 10 + r.b)));
  // score of one solved puzzle (the ranking value): fewer guesses and less time are better; the difficulty multiplies it
  function scoreOf(cfg, n, ms) {
    const base = 100 * (cfg.max - n + 1), tb = Math.max(0, 240 - Math.floor((ms || 0) / 1000));
    return Math.round((base + tb) * cfg.mult * (cfg.dup ? 1.5 : 1));
  }

  // the strong CPU (and the test bot): the guess whose worst answer leaves the fewest possibilities (minimax over a sample)
  function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }
  function sample(arr, n, r) { if (arr.length <= n) return arr.slice(); const out = new Set(); while (out.size < n) out.add(arr[Math.floor(r() * arr.length)]); return [...out]; }
  function minimax(cand, cfg, tried, r, fb) {
    const all = allCodes(cfg);
    const pool = cand.length > 1500 ? sample(cand, 1500, r) : cand;
    const guesses = sample(cand, 140, r).concat(cand.length > 3 ? sample(all, 40, r).filter(x => !tried.has(x)) : []);
    let best = null, bestW = Infinity, bestIn = false;
    const cnt = new Int32Array(100), candSet = cand.length < 5000 ? new Set(cand) : null;
    for (const g of guesses) {
      cnt.fill(0); let w = 0;
      for (const s of pool) { const k = fbKey(fb, hb(s, g)); if (++cnt[k] > w) w = cnt[k]; }
      const inC = candSet ? candSet.has(g) : true;
      if (w < bestW || (w === bestW && inC && !bestIn)) { best = g; bestW = w; bestIn = inC; }
    }
    return best || pick(cand, r);
  }

  // ---------- missions ----------
  const MISSIONS = [
    // world 0: learn the clues on a small board
    { world: 0, sym: 'num', len: 3, n: 6, dup: false, fb: 'full', given: 0, max: 7, par: [5, 4], name: 'はじめの 3けた', desc: '0〜5 の数字だけ。3つの並びを、ヒットとブローで当てよう。' },
    { world: 0, sym: 'col', len: 3, n: 6, dup: false, fb: 'full', given: 0, max: 7, par: [5, 4], name: 'いろを ならべる', desc: '6色だけ。色と形と文字で見分けて、3つの並びを当てよう。' },
    { world: 0, sym: 'num', len: 4, n: 8, dup: false, fb: 'full', given: 2, max: 6, par: [4, 3], name: 'ヒントつきの なぞ', desc: 'はじめから2つのヒントが出ている。そこから4けたの答えをしぼろう。' },
    { world: 0, sym: 'num', len: 3, n: 8, dup: false, fb: 'hit', given: 0, max: 11, par: [8, 6], name: 'ヒットだけ みえる', desc: 'ブローは見えない。ヒット（場所も合っている数）だけで3つの並びを当てよう。' },
    // world 1: repeats, hidden info, more symbols
    { world: 1, sym: 'num', len: 4, n: 6, dup: true, fb: 'full', given: 0, max: 9, par: [7, 5], name: 'おなじ数字も ある', desc: '0〜5 の数字。答えに同じ数字が何度も出ることがある。' },
    { world: 1, sym: 'col', len: 4, n: 8, dup: false, fb: 'full', given: 1, max: 8, par: [6, 5], name: '8色の 4つならび', desc: '8色のうち4つ。ヒントがひとつ出ている。' },
    { world: 1, sym: 'num', len: 3, n: 8, dup: false, fb: 'blow', given: 0, max: 10, par: [8, 6], name: 'ブローだけ みえる', desc: 'ヒットは見えない。ブロー（数字は合っているが場所がちがう数）だけで当てよう。' },
    { world: 1, sym: 'num', len: 4, n: 10, dup: false, fb: 'hit', given: 1, max: 14, par: [11, 9], name: 'ヒットだけの 4けた', desc: '4けたの答えを、ヒットだけで当てる。ヒントがひとつ出ている。' },
    // world 2: long rows and the hardest feedback
    { world: 2, sym: 'num', len: 5, n: 10, dup: false, fb: 'full', given: 3, max: 7, par: [5, 4], name: '5けたの なぞ', desc: 'はじめから3つのヒント。5けたの答えを少ない回数で当てよう。' },
    { world: 2, sym: 'num', len: 4, n: 10, dup: false, fb: 'blow', given: 0, max: 13, par: [10, 8], name: 'ブローだけの 4けた', desc: '4けたの答えを、ブローだけで当てる。ヒットは見えない。' },
    { world: 2, sym: 'col', len: 5, n: 8, dup: true, fb: 'full', given: 0, max: 11, par: [8, 6], name: '色の ぎっしり', desc: '8色で5つ。同じ色が何度も出ることがある。' },
    { world: 2, sym: 'num', len: 6, n: 10, dup: false, fb: 'full', given: 0, max: 12, par: [9, 7], name: '6けたの 大なぞ', desc: '10個の数字から6つ。ヒットとブローをよく読んで、しぼりこもう。' },
  ].map((m, i) => Object.assign(m, { id: 'm' + (i + 1), index: i }));
  const COUNT = MISSIONS.length;
  const WORLDS = [{ name: '入門の机' }, { name: '推理の夜' }, { name: '名探偵の部屋' }];

  const info = i => MISSIONS[i] || null;
  function cfgOf(i) {
    const m = MISSIONS[i]; if (!m) return null;
    return { sym: m.sym, d: 'm', dup: m.dup, len: m.len, max: m.max, mult: 1, n: m.n };
  }
  // a fresh puzzle: the answer, the clues that are shown from the start (never a solved row), and the "flash" hint (one place of the answer)
  function build(i, rnd) {
    const m = MISSIONS[i], cfg = cfgOf(i);
    const secret = makeSecret(cfg, rnd), given = [];
    for (let t = 0; given.length < m.given && t < 500; t++) {
      const g = makeSecret(cfg, rnd);
      if (g === secret || given.includes(g)) continue;
      const v = hb(secret, g);
      if (Math.floor(v / 10) === cfg.len) continue;
      if (fbKey(m.fb, v) === 0 && t < 400) continue; // a clue that says nothing is no clue
      given.push(g);
    }
    const pos = Math.floor(rnd() * cfg.len);
    return { cfg, secret, given, hint: { pos, ch: secret[pos] } };
  }
  // 0 = not solved, 1 = solved, 2 = within par[0] tries, 3 = within par[1] tries; the flash hint caps it at 2
  function starsFor(i, tries, hinted) {
    const m = MISSIONS[i]; if (!m || !(tries >= 1) || tries > m.max) return 0;
    const s = tries <= m.par[1] ? 3 : tries <= m.par[0] ? 2 : 1;
    return hinted ? Math.min(2, s) : s;
  }
  // 0..1 toward the 3 stars (fewer tries = more)
  function progress(i, tries) {
    const m = MISSIONS[i]; if (!m || !(tries >= 1) || tries > m.max) return 0;
    return clamp((m.max - tries + 1) / (m.max - m.par[1] + 1), 0, 1);
  }

  // ---------- kusoge.hitblow.x ----------
  const natural = (v, hi) => { v = Number(v); return isFinite(v) ? clamp(Math.floor(v), 0, hi) : 0; };
  function readX(raw) {
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
    const x = { v: 1, s: new Array(COUNT).fill(0), b: new Array(COUNT).fill(0), ws: 0, wm: 0 };
    if (!o || typeof o !== 'object' || Array.isArray(o)) return x;
    for (let i = 0; i < COUNT; i++) {
      x.s[i] = Array.isArray(o.s) ? natural(o.s[i], 3) : 0;
      x.b[i] = Array.isArray(o.b) ? natural(o.b[i], 99) : 0;
      if (!x.s[i]) x.b[i] = 0;
    }
    x.ws = natural(o.ws, 9999); x.wm = Math.max(natural(o.wm, 9999), x.ws);
    return x;
  }
  const open = (x, i) => i >= 0 && i < COUNT && (i === 0 || x.s[i - 1] >= 1);
  const totalStars = x => x.s.reduce((a, b) => a + b, 0);
  // returns true when anything improved
  function recordMission(x, i, stars, tries) {
    if (!(i >= 0 && i < COUNT) || !(stars >= 1)) return false;
    let up = false;
    if (stars > x.s[i]) { x.s[i] = stars; up = true; }
    if (tries >= 1 && (!x.b[i] || tries < x.b[i])) { x.b[i] = tries; up = true; }
    return up;
  }
  // the win streak of normal solo play (a loss or giving up starts over)
  function recordSolo(x, won) {
    if (won) { x.ws++; x.wm = Math.max(x.wm, x.ws); } else x.ws = 0;
    return x.ws;
  }

  return { DIFFS, MISSIONS, WORLDS, COUNT, mkCfg, cfgOf, chOf, idxOf, mkRng, hb, judge, fbKey, allCodes, makeSecret, validCode, filterBy, scoreOf, pick, sample, minimax,
    info, build, starsFor, progress, readX, open, totalStars, recordMission, recordSolo };
});
