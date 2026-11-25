// 五目ならべ工房：ゲームの中身（決まった結果の純粋なロジック。node でもブラウザでも動く）
// ---------------------------------------------------------------------------------
// ルール（昔からあるふつうのルール）：黒（先手）と白が交互に、盤の交点に石を1つずつ置く。縦・横・ななめのどれかに、自分の石を5つ並べたら勝ち。
//   盤は 15×15（ふつう）・13×13・9×9（n）。マスの番号は r*n+c（上の段が 0）。マスの名前は 列の英字 a〜 ＋ 段の数字（下の段が 1。例：h8 が 15×15 の真ん中）。
// 5つ並べたときの決まり（rule）：
//   'free'  … 自由ルール。5つ以上つながれば勝ち（6つ以上でもよい）。禁じ手なし。
//   'std'   … ちょうど5つ。6つ以上つながっても勝ちにならない（黒も白も）。禁じ手なし。
//   'renju' … 連珠ふうの禁じ手つき。白は 5つ以上で勝ち。黒は「ちょうど5つ」で勝ちで、次の3つは置けない（置けるマスから外れる）：
//             長連（6つ以上つながる）・四四（四を2つ同時につくる）・三三（活三＝あと1手で「両はしが開いた四」になる三を2つ同時につくる）。
//             ただし、その手でちょうど5つできるなら勝ちなので、禁じ手ではない。三三の三が本物かどうかは、「その四にするマスが禁じ手ではないこと」まで調べる。
// 石：0 なし・1 黒・2 白。st は JSON にできるものだけ。
//   st = { v:1, n, rule, b:[n*n], turn:1|2, moves:[[マス, 色]…], over, winner(0 引き分け|1|2), line:[勝った並びのマス], first:1, seed }
//   乱数は使わず（CPU のばらつきは盤から決まる種で決める）、同じ局面・同じ強さなら同じ手になる（読む量を「時間」で切るときだけ、機械の速さで変わる）。
// CPU の強さ：1 よわい（五とめ・四とめだけはする、でたらめ寄り）・2 ふつう（石の形に点をつけて1手読み）・
//   3 つよい（アルファベータで数手先＋連続四の探索）・4 とてもつよい（時間いっぱいまで深く読む＋連続四・三を使った攻めの探索）。
// 毎日のパズル：「黒番。四（あと1つで五になる形）だけをつないで、○手で五をつくれ」（連続四＝VCF）。最短の手数がちょうど○で、その最初の手が1つだけであることを、
//   全部の四の手を調べて確かめてある（tools/gomoku-puzzle-gen.js・tools/tests/unit/gomoku-engine.test.js）。
(function (root) {
  'use strict';

  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const opp = k => 3 - k;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const COLS = 'abcdefghijklmno';
  const SIZES = [9, 13, 15];
  const RULES = ['free', 'std', 'renju'];
  const exactOf = (rule, k) => rule === 'std' || (rule === 'renju' && k === BLACK);   // その色は「ちょうど5つ」でないと勝てないか

  // ---------- 盤の形（n ごとに1回だけ作る）：5マスの窓・マスごとの窓・近いマス ----------
  const GEO = {};
  function geo(n) {
    if (GEO[n]) return GEO[n];
    const N = n * n, wins = [], winsOf = [];
    for (let i = 0; i < N; i++) winsOf.push([]);
    for (let d = 0; d < 4; d++) {
      const dr = DIRS[d][0], dc = DIRS[d][1];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const er = r + dr * 4, ec = c + dc * 4;
        if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
        const w = [];
        for (let j = 0; j < 5; j++) w.push((r + dr * j) * n + c + dc * j);
        const id = wins.length; wins.push(Int16Array.from(w));
        for (const x of w) winsOf[x].push(id);
      }
    }
    const nb2 = [], nb1 = [];
    for (let i = 0; i < N; i++) {
      const r = (i / n) | 0, c = i % n, a = [], b1 = [];
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        a.push(rr * n + cc); if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) b1.push(rr * n + cc);
      }
      nb2.push(Int16Array.from(a)); nb1.push(Int16Array.from(b1));
    }
    // 星（目印の点）
    const m = (n - 1) / 2, e = n === 15 ? 3 : n === 13 ? 3 : 2;
    const stars = n === 9 ? [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]] : [[e, e], [e, n - 1 - e], [m, m], [n - 1 - e, e], [n - 1 - e, n - 1 - e]];
    return (GEO[n] = { n, N, wins, winsOf: winsOf.map(a => Int16Array.from(a)), nb2, nb1, stars: stars.map(p => p[0] * n + p[1]), center: m * n + m });
  }

  // ---------- 並びの調べ（盤が Array でも Int8Array でも動く） ----------
  // 1方向の見え方：cell を中心に ±5 マス。a[i]：0 空き・1 k の石（cell は k の石として扱う）・2 それ以外（相手の石・盤の外）。id[i]：その盤のマス（外は -1）
  function lineView(b, n, cell, d, k) {
    const r = (cell / n) | 0, c = cell % n, dr = DIRS[d][0], dc = DIRS[d][1], a = new Array(11), id = new Array(11);
    for (let j = -5; j <= 5; j++) {
      const rr = r + dr * j, cc = c + dc * j;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) { a[j + 5] = 2; id[j + 5] = -1; continue; }
      const i = rr * n + cc; id[j + 5] = i;
      const v = i === cell ? k : b[i];
      a[j + 5] = v === k ? 1 : v === 0 ? 0 : 2;
    }
    return { a, id };
  }
  // cell に k の石があるとして、その石を通る並びの長さ（方向 d）
  function runCells(b, n, cell, k, d) {
    const r = (cell / n) | 0, c = cell % n, dr = DIRS[d][0], dc = DIRS[d][1], out = [cell];
    for (let s = -1; s <= 1; s += 2) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] === k) { out.push(rr * n + cc); rr += dr * s; cc += dc * s; }
    }
    return out;
  }
  // cell に k の石を置いた直後、勝ちになる並びがあれば、そのマスの並び（なければ null）。rule によって「ちょうど5」か「5以上」
  function winLine(b, n, cell, k, rule) {
    const exact = exactOf(rule, k);
    for (let d = 0; d < 4; d++) {
      const run = runCells(b, n, cell, k, d);
      if (exact ? run.length === 5 : run.length >= 5) return run.sort((x, y) => x - y);
    }
    return null;
  }

  // cell（空き）に k が置いたときの形：{ five, over（長連）, fours（四の数。同じ4つの石でできる四は1つ）, open4（両はしが開いた四がある）, threes（活三の数）, forb }
  function analyzeMove(b, n, cell, k, rule, depth) {
    depth = depth | 0;
    const exact = exactOf(rule, k), res = { five: false, over: false, fours: 0, open4: false, threes: 0, forb: null };
    const was = b[cell]; b[cell] = k;
    const sets = [];
    for (let d = 0; d < 4; d++) {
      const v = lineView(b, n, cell, d, k), a = v.a;
      let s = 5, e = 5; while (s > 0 && a[s - 1] === 1) s--; while (e < 10 && a[e + 1] === 1) e++;
      const len = e - s + 1;
      if (exact ? len === 5 : len >= 5) { res.five = true; continue; }
      if (len >= 6) { res.over = true; continue; }
      // 四：ここを1つ埋めると、この石を通る5つ（exact なら「ちょうど5つ」）ができる空き j。同じ4つの石でできるものは1つの四
      const keys = {};
      for (let j = 1; j <= 9; j++) {
        if (a[j] !== 0) continue;
        a[j] = 1;
        let s2 = j, e2 = j; while (s2 > 0 && a[s2 - 1] === 1) s2--; while (e2 < 10 && a[e2 + 1] === 1) e2++;
        a[j] = 0;
        const l2 = e2 - s2 + 1;
        if (s2 > 5 || e2 < 5) continue;
        if (!(exact ? l2 === 5 : l2 >= 5)) continue;
        const key = s2 + ':' + e2 + ':' + [j].join('');
        const stones = []; for (let x = s2; x <= e2; x++) if (x !== j) stones.push(x);
        const sk = stones.join(',');
        keys[sk] = (keys[sk] || 0) + 1;
        void key;
      }
      const ks = Object.keys(keys);
      if (ks.length) { res.fours += ks.length; for (const q of ks) if (keys[q] >= 2) res.open4 = true; continue; }
      // 活三：1つ置くと「両はしが開いた四」になる空き j（その j が黒の禁じ手でないこと）
      let three = false;
      for (let j = 1; j <= 9 && !three; j++) {
        if (a[j] !== 0) continue;
        a[j] = 1;
        let s2 = 5, e2 = 5; while (s2 > 0 && a[s2 - 1] === 1) s2--; while (e2 < 10 && a[e2 + 1] === 1) e2++;
        const inRun = j >= s2 && j <= e2;
        const straight = inRun && e2 - s2 + 1 === 4 && s2 >= 2 && e2 <= 8 && a[s2 - 1] === 0 && a[e2 + 1] === 0 && (!exact || (a[s2 - 2] !== 1 && a[e2 + 2] !== 1));
        a[j] = 0;
        if (!straight) continue;
        if (rule === 'renju' && k === BLACK && depth < 3 && isForbidden(b, n, v.id[j], depth + 1)) continue;
        three = true;
      }
      if (three) res.threes++;
    }
    b[cell] = was;
    if (rule === 'renju' && k === BLACK && !res.five) res.forb = res.over ? 'over' : res.fours >= 2 ? 'four' : res.threes >= 2 ? 'three' : null;
    return res;
  }
  // 連珠ふうの黒の禁じ手か（'over' 長連・'four' 四四・'three' 三三）。空きマスだけ。そうでなければ null
  function isForbidden(b, n, cell, depth) {
    if (b[cell] !== 0) return null;
    return analyzeMove(b, n, cell, BLACK, 'renju', depth).forb;
  }

  // ---------- 探索用の盤（窓ごとの石の数を持ち、置く・戻すが軽い） ----------
  // T：窓（5マス）に同じ色の石が x 個だけあるときの点
  const WT = [0, 1, 7, 55, 620, 100000];
  function mkPos(st) {
    const n = st.n, g = geo(n), W = g.wins.length;
    const P = { g, n, N: g.N, rule: st.rule, b: new Int8Array(g.N), c: [null, new Uint8Array(W), new Uint8Array(W)], nr: new Uint8Array(g.N), cnt: 0, sc: 0,
      L: [null, { 3: [], 4: [] }, { 3: [], 4: [] }], ix: [null, new Int16Array(W).fill(-1), new Int16Array(W).fill(-1)], f5: [0, 0, 0], ply: 0 };
    for (let i = 0; i < g.N; i++) if (st.b[i]) put(P, i, st.b[i]);
    return P;
  }
  function listSet(P, k, w, cls, on) {
    if (cls !== 3 && cls !== 4) return;
    const arr = P.L[k][cls], ix = P.ix[k];
    if (on) { ix[w] = arr.length; arr.push(w); }
    else { const i = ix[w], last = arr.pop(); if (last !== w) { arr[i] = last; ix[last] = i; } ix[w] = -1; }
  }
  function winUpdate(P, k, w, delta) {
    const c1 = P.c[1], c2 = P.c[2];
    const o1 = c2[w] === 0 ? c1[w] : 0, o2 = c1[w] === 0 ? c2[w] : 0;
    if (k === 1) c1[w] += delta; else c2[w] += delta;
    const n1 = c2[w] === 0 ? c1[w] : 0, n2 = c1[w] === 0 ? c2[w] : 0;
    if (n1 !== o1) { P.sc += WT[n1] - WT[o1]; listSet(P, 1, w, o1, false); listSet(P, 1, w, n1, true); if (o1 === 5) P.f5[1]--; if (n1 === 5) P.f5[1]++; }
    if (n2 !== o2) { P.sc -= WT[n2] - WT[o2]; listSet(P, 2, w, o2, false); listSet(P, 2, w, n2, true); if (o2 === 5) P.f5[2]--; if (n2 === 5) P.f5[2]++; }
  }
  function put(P, cell, k) {
    P.b[cell] = k; P.cnt++;
    const ws = P.g.winsOf[cell]; for (let i = 0; i < ws.length; i++) winUpdate(P, k, ws[i], 1);
    const nb = P.g.nb2[cell]; for (let i = 0; i < nb.length; i++) P.nr[nb[i]]++;
  }
  function take(P, cell) {
    const k = P.b[cell]; P.b[cell] = 0; P.cnt--;
    const ws = P.g.winsOf[cell]; for (let i = 0; i < ws.length; i++) winUpdate(P, k, ws[i], -1);
    const nb = P.g.nb2[cell]; for (let i = 0; i < nb.length; i++) P.nr[nb[i]]--;
  }
  // k が次の1手で五をつくれるマス（rule どおりに確かめる）
  function completions(P, k) {
    const L4 = P.L[k][4]; if (!L4.length) return [];
    const out = [], wins = P.g.wins, exact = exactOf(P.rule, k);
    for (let i = 0; i < L4.length; i++) {
      const w = wins[L4[i]];
      for (let j = 0; j < 5; j++) {
        const c = w[j];
        if (P.b[c] !== 0 || out.indexOf(c) >= 0) continue;
        if (exact || P.rule !== 'free') { P.b[c] = k; const ok = !!winLine(P.b, P.n, c, k, P.rule); P.b[c] = 0; if (!ok) continue; }
        out.push(c);
      }
    }
    return out;
  }
  // k が置くと四になるかもしれないマス（3つ＋空き2つの窓の空き）
  function fourCells(P, k) {
    const L3 = P.L[k][3], out = [], wins = P.g.wins;
    for (let i = 0; i < L3.length; i++) { const w = wins[L3[i]]; for (let j = 0; j < 5; j++) { const c = w[j]; if (P.b[c] === 0 && out.indexOf(c) < 0) out.push(c); } }
    return out;
  }
  const bannedFor = (P, cell, k) => P.rule === 'renju' && k === BLACK && !!isForbidden(P.b, P.n, cell, 0);

  // ---------- 連続四（VCF）：k が四だけをつないで勝てるか ----------
  // depth：k が置ける手の数（最後の五を含む）。勝てるなら最初の手のマス、なければ -1。ctx.nodes で探索量を数え、ctx.cap を超えたら打ち切る（ctx.cut = true）
  function vcfRoot(P, k, depth, ctx, all) {
    const c0 = completions(P, k);
    if (c0.length) return all ? [c0[0]] : c0[0];
    if (depth <= 1) return all ? [] : -1;
    const o = opp(k), oc = completions(P, o);
    if (oc.length >= 2) return all ? [] : -1;
    const cands = oc.length === 1 ? [oc[0]] : fourCells(P, k), wins = [];
    for (const m of cands) {
      if (ctx.cut) break;
      if (vcfTry(P, k, m, depth, ctx)) { if (!all) return m; wins.push(m); }
    }
    return all ? wins : -1;
  }
  // k が m に置く（四をつくる）→ 相手はとめるしかない → その先も連続四で勝てるか
  function vcfTry(P, k, m, depth, ctx) {
    ctx.nodes++; if (ctx.nodes > ctx.cap) { ctx.cut = true; return false; }
    if (P.b[m] !== 0) return false;
    if (bannedFor(P, m, k)) return false;
    const o = opp(k);
    put(P, m, k);
    let win = false;
    if (winLine(P.b, P.n, m, k, P.rule)) win = true;
    else {
      const mc = completions(P, k);
      if (mc.length && !completions(P, o).length) {
        if (mc.length >= 2) win = depth >= 2;
        else if (depth >= 3) {
          const c = mc[0];
          put(P, c, o);
          if (!winLine(P.b, P.n, c, o, P.rule)) win = vcfRoot(P, k, depth - 1, ctx, false) >= 0;
          take(P, c);
        }
      }
    }
    take(P, m);
    return win;
  }
  // 最短の連続四：{ moves: 手数, first: [その手数で勝てる最初の手…], line: ひとつの手順（黒白交互のマス） }。depth 手までに勝てなければ null
  function vcfShortest(st, k, maxDepth, cap) {
    const P = mkPos(st);
    for (let d = 1; d <= maxDepth; d++) {
      const ctx = { nodes: 0, cap: cap || 2e6, cut: false };
      const first = vcfRoot(P, k, d, ctx, true);
      if (ctx.cut) return null;
      if (first.length) return { moves: d, first, line: vcfLine(P, k, first[0], d) };
    }
    return null;
  }
  // 手順をひとつ作る（最初の手から、相手のとめる手をはさんで最後の五まで）
  function vcfLine(P, k, first, depth) {
    const line = [], o = opp(k), put0 = [];
    let m = first, d = depth;
    for (let guard = 0; guard < 20; guard++) {
      if (m < 0) break;
      put(P, m, k); put0.push(m); line.push(m);
      if (winLine(P.b, P.n, m, k, P.rule)) break;
      const mc = completions(P, k);
      if (!mc.length) break;
      const c = mc[0];
      put(P, c, o); put0.push(c); line.push(c);
      d--;
      if (mc.length >= 2) { // 五をつくる（どのマスでもよい）
        const mc2 = completions(P, k); if (mc2.length) { line.push(mc2[0]); } break;
      }
      m = vcfRoot(P, k, d, { nodes: 0, cap: 2e6, cut: false }, false);
    }
    for (let i = put0.length - 1; i >= 0; i--) take(P, put0[i]);
    return line;
  }

  // ---------- 状態 ----------
  function create(o) {
    o = o || {};
    const n = SIZES.indexOf(o.n) >= 0 ? o.n : 15, rule = RULES.indexOf(o.rule) >= 0 ? o.rule : 'free';
    return { v: 1, n, rule, b: new Array(n * n).fill(0), turn: BLACK, moves: [], over: false, winner: 0, line: [], first: BLACK, seed: (o.seed >>> 0) || 0 };
  }
  const clone = st => JSON.parse(JSON.stringify(st));
  const inBoard = (st, cell) => Number.isInteger(cell) && cell >= 0 && cell < st.n * st.n;
  // 黒の禁じ手のマスの一覧（連珠ふうのときだけ。黒の番でなくても、「いま黒が置いたら」の一覧）。遠いマスは調べない
  function forbiddenCells(st) {
    if (st.rule !== 'renju' || st.over) return [];
    const g = geo(st.n), b = st.b, out = [];
    const near = new Uint8Array(g.N);
    for (let i = 0; i < g.N; i++) if (b[i]) { const nb = g.nb2[i]; for (let j = 0; j < nb.length; j++) near[nb[j]] = 1; }
    for (let i = 0; i < g.N; i++) if (!b[i] && near[i] && isForbidden(b, st.n, i, 0)) out.push(i);
    return out;
  }
  const forbiddenReason = (st, cell) => (st.rule === 'renju' && st.b[cell] === 0 ? isForbidden(st.b, st.n, cell, 0) : null);
  const isLegal = (st, cell) => !st.over && inBoard(st, cell) && st.b[cell] === 0 && !(st.rule === 'renju' && st.turn === BLACK && isForbidden(st.b, st.n, cell, 0));
  function legal(st) {
    if (st.over) return [];
    const out = [], fb = st.rule === 'renju' && st.turn === BLACK ? new Set(forbiddenCells(st)) : null;
    for (let i = 0; i < st.n * st.n; i++) if (!st.b[i] && !(fb && fb.has(i))) out.push(i);
    return out;
  }
  function counts(st) { let b = 0, w = 0; for (const v of st.b) { if (v === BLACK) b++; else if (v === WHITE) w++; } return { b, w, e: st.n * st.n - b - w }; }
  function result(st) { const c = counts(st); return { b: c.b, w: c.w, e: c.e, winner: st.winner || 0, line: st.line || [], moves: st.moves.length, draw: !!st.over && !st.winner }; }
  // 置く。できなければ null。できれば出来事 [{ t:'mv', c, k }, { t:'end', w, line }?]
  function play(st, cell) {
    if (!isLegal(st, cell)) return null;
    const k = st.turn;
    st.b[cell] = k; st.moves.push([cell, k]);
    const ev = [{ t: 'mv', c: cell, k }];
    const line = winLine(st.b, st.n, cell, k, st.rule);
    if (line) { st.over = true; st.winner = k; st.line = line; ev.push({ t: 'end', w: k, line }); }
    else if (st.moves.length >= st.n * st.n) { st.over = true; st.winner = 0; ev.push({ t: 'end', w: 0, line: [] }); }
    else st.turn = opp(k);
    return ev;
  }
  // 手の列から作り直す（もどす・つづきから）。反則の手があれば null
  function replay(n, rule, list, seed) {
    const st = create({ n, rule, seed });
    for (const m of list) { if (st.over || !play(st, m[0])) return null; }
    return st;
  }
  function rewind(st, len) { return replay(st.n, st.rule, st.moves.slice(0, Math.max(0, len)), st.seed); }
  // 盤の文字（0・1・2 の並び）や行ごとの文字から、状態をつくる（オンライン・パズル・テスト用）
  function fromBoard(n, cells, turn, rule) {
    const st = create({ n, rule }); st.b = Array.from({ length: n * n }, (x, i) => +cells[i] || 0); st.turn = turn === WHITE ? WHITE : BLACK;
    return st;
  }
  // 'x'（黒）'o'（白）'.'（空き）の行から状態をつくる（テスト用）
  function fromRows(rows, turn, rule) {
    const n = rows.length, b = [];
    for (const row of rows) for (const ch of row) b.push(ch === 'x' ? 1 : ch === 'o' ? 2 : 0);
    const st = create({ n, rule: rule || 'free' }); st.b = b; st.turn = turn === 2 ? 2 : 1;
    return st;
  }

  // ---------- 名前 ----------
  const name = (cell, n) => (cell < 0 ? 'pass' : COLS[cell % (n || 15)] + ((n || 15) - Math.floor(cell / (n || 15))));
  function parse(s, n) {
    n = n || 15;
    const m = /^([a-o])(\d{1,2})$/.exec(String(s).toLowerCase());
    if (!m) return -1;
    const c = COLS.indexOf(m[1]), r = n - +m[2];
    return c < n && r >= 0 && r < n ? r * n + c : -1;
  }

  // ---------- 種（局面から決まる。乱数のかわり） ----------
  function hash32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const seedOf = (st, level) => hash32(st.b.join('') + ':' + st.turn + ':' + st.moves.length + ':' + level + ':' + (st.seed | 0) + ':' + st.rule);

  // ---------- 手の並べ替え（石の形の点） ----------
  const AT = [1, 5, 22, 150, 4000], DF = [0, 3, 14, 100, 3500];
  // 窓の点だけの軽い見積もり（探索の中で使う）
  function heur(P, cell, k) {
    const o = opp(k), ws = P.g.winsOf[cell], ck = P.c[k], co = P.c[o];
    let s = 0;
    for (let i = 0; i < ws.length; i++) { const w = ws[i], a = ck[w], d = co[w]; if (d === 0) s += AT[a]; if (a === 0) s += DF[d]; }
    return s;
  }
  // 形の点（analyzeMove の結果から）：大きいほど強い狙い
  function tacticScore(r) {
    if (r.five) return 1e7;
    if (r.forb) return -1;
    if (r.open4 || r.fours >= 2 || (r.fours >= 1 && r.threes >= 1)) return 1e6;
    if (r.threes >= 2) return 2e5;
    if (r.fours === 1) return 6e3;
    if (r.threes === 1) return 4e3;
    return 0;
  }
  // 手の候補を点の高い順に（近くに石があるマスだけ）。limit 個まで
  function candidates(P, k, limit) {
    const g = P.g, list = [];
    if (P.cnt === 0) return [g.center];
    for (let i = 0; i < g.N; i++) if (P.b[i] === 0 && P.nr[i] > 0) list.push([i, heur(P, i, k)]);
    list.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return list.slice(0, limit || list.length).map(x => x[0]);
  }
  // 1手読みの点：自分がそこに置く形の点 ＋ 相手がそこに置く形の点（ふせぐ） ＋ 窓の点
  function rankMoves(P, k, limit, wide) {
    const o = opp(k), pre = candidates(P, k, wide || 18), out = [];
    for (const c of pre) {
      if (bannedFor(P, c, k)) continue;
      const mine = analyzeMove(P.b, P.n, c, k, P.rule), his = analyzeMove(P.b, P.n, c, o, P.rule);
      const ts = tacticScore(mine), td = his.forb ? 0 : tacticScore(his);
      out.push({ c, s: ts + 0.92 * td + heur(P, c, k), mine, his, ts, td });
    }
    out.sort((a, b) => b.s - a.s || a.c - b.c);
    return limit ? out.slice(0, limit) : out;
  }

  // ---------- アルファベータ ----------
  const WINV = 1e6;
  function evalFor(P, k) { return k === BLACK ? P.sc : -P.sc; }
  // k の番。手の数 ply だけ進んでいる。負けのほうが「遅い」ほど、勝ちは「早い」ほど高い
  function ab(P, k, depth, alpha, beta, ply, ctx, ext) {
    ctx.nodes++;
    if ((ctx.nodes & 127) === 0 && (ctx.nodes > ctx.cap || (ctx.until && Date.now() > ctx.until))) ctx.cut = true;
    if (ctx.cut) return 0;
    if (P.cnt >= P.N) return 0;
    const o = opp(k);
    if (completions(P, k).length) return WINV - ply;
    const oc = completions(P, o);
    let list;
    if (oc.length >= 2) return -(WINV - ply - 1);
    if (oc.length === 1) { if (bannedFor(P, oc[0], k)) return -(WINV - ply - 1); list = [oc[0]]; }
    else {
      if (depth <= 0) return evalFor(P, k);
      const wide = ctx.width[Math.min(ctx.width.length - 1, ply)];
      list = candidates(P, k, wide + 6);
      if (list.length > wide) list.length = wide;
    }
    if (oc.length === 1 && depth <= 0 && ext <= 0) return evalFor(P, k);
    let best = -1e9;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (oc.length !== 1 && bannedFor(P, c, k)) continue;
      put(P, c, k);
      let v;
      if (winLine(P.b, P.n, c, k, P.rule)) v = WINV - ply;
      else v = -ab(P, o, depth - 1, -beta, -alpha, ply + 1, ctx, oc.length === 1 ? ext - 1 : ext);
      take(P, c);
      if (ctx.cut) return 0;
      if (v > best) { best = v; if (v > alpha) { alpha = v; if (alpha >= beta) break; } }
    }
    return best === -1e9 ? evalFor(P, k) : best;
  }

  // ---------- 攻めの探索（四と活三を使う。守りは「その三をこわす手」と相手の四）----------
  function vctRoot(P, k, depth, ctx) {
    const c0 = completions(P, k); if (c0.length) return c0[0];
    if (depth <= 0 || ctx.cut) return -1;
    const o = opp(k), oc = completions(P, o);
    if (oc.length >= 2) return -1;
    let cands;
    if (oc.length === 1) cands = [oc[0]];
    else {
      const pre = candidates(P, k, 40), set = [];
      for (const c of pre) { if (bannedFor(P, c, k)) continue; const r = analyzeMove(P.b, P.n, c, k, P.rule); if (r.five || r.fours || r.threes) set.push([c, tacticScore(r)]); }
      set.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      cands = set.slice(0, 8).map(x => x[0]);
    }
    for (const m of cands) {
      ctx.nodes++; if (ctx.nodes > ctx.cap) { ctx.cut = true; return -1; }
      if (vctTry(P, k, m, depth, ctx)) return m;
    }
    return -1;
  }
  function vctTry(P, k, m, depth, ctx) {
    if (P.b[m] !== 0 || bannedFor(P, m, k)) return false;
    const o = opp(k), r = analyzeMove(P.b, P.n, m, k, P.rule);
    put(P, m, k);
    let win = false;
    if (r.five) win = true;
    else if (!completions(P, o).length) {
      const mc = completions(P, k);
      if (mc.length >= 2) win = true;
      else if (mc.length === 1) {   // 四：とめるしかない
        const c = mc[0]; put(P, c, o);
        if (!winLine(P.b, P.n, c, o, P.rule)) win = vctRoot(P, k, depth - 1, ctx) >= 0;
        take(P, c);
      } else if (r.threes && depth >= 2) win = threatDefended(P, k, m, depth, ctx);   // 三：守りの手はぜんぶ試す
    }
    take(P, m);
    return win;
  }
  // 三をつくった手 m（盤には置いてある）：相手がどこに置いても、そのあとも攻めで勝てるか
  function threatDefended(P, k, m, depth, ctx) {
    const o = opp(k), mr = (m / P.n) | 0, mc = m % P.n, defs = new Set();
    // 守りの手：m を通る4方向の ±4 の空きマスと、相手が四をつくれるマス
    for (let d = 0; d < 4; d++) for (let j = -4; j <= 4; j++) {
      const rr = mr + DIRS[d][0] * j, cc = mc + DIRS[d][1] * j;
      if (rr < 0 || rr >= P.n || cc < 0 || cc >= P.n) continue;
      const i = rr * P.n + cc; if (P.b[i] === 0) defs.add(i);
    }
    for (const c of fourCells(P, o)) defs.add(c);
    if (defs.size > 30) return false;
    for (const d of defs) {
      ctx.nodes++; if (ctx.nodes > ctx.cap) { ctx.cut = true; return false; }
      put(P, d, o);
      const ok = winLine(P.b, P.n, d, o, P.rule) ? false : vctRoot(P, k, depth - 1, ctx) >= 0;
      take(P, d);
      if (!ok) return false;
    }
    return true;
  }

  // ---------- CPU ----------
  // opts：{ time（ミリ秒。0 なら時間では切らない）, nodes（探索量の上限。時間で切るときの保険）, depth }
  const LEVEL = {
    3: { time: 140, nodes: 40000, depth: 6, width: [10, 8, 6, 5, 4, 4], vcf: 5, safe: 4, vct: 0, cand: 8 },
    4: { time: 380, nodes: 220000, depth: 8, width: [12, 9, 7, 6, 5, 4, 4, 3], vcf: 9, safe: 7, vct: 3, cand: 10 },
  };
  const ownTime = (o, d) => (o && o.time !== undefined ? o.time : d);
  const ownNodes = (o, d) => (o && o.nodes !== undefined ? o.nodes : d);

  // 手を決める。{ cell, why, v?, ... } を返す（置けないとき null）
  function think(st, level, opts) {
    level = Math.max(1, Math.min(4, level | 0 || 2));
    if (st.over) return null;
    const P = mkPos(st), k = st.turn, o = opp(k);
    if (P.cnt === 0) return { cell: P.g.center, why: 'open' };
    const leg = legal(st);
    if (!leg.length) return null;
    const rnd = rng(seedOf(st, level));
    const mc = completions(P, k);
    if (mc.length) return { cell: mc[0], why: 'five' };
    const oc = completions(P, o);
    if (oc.length) { const cell = oc.find(c => leg.indexOf(c) >= 0); if (cell != null) return { cell, why: 'block' }; return { cell: leg[0], why: 'lost' }; }
    // 2手目：真ん中のまわり
    if (P.cnt === 1) { const c0 = st.moves[0][0], nb = P.g.nb1[c0].filter(c => !st.b[c]); return { cell: nb[Math.floor(rnd() * nb.length)], why: 'open' }; }

    if (level === 1) {
      // 相手の「勝ちになる形」をつくるマスをとめる（半分の確率）。そうでなければ石の近くのでたらめ
      const pre = candidates(P, k, 30), kill = [], build = [];
      for (const c of pre) {
        if (bannedFor(P, c, k)) continue;
        const his = analyzeMove(P.b, P.n, c, o, P.rule), mine = analyzeMove(P.b, P.n, c, k, P.rule);
        if (!his.forb && tacticScore(his) >= 1e6) kill.push(c);
        if (tacticScore(mine) >= 1e6) build.push(c);
      }
      if (build.length && rnd() < 0.6) return { cell: build[Math.floor(rnd() * build.length)], why: 'build' };
      if (kill.length && rnd() < 0.55) return { cell: kill[Math.floor(rnd() * kill.length)], why: 'kill' };
      const near = pre.filter(c => leg.indexOf(c) >= 0), base = near.length ? near : leg;
      // 直前の相手の石のそばを選びやすく
      const last = st.moves.length ? st.moves[st.moves.length - 1][0] : -1, close = last >= 0 ? base.filter(c => P.g.nb1[last].indexOf(c) >= 0) : [];
      const pickFrom = close.length && rnd() < 0.7 ? close : base;
      return { cell: pickFrom[Math.floor(rnd() * pickFrom.length)], why: 'rand' };
    }

    if (level === 2) {
      const rk = rankMoves(P, k, 6, 16);
      if (!rk.length) return { cell: leg[0], why: 'any' };
      const top = rk[0].s, set = rk.filter(x => x.s >= top * 0.97 - 2);
      return { cell: set[Math.floor(rnd() * set.length)].c, why: 'score', v: top };
    }

    const L = LEVEL[level], time = ownTime(opts, L.time), capN = ownNodes(opts, L.nodes), maxD = (opts && opts.depth) || L.depth;
    const until = time > 0 ? Date.now() + time : 0;
    const ctxBase = () => ({ nodes: 0, cap: capN, cut: false, until });
    // 1. 連続四で勝てる
    { const ctx = ctxBase(); ctx.cap = Math.min(capN, 60000); const m = vcfRoot(P, k, L.vcf, ctx, false); if (m >= 0) return { cell: m, why: 'vcf' }; }
    // 2. 攻めの探索（四と活三）
    if (L.vct) { const ctx = ctxBase(); ctx.cap = Math.min(capN, 30000); const m = vctRoot(P, k, L.vct, ctx); if (m >= 0 && !ctx.cut && leg.indexOf(m) >= 0) return { cell: m, why: 'vct' }; }
    // 3. 候補を点順に並べ、相手に連続四で勝たれる手は除く。残りをアルファベータで比べる
    const rk = rankMoves(P, k, L.cand + 4, 22);
    if (!rk.length) return { cell: leg[0], why: 'any' };
    const safe = [];
    for (const r of rk) {
      if (r.mine.five) return { cell: r.c, why: 'five' };
      put(P, r.c, k);
      const ctx = ctxBase(); ctx.cap = Math.min(capN, 20000);
      const lose = vcfRoot(P, o, L.safe, ctx, false) >= 0;
      take(P, r.c);
      if (!lose) safe.push(r);
    }
    const pool = (safe.length ? safe : rk).slice(0, L.cand);
    // 反復深化：深さ 1 から。途中で切れたら、最後まで読み終えた深さの結果
    let bestList = pool.map(r => ({ c: r.c, v: r.s / 1000 })), done = 0;
    for (let d = 2; d <= maxD; d++) {
      const ctx = ctxBase(); ctx.width = L.width;
      const scored = []; let alpha = -1e9; const tolR = level === 3 ? 12 : 0;
      for (const r of (done ? bestList.slice() : pool.map(x => ({ c: x.c, v: x.s })))) {
        put(P, r.c, k);
        let v;
        if (winLine(P.b, P.n, r.c, k, P.rule)) v = WINV;
        else v = -ab(P, o, d - 1, -1e9, -(alpha - tolR - 1), 1, ctx, 2);
        take(P, r.c);
        if (ctx.cut) break;
        scored.push({ c: r.c, v }); if (v > alpha) alpha = v;
      }
      if (ctx.cut || scored.length < (done ? bestList.length : pool.length)) break;
      scored.sort((a, b) => b.v - a.v || a.c - b.c); bestList = scored; done = d;
      if (scored[0].v >= WINV - 50) break;
      if (until && Date.now() > until) break;
    }
    const top = bestList[0].v, tol = level === 3 ? 12 : 0;
    const set = bestList.filter(x => x.v >= top - tol).map(x => x.c);
    return { cell: set[Math.floor(rnd() * set.length)], why: 'search', v: top, depth: done, ties: set };
  }
  function cpu(st, level, opts) { const t = think(st, level, opts); return t ? t.cell : null; }
  // ヒント（いちばん強い読みで）。{ cell, why, ... }
  function best(st, level, opts) { return think(st, level || 4, opts); }
  // 時間切れのとき：いちばんよわい CPU のように
  const auto = st => cpu(st, 1);

  // ---------- 毎日のパズル ----------
  // 登録簿のパズル集（gomoku/puzzles.js が作る）から、種で5問えらぶ。やさしい順。
  function dailySet(seed, bank, count) {
    count = count || 5;
    const list = (bank && bank.list) || [];
    if (!list.length) return [];
    const tiers = []; for (let t = 0; t < count; t++) tiers.push([]);
    for (let i = 0; i < list.length; i++) tiers[Math.min(count - 1, Math.floor(i * count / list.length))].push(i);
    const rnd = rng(hash32('gomoku:daily:' + seed)), out = [];
    for (let t = 0; t < count; t++) { const T = tiers[t]; out.push(T[Math.floor(rnd() * T.length)]); }
    return out;
  }
  const puzzlePoints = ok => (ok ? 200 : 0);
  // パズル 1 問を st にする。p = { b: 盤（n*n 文字）, n: 盤の大きさ, m: 手数, s: [手順のマス…] }
  function fromPuzzle(p) {
    const n = p.n || 15, st = create({ n, rule: 'free' });
    for (let i = 0; i < n * n; i++) st.b[i] = +p.b[i];
    st.turn = BLACK; st.puzzle = true;
    return st;
  }
  // パズルの途中の手：黒が cell に置いて、あと left 手（この手を含む）で勝てるか。
  //   { ok, won（五ができた）, reply（白のとめた手。なければ -1）, left（残り） }
  function puzzleStep(st, cell, left) {
    if (st.over || st.turn !== BLACK || !isLegal(st, cell)) return { ok: false };
    const P = mkPos(st), k = BLACK, o = WHITE;
    const c0 = completions(P, k);
    if (c0.length) {                                   // 五をつくれる局面：五をつくる手だけが正解
      if (c0.indexOf(cell) < 0) return { ok: false };
      play(st, cell); return { ok: true, won: true, reply: -1, left: 0 };
    }
    if (left <= 1) return { ok: false };
    const oc = completions(P, o);
    const ctx = { nodes: 0, cap: 4e5, cut: false };
    if (oc.length >= 2) return { ok: false };
    if (!vcfTry(P, k, cell, left, ctx)) return { ok: false };
    play(st, cell);
    const P2 = mkPos(st), mc = completions(P2, k);
    const reply = mc[0];
    play(st, reply);
    return { ok: true, won: false, reply, left: left - 1 };
  }

  const API = {
    EMPTY, BLACK, WHITE, DIRS, SIZES, RULES, geo, create, clone, legal, isLegal, play, replay, rewind, counts, result, name, parse, fromBoard, fromRows,
    forbiddenCells, forbiddenReason, isForbidden, analyzeMove, winLine, cpu, think, best, auto, hash32, rng, seedOf, dailySet, puzzlePoints, fromPuzzle, puzzleStep,
    vcfShortest, mkPos, put, take, completions, fourCells, vcfRoot, vcfTry, vctRoot, rankMoves, exactOf, opp, LEVEL,
  };
  root.GomokuEngine = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
