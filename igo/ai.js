// 囲碁工房：CPU（外部のライブラリ・学習済みモデルなし。ぜんぶ自作）
// ---------------------------------------------------------------------------------------------------------------------
// ・Board       … 探索用の速い盤（まわりに壁をつけた Int8Array）。取り・コウ・自殺手・目の検出・シチョウの読み。
// ・Search      … モンテカルロ木探索（UCT ＋ RAVE ＋ 手の事前の重み）。プレイアウトは軽い方針（あたり・取り・逃げ・ハネ・ツケのパターン）で、
//                 自分の目はつぶさず、自己あたりを避ける。時間（ms）か反復回数で止める。step() で少しずつ進められる（Worker なしの時間割り用）。
// ・choose()    … 強さ 1〜5 に応じた1手（座標・パスか）。1＝あたりを見落とす初心者、2＝ごく浅い探索、3〜5＝時間 250・500・800 ms。
// ・suggestDead() … 2回パスのあと、プレイアウトで石の「生き死に」を見積もる（死に石の自動提案）。
// ・analyze()   … ヒントの理由（取る・守る・あたり・隅・つなぐ…）。
// DOM は使わない。node でも Worker でも動く。
(function (root) {
  'use strict';
  const E = root.IgoEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // ---------------------------------------------------------------- 速い盤
  class Board {
    constructor(n) {
      this.n = n; const W = this.W = n + 2; this.N = n * n;
      this.c = new Int8Array(W * W); this.emp = new Int16Array(n * n); this.epos = new Int16Array(W * W).fill(-1); this.ne = 0;
      this.sm = new Int32Array(W * W); this.lm = new Int32Array(W * W); this.stamp = 0; this.buf = new Int16Array(n * n + 4); this.gn = 0;
      this.ko = -1; this.turn = 1; this.last = -1; this.moves = 0; this.passes = 0; this.caps = [0, 0, 0];
      this.dirs = [-W, -1, 1, W]; this.diag = [-W - 1, -W + 1, W - 1, W + 1];
      for (let i = 0; i < W * W; i++) { const r = (i / W) | 0, c = i % W; if (r === 0 || c === 0 || r === W - 1 || c === W - 1) this.c[i] = 3; }
    }
    static fromState(st) {
      const B = new Board(st.n), n = st.n;
      for (let i = 0; i < n * n; i++) { const p = B.toP(i); if (st.b[i]) B.c[p] = st.b[i]; else B.addEmpty(p); }
      B.turn = st.turn; B.ko = st.ko >= 0 ? B.toP(st.ko) : -1; B.caps = st.caps.slice();
      B.moves = st.moves.length; B.passes = st.passes || 0;
      const lm = st.moves[st.moves.length - 1]; B.last = lm && lm[0] >= 0 ? B.toP(lm[0]) : -1;
      return B;
    }
    toP(i) { const n = this.n; return ((i / n) | 0) * this.W + this.W + 1 + (i % n); }
    toI(p) { const W = this.W; return ((p / W) | 0) * this.n - this.n + (p % W) - 1; }
    copyFrom(o) { this.c.set(o.c); this.emp.set(o.emp); this.epos.set(o.epos); this.ne = o.ne; this.ko = o.ko; this.turn = o.turn; this.last = o.last; this.moves = o.moves; this.passes = o.passes; this.caps[1] = o.caps[1]; this.caps[2] = o.caps[2]; }
    clone() { const b = new Board(this.n); b.copyFrom(this); return b; }
    addEmpty(p) { this.epos[p] = this.ne; this.emp[this.ne++] = p; }
    delEmpty(p) { const i = this.epos[p], l = this.emp[--this.ne]; this.emp[i] = l; this.epos[l] = i; this.epos[p] = -1; }
    // p の石のつながりを buf に集める。戻り値は呼吸点の数。max>0 なら、max 個見つかった時点でやめる（buf は途中まで）
    group(p, max) {
      const c = this.c, col = c[p], buf = this.buf, sm = this.sm, lm = this.lm, d = this.dirs, s = ++this.stamp;
      let n = 1, libs = 0; buf[0] = p; sm[p] = s;
      for (let k = 0; k < n; k++) {
        const q = buf[k];
        for (let j = 0; j < 4; j++) {
          const r = q + d[j], v = c[r];
          if (v === 0) { if (lm[r] !== s) { lm[r] = s; libs++; if (max > 0 && libs >= max) { this.gn = n; return libs; } } }
          else if (v === col && sm[r] !== s) { sm[r] = s; buf[n++] = r; }
        }
      }
      this.gn = n; return libs;
    }
    // 打つ。戻り値：取った石の数、できない手は -1
    play(p, color) {
      const c = this.c; if (c[p] !== 0 || p === this.ko) return -1;
      const opp = 3 - color, d = this.dirs; c[p] = color; let cap = 0, capP = -1;
      for (let j = 0; j < 4; j++) {
        const q = p + d[j];
        if (c[q] === opp && this.group(q, 0) === 0) { const k = this.gn; for (let i = 0; i < k; i++) { const s = this.buf[i]; c[s] = 0; this.addEmpty(s); capP = s; } cap += k; }
      }
      const libs = this.group(p, 0);
      if (!libs) { c[p] = 0; return -1; }
      this.ko = cap === 1 && this.gn === 1 && libs === 1 ? capP : -1;
      this.delEmpty(p); this.last = p; this.turn = opp; this.moves++; this.passes = 0; this.caps[color] += cap;
      return cap;
    }
    pass() { this.turn = 3 - this.turn; this.ko = -1; this.last = -1; this.moves++; this.passes++; }
    // 打てるか（自殺手・コウ・うまっている）
    legal(p, color) {
      const c = this.c; if (c[p] !== 0 || p === this.ko) return false;
      const d = this.dirs, opp = 3 - color;
      for (let j = 0; j < 4; j++) {
        const v = c[p + d[j]];
        if (v === 0) return true;
        if (v === color) { if (this.group(p + d[j], 2) >= 2) return true; }
        else if (v === opp) { if (this.group(p + d[j], 2) === 1) return true; }
      }
      return false;
    }
    // 自分の目（まわりが自分の石か壁で、ななめが敵に食われていない）
    isEye(p, color) {
      const c = this.c, d = this.dirs; let bc = 0;
      for (let j = 0; j < 4; j++) { const v = c[p + d[j]]; if (v === 3) bc++; else if (v !== color) return false; }
      let bad = 0; const g = this.diag;
      for (let j = 0; j < 4; j++) { const v = c[p + g[j]]; if (v === 3) { /* 壁 */ } else if (v === 3 - color) bad++; }
      return bc > 0 ? bad === 0 : bad <= 1;
    }
    // p に color が打ったらどうなるか：{ cap, libs, size }（盤はもとにもどす）。打てなければ null
    sim(p, color) {
      const c = this.c; if (c[p] !== 0) return null;
      const opp = 3 - color, d = this.dirs; c[p] = color; let cap = 0; const rem = [];
      for (let j = 0; j < 4; j++) {
        const q = p + d[j];
        if (c[q] === opp && this.group(q, 0) === 0) { const k = this.gn; for (let i = 0; i < k; i++) { const s = this.buf[i]; rem.push(s); c[s] = 0; } cap += k; }
      }
      const libs = this.group(p, 0), size = this.gn;
      for (const s of rem) c[s] = opp;
      c[p] = 0;
      return libs ? { cap, libs, size } : null;
    }
    // 最後の手を中心とした局面の「まわり」（8方向）
    around(p) { const d = this.dirs, g = this.diag; return [p + d[0], p + d[1], p + d[2], p + d[3], p + g[0], p + g[1], p + g[2], p + g[3]]; }
    // 面積計算（Tromp-Taylor）。黒 − 白 の差（コミ込みの前）
    areaDiff() {
      const c = this.c, W = this.W, n = this.n; let b = 0, w = 0; const s = ++this.stamp, sm = this.sm, dd = this.dirs;
      for (let r = 1; r <= n; r++) for (let q = 1; q <= n; q++) {
        const p = r * W + q, v = c[p];
        if (v === 1) b++; else if (v === 2) w++;
        else if (sm[p] !== s) {
          let cnt = 1, bk = 0, wh = 0; sm[p] = s; const st = [p];
          for (let k = 0; k < st.length; k++) for (let j = 0; j < 4; j++) { const t = st[k] + dd[j], u = c[t]; if (u === 0) { if (sm[t] !== s) { sm[t] = s; st.push(t); cnt++; } } else if (u === 1) bk = 1; else if (u === 2) wh = 1; }
          if (bk && !wh) b += cnt; else if (wh && !bk) w += cnt;
        }
      }
      return b - w;
    }
  }

  // ---------------------------------------------------------------- 乱数
  function mkRng(seed) { let s = (seed >>> 0) || 0x9e3779b9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  // ---------------------------------------------------------------- シチョウ（梯子）
  // color の石 p のつながりが、シチョウで取られるか。呼吸点2で攻める側の番、または呼吸点1（あたり）で逃げる側の番、から読む。
  // 取られる（逃げられない）なら true。読みの上限を超えたら false（逃げられるとみなす）。逃げる側は、となりの敵をあたりで取れれば逃げたことにする
  function ladderWorks(B0, p, color) {
    const B = B0.clone(), att = 3 - color; let budget = 260;
    const libsOf = () => B.group(p, 0);
    const stones = () => Array.from(B.buf.subarray(0, B.gn));
    function attack(depth) {
      if (--budget < 0 || depth > 80) return false;
      if (B.c[p] !== color) return true;
      const l = libsOf(); if (l >= 3) return false; if (l <= 1) return true;
      const ls = []; for (const s of stones()) for (const d of B.dirs) { const q = s + d; if (B.c[q] === 0 && ls.indexOf(q) < 0) ls.push(q); }
      for (const a of ls) {
        const snap = B.clone(); B.turn = att; B.ko = -1;
        const r = B.play(a, att);
        if (r >= 0 && (B.group(a, 0) >= 2 || r > 0) && run(depth + 1)) return true;
        B.copyFrom(snap);
      }
      return false;
    }
    function run(depth) {
      if (--budget < 0 || depth > 80) return false;
      if (B.c[p] !== color) return true;
      const l = libsOf(); if (l >= 2) return l >= 3 ? false : attack(depth + 1); if (l === 0) return true;
      const st = stones();
      for (const s of st) for (const d of B.dirs) { const q = s + d; if (B.c[q] === att && B.group(q, 2) === 1) return false; }
      let lib = -1; for (const s of st) for (const d of B.dirs) if (B.c[s + d] === 0) lib = s + d;
      if (lib < 0) return true;
      B.turn = color; B.ko = -1;
      if (B.play(lib, color) < 0) return true;
      return attack(depth + 1);
    }
    const l = libsOf();
    return l === 1 ? run(0) : l === 2 ? attack(0) : false;
  }

  // ---------------------------------------------------------------- 手の見立て（方針・事前の重み・ヒントの理由）
  // 戻り値：{ cap, save, atari, selfAtari, hane, cut, ...}
  function features(B, p, color) {
    const opp = 3 - color, c = B.c, d = B.dirs, f = { cap: 0, save: 0, atari: 0, selfAtari: false, hane: false, cut: false, connect: false, edge: false, touch: 0, libs: 0 };
    // 自分のあたりの石を助けるか
    const mine = new Set(), theirs = new Set();
    for (let j = 0; j < 4; j++) {
      const q = p + d[j];
      if (c[q] === color) { const l = B.group(q, 0); if (l === 1) { f.save += B.gn; } mine.add(q); }
      else if (c[q] === opp) { const l = B.group(q, 0); if (l === 1) f.cap += B.gn; else if (l === 2) f.atari += B.gn; theirs.add(q); f.touch++; }
    }
    const sim = B.sim(p, color);
    if (!sim) { f.illegal = true; return f; }
    f.libs = sim.libs; f.size = sim.size;
    f.selfAtari = sim.libs === 1 && sim.cap === 0;
    if (!f.save || sim.libs < 2) f.save = f.save && sim.libs >= 2 ? f.save : 0;
    // ハネ・ツケ：敵の石に接していて、ななめに味方の石がある
    for (let j = 0; j < 4; j++) { const q = B.diag[j]; if (c[p + q] === color) { /* 味方がななめ */ f.connect = f.connect || mine.size === 0; } }
    if (f.touch) for (let j = 0; j < 4; j++) { const g = p + B.diag[j]; if (c[g] === color) { f.hane = true; } }
    // キリ：敵の石がななめの両側にあり、反対側に味方も敵もない
    const nbs = [c[p - B.W], c[p + 1], c[p + B.W], c[p - 1]];
    for (let j = 0; j < 4; j++) { const a = nbs[j], b2 = nbs[(j + 1) % 4]; if (a === opp && b2 === opp) { const g = p + [d[0] + d[2], d[2] + d[3], d[3] + d[1], d[1] + d[0]][j]; if (c[g] !== opp) f.cut = true; } }
    const n = B.n, i = B.toI(p), r = (i / n) | 0, col = i % n; f.edge = r === 0 || col === 0 || r === n - 1 || col === n - 1;
    return f;
  }
  // 方針の点数（高いほどよい手）。tactical:false なら、あたりなどの戦術を見ない（初心者の見落とし）
  function heur(B, p, color, ctx) {
    const f = features(B, p, color); if (f.illegal) return -1e9;
    ctx = ctx || {}; const n = B.n, i = B.toI(p), r = (i / n) | 0, col = i % n, mr = Math.min(r, n - 1 - r), mc = Math.min(col, n - 1 - col);
    let s = 0;
    if (ctx.tactical !== false) {
      s += f.cap * 12 + (f.save ? 10 + f.save * 3 : 0) + (f.atari ? 5 + Math.min(f.atari, 6) : 0);
      if (f.selfAtari) s -= 30 + f.size * 4;
      if (ctx.ladder && f.save && f.libs === 2) { const B2 = B.clone(); if (B2.play(p, color) >= 0 && ladderWorks(B2, p, color)) s -= 24; }
      if (ctx.ladder && f.atari && !f.cap) { /* あたりをかけて逃げられないシチョウなら加点 */ }
    }
    if (f.hane) s += 2.5; if (f.cut) s += 2; if (f.touch && !f.hane) s += 1;
    // 辺：1線はあまり打たない
    const ml = Math.min(mr, mc);
    if (ml === 0) s -= f.touch || f.cap || f.save ? 1 : 7; else if (ml === 1) s -= f.touch || f.cap || f.save ? 0 : 3;
    // はじめの数手：隅（三々・星・小目）、小さい盤は天元と星
    if (ctx.opening) {
      const near = ml <= 3 && Math.max(mr, mc) <= 4 ? 1 : 0;
      if (n >= 13) { if (near) { const k = (mr === 3 && mc === 3) ? 9 : ((mr === 2 && mc === 3) || (mr === 3 && mc === 2)) ? 8 : (mr === 2 && mc === 2) ? 5 : (ml >= 2 ? 4 : 0); s += k; } }
      else { if (mr === 4 && mc === 4) s += 6; else if (mr === 2 && mc === 2) s += 7; else if (ml === 2) s += 3; }
    }
    return s;
  }
  // ---------------------------------------------------------------- プレイアウト
  // 軽い方針：直前の手のまわりの「あたり・取り・逃げ」→ ハネ・ツケ・キリ → 乱数。目をつぶさず、自己あたりを避ける。
  function playout(B, rnd, rec, maxMoves, noRec) {
    const n = B.n, lim = maxMoves || n * n * 2 + 60; let k = 0, passes = 0, sinceCheck = 0;
    const W = B.W;
    while (passes < 2 && k < lim) {
      const color = B.turn; let mv = -1;
      const last = B.last;
      if (last > 0 && B.ko < 0 || last > 0) {
        // 1) 相手の最後の手のつながり：あたりなら取る／まわりの自分の石があたりなら助ける
        const opp = 3 - color;
        if (B.c[last] === opp) {
          const lb = B.group(last, 0);
          if (lb === 1 && rnd() < 0.95) { const sx = B.buf[0]; let lib = -1; for (let t = 0; t < B.gn && lib < 0; t++) for (const d of B.dirs) if (B.c[B.buf[t] + d] === 0) { lib = B.buf[t] + d; break; } void sx; if (lib > 0 && B.legal(lib, color)) { const sm = B.sim(lib, color); if (sm && (sm.libs > 1 || sm.cap)) mv = lib; } }
          if (mv < 0) {
            // 自分の石があたり（最後の手のとなり）：のばして逃げる
            const ar = B.around(last);
            for (let j = 0; j < 4 && mv < 0; j++) {
              const q = ar[j];
              if (B.c[q] === color) {
                const lb2 = B.group(q, 0);
                if (lb2 === 1 && rnd() < 0.9) { let lib = -1; for (let t = 0; t < B.gn && lib < 0; t++) for (const d of B.dirs) if (B.c[B.buf[t] + d] === 0) { lib = B.buf[t] + d; break; } if (lib > 0 && B.legal(lib, color)) { const sm = B.sim(lib, color); if (sm && sm.libs >= 2) mv = lib; } }
              }
            }
          }
          if (mv < 0 && lb === 2 && rnd() < 0.35) {
            // あたりにかける（呼吸点2 → 1）
            let cand = []; for (let t = 0; t < B.gn; t++) for (const d of B.dirs) { const q = B.buf[t] + d; if (B.c[q] === 0 && cand.indexOf(q) < 0) cand.push(q); }
            const q = cand[(rnd() * cand.length) | 0];
            if (q && B.legal(q, color)) { const sm = B.sim(q, color); if (sm && sm.libs >= 2) mv = q; }
          }
        }
        // 2) パターン：最後の手のまわりのハネ・ツケ・キリ
        if (mv < 0 && rnd() < 0.55) {
          const ar = B.around(last), s0 = (rnd() * 8) | 0;
          for (let t = 0; t < 8 && mv < 0; t++) {
            const q = ar[(s0 + t) & 7]; if (B.c[q] !== 0 || !B.legal(q, color)) continue;
            if (B.isEye(q, color)) continue;
            let fr = -1; const dd = B.dirs, g = B.diag;
            // ハネ：敵の石に接し、ななめに味方
            let touch = false, dgn = false; for (let j = 0; j < 4; j++) { if (B.c[q + dd[j]] === 3 - color) touch = true; if (B.c[q + g[j]] === color) dgn = true; }
            if (touch && dgn) fr = 1;
            else { // キリ
              const a = B.c[q - W], b2 = B.c[q + 1], c2 = B.c[q + W], d2 = B.c[q - 1];
              const o2 = 3 - color; if ((a === o2 && b2 === o2 && B.c[q - W + 1] !== o2) || (b2 === o2 && c2 === o2 && B.c[q + W + 1] !== o2) || (c2 === o2 && d2 === o2 && B.c[q + W - 1] !== o2) || (d2 === o2 && a === o2 && B.c[q - W - 1] !== o2)) fr = 1;
            }
            if (fr > 0) { const sm = B.sim(q, color); if (sm && (sm.libs >= 2 || sm.cap)) mv = q; }
          }
        }
      }
      if (mv < 0) {
        // 3) 乱数：うまっていない点から、目でも自己あたりでもないものを選ぶ
        const ne = B.ne; if (ne) {
          let s = (rnd() * ne) | 0;
          for (let t = 0; t < ne; t++) {
            const q = B.emp[(s + t) % ne];
            if (!B.legal(q, color) || B.isEye(q, color)) continue;
            const cc = B.c, dd2 = B.dirs;
            if ((cc[q + dd2[0]] === 0 ? 1 : 0) + (cc[q + dd2[1]] === 0 ? 1 : 0) + (cc[q + dd2[2]] === 0 ? 1 : 0) + (cc[q + dd2[3]] === 0 ? 1 : 0) < 2) {
              const sm = B.sim(q, color);
              if (!sm) continue;
              if (sm.libs === 1 && sm.cap === 0 && (sm.size > 1 || rnd() < 0.85)) continue;
            }
            mv = q; break;
          }
        }
      }
      if (mv < 0) { B.pass(); passes++; }
      else {
        passes = 0; const col = B.turn; B.play(mv, col);
        if (rec && !noRec) { rec.p[rec.n] = mv; rec.c[rec.n] = col; rec.n++; }
      }
      k++;
      if (++sinceCheck >= 24) { sinceCheck = 0; if (Math.abs(B.areaDiff()) > B.N * 0.55) break; }
    }
    return B.areaDiff();
  }

  // ---------------------------------------------------------------- モンテカルロ木探索（UCT ＋ RAVE ＋ 事前の重み）
  class Node {
    constructor(par, mv, mover) { this.par = par; this.mv = mv; this.mover = mover; this.ch = null; this.n = 0; this.w = 0; this.rn = 0; this.rw = 0; this.by = null; }
  }
  class Search {
    // st: IgoEngine の状態。opts: { level, seed, komi（既定 st.komi）, ladder, noPass }
    constructor(st, opts) {
      opts = opts || {}; this.st = st; this.opts = opts; this.B = Board.fromState(st); this.n = st.n; this.komi = st.komi;
      this.rnd = mkRng(opts.seed || ((Math.random() * 4294967295) >>> 0) || 1); this.work = this.B.clone();
      this.root = new Node(null, -1, 3 - st.turn); this.color = st.turn; this.iters = 0; this.nodes = 1;
      this.ladder = opts.ladder !== false; this.prior = opts.prior !== false;
      this.rec = { p: new Int16Array(this.n * this.n * 3 + 64), c: new Int8Array(this.n * this.n * 3 + 64), n: 0 };
      this.openingN = st.moves.length < (st.n === 19 ? 14 : st.n === 13 ? 8 : 4);
      this.lastPassed = st.moves.length > 0 && st.moves[st.moves.length - 1][0] < 0;
      this.expand(this.root, this.B, true);
    }
    // 子（候補手）を作る。root のときは、エンジンの本当の反則（スーパーコウ）も見る
    expand(node, B, isRoot) {
      const color = B.turn, kids = [], opening = this.openingN && node === this.root; node.by = new Int16Array(B.W * B.W).fill(-1);
      const ctx = { opening, ladder: this.ladder && (isRoot || true), tactical: true };
      const empties = Array.from(B.emp.slice(0, B.ne)).sort((a, b) => a - b);
      for (const p of empties) {
        if (!B.legal(p, color)) continue;
        if (B.isEye(p, color)) { /* 自分の目：ふつうは打たない（ただし敵のつながりを取るなら別） */ const sm = B.sim(p, color); if (!sm || !sm.cap) continue; }
        if (isRoot) { const i = B.toI(p); if (!E.attempt(this.st, i, color, false).ok) continue; }
        let pr = 0;
        if (this.prior) pr = heur(B, p, color, ctx);
        // 自己あたり（大きい）は候補から外す（ただし取るなら残す）
        const ch = new Node(node, p, color);
        const pv = this.prior ? Math.max(-20, Math.min(40, pr)) : 0;
        const nv = this.prior ? Math.max(0, (pv + 12) / 4) : 0;   // 事前に「見たことにする」回数
        const wr = this.prior ? Math.max(0.05, Math.min(0.95, 0.5 + pv / 60)) : 0.5;
        ch.n = nv; ch.w = nv * wr; ch.rn = nv; ch.rw = nv * wr; ch.pr = pr;
        if (this.prior && pr <= -25 && !isRoot) { continue; }   // 大きな自己あたりは探索しない
        if (pr <= -25 && isRoot) ch.bad = true;
        node.by[p] = kids.length; kids.push(ch);
      }
      // パス（相手がパスしたとき、または候補が無いとき）
      if (isRoot ? (this.lastPassed || !kids.length || this.opts.allowPass) : (!kids.length || B.passes >= 1)) { const ps = new Node(node, -2, color); ps.n = 0; ps.pass = true; node.by[0] = kids.length; kids.push(ps); }
      node.ch = kids;
      return kids.length;
    }
    select(node, parentN) {
      const kids = node.ch; let best = null, bv = -1e9; const lnN = Math.log(parentN + 1);
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i]; let v;
        if (c.n === 0 && c.rn === 0) { v = 10 + (c.pr || 0) * 0.01; }
        else {
          const q = c.n ? c.w / c.n : 0.5, rq = c.rn ? c.rw / c.rn : 0.5;
          const beta = c.rn / (c.rn + c.n + 0.0004 * c.rn * c.n + 1e-9);
          v = (1 - beta) * q + beta * rq + 0.1 * Math.sqrt(lnN / (c.n + 1));
        }
        if (c.bad) v -= 0.3;
        if (v > bv) { bv = v; best = c; }
      }
      return best;
    }
    // 1回の反復
    iterate() {
      const B = this.work; B.copyFrom(this.B); this.rec.n = 0;
      let node = this.root; const path = [node]; let depth = 0;
      while (node.ch && node.ch.length) {
        const c = this.select(node, node.n + 1 || 1);
        if (!c) break;
        if (c.pass) { B.pass(); } else { const r = B.play(c.mv, B.turn); if (r < 0) { node.ch.splice(node.ch.indexOf(c), 1); if (node.by) node.by[c.mv] = -1; continue; } }
        node = c; path.push(node); depth++;
        if (!node.ch) { if (node.n >= 1 && this.nodes < 60000 && depth < 40) { if (B.passes >= 2) break; this.expandNow(node, B); } break; }
        if (B.passes >= 2) break;
      }
      // 評価
      const startN = this.rec.n;
      let diff;
      if (B.passes >= 2) diff = B.areaDiff(); else diff = playout(B, this.rnd, this.rec, 0);
      const blackWin = diff - this.komi > 0 ? 1 : diff - this.komi < 0 ? 0 : 0.5;
      const total = this.rec.n;
      // 逆伝播：node.mover の勝ち（黒なら blackWin）。RAVE：プレイアウトで同じ色が打った点
      for (let k = path.length - 1; k >= 0; k--) {
        const nd = path[k]; nd.n += 1; nd.w += nd.mover === 1 ? blackWin : 1 - blackWin;
        if (nd.by && k < path.length) {
          // この局面の手番の色（子の mover）が、その後のプレイアウトで打った点
          const col = 3 - nd.mover; // 次に打つ色
          for (let m = 0; m < total; m++) {
            if (this.rec.c[m] !== col) continue; const idx = nd.by[this.rec.p[m]];
            if (idx >= 0 && nd.ch[idx] && !nd.ch[idx].pass) { const ch = nd.ch[idx]; ch.rn += 1; ch.rw += col === 1 ? blackWin : 1 - blackWin; }
          }
        }
      }
      void startN; this.iters++;
    }
    expandNow(node, B) { this.nodes += this.expand(node, B, false) + 1; }
    // 時間（ms）か回数まで進める。戻り値：進めた回数
    run(ms, maxIters) {
      const t0 = now(); let k = 0;
      while ((!maxIters || k < maxIters)) {
        this.iterate(); k++;
        if ((k & 7) === 0 && ms && now() - t0 >= ms) break;
        if (!ms && !maxIters) break;
      }
      return k;
    }
    // 結果：{ cell（-1 = パス）, rate（自分の勝率）, top:[[cell, n, rate]…], iters }
    result() {
      const kids = this.root.ch || [], mine = [];
      for (const c of kids) {
        const real = c.n - (c.pn || 0); void real;
        mine.push({ c, n: c.n, v: c.n ? c.w / c.n : 0 });
      }
      mine.sort((a, b) => b.n - a.n);
      const top = mine.slice(0, 5).map(x => [x.c.pass ? -1 : this.B.toI(x.c.mv), Math.round(x.n), Math.round(x.v * 1000) / 1000]);
      const b = mine[0];
      if (!b) return { cell: -1, rate: 0.5, top: [], iters: this.iters };
      // 勝率は自分（color）から見て。node.w は mover（= color）の勝ち
      return { cell: b.c.pass ? -1 : this.B.toI(b.c.mv), rate: b.v, top, iters: this.iters, passRate: (kids.find(c => c.pass) || { n: 0, w: 0 }).n ? kids.find(c => c.pass).w / kids.find(c => c.pass).n : null };
    }
  }

  // ---------------------------------------------------------------- 強さ
  // time: ms の上限（Worker でも 800 以下）。iters: テストでの回数上限。
  const LEVELS = {
    1: { kind: 'heur', time: 40, ignore: 0.5, noise: 6 },
    2: { kind: 'mcts', time: 180, iters: 160, prior: true, ladder: false, ignore: 0.12, pick: 0.28 },
    3: { kind: 'mcts', time: 260, prior: true, ladder: true, pick: 0.08 },
    4: { kind: 'mcts', time: 520, prior: true, ladder: true, pick: 0 },
    5: { kind: 'mcts', time: 800, prior: true, ladder: true, pick: 0 },
  };
  const levelInfo = lv => LEVELS[Math.max(1, Math.min(5, lv | 0 || 3))];

  // かんたんな基準 bot（強さの比較用）：置ける所からランダム（自分の目と自己あたりはさける）
  function randomBot(st, rnd) {
    const B = Board.fromState(st), color = st.turn, c = []; rnd = rnd || Math.random;
    for (let i = 0; i < B.ne; i++) { const p = B.emp[i]; if (B.legal(p, color) && !B.isEye(p, color)) { const sm = B.sim(p, color); if (sm && !(sm.libs === 1 && !sm.cap)) c.push(p); } }
    let tries = 0;
    while (c.length && tries++ < 20) { const p = c[(rnd() * c.length) | 0], i = B.toI(p); if (E.attempt(st, i, color, false).ok) return i; }
    return -1;
  }

  // 1手選ぶ。戻り値 { cell（-1 でパス）, rate, why（初心者向けの「見落とし」の種類）, iters }
  // 前半（prepare）：探索がいらない場合はここで答えが出る。探索がいる場合は { S, L, rnd, ms, it, lastPass } を返す
  function prepare(st, level, o) {
    o = o || {}; const L = levelInfo(level), rnd = mkRng(o.seed || ((Math.random() * 4294967295) >>> 0));
    const n = st.n, color = st.turn;
    if (st.phase !== 'play') return { done: { cell: -1, rate: 0.5 } };
    const lastPass = st.moves.length > 0 && st.moves[st.moves.length - 1][0] < 0;
    if (st.moves.length > n * n * 3) return { done: { cell: -1, rate: 0.5 } };
    if (L.kind === 'heur') {
      const B = Board.fromState(st), opening = st.moves.length < (n === 19 ? 12 : n === 13 ? 8 : 3);
      const ign = rnd() < L.ignore;     // 「見落とし」：戦術（あたり・取り・自己あたり）を見ない手番
      let bestV = -1e9, best = -1, any = 0;
      for (let i = 0; i < B.ne; i++) {
        const p = B.emp[i]; if (!B.legal(p, color)) continue;
        if (B.isEye(p, color)) continue;
        if (!E.attempt(st, B.toI(p), color, false).ok) continue;
        any++;
        let s = heur(B, p, color, { opening, tactical: !ign, ladder: false });
        let near = 0; for (const q of B.around(p)) if (B.c[q] === 1 || B.c[q] === 2) near++;
        if (st.moves.length > 6) s += near ? 1.5 : -2;
        s += (rnd() - 0.5) * 2 * L.noise;
        if (s > bestV) { bestV = s; best = p; }
      }
      if (!any) return { done: { cell: -1, rate: 0.5 } };
      if (lastPass) { const d = B.areaDiff() - st.komi; if ((color === 1 && d > 0) || (color === 2 && d < 0) || bestV < -4) return { done: { cell: -1, rate: 0.5 } }; }
      if (st.moves.length > n * n && bestV < 0) return { done: { cell: -1, rate: 0.5 } };
      return { done: { cell: B.toI(best), rate: 0.5, why: ign ? 'ignore' : null, iters: 0 } };
    }
    const S = new Search(st, { seed: (rnd() * 4294967295) >>> 0, ladder: L.ladder, prior: L.prior });
    const ms = o.time != null ? o.time : L.time, it = o.iters || (o.time == null ? L.iters : 0) || 0;
    return { S, L, rnd, ms, it: it || (ms ? 0 : 200), lastPass };
  }
  // 後半（finish）：探索のあとの選び方（人間らしいミス・パスの判断）
  function finish(P, st) {
    const { S, L, rnd, lastPass } = P, color = st.turn, r = S.result();
    let cell = r.cell;
    // 大きい盤のはじめの数手：読みが浅くてあてにならないので、隅（三々・星・小目）の方針の点数でえらぶ
    if (S.openingN && st.n >= 13 && S.root.ch) {
      const cand = S.root.ch.filter(c => !c.pass && !c.bad).sort((a, b) => (b.pr || 0) - (a.pr || 0)).slice(0, 4);
      if (cand.length) cell = S.B.toI(cand[Math.min(cand.length - 1, (rnd() * rnd() * cand.length) | 0)].mv);
    }
    if (L.pick && rnd() < L.pick && r.top.length > 1) { const k = 1 + ((rnd() * Math.min(2, r.top.length - 1)) | 0); if (r.top[k][0] >= 0 && r.top[k][2] > 0.35) cell = r.top[k][0]; }
    if (cell >= 0 && lastPass) { const pr = r.passRate; if (pr != null && pr >= r.rate - 0.02) cell = -1; }
    if (cell >= 0 && !E.attempt(st, cell, color, false).ok) cell = -1;
    return { cell, rate: r.rate, why: null, iters: r.iters, top: r.top };
  }
  function choose(st, level, o) {
    const P = prepare(st, level, o); if (P.done) return P.done;
    P.S.run(P.ms, P.it); return finish(P, st);
  }
  // 少しずつ進める版（Worker が使えないとき、画面が固まらないように 30ms ずつ）。onSlice(進み 0〜1) を呼ぶ
  function chooseAsync(st, level, o, onSlice) {
    return new Promise(resolve => {
      const P = prepare(st, level, o); if (P.done) { resolve(P.done); return; }
      const t0 = now(), total = P.ms || 200; let k = 0;
      const tick = () => {
        const left = total - (now() - t0);
        if (left <= 0 || (P.it && k >= P.it)) { resolve(finish(P, st)); return; }
        k += P.S.run(Math.min(28, left), P.it ? Math.max(1, P.it - k) : 0);
        if (onSlice) onSlice(Math.min(1, (now() - t0) / total));
        setTimeout(tick, 0);
      };
      tick();
    });
  }

  // ---------------------------------------------------------------- 死に石の見積もり
  // プレイアウトを重ねて、石ごとに「最後にだれの地・石になったか」を数える。dead は相手側の持ち物になることが多い石のつながり。
  function ownership(st, o) {
    o = o || {}; const B0 = Board.fromState(st), W = B0.W, n = st.n, N = n * n;
    const rnd = mkRng(o.seed || 12345), cnt = new Float32Array(N); let sims = 0; const t0 = now();
    const budget = o.time != null ? o.time : 500, maxIt = o.iters || 100000;
    const B = B0.clone(); const rec = { p: new Int16Array(N * 3 + 64), c: new Int8Array(N * 3 + 64), n: 0 };
    while (sims < maxIt && (sims < 30 || now() - t0 < budget)) {
      B.copyFrom(B0); B.passes = 0; B.ko = -1;
      playout(B, rnd, rec, 0, true);
      // 面積の持ち主：石か、囲んだ空き地
      const c = B.c, s = ++B.stamp, sm = B.sm, dd = B.dirs;
      for (let r = 1; r <= n; r++) for (let q = 1; q <= n; q++) {
        const p = r * W + q, v = c[p], i = (r - 1) * n + (q - 1);
        if (v === 1) cnt[i] += 1; else if (v === 2) cnt[i] -= 1;
        else if (sm[p] !== s) {
          const st2 = [p]; sm[p] = s; let bk = 0, wh = 0;
          for (let k = 0; k < st2.length; k++) for (let j = 0; j < 4; j++) { const t = st2[k] + dd[j], u = c[t]; if (u === 0) { if (sm[t] !== s) { sm[t] = s; st2.push(t); } } else if (u === 1) bk = 1; else if (u === 2) wh = 1; }
          const o2 = bk && !wh ? 1 : wh && !bk ? -1 : 0;
          for (const t of st2) { const ii = ((t / W) | 0) - 1, jj = (t % W) - 1; cnt[ii * n + jj] += o2; }
        }
      }
      sims++;
    }
    const own = new Float32Array(N); for (let i = 0; i < N; i++) own[i] = cnt[i] / sims;
    return { own, sims };
  }
  function suggestDead(st, o) {
    o = o || {}; const { own, sims } = ownership(st, o), n = st.n, dead = [], done = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (!st.b[i] || done[i]) continue;
      const ch = E.chain(st.b, n, i); let sum = 0; for (const c of ch.cells) { done[c] = 1; sum += own[c]; }
      const avg = sum / ch.cells.length, sgn = ch.color === 1 ? 1 : -1;
      // この色の石が、プレイアウトの 70% 以上で相手のものになっていれば死に石
      if (avg * sgn < -0.4) for (const c of ch.cells) dead.push(c);
    }
    return { dead: dead.sort((a, b) => a - b), own, sims };
  }

  // ---------------------------------------------------------------- ヒントの理由
  // 戻り値：{ kind, n? } kind: capture | save | atari | cut | hane | corner | center | connect | extend | block | area
  function analyze(st, cell) {
    const B = Board.fromState(st), p = B.toP(cell), color = st.turn;
    const f = features(B, p, color), n = st.n, i = cell, r = (i / n) | 0, c = i % n, mr = Math.min(r, n - 1 - r), mc = Math.min(c, n - 1 - c);
    if (f.illegal) return { kind: 'area' };
    if (f.cap) return { kind: 'capture', n: f.cap };
    if (f.save && f.libs >= 2) return { kind: 'save', n: f.save };
    if (f.atari) return { kind: 'atari', n: f.atari };
    if (st.moves.length < (n === 19 ? 16 : n === 13 ? 10 : 6) && Math.max(mr, mc) <= 4 && Math.min(mr, mc) >= 2) return { kind: 'corner' };
    if (n === 9 && mr === 4 && mc === 4) return { kind: 'center' };
    if (f.cut) return { kind: 'cut' };
    if (f.hane) return { kind: 'hane' };
    if (f.touch) return { kind: 'block' };
    if (f.connect) return { kind: 'connect' };
    return { kind: 'area' };
  }
  // あたり・自己あたりの警告（atari warning）：color の石で呼吸点1のつながりの代表マス
  function atariWarn(st, color) { return E.atariCells(st, color); }
  function selfAtariAt(st, cell, color) { const B = Board.fromState(st), s = B.sim(B.toP(cell), color || st.turn); return !!(s && s.libs === 1 && !s.cap); }
  function ladderAt(st, cell) { // cell の石のつながり（あたり→のがれ）がシチョウで取られるか
    const B = Board.fromState(st); const p = B.toP(cell); if (!B.c[p]) return false; return ladderWorks(B, p, B.c[p]);
  }

  const API = { Board, Search, choose, chooseAsync, prepare, finish, randomBot, suggestDead, ownership, analyze, atariWarn, selfAtariAt, ladderAt, playout, ladderWorks, features, heur, LEVELS, levelInfo, mkRng };
  root.IgoAI = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
