// チェス工房：ルールの中身（決まった結果の純粋なロジック。node でもブラウザでも動く）
// ---------------------------------------------------------------------------------
// ルール：国際チェス連盟（FIDE）のふつうのルール。キャスリング・アンパッサン・プロモーション・チェック／チェックメイト／ステイルメイト・
//   同一局面3回・50手ルール（自動で引き分け）・駒がたりない引き分け。75手・5回くり返しは必ず引き分け。
// 盤：マスの番号は 0..63（a1=0, b1=1 … h1=7, a2=8 … h8=63）。駒：0 なし／白 1..6（P N B R Q K）／黒 9..14（色 ×8 ＋ 種類）。
// 手：整数 1つ = from | to<<6 | プロモーションの駒（2..5）<<12 | フラグ<<16（1 とる・2 アンパッサン・4 ポーンの2歩・8 キング側キャスリング・16 クイーン側）。
// このファイルにあるもの：局面（Pos。make / unmake）・FEN・SAN・PGN・手の生成・perft・Game（手の列・状態・くり返し）・持ち時間（Clock）。
// 探索・評価・CPU・ヒント・パズルの確かめは ai.js。
(function (root) {
  'use strict';

  const WHITE = 0, BLACK = 1;
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const F_CAP = 1, F_EP = 2, F_DBL = 4, F_KC = 8, F_QC = 16;
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh', PCH = ' PNBRQK';
  const sqName = s => FILES[s & 7] + ((s >> 3) + 1);
  const parseSq = t => { const m = /^([a-h])([1-8])$/.exec(String(t)); return m ? (m[2] - 1) * 8 + FILES.indexOf(m[1]) : -1; };
  const typeOf = p => p & 7, colorOf = p => p >> 3;
  const pieceChar = p => (p ? (p >> 3 ? PCH[p & 7].toLowerCase() : PCH[p & 7]) : '');
  const CHAR2P = {}; for (let t = 1; t <= 6; t++) { CHAR2P[PCH[t]] = t; CHAR2P[PCH[t].toLowerCase()] = 8 + t; }

  // ---------- 表（1回だけ作る） ----------
  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];   // N S E W NE NW SE SW（[列, 段]）
  const RAY = [], KNT = [], KNG = [], PAT = [[], []];
  for (let s = 0; s < 64; s++) {
    const f = s & 7, r = s >> 3;
    for (const [df, dr] of DIRS) { const ray = []; let ff = f + df, rr = r + dr; while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) { ray.push(rr * 8 + ff); ff += df; rr += dr; } RAY.push(Int8Array.from(ray)); }
    const kn = [], kg = [];
    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) { const ff = f + df, rr = r + dr; if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) kn.push(rr * 8 + ff); }
    for (const [df, dr] of DIRS) { const ff = f + df, rr = r + dr; if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) kg.push(rr * 8 + ff); }
    KNT.push(Int8Array.from(kn)); KNG.push(Int8Array.from(kg));
    for (const c of [0, 1]) { const pa = [], rr = r + (c ? -1 : 1); if (rr >= 0 && rr < 8) for (const df of [-1, 1]) { const ff = f + df; if (ff >= 0 && ff < 8) pa.push(rr * 8 + ff); } PAT[c].push(Int8Array.from(pa)); }
  }
  // キャスリングの権利：1 白キング側・2 白クイーン側・4 黒キング側・8 黒クイーン側。そのマスに動く・とられると権利が消える
  const CR = new Int8Array(64).fill(15); CR[4] &= ~3; CR[0] &= ~2; CR[7] &= ~1; CR[60] &= ~12; CR[56] &= ~8; CR[63] &= ~4;
  // 乱数の表（ハッシュ用。固定の種）
  let zs = 0x9e3779b9 | 0;
  const zr = () => { zs ^= zs << 13; zs ^= zs >>> 17; zs ^= zs << 5; return zs | 0; };
  const ZP1 = new Int32Array(16 * 64), ZP2 = new Int32Array(16 * 64), ZC1 = new Int32Array(16), ZC2 = new Int32Array(16), ZE1 = new Int32Array(8), ZE2 = new Int32Array(8);
  for (let i = 0; i < ZP1.length; i++) { ZP1[i] = zr(); ZP2[i] = zr(); }
  for (let i = 0; i < 16; i++) { ZC1[i] = zr(); ZC2[i] = zr(); }
  for (let i = 0; i < 8; i++) { ZE1[i] = zr(); ZE2[i] = zr(); }
  const ZS1 = zr(), ZS2 = zr();

  // ---------- 局面 ----------
  const MAXPLY = 2048;
  function Pos() {
    this.b = new Int8Array(64); this.side = 0; this.cast = 0; this.ep = -1; this.half = 0; this.full = 1; this.ksq = [4, 60]; this.h1 = 0; this.h2 = 0; this.n = 0;
    this.uM = new Int32Array(MAXPLY); this.uC = new Int8Array(MAXPLY); this.uCast = new Int8Array(MAXPLY); this.uEp = new Int8Array(MAXPLY); this.uHalf = new Int16Array(MAXPLY);
    this.uH1 = new Int32Array(MAXPLY); this.uH2 = new Int32Array(MAXPLY); this.uP = new Int8Array(MAXPLY);
  }
  Pos.prototype.hashAll = function () {
    let h1 = 0, h2 = 0; const b = this.b;
    for (let s = 0; s < 64; s++) if (b[s]) { h1 ^= ZP1[b[s] * 64 + s]; h2 ^= ZP2[b[s] * 64 + s]; }
    h1 ^= ZC1[this.cast]; h2 ^= ZC2[this.cast];
    if (this.side) { h1 ^= ZS1; h2 ^= ZS2; }
    const e = this.epFile(); if (e >= 0) { h1 ^= ZE1[e]; h2 ^= ZE2[e]; }
    this.h1 = h1; this.h2 = h2;
  };
  // アンパッサンのマスがあって、それをとれるポーンがいるときだけ、そのファイル（ハッシュと同一局面の判定に使う）
  Pos.prototype.epFile = function () {
    const ep = this.ep; if (ep < 0) return -1;
    const pawn = this.side * 8 + P, pa = PAT[this.side ^ 1][ep];
    for (let i = 0; i < pa.length; i++) if (this.b[pa[i]] === pawn) return ep & 7;
    return -1;
  };
  Pos.prototype.clone = function () { const p = new Pos(); p.b.set(this.b); p.side = this.side; p.cast = this.cast; p.ep = this.ep; p.half = this.half; p.full = this.full; p.ksq = this.ksq.slice(); p.hashAll(); return p; };

  function attackedBy(b, sq, by) {
    const pa = PAT[by ^ 1][sq], pawn = by * 8 + P;
    for (let i = 0; i < pa.length; i++) if (b[pa[i]] === pawn) return true;
    const kn = KNT[sq], knight = by * 8 + N;
    for (let i = 0; i < kn.length; i++) if (b[kn[i]] === knight) return true;
    const kg = KNG[sq], king = by * 8 + K;
    for (let i = 0; i < kg.length; i++) if (b[kg[i]] === king) return true;
    const rk = by * 8 + R, bs = by * 8 + B, qn = by * 8 + Q, base = sq * 8;
    for (let d = 0; d < 4; d++) { const ray = RAY[base + d]; for (let i = 0; i < ray.length; i++) { const p = b[ray[i]]; if (p) { if (p === rk || p === qn) return true; break; } } }
    for (let d = 4; d < 8; d++) { const ray = RAY[base + d]; for (let i = 0; i < ray.length; i++) { const p = b[ray[i]]; if (p) { if (p === bs || p === qn) return true; break; } } }
    return false;
  }
  // sq を利かせている「by 色の駒」のマスの一覧（ヒントの説明用）
  function attackers(b, sq, by) {
    const out = [], pa = PAT[by ^ 1][sq];
    for (let i = 0; i < pa.length; i++) if (b[pa[i]] === by * 8 + P) out.push(pa[i]);
    const kn = KNT[sq]; for (let i = 0; i < kn.length; i++) if (b[kn[i]] === by * 8 + N) out.push(kn[i]);
    const kg = KNG[sq]; for (let i = 0; i < kg.length; i++) if (b[kg[i]] === by * 8 + K) out.push(kg[i]);
    for (let d = 0; d < 8; d++) { const ray = RAY[sq * 8 + d]; for (let i = 0; i < ray.length; i++) { const p = b[ray[i]]; if (p) { if (colorOf(p) === by && ((typeOf(p) === Q) || (d < 4 && typeOf(p) === R) || (d >= 4 && typeOf(p) === B))) out.push(ray[i]); break; } } }
    return out;
  }
  Pos.prototype.inCheck = function () { return attackedBy(this.b, this.ksq[this.side], this.side ^ 1); };
  Pos.prototype.isAttacked = function (sq, by) { return attackedBy(this.b, sq, by); };

  // ---------- 手の生成（疑似合法：自分のキングが取られる手も含む。legalMoves が絞る） ----------
  function gen(pos, out, caps) {
    out.length = 0;
    const b = pos.b, us = pos.side, them = us ^ 1, ub = us * 8;
    const dir = us ? -8 : 8, startR = us ? 6 : 1, promoR = us ? 1 : 6;
    for (let s = 0; s < 64; s++) {
      const p = b[s]; if (!p || (p >> 3) !== us) continue;
      const t = p & 7;
      if (t === P) {
        const r = s >> 3, f = s & 7, one = s + dir;
        if (r === promoR) {
          if (!b[one] && !caps) { for (let pr = Q; pr >= N; pr--) out.push(s | one << 6 | pr << 12); }
          else if (!b[one] && caps) out.push(s | one << 6 | Q << 12);
          for (const df of [-1, 1]) { const ff = f + df; if (ff < 0 || ff > 7) continue; const to = one + df; const c = b[to]; if (c && (c >> 3) === them) for (let pr = Q; pr >= N; pr--) out.push(s | to << 6 | pr << 12 | F_CAP << 16); }
        } else {
          if (!caps && !b[one]) { out.push(s | one << 6); if (r === startR && !b[one + dir]) out.push(s | (one + dir) << 6 | F_DBL << 16); }
          for (const df of [-1, 1]) {
            const ff = f + df; if (ff < 0 || ff > 7) continue; const to = one + df, c = b[to];
            if (c && (c >> 3) === them) out.push(s | to << 6 | F_CAP << 16);
            else if (to === pos.ep && !c) out.push(s | to << 6 | (F_CAP | F_EP) << 16);
          }
        }
      } else if (t === N) {
        const kn = KNT[s];
        for (let i = 0; i < kn.length; i++) { const to = kn[i], c = b[to]; if (!c) { if (!caps) out.push(s | to << 6); } else if ((c >> 3) === them) out.push(s | to << 6 | F_CAP << 16); }
      } else if (t === K) {
        const kg = KNG[s];
        for (let i = 0; i < kg.length; i++) { const to = kg[i], c = b[to]; if (!c) { if (!caps) out.push(s | to << 6); } else if ((c >> 3) === them) out.push(s | to << 6 | F_CAP << 16); }
        if (!caps) {
          const home = us ? 60 : 4;
          if (s === home && !attackedBy(b, s, them)) {
            if ((pos.cast & (us ? 4 : 1)) && !b[home + 1] && !b[home + 2] && b[home + 3] === ub + R && !attackedBy(b, home + 1, them) && !attackedBy(b, home + 2, them)) out.push(s | (home + 2) << 6 | F_KC << 16);
            if ((pos.cast & (us ? 8 : 2)) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === ub + R && !attackedBy(b, home - 1, them) && !attackedBy(b, home - 2, them)) out.push(s | (home - 2) << 6 | F_QC << 16);
          }
        }
      } else {
        const d0 = t === B ? 4 : 0, d1 = t === R ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          const ray = RAY[s * 8 + d];
          for (let i = 0; i < ray.length; i++) { const to = ray[i], c = b[to]; if (!c) { if (!caps) out.push(s | to << 6); } else { if ((c >> 3) === them) out.push(s | to << 6 | F_CAP << 16); break; } }
        }
      }
    }
    return out.length;
  }

  // ---------- 指す・戻す ----------
  Pos.prototype.make = function (m) {
    const b = this.b, from = m & 63, to = (m >> 6) & 63, pr = (m >> 12) & 15, fl = m >> 16, pc = b[from], us = this.side, i = this.n++;
    this.uM[i] = m; this.uCast[i] = this.cast; this.uEp[i] = this.ep; this.uHalf[i] = this.half; this.uH1[i] = this.h1; this.uH2[i] = this.h2; this.uP[i] = pc;
    let h1 = this.h1, h2 = this.h2;
    const oe = this.epFile(); if (oe >= 0) { h1 ^= ZE1[oe]; h2 ^= ZE2[oe]; }
    let cap = b[to], capSq = to;
    if (fl & F_EP) { capSq = us ? to + 8 : to - 8; cap = b[capSq]; b[capSq] = 0; h1 ^= ZP1[cap * 64 + capSq]; h2 ^= ZP2[cap * 64 + capSq]; }
    else if (cap) { h1 ^= ZP1[cap * 64 + to]; h2 ^= ZP2[cap * 64 + to]; }
    this.uC[i] = cap;
    b[from] = 0; const np = pr ? us * 8 + pr : pc; b[to] = np;
    h1 ^= ZP1[pc * 64 + from] ^ ZP1[np * 64 + to]; h2 ^= ZP2[pc * 64 + from] ^ ZP2[np * 64 + to];
    if (fl & (F_KC | F_QC)) {
      const rf = fl & F_KC ? to + 1 : to - 2, rt = fl & F_KC ? to - 1 : to + 1, rk = us * 8 + R;
      b[rf] = 0; b[rt] = rk; h1 ^= ZP1[rk * 64 + rf] ^ ZP1[rk * 64 + rt]; h2 ^= ZP2[rk * 64 + rf] ^ ZP2[rk * 64 + rt];
    }
    if ((pc & 7) === K) this.ksq[us] = to;
    const nc = this.cast & CR[from] & CR[to];
    if (nc !== this.cast) { h1 ^= ZC1[this.cast] ^ ZC1[nc]; h2 ^= ZC2[this.cast] ^ ZC2[nc]; this.cast = nc; }
    this.ep = fl & F_DBL ? (from + to) >> 1 : -1;
    this.half = (pc & 7) === P || cap ? 0 : this.half + 1;
    if (us) this.full++;
    this.side = us ^ 1; h1 ^= ZS1; h2 ^= ZS2;
    const ne = this.epFile(); if (ne >= 0) { h1 ^= ZE1[ne]; h2 ^= ZE2[ne]; }
    this.h1 = h1; this.h2 = h2;
  };
  Pos.prototype.unmake = function () {
    const i = --this.n, m = this.uM[i], b = this.b, from = m & 63, to = (m >> 6) & 63, fl = m >> 16, pc = this.uP[i], cap = this.uC[i], us = this.side ^ 1;
    this.side = us; if (us) this.full--;
    b[from] = pc; b[to] = 0;
    if (fl & F_EP) b[us ? to + 8 : to - 8] = cap; else if (cap) b[to] = cap;
    if (fl & (F_KC | F_QC)) { const rf = fl & F_KC ? to + 1 : to - 2, rt = fl & F_KC ? to - 1 : to + 1; b[rt] = 0; b[rf] = us * 8 + R; }
    if ((pc & 7) === K) this.ksq[us] = from;
    this.cast = this.uCast[i]; this.ep = this.uEp[i]; this.half = this.uHalf[i]; this.h1 = this.uH1[i]; this.h2 = this.uH2[i];
  };
  // 空の手（探索用）
  Pos.prototype.makeNull = function () {
    const i = this.n++; this.uM[i] = 0; this.uCast[i] = this.cast; this.uEp[i] = this.ep; this.uHalf[i] = this.half; this.uH1[i] = this.h1; this.uH2[i] = this.h2;
    let h1 = this.h1, h2 = this.h2; const oe = this.epFile(); if (oe >= 0) { h1 ^= ZE1[oe]; h2 ^= ZE2[oe]; }
    this.ep = -1; this.side ^= 1; this.half++; h1 ^= ZS1; h2 ^= ZS2; this.h1 = h1; this.h2 = h2;
  };
  Pos.prototype.unmakeNull = function () { const i = --this.n; this.side ^= 1; this.cast = this.uCast[i]; this.ep = this.uEp[i]; this.half = this.uHalf[i]; this.h1 = this.uH1[i]; this.h2 = this.uH2[i]; };
  // 指して、自分のキングが取られるなら戻して false
  Pos.prototype.makeLegal = function (m) { const us = this.side; this.make(m); if (attackedBy(this.b, this.ksq[us], us ^ 1)) { this.unmake(); return false; } return true; };

  const _gen = [];
  function legalMoves(pos) {
    const tmp = [], out = []; gen(pos, tmp, false);
    for (let i = 0; i < tmp.length; i++) if (pos.makeLegal(tmp[i])) { pos.unmake(); out.push(tmp[i]); }
    return out;
  }
  function hasLegal(pos) { gen(pos, _gen, false); for (let i = 0; i < _gen.length; i++) if (pos.makeLegal(_gen[i])) { pos.unmake(); return true; } return false; }

  // ---------- perft ----------
  function perft(pos, depth) {
    if (depth === 0) return 1;
    const mv = []; gen(pos, mv, false); let n = 0;
    for (let i = 0; i < mv.length; i++) { if (!pos.makeLegal(mv[i])) continue; n += depth === 1 ? 1 : perft(pos, depth - 1); pos.unmake(); if (depth === 1) { /* unmake だけ */ } }
    return n;
  }
  function perftDivide(pos, depth) {
    const mv = legalMoves(pos), out = {};
    for (const m of mv) { pos.make(m); out[uci(m)] = depth <= 1 ? 1 : perft(pos, depth - 1); pos.unmake(); }
    return out;
  }

  // ---------- FEN ----------
  function fromFen(fen) {
    const r = parseFen(fen); if (r.error) throw new Error(r.error); return r.pos;
  }
  // { pos } か { error: コード }。コード：fields・rank・char・kings・pawns・side・cast・ep・check・count
  function parseFen(fen) {
    const parts = String(fen == null ? '' : fen).trim().split(/\s+/);
    if (!parts[0]) return { error: 'fields' };
    const rows = parts[0].split('/');
    if (rows.length !== 8) return { error: 'rank' };
    const pos = new Pos(), b = pos.b; let kings = [0, 0], cnt = [0, 0], pawns = [0, 0];
    for (let i = 0; i < 8; i++) {
      const r = 7 - i; let f = 0;
      for (const ch of rows[i]) {
        if (/[1-8]/.test(ch)) f += +ch;
        else { const p = CHAR2P[ch]; if (!p) return { error: 'char' }; if (f > 7) return { error: 'rank' }; b[r * 8 + f] = p; const c = p >> 3; cnt[c]++; if ((p & 7) === K) { kings[c]++; pos.ksq[c] = r * 8 + f; } if ((p & 7) === P) { pawns[c]++; if (r === 0 || r === 7) return { error: 'pawns' }; } f++; }
      }
      if (f !== 8) return { error: 'rank' };
    }
    if (kings[0] !== 1 || kings[1] !== 1) return { error: 'kings' };
    if (cnt[0] > 16 || cnt[1] > 16 || pawns[0] > 8 || pawns[1] > 8) return { error: 'count' };
    const sd = parts[1] || 'w'; if (sd !== 'w' && sd !== 'b') return { error: 'side' };
    pos.side = sd === 'b' ? 1 : 0;
    const cs = parts[2] || '-'; if (!/^(-|[KQkq]+)$/.test(cs)) return { error: 'cast' };
    let c = 0; if (cs.includes('K') && b[4] === 6 && b[7] === 4) c |= 1; if (cs.includes('Q') && b[4] === 6 && b[0] === 4) c |= 2; if (cs.includes('k') && b[60] === 14 && b[63] === 12) c |= 4; if (cs.includes('q') && b[60] === 14 && b[56] === 12) c |= 8;
    pos.cast = c;
    const eps = parts[3] || '-';
    if (eps !== '-') {
      const e = parseSq(eps); if (e < 0) return { error: 'ep' };
      const r = e >> 3; if (!((pos.side === 0 && r === 5) || (pos.side === 1 && r === 2))) return { error: 'ep' };
      const pawnSq = pos.side === 0 ? e - 8 : e + 8;
      if (b[pawnSq] === (pos.side ? 1 : 9) && !b[e]) pos.ep = e;       // 合わない ep は黙って捨てる
    }
    pos.half = Math.max(0, parseInt(parts[4], 10) || 0); pos.full = Math.max(1, parseInt(parts[5], 10) || 1);
    if (attackedBy(b, pos.ksq[pos.side ^ 1], pos.side)) return { error: 'check' };       // 手番でない側のキングにチェックがかかっている
    pos.hashAll();
    return { pos };
  }
  function toFen(pos) {
    let s = '';
    for (let r = 7; r >= 0; r--) { let e = 0; for (let f = 0; f < 8; f++) { const p = pos.b[r * 8 + f]; if (!p) e++; else { if (e) { s += e; e = 0; } s += pieceChar(p); } } if (e) s += e; if (r) s += '/'; }
    const c = pos.cast; return s + ' ' + (pos.side ? 'b' : 'w') + ' ' + ((c & 1 ? 'K' : '') + (c & 2 ? 'Q' : '') + (c & 4 ? 'k' : '') + (c & 8 ? 'q' : '') || '-') + ' ' + (pos.ep >= 0 ? sqName(pos.ep) : '-') + ' ' + pos.half + ' ' + pos.full;
  }
  // くり返しの判定に使う、局面の文字列（手数を除く。アンパッサンは、実際にとれるときだけ入れる）
  function posKey(pos) {
    let s = ''; for (let i = 0; i < 64; i++) s += pos.b[i] ? String.fromCharCode(64 + pos.b[i]) : '.';
    let ep = ''; if (pos.ep >= 0) { for (const m of legalMoves(pos)) if ((m >> 16) & F_EP) { ep = String(pos.ep); break; } }
    return s + pos.side + pos.cast + ep;
  }

  // ---------- 手の名前 ----------
  const uci = m => sqName(m & 63) + sqName((m >> 6) & 63) + (((m >> 12) & 15) ? PCH[(m >> 12) & 15].toLowerCase() : '');
  function toSan(pos, m, legal) {
    const from = m & 63, to = (m >> 6) & 63, pr = (m >> 12) & 15, fl = m >> 16, pc = pos.b[from], t = pc & 7; let s;
    if (fl & F_KC) s = 'O-O'; else if (fl & F_QC) s = 'O-O-O';
    else if (t === P) { s = (fl & F_CAP ? FILES[from & 7] + 'x' : '') + sqName(to) + (pr ? '=' + PCH[pr] : ''); }
    else {
      s = PCH[t];
      const lg = legal || legalMoves(pos); let amb = false, sf = false, sr = false;
      for (const x of lg) { if (x === m) continue; const xf = x & 63; if (((x >> 6) & 63) === to && (pos.b[xf] & 7) === t && pos.b[xf] === pc && xf !== from) { amb = true; if ((xf & 7) === (from & 7)) sf = true; if ((xf >> 3) === (from >> 3)) sr = true; } }
      if (amb) { if (!sf) s += FILES[from & 7]; else if (!sr) s += (from >> 3) + 1; else s += sqName(from); }
      s += (fl & F_CAP ? 'x' : '') + sqName(to);
    }
    pos.make(m);
    if (attackedBy(pos.b, pos.ksq[pos.side], pos.side ^ 1)) s += hasLegal(pos) ? '+' : '#';
    pos.unmake();
    return s;
  }
  const sanKey = s => String(s).replace(/[x+#!?=:\-]/g, '');
  // 文字（SAN・UCI・'e2-e4'・'Nf3'・'0-0'・'e8Q'・'Ng1f3' …）から合法手を探す。{ move } か { error: 'none' | 'ambiguous' }
  function parseMove(pos, text, legal) {
    let t = String(text == null ? '' : text).trim().replace(/[\u2013\u2014\u2212]/g, '-');
    if (!t) return { error: 'none' };
    t = t.replace(/[0]/g, 'O').replace(/\s+/g, '');
    const lg = legal || legalMoves(pos), key = sanKey(t);
    const cand = [];
    const uciRe = /^([a-h][1-8])([a-h][1-8])([qrbnQRBN]?)$/;
    const um = uciRe.exec(key) || (/^[KQRBNP]/.test(key) ? uciRe.exec(key.slice(1)) : null);
    if (um) {
      const f = parseSq(um[1]), to = parseSq(um[2]), pr = um[3] ? CHAR2P[um[3].toUpperCase()] : 0;
      for (const m of lg) if ((m & 63) === f && ((m >> 6) & 63) === to && (((m >> 12) & 15) === pr || (!pr && ((m >> 12) & 15) === Q && false))) cand.push(m);
      if (!cand.length && !pr) for (const m of lg) if ((m & 63) === f && ((m >> 6) & 63) === to && ((m >> 12) & 15) === Q) cand.push(m);     // 昇格の駒を書かなかったらクイーン
      if (cand.length === 1) return { move: cand[0] };
    }
    if (/^(OO|OOO)$/i.test(key)) {
      const want = key.length === 2 ? F_KC : F_QC;
      for (const m of lg) if ((m >> 16) & want) return { move: m };
      return { error: 'none' };
    }
    const sans = new Map();
    for (const m of lg) sans.set(m, sanKey(toSan(pos, m, lg)));
    const tryKey = k => { const r = []; for (const m of lg) if (sans.get(m) === k) r.push(m); return r; };
    let r = tryKey(key);
    if (!r.length && /^[nbrqk]/.test(key) && !/^[a-h]/.test(key[0].toLowerCase() === key[0] && key[0] === 'b' ? 'b' : key[0])) r = tryKey(key[0].toUpperCase() + key.slice(1));
    if (!r.length && /^b[a-h1-8]/.test(key)) r = tryKey('B' + key.slice(1));
    if (!r.length) {      // 書きすぎ・書きたりない：駒の字だけ、取る記号なし、昇格の駒が小文字
      const k2 = key.replace(/([a-h][1-8])([qrbn])$/, (m0, a, b2) => a + b2.toUpperCase());
      r = tryKey(k2);
    }
    if (r.length === 1) return { move: r[0] };
    if (r.length > 1) return { error: 'ambiguous' };
    // 駒の字＋どこから＋どこへ（Ng1f3）や、足りないあいまいさ（Nf3 で2つ）は上で処理。最後に、動かす駒の字とマスだけで探す
    const pm = /^([NBRQK])([a-h]?[1-8]?)([a-h][1-8])$/.exec(key);
    if (pm) {
      const tp = CHAR2P[pm[1]], to = parseSq(pm[3]), res = [];
      for (const m of lg) if (((m >> 6) & 63) === to && (pos.b[m & 63] & 7) === tp && (!pm[2] || sqName(m & 63).indexOf(pm[2]) >= 0)) res.push(m);
      if (res.length === 1) return { move: res[0] };
      if (res.length > 1) return { error: 'ambiguous' };
    }
    return { error: 'none' };
  }

  // ---------- 駒がたりない・メイトできる駒があるか ----------
  function material(pos) {
    const c = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]], bishopsSq = [[], []];
    for (let s = 0; s < 64; s++) { const p = pos.b[s]; if (p) { c[p >> 3][p & 7]++; if ((p & 7) === B) bishopsSq[p >> 3].push(s); } }
    return { c, bishopsSq };
  }
  // どちらも、メイトできない（キングだけ・キング＋ビショップ/ナイト1つ・同じ色のビショップだけ）
  function insufficient(pos) {
    const m = material(pos);
    for (const k of [0, 1]) { const c = m.c[k]; if (c[P] || c[R] || c[Q]) return false; }
    const minors = k => m.c[k][N] + m.c[k][B];
    if (minors(0) + minors(1) <= 1) return true;
    if (m.c[0][N] || m.c[1][N]) return false;
    const col = s => ((s >> 3) + (s & 7)) & 1, all = m.bishopsSq[0].concat(m.bishopsSq[1]);
    return all.every(s => col(s) === col(all[0]));
  }
  // color が、相手が下手でもメイトできる駒を持っているか（持ち時間切れで、勝ちか引き分けかを決める）
  function canMate(pos, color) {
    const m = material(pos), c = m.c[color], o = m.c[color ^ 1];
    if (c[P] || c[R] || c[Q]) return true;
    const n = c[N] + c[B]; if (!n) return false;
    const oppPieces = o[P] + o[N] + o[B] + o[R] + o[Q];
    if (n === 1) return oppPieces > 0;
    if (c[N] === 0 && oppPieces === 0) { const col = s => ((s >> 3) + (s & 7)) & 1, sq = m.bishopsSq[color]; return !sq.every(s => col(s) === col(sq[0])); }
    return true;
  }

  // ---------- Game：手の列と状態 ----------
  function Game(fen) {
    const r = parseFen(fen || START); if (r.error) throw new Error('fen:' + r.error);
    this.pos = r.pos; this.start = fen ? toFen(r.pos) : START; this.list = []; this.keys = [posKey(this.pos)]; this.sans = []; this.ucis = []; this.st = null; this.res = null;
  }
  Game.prototype.legal = function () { return legalMoves(this.pos); };
  Game.prototype.turn = function () { return this.pos.side; };
  Game.prototype.fen = function () { return toFen(this.pos); };
  Game.prototype.ply = function () { return this.list.length; };
  // m は手（整数）か文字。{ ok, move, san } か { ok:false, error }
  Game.prototype.play = function (mv) {
    const lg = legalMoves(this.pos); let m = mv;
    if (typeof mv !== 'number') { const r = parseMove(this.pos, mv, lg); if (r.error) return { ok: false, error: r.error }; m = r.move; }
    else if (lg.indexOf(mv) < 0) { const f = mv & 63, to = (mv >> 6) & 63; m = lg.find(x => (x & 63) === f && ((x >> 6) & 63) === to && ((x >> 12) & 15) === ((mv >> 12) & 15)); if (m == null) return { ok: false, error: 'illegal' }; }
    const san = toSan(this.pos, m, lg);
    this.pos.make(m); this.list.push(m); this.sans.push(san); this.ucis.push(uci(m)); this.keys.push(posKey(this.pos)); this.st = null;
    return { ok: true, move: m, san, status: this.status() };
  };
  Game.prototype.undo = function (n) {
    let k = 0; n = n == null ? 1 : n;
    while (n-- > 0 && this.list.length) { this.pos.unmake(); this.list.pop(); this.sans.pop(); this.ucis.pop(); this.keys.pop(); k++; }
    this.st = null; this.res = null; return k;
  };
  // 状態：{ over, result: '1-0' | '0-1' | '1/2-1/2' | '*', winner: 0 白 | 1 黒 | -1 引き分け | null, reason, check, turn }
  // reason：mate・stalemate・insufficient・repetition（3回）・fifty（50手）・seventyfive・fivefold・（外から）resign・time・agreed・abandon
  Game.prototype.status = function (o) {
    if (this.res) return this.res;
    if (this.st && !o) return this.st;
    const pos = this.pos, check = pos.inCheck(), turn = pos.side; let r;
    if (!hasLegal(pos)) r = check ? { over: true, result: turn ? '1-0' : '0-1', winner: turn ? 0 : 1, reason: 'mate' } : { over: true, result: '1/2-1/2', winner: -1, reason: 'stalemate' };
    else if (insufficient(pos)) r = { over: true, result: '1/2-1/2', winner: -1, reason: 'insufficient' };
    else {
      const rep = this.repeats();
      if (rep >= 5) r = { over: true, result: '1/2-1/2', winner: -1, reason: 'fivefold' };
      else if (pos.half >= 150) r = { over: true, result: '1/2-1/2', winner: -1, reason: 'seventyfive' };
      else if (rep >= 3) r = { over: true, result: '1/2-1/2', winner: -1, reason: 'repetition' };
      else if (pos.half >= 100) r = { over: true, result: '1/2-1/2', winner: -1, reason: 'fifty' };
      else r = { over: false, result: '*', winner: null, reason: '' };
    }
    r.check = check; r.turn = turn; r.rep = r.over ? 0 : this.repeats();
    this.st = r; return r;
  };
  Game.prototype.repeats = function () { const k = this.keys[this.keys.length - 1]; let n = 0; for (let i = this.keys.length - 1; i >= 0; i -= 1) if (this.keys[i] === k) n++; return n; };
  // 外からの終わり（投了・時間切れ・合意の引き分け）
  Game.prototype.end = function (reason, winner) {
    this.res = { over: true, result: winner === 0 ? '1-0' : winner === 1 ? '0-1' : '1/2-1/2', winner: winner == null ? -1 : winner, reason, check: false, turn: this.pos.side, rep: 0 };
    return this.res;
  };
  Game.prototype.result = function () { return this.status().result; };
  Game.prototype.lastMove = function () { return this.list.length ? this.list[this.list.length - 1] : null; };
  // n 手目（0 = 初期）の局面の Pos（読むだけ。手を戻して進めるので、すぐ使い終わること）
  Game.prototype.fenAt = function (n) {
    const keep = []; const total = this.list.length; n = Math.max(0, Math.min(total, n));
    for (let i = total - 1; i >= n; i--) { keep.push(this.list[i]); this.pos.unmake(); }
    const f = toFen(this.pos);
    for (let i = keep.length - 1; i >= 0; i--) this.pos.make(keep[i]);
    return f;
  };
  Game.fromUci = function (list, fen) { const g = new Game(fen); for (const u of list) { const r = g.play(u); if (!r.ok) throw new Error('bad move ' + u); } return g; };

  // ---------- PGN ----------
  function pgnDate(d) { d = d || new Date(); return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); }
  function toPgn(g, tags) {
    const t = Object.assign({ Event: 'Casual game', Site: 'Chess Workshop', Date: pgnDate(), Round: '-', White: 'White', Black: 'Black', Result: g.result() }, tags || {});
    if (g.start !== START) { t.SetUp = '1'; t.FEN = g.start; }
    t.Result = tags && tags.Result ? tags.Result : g.result();
    const order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    let out = order.map(k => '[' + k + ' "' + String(t[k]).replace(/["\\]/g, '\\$&') + '"]').join('\n');
    for (const k of Object.keys(t)) if (order.indexOf(k) < 0) out += '\n[' + k + ' "' + String(t[k]).replace(/["\\]/g, '\\$&') + '"]';
    const first = fenParts(g.start); const toks = []; let num = +first.full || 1, side = first.side;
    g.sans.forEach((s, i) => { if (side === 0) toks.push(num + '.'); else if (i === 0) toks.push(num + '...'); toks.push(s); if (side === 1) num++; side ^= 1; });
    toks.push(t.Result);
    let line = '', text = '';
    for (const w of toks) { if (line.length + w.length + 1 > 80) { text += line + '\n'; line = w; } else line = line ? line + ' ' + w : w; }
    return out + '\n\n' + text + line + '\n';
  }
  const fenParts = fen => { const p = String(fen).split(' '); return { side: p[1] === 'b' ? 1 : 0, full: p[5] }; };
  // PGN の文字から最初の1局。{ game, tags, result } か { error, ply, token }
  function fromPgn(text) {
    let s = String(text == null ? '' : text).replace(/\r/g, '').replace(/^\uFEFF/, '');
    const tags = {}, tre = /^\s*\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm; let mt, lastTag = 0;
    while ((mt = tre.exec(s))) { tags[mt[1]] = mt[2].replace(/\\(["\\])/g, '$1'); lastTag = tre.lastIndex; }
    let body = s.slice(lastTag).replace(/^\s*%.*$/gm, '');
    body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let depth = 0, out = '';
    for (const ch of body) { if (ch === '(') depth++; else if (ch === ')') { if (depth) depth--; } else if (!depth) out += ch; }
    const toks = out.replace(/\$\d+/g, ' ').replace(/\d+\s*\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean);
    let g; try { g = new Game(tags.FEN && /^(1|true)$/i.test(tags.SetUp || '1') ? tags.FEN : null); } catch (e) { return { error: 'fen', ply: 0, token: tags.FEN || '' }; }
    let result = tags.Result || '*';
    for (const tk of toks) {
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tk)) { result = tk; break; }
      const clean = tk.replace(/[!?]+$/, '');
      if (!clean) continue;
      const r = g.play(clean); if (!r.ok) return { error: r.error, ply: g.list.length + 1, token: tk };
    }
    return { game: g, tags, result };
  }

  // ---------- 持ち時間 ----------
  // プリセット：id・基本の秒・1手ごとにふえる秒。0 はなし（カジュアル）
  const TC = [
    { id: 0, base: 0, inc: 0, key: 'none' },
    { id: 1, base: 180, inc: 2, key: 'b3' },
    { id: 2, base: 300, inc: 0, key: 'b5' },
    { id: 3, base: 600, inc: 0, key: 'r10' },
    { id: 4, base: 900, inc: 10, key: 'r15' },
  ];
  const tcOf = id => TC[id] || TC[0];
  // 時計：remaining[色]（ms）。running = 動いている色（-1 は止まっている）。時刻は呼ぶ側が渡す（テストで決められるように）
  function Clock(tcId, now) {
    const tc = tcOf(tcId); this.tc = tc; this.rem = [tc.base * 1000, tc.base * 1000]; this.run = -1; this.t = now || 0; this.on = tc.base > 0;
  }
  Clock.prototype.left = function (color, now) { return !this.on ? Infinity : Math.max(0, this.rem[color] - (this.run === color ? now - this.t : 0)); };
  Clock.prototype.start = function (color, now) { this.run = color; this.t = now; };
  // color が指し終わった：残りから経過を引き、増分を足して、相手の時計を動かす。時間切れなら false
  Clock.prototype.press = function (color, now) {
    if (!this.on) { this.run = color ^ 1; this.t = now; return true; }
    if (this.run === color) this.rem[color] -= now - this.t;
    if (this.rem[color] <= 0) { this.rem[color] = 0; this.run = -1; return false; }
    this.rem[color] += this.tc.inc * 1000; this.run = color ^ 1; this.t = now; return true;
  };
  Clock.prototype.flagged = function (now) { if (!this.on || this.run < 0) return -1; return this.left(this.run, now) <= 0 ? this.run : -1; };
  Clock.prototype.stop = function (now) { if (this.on && this.run >= 0) this.rem[this.run] = Math.max(0, this.rem[this.run] - (now - this.t)); this.run = -1; };

  const API = {
    WHITE, BLACK, P, N, B, R, Q, K, F_CAP, F_EP, F_DBL, F_KC, F_QC, START, FILES, PCH,
    Pos, gen, legalMoves, hasLegal, perft, perftDivide, attackedBy, attackers, fromFen, parseFen, toFen, posKey,
    sqName, parseSq, typeOf, colorOf, pieceChar, CHAR2P, uci, toSan, parseMove, insufficient, canMate, material,
    Game, toPgn, fromPgn, TC, tcOf, Clock, KNT, KNG, RAY, PAT, MAXPLY,
    from: m => m & 63, to: m => (m >> 6) & 63, promo: m => (m >> 12) & 15, flags: m => m >> 16, mk: (f, t, pr, fl) => f | t << 6 | (pr || 0) << 12 | (fl || 0) << 16,
  };
  root.ChessEngine = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
