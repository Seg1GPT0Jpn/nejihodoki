// 囲碁工房：ルールの本体（盤・石・呼吸点・取り・コウ・自殺手・パス・死に石・数え方）。DOM は使わず、node でも動く。
// 盤は n×n の配列 b（0 空き・1 黒・2 白）。手は [マス, 色]（マス -1 = パス）。マスの番号は 行*n+列（左上が 0）。
// ルール：rule 'jp'（日本ルール＝地を数える。取った石と死に石を足す。セキの中は数えない）と 'cn'（中国ルール＝石と地を足す）。
//         コウ：ふつうは単純コウ（取り返しの禁止）。superko:true なら「同じ盤面を二度つくらない」（ポジショナル・スーパーコウ）。自殺手は禁止。
//         パスが2回つづくと phase 'dead'（死に石をえらぶ）。confirm() で数えて phase 'over'。
(function (root) {
  'use strict';
  const SIZES = [9, 13, 19];
  const RULES = ['jp', 'cn'];
  const GEO = {};
  function geo(n) {
    if (GEO[n]) return GEO[n];
    const nb = [], dg = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const a = [], d = [];
      if (r > 0) a.push((r - 1) * n + c); if (c > 0) a.push(r * n + c - 1); if (c < n - 1) a.push(r * n + c + 1); if (r < n - 1) a.push((r + 1) * n + c);
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) d.push(rr * n + cc); }
      nb.push(a); dg.push(d);
    }
    // zobrist（決まった種から。盤の大きさごとに同じ表）
    let s = (0x9e3779b9 ^ (n * 2654435761)) >>> 0; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
    const zl = [], zh = [];
    for (let i = 0; i < n * n * 3; i++) { zl.push(rnd()); zh.push(rnd() & 0x1fffff); }
    const a = n === 9 ? 2 : 3, lo = a, hi = n - 1 - a, mid = (n - 1) >> 1;
    const P = (r, c) => r * n + c;
    const stars = n === 9 ? [P(2, 2), P(2, 6), P(6, 2), P(6, 6), P(4, 4)] : n === 13 ? [P(3, 3), P(3, 9), P(9, 3), P(9, 9), P(6, 6)] : [P(3, 3), P(3, 9), P(3, 15), P(9, 3), P(9, 9), P(9, 15), P(15, 3), P(15, 9), P(15, 15)];
    // 置き碁の石の場所（日本式：2＝右上と左下、3＝右下をたす、4＝左上をたす、5＝天元、6〜9＝辺と天元）
    const hcOrder = [P(lo, hi), P(hi, lo), P(hi, hi), P(lo, lo)];
    const hc = {};
    for (let k = 2; k <= 9; k++) {
      let L;
      if (k <= 4) L = hcOrder.slice(0, k);
      else if (k === 5) L = hcOrder.concat([P(mid, mid)]);
      else if (k === 6) L = hcOrder.concat([P(mid, lo), P(mid, hi)]);
      else if (k === 7) L = hcOrder.concat([P(mid, lo), P(mid, hi), P(mid, mid)]);
      else if (k === 8) L = hcOrder.concat([P(mid, lo), P(mid, hi), P(lo, mid), P(hi, mid)]);
      else L = hcOrder.concat([P(mid, lo), P(mid, hi), P(lo, mid), P(hi, mid), P(mid, mid)]);
      hc[k] = L;
    }
    return (GEO[n] = { n, nb, dg, zl, zh, stars, hc, size: n * n });
  }
  const hashNum = (h, l) => h * 4294967296 + (l >>> 0);

  // ---------------------------------------------------------------- 石のつながり
  // マス i の石のつながり：{ color, cells, libs }（空きなら null）
  function chain(b, n, i) {
    const col = b[i]; if (!col) return null;
    const nb = geo(n).nb, seen = new Uint8Array(n * n), cells = [i], libs = [], ls = new Uint8Array(n * n);
    seen[i] = 1;
    for (let k = 0; k < cells.length; k++) for (const q of nb[cells[k]]) {
      if (b[q] === col) { if (!seen[q]) { seen[q] = 1; cells.push(q); } }
      else if (b[q] === 0 && !ls[q]) { ls[q] = 1; libs.push(q); }
    }
    return { color: col, cells, libs };
  }
  function fresh(n) { return new Array(n * n).fill(0); }

  // ---------------------------------------------------------------- 状態
  function seenOf(st) {
    if (!st._seen || st._seenN !== st.hs.length) { const d = new Set(st.hs); Object.defineProperty(st, '_seen', { value: d, enumerable: false, writable: true, configurable: true }); Object.defineProperty(st, '_seenN', { value: st.hs.length, enumerable: false, writable: true, configurable: true }); }
    return st._seen;
  }
  function fullHash(b, n) {
    const g = geo(n); let l = 0, h = 0;
    for (let i = 0; i < b.length; i++) if (b[i]) { l ^= g.zl[i * 3 + b[i]]; h ^= g.zh[i * 3 + b[i]]; }
    return hashNum(h, l);
  }
  // opts: { n, rule, komi, hc（置き石の数 0, 2〜9）, superko, seed }
  function create(o) {
    o = o || {};
    const n = SIZES.indexOf(o.n) >= 0 ? o.n : 9, rule = RULES.indexOf(o.rule) >= 0 ? o.rule : 'jp';
    const hc = o.hc >= 2 && o.hc <= 9 ? o.hc | 0 : 0;
    const komi = typeof o.komi === 'number' && isFinite(o.komi) ? o.komi : hc ? 0.5 : rule === 'cn' ? 7.5 : 6.5;
    const b = fresh(n); let turn = hc ? 2 : 1;
    if (o.setup && o.setup.length) { for (const [c, k] of o.setup) if (c >= 0 && c < n * n && (k === 1 || k === 2)) b[c] = k; if (o.pl === 1 || o.pl === 2) turn = o.pl; else if (!hc) turn = 1; }
    else if (hc) for (const p of geo(n).hc[hc]) b[p] = 1;
    const cfg = { n, rule, komi, hc, superko: !!o.superko }; if (o.setup && o.setup.length) { cfg.setup = o.setup.map(x => x.slice()); cfg.pl = turn; }
    const st = { v: 1, n, rule, komi, hc, superko: !!o.superko, b, turn, ko: -1, caps: [0, 0, 0], moves: [], passes: 0, phase: 'play', result: null, dead: [], start: b.slice(), hs: [], over: false, cfg };
    st.hs.push(fullHash(b, n));
    return st;
  }
  const clone = st => { const c = JSON.parse(JSON.stringify(st)); return c; };
  // 手のならびから状態を作り直す（もどす・棋譜の読みこみ・オンラインのホスト復帰）
  function fromMoves(o, moves, upto) {
    const st = create(o); const lim = upto == null ? moves.length : upto;
    for (let i = 0; i < lim; i++) {
      const m = moves[i]; if (st.phase !== 'play') break;
      st.turn = m[1];
      const r = m[0] < 0 ? pass(st) : play(st, m[0]);
      if (!r.ok) return { st, failed: i };
    }
    return { st, failed: -1 };
  }

  // 手をためす。ok:false なら盤は元のまま。ok:true のときは commit=false でも盤を元にもどす（結果だけ返す）
  function attempt(st, cell, color, commit) {
    const n = st.n, g = geo(n), b = st.b, nb = g.nb;
    if (cell < 0 || cell >= n * n || b[cell]) return { ok: false, why: 'occupied' };
    if (cell === st.ko && st.ko >= 0 && color === st.turn) return { ok: false, why: 'ko' };
    const opp = 3 - color; b[cell] = color;
    const captured = []; const mark = new Set();
    for (const q of nb[cell]) if (b[q] === opp && !mark.has(q)) {
      const ch = chain(b, n, q);
      for (const c of ch.cells) mark.add(c);
      if (!ch.libs.length) for (const c of ch.cells) captured.push(c);
    }
    for (const c of captured) b[c] = 0;
    const own = chain(b, n, cell);
    const revert = () => { for (const c of captured) b[c] = opp; b[cell] = 0; };
    if (!own.libs.length) { revert(); return { ok: false, why: 'suicide' }; }
    let hl = 0, hh = 0;
    // 盤面の hash（手番をふくまない）
    const base = st.hs.length ? st.hs[st.hs.length - 1] : 0;
    void base;
    const h = fullHash(b, n);
    if (st.superko && seenOf(st).has(h)) { revert(); return { ok: false, why: 'superko' }; }
    void hl; void hh;
    const ko = captured.length === 1 && own.cells.length === 1 && own.libs.length === 1 ? captured[0] : -1;
    const res = { ok: true, captured, ko, h, atari: own.libs.length === 1 && own.cells.length >= 1 };
    if (!commit) revert();
    return res;
  }
  const isLegal = (st, cell, color) => st.phase === 'play' && !st.over && attempt(st, cell, color || st.turn, false).ok;
  function legalMoves(st, color) { const out = []; if (st.phase !== 'play') return out; for (let i = 0; i < st.n * st.n; i++) if (!st.b[i] && attempt(st, i, color || st.turn, false).ok) out.push(i); return out; }
  function play(st, cell) {
    if (st.phase !== 'play') return { ok: false, why: 'phase' };
    const color = st.turn, r = attempt(st, cell, color, true);
    if (!r.ok) return r;
    st.caps[color] += r.captured.length; st.ko = r.ko; st.hs.push(r.h);
    if (st._seen) { st._seen.add(r.h); st._seenN = st.hs.length; }
    st.moves.push([cell, color]); st.passes = 0; st.turn = 3 - color;
    return r;
  }
  function pass(st) {
    if (st.phase !== 'play') return { ok: false, why: 'phase' };
    st.moves.push([-1, st.turn]); st.turn = 3 - st.turn; st.ko = -1; st.passes++;
    if (st.passes >= 2) { st.phase = 'dead'; st.dead = []; }
    return { ok: true, pass: true };
  }
  function resign(st, color) {
    st.phase = 'over'; st.over = true;
    st.result = { w: 3 - color, by: 'resign', text: (color === 1 ? 'W' : 'B') + '+R', margin: 0 };
    return st.result;
  }
  function timeout(st, color) { const r = resign(st, color); r.by = 'time'; r.text = (color === 1 ? 'W' : 'B') + '+T'; return r; }
  // 死に石えらびをやめて、対局にもどる。color が先に打つ
  function resume(st, color) { if (st.phase !== 'dead') return false; st.phase = 'play'; st.passes = 0; st.dead = []; st.turn = color || st.turn; st.ko = -1; return true; }

  // ---------------------------------------------------------------- 数える
  // 死に石 dead（マスの配列）を取りのぞいた盤を作り、空き地を分ける
  function regionsOf(b, n) {
    const nb = geo(n).nb, id = new Int32Array(n * n).fill(-1), out = [];
    for (let i = 0; i < n * n; i++) {
      if (b[i] || id[i] >= 0) continue;
      const cells = [i]; id[i] = out.length; let bk = 0, wh = 0; const bchains = new Set();
      for (let k = 0; k < cells.length; k++) for (const q of nb[cells[k]]) {
        if (b[q] === 0) { if (id[q] < 0) { id[q] = out.length; cells.push(q); } }
        else { if (b[q] === 1) bk = 1; else wh = 1; bchains.add(q); }
      }
      out.push({ cells, owner: bk && !wh ? 1 : wh && !bk ? 2 : 0, bk, wh, adj: [...bchains] });
    }
    return { id, list: out };
  }
  const eyeValue = r => (r.cells.length >= 6 ? 2 : 1);
  // セキ：目が2つない（地が1つ以下）で、相手の石と共通の呼吸点（どちらの地でもない空き）を持つ生きている石のつながり
  function sekiCells(b, n) {
    const { id, list } = regionsOf(b, n), nb = geo(n).nb, seki = new Set(), done = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (!b[i] || done[i]) continue;
      const ch = chain(b, n, i); for (const c of ch.cells) done[c] = 1;
      let eyes = 0, shared = false; const regs = new Set();
      for (const l of ch.libs) {
        const r = list[id[l]]; if (regs.has(id[l])) continue; regs.add(id[l]);
        if (r.owner === ch.color) eyes += eyeValue(r); else if (r.owner === 0 && r.bk && r.wh) shared = true;
      }
      // つながりのまわりの「ほかの色の石がない空き地」のうち、そのつながりだけが接するものを目と数える
      if (eyes < 2 && shared) for (const c of ch.cells) seki.add(c);
    }
    return seki;
  }
  // 数える：dead は取りのぞく石のマス（その石のつながりぜんぶ）。戻り値 { b, w, terB, terW, ... }
  function score(st, dead) {
    const n = st.n, b = st.b.slice(); const dd = new Set(dead || []);
    let deadB = 0, deadW = 0;
    for (const c of dd) { if (b[c] === 1) deadB++; else if (b[c] === 2) deadW++; b[c] = 0; }
    const { id, list } = regionsOf(b, n);
    const seki = st.rule === 'jp' ? sekiCells(b, n) : new Set();
    const terr = new Int8Array(n * n);   // 地の持ち主（0 なし）
    let terB = 0, terW = 0, stB = 0, stW = 0, neutral = 0;
    for (let i = 0; i < n * n; i++) { if (b[i] === 1) stB++; else if (b[i] === 2) stW++; }
    for (const r of list) {
      let o = r.owner;
      if (o && st.rule === 'jp') { // セキの石にだけ接する空き地は数えない
        for (const q of r.adj) if (b[q] === o && seki.has(q)) { o = 0; break; }
      }
      if (o === 1) terB += r.cells.length; else if (o === 2) terW += r.cells.length; else neutral += r.cells.length;
      if (o) for (const c of r.cells) terr[c] = o;
    }
    for (const c of dd) { /* 死に石の場所は、地になった側の地に入っている */ void c; }
    let sb, sw;
    if (st.rule === 'cn') { sb = stB + terB; sw = stW + terW + st.komi; }
    else { sb = terB + st.caps[1] + deadW; sw = terW + st.caps[2] + deadB + st.komi; }
    const diff = sb - sw;
    const w = diff > 0 ? 1 : diff < 0 ? 2 : 0;
    const m = Math.abs(diff);
    return { b: sb, w: sw, terB, terW, stB, stW, deadB, deadW, neutral, caps: [st.caps[1], st.caps[2]], diff, winner: w, margin: m, terr, seki: [...seki], text: w ? (w === 1 ? 'B+' : 'W+') + m : '0' };
  }
  // 死に石のえらびを、つながりごとに切りかえる（石のあるマスを渡す）
  function toggleDead(st, cell) {
    if (st.phase !== 'dead' || !st.b[cell]) return false;
    const ch = chain(st.b, st.n, cell), set = new Set(st.dead);
    const isDead = set.has(cell);
    for (const c of ch.cells) { if (isDead) set.delete(c); else set.add(c); }
    st.dead = [...set].sort((a, b) => a - b); return !isDead;
  }
  // 数えて終わる
  function confirm(st) {
    if (st.phase !== 'dead') return null;
    const sc = score(st, st.dead);
    st.phase = 'over'; st.over = true;
    st.result = { w: sc.winner, by: 'score', text: sc.text, margin: sc.margin, b: sc.b, wt: sc.w };
    return sc;
  }

  // ---------------------------------------------------------------- 勢力（地の見積もり。Bouzy の膨張・浸食）
  function estimate(st, dead) {
    const n = st.n, g = geo(n), nb = g.nb, N = n * n; const b = st.b;
    const dd = new Set(dead || []);
    let inf = new Int32Array(N);
    for (let i = 0; i < N; i++) { if (!b[i] || dd.has(i)) continue; inf[i] = b[i] === 1 ? 128 : -128; }
    const dil = a => { const o = a.slice(); for (let i = 0; i < N; i++) { let p = 0, q = 0; for (const j of nb[i]) { if (a[j] > 0) p++; else if (a[j] < 0) q++; } if (a[i] >= 0 && q === 0) o[i] = a[i] + p; else if (a[i] <= 0 && p === 0) o[i] = a[i] - q; else if (a[i] > 0 && q > 0) o[i] = a[i]; else if (a[i] < 0 && p > 0) o[i] = a[i]; } return o; };
    const ero = a => { const o = a.slice(); for (let i = 0; i < N; i++) { let z = 0; for (const j of nb[i]) if (a[j] === 0) z++; if (a[i] > 0) o[i] = Math.max(0, a[i] - z); else if (a[i] < 0) o[i] = Math.min(0, a[i] + z); } return o; };
    for (let k = 0; k < 5; k++) inf = dil(inf);
    for (let k = 0; k < 21; k++) inf = ero(inf);
    const own = new Int8Array(N); let eb = 0, ew = 0;
    for (let i = 0; i < N; i++) { own[i] = inf[i] > 0 ? 1 : inf[i] < 0 ? 2 : 0; if (own[i] === 1) eb++; else if (own[i] === 2) ew++; }
    for (let i = 0; i < N; i++) if (dd.has(i) && own[i] === 0) own[i] = b[i] === 1 ? 2 : 1;
    return { own, b: eb, w: ew, diff: eb - (ew + st.komi) };
  }
  // 石のつながりが「あたり」（呼吸点1）の石のマスの一覧（色を指定）
  function atariCells(st, color) {
    const out = [], done = new Set();
    for (let i = 0; i < st.n * st.n; i++) {
      if (st.b[i] !== color || done.has(i)) continue;
      const ch = chain(st.b, st.n, i); for (const c of ch.cells) done.add(c);
      if (ch.libs.length === 1) for (const c of ch.cells) out.push(c);
    }
    return out;
  }
  const name = (c, n) => (c < 0 ? 'pass' : 'ABCDEFGHJKLMNOPQRST'[c % n] + (n - ((c / n) | 0)));   // 盤の座標（I をとばす）。例 D4
  const colName = (c, n) => 'ABCDEFGHJKLMNOPQRST'[c % n];
  const rowName = (c, n) => String(n - ((c / n) | 0));
  function counts(st) { let b = 0, w = 0; for (const v of st.b) { if (v === 1) b++; else if (v === 2) w++; } return { b, w, e: st.b.length - b - w }; }
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  const API = { SIZES, RULES, geo, chain, create, clone, fromMoves, attempt, isLegal, legalMoves, play, pass, resign, timeout, resume, regionsOf, sekiCells, score, toggleDead, confirm, estimate, atariCells, name, colName, rowName, counts, rng, fullHash, fresh };
  root.IgoEngine = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
