// 囲碁工房：詰碁（死活）の読みきり。外部のものは使わない。node でもブラウザでも動く。
// ---------------------------------------------------------------------------------------------------------------------
// 問題の形：9×9 の盤の一部（隅や辺）。region（打てる点）の外にある石は「かべ」で、取られない（つながっていれば生き）。
//   board  … 81 文字：'.' 空き・'x' 黒・'o' 白。region … 81 文字：'1' 打てる点。target … 取る・助ける石のマス。
//   type 'kill'（hero が攻めて target を取る）か 'live'（hero が target を生かす）。hero … 1|2（手番の色）。
// 読み：deadline の手数（plies）までの AND-OR 探索。
//   取れる（KILL）＝ 攻め側がどう受けられても target を取れる。生き（LIVE）＝ 守り側が Benson の方法で「どうやっても取られない形」にできる。
//   どちらも示せない手は 'unknown'。問題は、正解の手がひとつ以上あり、ほかの手（パスも）がぜんぶ「まちがい」と示せたときだけ「読み済み（verified）」。
(function (root) {
  'use strict';
  const E = root.IgoEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const N = 9, G = E.geo(N), NB = G.nb;
  const idx = (r, c) => r * N + c;

  class Pos {
    constructor(board, region, target, defColor) {
      this.b = Int8Array.from(board.split('').map(ch => (ch === 'x' ? 1 : ch === 'o' ? 2 : 0)));
      this.reg = Uint8Array.from(region.split('').map(ch => +ch));
      this.target = target; this.def = defColor; this.ko = -1; this.last = -1;
    }
    copy() { const p = Object.create(Pos.prototype); p.b = this.b.slice(); p.reg = this.reg; p.target = this.target; p.def = this.def; p.ko = this.ko; p.last = this.last; return p; }
    key(side) { let s = ''; for (let i = 0; i < 81; i++) if (this.reg[i] || this.b[i]) s += this.b[i]; return s + '|' + this.ko + '|' + side; }
    // つながり（かべにつながっていれば immortal）
    group(i) {
      const b = this.b, col = b[i], cells = [i], seen = new Set([i]), libs = new Set(); let imm = false;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k]; if (!this.reg[c]) imm = true;
        for (const q of NB[c]) { if (b[q] === col) { if (!seen.has(q)) { seen.add(q); cells.push(q); } } else if (b[q] === 0 && this.reg[q]) libs.add(q); }
      }
      return { cells, libs: [...libs], imm, color: col };
    }
    // 打つ。できなければ null。成功なら新しい局面
    play(i, color) {
      if (!this.reg[i] || this.b[i] || i === this.ko) return null;
      const q = this.copy(); q.b[i] = color; const opp = 3 - color; let capCount = 0, capLast = -1; const done = new Set();
      for (const j of NB[i]) if (q.b[j] === opp && !done.has(j)) {
        const g = q.group(j); for (const c of g.cells) done.add(c);
        if (!g.libs.length && !g.imm) { for (const c of g.cells) { q.b[c] = 0; capLast = c; } capCount += g.cells.length; }
      }
      const own = q.group(i);
      if (!own.libs.length && !own.imm) return null;
      q.ko = capCount === 1 && own.cells.length === 1 && own.libs.length === 1 ? capLast : -1;
      q.last = i; return q;
    }
    moves(color) { const out = []; for (let i = 0; i < 81; i++) if (this.reg[i] && !this.b[i]) { const q = this.play(i, color); if (q) out.push([i, q]); } return out; }
    captured() { return this.b[this.target] === 0 || this.b[this.target] === 3 - this.def; }
    // Benson：守りの色の石のつながりのうち、取られない形になっているもの（target がそのひとつか）
    alive() {
      const b = this.b, def = this.def;
      if (b[this.target] !== def) return false;
      // つながり
      const chainId = new Int16Array(81).fill(-1), chains = [];
      for (let i = 0; i < 81; i++) if (b[i] === def && chainId[i] < 0) { const g = this.group(i); for (const c of g.cells) chainId[c] = chains.length; chains.push(g); }
      // 空き地：region の中の、守りの石以外の点のつながり
      const regId = new Int16Array(81).fill(-1), regs = [];
      for (let i = 0; i < 81; i++) {
        if (!(this.reg[i] || b[i]) || b[i] === def || regId[i] >= 0) continue;
        const cells = [i]; regId[i] = regs.length;
        // かべの石（打てる点の外）も空き地につながる：かべのとなりの点は、守りだけの「目」にならない
        for (let k = 0; k < cells.length; k++) for (const q of NB[cells[k]]) if ((this.reg[q] || b[q]) && b[q] !== def && regId[q] < 0) { regId[q] = regs.length; cells.push(q); }
        const adj = new Set(); for (const c of cells) for (const q of NB[c]) if (b[q] === def) adj.add(chainId[q]);
        regs.push({ cells, adj });
      }
      let X = new Set(chains.map((c, k) => k).filter(k => !chains[k].imm)), R = new Set(regs.map((r, k) => k));
      let changed = true;
      while (changed) {
        changed = false;
        // 空き地のうち、まわりに X でない守りのつながり（かべにつながる石も含む）があるものは外す
        for (const r of [...R]) { for (const a of regs[r].adj) if (!X.has(a)) { R.delete(r); changed = true; break; } }
        for (const k of [...X]) {
          let vital = 0;
          for (const r of R) {
            const rg = regs[r]; if (!rg.adj.has(k)) continue;
            // 空き地の点（石のない点も、攻めの石のある点も）がぜんぶ、k の呼吸点（となり）にあるか
            let ok = true; for (const c of rg.cells) { let adjC = false; for (const q of NB[c]) if (chainId[q] === k) { adjC = true; break; } if (!adjC) { ok = false; break; } }
            if (ok) vital++;
          }
          if (vital < 2) { X.delete(k); changed = true; }
        }
      }
      return X.has(chainId[this.target]);
    }
  }

  // ---------------------------------------------------------------- 読み
  class Solver {
    constructor(opts) { this.nodes = 0; this.cap = (opts && opts.cap) || 4e6; this.tt = new Map(); this.over = false; }
    // 攻め側の番。depth 手（plies）以内に target を取れるか
    kA(p, d) {
      if (p.captured()) return true; if (d <= 0) return false;
      if (++this.nodes > this.cap) { this.over = true; return false; }
      const att = 3 - p.def, k = 'KA' + p.key(att), t = this.tt.get(k);
      if (t) { if (t.t != null && t.t <= d) return true; if (t.f != null && t.f >= d) return false; }
      let res = false;
      for (const [, q] of p.moves(att)) { if (this.kD(q, d - 1)) { res = true; break; } if (this.over) break; }
      this.mem(k, res, d); return res;
    }
    // 守り側の番。どう受けても取られるか
    kD(p, d) {
      if (p.captured()) return true; if (p.alive()) return false; if (d <= 0) return false;
      if (++this.nodes > this.cap) { this.over = true; return false; }
      const k = 'KD' + p.key(p.def), t = this.tt.get(k);
      if (t) { if (t.t != null && t.t <= d) return true; if (t.f != null && t.f >= d) return false; }
      let res = true;
      const ps = p.copy(); ps.ko = -1;      // パス
      if (!this.kA(ps, d - 1)) res = false;
      if (res) for (const [, q] of p.moves(p.def)) { if (!this.kA(q, d - 1)) { res = false; break; } if (this.over) { res = false; break; } }
      this.mem(k, res, d); return res;
    }
    // 守り側の番。depth 手以内に、取られない形（Benson）にできるか
    lD(p, d) {
      if (p.captured()) return false; if (p.alive()) return true; if (d <= 0) return false;
      if (++this.nodes > this.cap) { this.over = true; return false; }
      const k = 'LD' + p.key(p.def), t = this.tt.get(k);
      if (t) { if (t.t != null && t.t <= d) return true; if (t.f != null && t.f >= d) return false; }
      let res = false;
      for (const [, q] of p.moves(p.def)) { if (this.lA(q, d - 1)) { res = true; break; } if (this.over) break; }
      this.mem(k, res, d); return res;
    }
    // 攻め側の番。どう攻めても生きられるか
    lA(p, d) {
      if (p.captured()) return false; if (p.alive()) return true; if (d <= 0) return false;
      if (++this.nodes > this.cap) { this.over = true; return false; }
      const att = 3 - p.def, k = 'LA' + p.key(att), t = this.tt.get(k);
      if (t) { if (t.t != null && t.t <= d) return true; if (t.f != null && t.f >= d) return false; }
      let res = true;
      const ps = p.copy(); ps.ko = -1;
      if (!this.lD(ps, d - 1)) res = false;
      if (res) for (const [, q] of p.moves(att)) { if (!this.lD(q, d - 1)) { res = false; break; } if (this.over) { res = false; break; } }
      this.mem(k, res, d); return res;
    }
    mem(k, res, d) {
      if (this.over) return;
      const t = this.tt.get(k) || {};
      if (res) { if (t.t == null || d < t.t) t.t = d; } else if (t.f == null || d > t.f) t.f = d;
      this.tt.set(k, t);
    }
  }

  // ひとつの手を調べる。戻り値 { r: 'kill'|'live'|'unknown', d: 示せた最小の手数 }
  // after = その手を打ったあとの局面（相手の番）。mover = 打った色
  function classify(after, mover, def, maxD, cap, shared) {
    const S = shared || new Solver({ cap }); S.over = false; S.nodes = 0; S.cap = cap || S.cap;
    for (let d = 1; d <= maxD; d++) {
      let r;
      if (mover === def) {     // 守りが打った：攻めの番。守りが生きを示せるか／攻めが取れるか
        if (S.lA(after, d)) return { r: 'live', d };
        if (S.kA(after, d)) return { r: 'kill', d };
      } else {                 // 攻めが打った：守りの番
        if (S.kD(after, d)) return { r: 'kill', d };
        if (S.lD(after, d)) return { r: 'live', d };
      }
      void r; if (S.over) break;
    }
    return { r: 'unknown', d: 0 };
  }
  // 問題 pz = { b（81文字）, rg（81文字）, t（target）, ty: 'kill'|'live', hero }。戻り値 { ok, ans:[マス], wrong:[マス], unknown:[マス], pass: 'kill'|'live'|'unknown', depth }
  function solve(pz, opts) {
    opts = opts || {}; const maxD = opts.maxD || 9, cap = opts.cap || 600000;
    const def = pz.ty === 'kill' ? 3 - pz.hero : pz.hero;
    const p = new Pos(pz.b, pz.rg, pz.t, def);
    const want = pz.ty;                 // 英雄がそうしたい結果
    const out = { ans: [], wrong: [], unknown: [], depth: 0, pass: 'unknown', n: 0 };
    const SH = new Solver({ cap });
    const ps = p.copy(); ps.ko = -1; out.pass = classify(ps, pz.hero, def, maxD, cap, SH).r;
    for (const [i, q] of p.moves(pz.hero)) {
      const c = classify(q, pz.hero, def, maxD, cap, SH); out.n++;
      if (c.r === want) { out.ans.push(i); out.depth = Math.max(out.depth, c.d); } else if (c.r === 'unknown') out.unknown.push(i); else out.wrong.push(i);
    }
    out.ok = out.ans.length >= 1 && out.unknown.length === 0 && out.pass !== want && out.pass !== 'unknown';
    // 最初から取れて（または生きて）いない問題だけ
    if (p.captured() || p.alive() && pz.ty === 'live') out.ok = false;
    return out;
  }
  // 手 cell を打たれたあとの「ふつうの応手」（守り・攻めの最善に近い手）：画面で見せる手順（PV）
  function reply(pz, state, cell, maxD) {
    const def = pz.ty === 'kill' ? 3 - pz.hero : pz.hero, p = new Pos(state, pz.rg, pz.t, def);
    const q = p.play(cell, pz.hero); if (!q) return null;
    return q;
  }
  // 相手の応手（詰碁の画面で、手を打ったあとに返す手）。hero が打ったあとの局面から、相手がもっとも粘る手を選ぶ
  function opponentMove(boardStr, pz, last) {
    const hero = pz.hero, opp = 3 - hero, def = pz.ty === 'kill' ? opp : hero;
    const p = new Pos(boardStr, pz.rg, pz.t, def); p.ko = -1;
    if (p.captured() || (pz.ty === 'live' && false)) return { pass: true };
    // 相手＝hero の反対。相手の目的を「heroの目的の否定」としたうえで、手ごとに hero の目的が示せるかを調べる
    const S0 = n => new Solver({ cap: 200000 });
    let best = null, bestScore = -1;
    for (const [i, q] of p.moves(opp)) {
      let score = 0; const S = S0();
      for (let d = 2; d <= 7; d++) {
        const heroWins = pz.ty === 'kill' ? S.kA(q, d) : S.lA(q, d);
        if (heroWins) { score = d; break; } score = 100;       // heroが示せない手ほどよい
        if (S.over) break;
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best == null ? { pass: true } : { cell: best, score: bestScore };
  }
  // 手順の見せ方：hero の手（正解のうち、いちばん早く示せるもの）と、終わったかどうか
  function posOf(pz, boardStr, ko) { const def = pz.ty === 'kill' ? 3 - pz.hero : pz.hero, p = new Pos(boardStr, pz.rg, pz.t, def); p.ko = ko == null ? -1 : ko; return p; }
  function finished(pz, boardStr) { const p = posOf(pz, boardStr); return pz.ty === 'kill' ? p.captured() : (!p.captured() && p.alive()); }
  function heroMove(pz, boardStr, maxD) {
    const p = posOf(pz, boardStr), def = p.def; let best = null;
    const SH = new Solver({ cap: 300000 });
    for (const [i, q] of p.moves(pz.hero)) { const c = classify(q, pz.hero, def, maxD || 7, 300000, SH); if (c.r === pz.ty && (!best || c.d < best.d)) best = { cell: i, d: c.d }; }
    return best;
  }
  function toStr(arr) { return Array.from(arr).map(v => (v === 1 ? 'x' : v === 2 ? 'o' : '.')).join(''); }
  // 8 とおりの向き（盤の対称）
  function xform(k, r, c) { const m = N - 1; switch (k) { case 0: return [r, c]; case 1: return [r, m - c]; case 2: return [m - r, c]; case 3: return [m - r, m - c]; case 4: return [c, r]; case 5: return [c, m - r]; case 6: return [m - c, r]; default: return [m - c, m - r]; } }
  function transform(str, k) { const o = new Array(81); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const [a, b] = xform(k, r, c); o[a * N + b] = str[r * N + c]; } return o.join(''); }
  function transformCell(cell, k) { const [a, b] = xform(k, (cell / N) | 0, cell % N); return a * N + b; }
  function swapColors(str) { return str.replace(/[xo]/g, ch => (ch === 'x' ? 'o' : 'x')); }

  const API = { Pos, Solver, classify, solve, opponentMove, reply, finished, heroMove, posOf, toStr, transform, transformCell, swapColors, xform };
  root.IgoTsumego = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
