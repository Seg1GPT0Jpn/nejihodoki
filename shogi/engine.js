// 将棋：ルールと CPU（DOM を使わない）。ページ・Web Worker・node のテストで同じファイルを使う。
// ---------------------------------------------------------------------------------
// 読み込み：ページでは <script src="engine.js"></script>（ShogiEngine というグローバルを作る）。node では require('./engine.js')。
//           Web Worker として new Worker('engine.js') で開くと、CPU の思考を受け持つ（下の「Worker」）。
// 盤の座標：sq = 段 * 9 + 列（0〜80）。列 0 が9筋（画面の左）、段 0 が一段目（画面の上、後手の陣）。先手（▲）が下。
// 指し手：USI の形の文字列（"7g7f"、"8h2b+"、"P*5e"）。中では整数（to | from<<8 | 成<<16 | 打つ駒<<17、マスは番兵つきの 11×13）。
//   ShogiEngine.Position：盤（fromSfen / sfen / legal / play / undo / inCheck / perft …）
//   ShogiEngine.Game：対局（手の記録・千日手・連続王手の千日手・詰み・投了・時間切れ・入玉宣言（27点法））
//   ShogiEngine.search(pos, { level, timeMs, depth, history }) → { move, score, depth, nodes }
//   ShogiEngine.solveMate(pos, maxPly) → 詰将棋の解（王手だけの AND/OR 探索）
//   ShogiEngine.kanji(pos, move, prevTo) / ShogiEngine.western(pos, move) / ShogiEngine.kif(game, info)：棋譜の表記
(function (root) {
'use strict';

// ---------------------------------------------------------------- pieces
const FU = 1, KY = 2, KE = 3, GI = 4, KI = 5, KA = 6, HI = 7, OU = 8;
const TO = 9, NY = 10, NK = 11, NG = 12, UM = 14, RY = 15;
const PROMOTABLE = [0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
const base = t => (t > 8 ? t - 8 : t);
const SFEN_CH = ['', 'P', 'L', 'N', 'S', 'G', 'B', 'R', 'K'];
const VALUE = [0, 100, 300, 350, 500, 560, 800, 950, 0, 560, 560, 560, 560, 0, 1150, 1350];
const HAND_VALUE = [0, 115, 320, 370, 540, 600, 880, 1050];

// ---------------------------------------------------------------- board geometry (11 wide, 13 tall; 2 rows of wall top and bottom for knights)
const BW = 11, BH = 13, NSQ = BW * BH, WALL = 100;
const pad = sq => ((sq / 9 | 0) + 2) * BW + (sq % 9) + 1;
const unpad = i => ((i / BW | 0) - 2) * 9 + (i % BW) - 1;
const P2S = new Int16Array(NSQ).fill(-1);
const S2P = new Int16Array(81);
for (let s = 0; s < 81; s++) { S2P[s] = pad(s); P2S[pad(s)] = s; }
const rowOf = i => (i / BW | 0) - 2; // 0..8 (段 - 1)
const colOf = i => (i % BW) - 1;     // 0..8 (0 = 9筋)

const N = -BW, S = BW, L = -1, R = 1;
const ALL8 = [N, S, L, R, N + L, N + R, S + L, S + R];
const GOLD = [N, N + L, N + R, L, R, S];
const STEP0 = [], SLIDE0 = [];
STEP0[FU] = [N]; STEP0[KY] = []; STEP0[KE] = [2 * N + L, 2 * N + R]; STEP0[GI] = [N, N + L, N + R, S + L, S + R];
STEP0[KI] = GOLD; STEP0[KA] = []; STEP0[HI] = []; STEP0[OU] = ALL8;
STEP0[TO] = GOLD; STEP0[NY] = GOLD; STEP0[NK] = GOLD; STEP0[NG] = GOLD; STEP0[13] = []; STEP0[UM] = [N, S, L, R]; STEP0[RY] = [N + L, N + R, S + L, S + R];
for (let t = 0; t < 16; t++) { STEP0[t] = STEP0[t] || []; SLIDE0[t] = []; }
SLIDE0[KY] = [N]; SLIDE0[KA] = [N + L, N + R, S + L, S + R]; SLIDE0[HI] = [N, S, L, R];
SLIDE0[UM] = SLIDE0[KA]; SLIDE0[RY] = SLIDE0[HI];
// [side][type] → offsets (gote: mirrored)
const STEP = [STEP0, STEP0.map(a => a.map(d => -d))];
const SLIDE = [SLIDE0, SLIDE0.map(a => a.map(d => -d))];
// attack masks: for an attacker of side s on the square sq + ALL8[k], which types reach sq in one step / by sliding
const STEP_ATK = [new Int32Array(8), new Int32Array(8)], SLIDE_ATK = [new Int32Array(8), new Int32Array(8)];
for (let s = 0; s < 2; s++) for (let k = 0; k < 8; k++) {
  const back = -ALL8[k];
  for (let t = 1; t < 16; t++) {
    if (STEP[s][t].indexOf(back) >= 0) STEP_ATK[s][k] |= 1 << t;
    if (SLIDE[s][t].indexOf(back) >= 0) { SLIDE_ATK[s][k] |= 1 << t; STEP_ATK[s][k] |= 1 << t; }
  }
}
// promotion zone / dead squares, by side and padded index
const ZONE = [new Uint8Array(NSQ), new Uint8Array(NSQ)];
const DEAD = [new Uint8Array(NSQ * 16), new Uint8Array(NSQ * 16)]; // DEAD[s][t*NSQ+i]: a piece of type t cannot stand there
for (let s = 0; s < 81; s++) {
  const i = S2P[s], r = (s / 9) | 0;
  ZONE[0][i] = r <= 2 ? 1 : 0; ZONE[1][i] = r >= 6 ? 1 : 0;
  DEAD[0][FU * NSQ + i] = DEAD[0][KY * NSQ + i] = r === 0 ? 1 : 0; DEAD[0][KE * NSQ + i] = r <= 1 ? 1 : 0;
  DEAD[1][FU * NSQ + i] = DEAD[1][KY * NSQ + i] = r === 8 ? 1 : 0; DEAD[1][KE * NSQ + i] = r >= 7 ? 1 : 0;
}

// ---------------------------------------------------------------- move encoding
const mk = (from, to, pro, drop) => to | (from << 8) | (pro ? 1 << 16 : 0) | (drop << 17);
const mTo = m => m & 255, mFrom = m => (m >> 8) & 255, mPro = m => (m >> 16) & 1, mDrop = m => (m >> 17) & 15;
const FILES = '987654321', RANKS = 'abcdefghi';
function sqName(i) { const s = P2S[i]; return FILES[s % 9] + RANKS[(s / 9) | 0]; }
function toUsi(m) {
  if (!m) return '';
  const d = mDrop(m);
  if (d) return SFEN_CH[d] + '*' + sqName(mTo(m));
  return sqName(mFrom(m)) + sqName(mTo(m)) + (mPro(m) ? '+' : '');
}
function parseSq(s) {
  const f = '123456789'.indexOf(s[0]), r = RANKS.indexOf(s[1]);
  if (f < 0 || r < 0) return -1;
  return S2P[r * 9 + (8 - f)];
}

// ---------------------------------------------------------------- zobrist (two 32-bit halves)
let seed = 0x9e3779b9;
const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const ZB1 = new Int32Array(31 * NSQ), ZB2 = new Int32Array(31 * NSQ);
for (let i = 0; i < ZB1.length; i++) { ZB1[i] = rnd32(); ZB2[i] = rnd32(); }
const ZH1 = new Int32Array(2 * 8 * 20), ZH2 = new Int32Array(2 * 8 * 20);
for (let i = 0; i < ZH1.length; i++) { ZH1[i] = rnd32(); ZH2[i] = rnd32(); }
const ZS1 = rnd32(), ZS2 = rnd32();
const zIdx = (p, i) => (p + 15) * NSQ + i;
const zhIdx = (s, t, c) => (s * 8 + t) * 20 + c;

// ---------------------------------------------------------------- Position
const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

class Position {
  constructor(sfen) {
    this.b = new Int8Array(NSQ);
    this.hand = new Int8Array(16); // side*8 + type
    this.king = new Int16Array(2);
    this.side = 0;
    this.h1 = 0; this.h2 = 0; this.mat = 0;
    this.ply = 1;
    // undo stack
    this.uMove = []; this.uCap = []; this.uH1 = []; this.uH2 = []; this.uMat = [];
    this.setSfen(sfen || START);
  }
  clone() { const p = new Position(this.sfen()); return p; }
  setSfen(sfen) {
    const parts = String(sfen).trim().split(/\s+/);
    if (parts[0] === 'startpos') parts.splice(0, 1, ...START.split(' '));
    const b = this.b; b.fill(WALL);
    for (let s = 0; s < 81; s++) b[S2P[s]] = 0;
    this.hand.fill(0); this.king[0] = this.king[1] = 0;
    const rows = parts[0].split('/');
    if (rows.length !== 9) throw new Error('bad sfen: ' + sfen);
    for (let r = 0; r < 9; r++) {
      let c = 0, pro = false;
      for (const ch of rows[r]) {
        if (ch === '+') { pro = true; continue; }
        if (/[1-9]/.test(ch)) { c += +ch; continue; }
        const up = ch.toUpperCase(), t = SFEN_CH.indexOf(up);
        if (t <= 0 || c > 8) throw new Error('bad sfen: ' + sfen);
        const tt = pro ? t + 8 : t, sd = ch === up ? 0 : 1;
        const i = S2P[r * 9 + c];
        b[i] = sd ? -tt : tt;
        if (t === OU) this.king[sd] = i;
        c++; pro = false;
      }
      if (c !== 9) throw new Error('bad sfen: ' + sfen);
    }
    this.side = parts[1] === 'w' ? 1 : 0;
    const hs = parts[2] || '-';
    if (hs !== '-') {
      let n = 0;
      for (const ch of hs) {
        if (/[0-9]/.test(ch)) { n = n * 10 + +ch; continue; }
        const up = ch.toUpperCase(), t = SFEN_CH.indexOf(up);
        if (t <= 0 || t >= OU) throw new Error('bad sfen hand: ' + sfen);
        this.hand[(ch === up ? 0 : 8) + t] += n || 1; n = 0;
      }
    }
    this.ply = +(parts[3] || 1) || 1;
    this.uMove.length = this.uCap.length = this.uH1.length = this.uH2.length = this.uMat.length = 0;
    this.rehash();
    return this;
  }
  rehash() {
    let h1 = 0, h2 = 0, mat = 0;
    for (let s = 0; s < 81; s++) {
      const i = S2P[s], p = this.b[i];
      if (!p) continue;
      h1 ^= ZB1[zIdx(p, i)]; h2 ^= ZB2[zIdx(p, i)];
      mat += p > 0 ? VALUE[p] : -VALUE[-p];
    }
    for (let sd = 0; sd < 2; sd++) for (let t = 1; t < 8; t++) {
      const c = this.hand[sd * 8 + t];
      h1 ^= ZH1[zhIdx(sd, t, c)]; h2 ^= ZH2[zhIdx(sd, t, c)];
      mat += (sd ? -1 : 1) * c * HAND_VALUE[t];
    }
    if (this.side) { h1 ^= ZS1; h2 ^= ZS2; }
    this.h1 = h1; this.h2 = h2; this.mat = mat;
    // no king on the board (tsume: the attacker has none)
    for (let sd = 0; sd < 2; sd++) { const k = this.king[sd]; if (!k || Math.abs(this.b[k]) !== OU) this.king[sd] = 0; }
  }
  key() { return (this.h1 >>> 0).toString(36) + '.' + (this.h2 >>> 0).toString(36); }
  sfen(withPly) {
    let out = '';
    for (let r = 0; r < 9; r++) {
      let e = 0;
      for (let c = 0; c < 9; c++) {
        const p = this.b[S2P[r * 9 + c]];
        if (!p) { e++; continue; }
        if (e) { out += e; e = 0; }
        const t = Math.abs(p), ch = SFEN_CH[base(t)];
        out += (t > 8 ? '+' : '') + (p > 0 ? ch : ch.toLowerCase());
      }
      if (e) out += e;
      if (r < 8) out += '/';
    }
    let hs = '';
    for (const sd of [0, 1]) for (const t of [HI, KA, KI, GI, KE, KY, FU]) {
      const c = this.hand[sd * 8 + t];
      if (c) hs += (c > 1 ? c : '') + (sd ? SFEN_CH[t].toLowerCase() : SFEN_CH[t]);
    }
    return out + ' ' + (this.side ? 'w' : 'b') + ' ' + (hs || '-') + ' ' + (withPly === false ? 1 : this.ply);
  }
  // ---- make / unmake
  make(m) {
    const b = this.b, sd = this.side, sg = sd ? -1 : 1, to = mTo(m), d = mDrop(m);
    this.uMove.push(m); this.uH1.push(this.h1); this.uH2.push(this.h2); this.uMat.push(this.mat);
    let h1 = this.h1 ^ ZS1, h2 = this.h2 ^ ZS2, mat = this.mat;
    if (d) {
      const hi = sd * 8 + d, c = this.hand[hi];
      h1 ^= ZH1[zhIdx(sd, d, c)] ^ ZH1[zhIdx(sd, d, c - 1)]; h2 ^= ZH2[zhIdx(sd, d, c)] ^ ZH2[zhIdx(sd, d, c - 1)];
      this.hand[hi] = c - 1;
      const p = sg * d; b[to] = p;
      h1 ^= ZB1[zIdx(p, to)]; h2 ^= ZB2[zIdx(p, to)];
      mat += sg * (VALUE[d] - HAND_VALUE[d]);
      this.uCap.push(0);
    } else {
      const from = mFrom(m), p = b[from], cap = b[to];
      this.uCap.push(cap);
      h1 ^= ZB1[zIdx(p, from)]; h2 ^= ZB2[zIdx(p, from)];
      b[from] = 0;
      if (cap) {
        h1 ^= ZB1[zIdx(cap, to)]; h2 ^= ZB2[zIdx(cap, to)];
        const ct = base(Math.abs(cap)), hi = sd * 8 + ct, c = this.hand[hi];
        h1 ^= ZH1[zhIdx(sd, ct, c)] ^ ZH1[zhIdx(sd, ct, c + 1)]; h2 ^= ZH2[zhIdx(sd, ct, c)] ^ ZH2[zhIdx(sd, ct, c + 1)];
        this.hand[hi] = c + 1;
        mat += sg * (VALUE[Math.abs(cap)] + HAND_VALUE[ct]);
        if (Math.abs(cap) === OU) this.king[sd ^ 1] = 0;
      }
      const np = mPro(m) ? p + sg * 8 : p;
      b[to] = np;
      h1 ^= ZB1[zIdx(np, to)]; h2 ^= ZB2[zIdx(np, to)];
      if (np !== p) mat += sg * (VALUE[Math.abs(np)] - VALUE[Math.abs(p)]);
      if (p === sg * OU) this.king[sd] = to;
    }
    this.h1 = h1; this.h2 = h2; this.mat = mat;
    this.side = sd ^ 1; this.ply++;
  }
  unmake() {
    const m = this.uMove.pop(), cap = this.uCap.pop();
    this.h1 = this.uH1.pop(); this.h2 = this.uH2.pop(); this.mat = this.uMat.pop();
    const sd = this.side ^ 1, sg = sd ? -1 : 1, b = this.b, to = mTo(m), d = mDrop(m);
    this.side = sd; this.ply--;
    if (d) { b[to] = 0; this.hand[sd * 8 + d]++; return m; }
    const from = mFrom(m), np = b[to], p = mPro(m) ? np - sg * 8 : np;
    b[from] = p; b[to] = cap;
    if (cap) { this.hand[sd * 8 + base(Math.abs(cap))]--; if (Math.abs(cap) === OU) this.king[sd ^ 1] = to; }
    if (p === sg * OU) this.king[sd] = from;
    return m;
  }
  // null move (search only)
  // ---- attacks
  // is padded square i attacked by side `by`?
  attacked(i, by) {
    const b = this.b, sg = by ? -1 : 1, st = STEP_ATK[by], sl = SLIDE_ATK[by];
    for (let k = 0; k < 8; k++) {
      const e = ALL8[k];
      let q = i + e, v = b[q];
      if (v === WALL) continue;
      if (v) {
        if (v * sg > 0 && (st[k] >> (v * sg)) & 1) return true;
        continue;
      }
      const msk = sl[k];
      if (!msk) continue;
      do { q += e; v = b[q]; } while (v === 0);
      if (v !== WALL && v * sg > 0 && (msk >> (v * sg)) & 1) return true;
    }
    // knights: a knight of `by` sits two rows behind (from its own view) and one file aside
    const kb = by ? 2 * N : 2 * S, kn = sg * KE;
    if (b[i + kb + L] === kn || b[i + kb + R] === kn) return true;
    return false;
  }
  inCheck(sd) { if (sd == null) sd = this.side; const k = this.king[sd]; return !!k && this.attacked(k, sd ^ 1); }
  // ---- move generation (pseudo-legal: may leave the own king in check; no 打ち歩詰め test)
  gen(out, n, capsOnly) {
    const b = this.b, sd = this.side, sg = sd ? -1 : 1, zone = ZONE[sd], dead = DEAD[sd];
    const stepT = STEP[sd], slideT = SLIDE[sd];
    for (let s = 0; s < 81; s++) {
      const from = S2P[s], p = b[from] * sg;
      if (p <= 0) continue;
      const st = stepT[p];
      for (let k = 0; k < st.length; k++) {
        const to = from + st[k], v = b[to];
        if (v === WALL || v * sg > 0) continue;
        if (capsOnly && !v) continue;
        n = this._add(out, n, from, to, p, zone, dead);
      }
      const sl = slideT[p];
      for (let k = 0; k < sl.length; k++) {
        const e = sl[k];
        let to = from + e, v = b[to];
        while (v === 0) { if (!capsOnly) n = this._add(out, n, from, to, p, zone, dead); to += e; v = b[to]; }
        if (v !== WALL && v * sg < 0) n = this._add(out, n, from, to, p, zone, dead);
      }
    }
    if (capsOnly) return n;
    const ho = sd * 8;
    let any = false;
    for (let t = 1; t < 8; t++) if (this.hand[ho + t]) { any = true; break; }
    if (!any) return n;
    let pawnFiles = 0;
    if (this.hand[ho + FU]) for (let s = 0; s < 81; s++) if (b[S2P[s]] === sg * FU) pawnFiles |= 1 << (s % 9);
    for (let t = 1; t < 8; t++) {
      if (!this.hand[ho + t]) continue;
      const dt = t * NSQ;
      for (let s = 0; s < 81; s++) {
        const to = S2P[s];
        if (b[to] || dead[dt + to]) continue;
        if (t === FU && (pawnFiles >> (s % 9)) & 1) continue;
        out[n++] = mk(0, to, 0, t);
      }
    }
    return n;
  }
  _add(out, n, from, to, p, zone, dead) {
    if (PROMOTABLE[p] && (zone[from] || zone[to])) {
      out[n++] = mk(from, to, 1, 0);
      if (!dead[p * NSQ + to]) out[n++] = mk(from, to, 0, 0);
    } else out[n++] = mk(from, to, 0, 0);
    return n;
  }
  // after make(m): did m leave the mover's king in check?
  leftInCheck() { const sd = this.side ^ 1, k = this.king[sd]; return !!k && this.attacked(k, this.side); }
  // m is a pawn drop that checks the king directly in front of it
  pawnDropCheck(m) {
    if (mDrop(m) !== FU) return false;
    const k = this.king[this.side ^ 1];
    return !!k && mTo(m) + (this.side ? S : N) === k;
  }
  // full legality of a pseudo-legal move (including 打ち歩詰め)
  isLegalPseudo(m) {
    const drop = this.pawnDropCheck(m);
    this.make(m);
    let ok = !this.leftInCheck();
    if (ok && drop && !this.hasEvasionNoDrop()) ok = false;
    this.unmake();
    return ok;
  }
  // the side to move (in check from an adjacent pawn) has a legal reply. Drops cannot block an adjacent check.
  hasEvasionNoDrop() {
    const buf = this._buf || (this._buf = new Int32Array(1024));
    const n = this.gen(buf, 0, false);
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      if (mDrop(m)) continue;
      this.make(m);
      const bad = this.leftInCheck();
      this.unmake();
      if (!bad) return true;
    }
    return false;
  }
  legalMoves() {
    const buf = new Int32Array(1024), n = this.gen(buf, 0, false), out = [];
    for (let i = 0; i < n; i++) if (this.isLegalPseudo(buf[i])) out.push(buf[i]);
    return out;
  }
  hasLegalMove() {
    const buf = new Int32Array(1024), n = this.gen(buf, 0, false);
    for (let i = 0; i < n; i++) if (this.isLegalPseudo(buf[i])) return true;
    return false;
  }
  legal() { return this.legalMoves().map(toUsi); }
  parse(usi) {
    usi = String(usi || '').trim();
    let m = 0;
    if (/^[PLNSGBR]\*[1-9][a-i]$/.test(usi)) m = mk(0, parseSq(usi.slice(2)), 0, SFEN_CH.indexOf(usi[0]));
    else if (/^[1-9][a-i][1-9][a-i]\+?$/.test(usi)) m = mk(parseSq(usi.slice(0, 2)), parseSq(usi.slice(2, 4)), usi[4] === '+', 0);
    else return 0;
    return this.legalMoves().indexOf(m) >= 0 ? m : 0;
  }
  play(usi) { const m = typeof usi === 'number' ? usi : this.parse(usi); if (!m) return false; this.make(m); return true; }
  givesCheck(m) { this.make(m); const c = this.inCheck(); this.unmake(); return c; }
  perft(d) {
    if (d === 0) return 1;
    const buf = new Int32Array(1024), n = this.gen(buf, 0, false);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      const pd = this.pawnDropCheck(m);
      this.make(m);
      if (!this.leftInCheck() && !(pd && !this.hasEvasionNoDrop())) total += d === 1 ? 1 : this.perft(d - 1);
      this.unmake();
    }
    return total;
  }
  // helpers for the page (unpadded squares)
  at(sq) { return this.b[S2P[sq]]; }
  handOf(sd, t) { return this.hand[sd * 8 + t]; }
}

// ---------------------------------------------------------------- move info for the page
function info(m) {
  const d = mDrop(m);
  return { from: d ? -1 : P2S[mFrom(m)], to: P2S[mTo(m)], promote: !!mPro(m), drop: d };
}

// ---------------------------------------------------------------- notation
const KANJI_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const ZEN_NUM = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const KANJI_PIECE = ['', '歩', '香', '桂', '銀', '金', '角', '飛', '玉', 'と', '成香', '成桂', '成銀', '', '馬', '龍'];
const KIF_PIECE = ['', '歩', '香', '桂', '銀', '金', '角', '飛', '玉', 'と', '成香', '成桂', '成銀', '', '馬', '龍'];
const EN_PIECE = ['', 'P', 'L', 'N', 'S', 'G', 'B', 'R', 'K', '+P', '+L', '+N', '+S', '', '+B', '+R'];
const fileOf = i => 9 - colOf(i), rankOf = i => rowOf(i) + 1;

// other pieces of the same kind that can legally go to the same square (for the relative words)
function rivals(pos, m) {
  const to = mTo(m), from = mFrom(m), p = pos.b[from];
  return pos.legalMoves().filter(x => !mDrop(x) && mTo(x) === to && mFrom(x) !== from && pos.b[mFrom(x)] === p)
    .map(mFrom).filter((v, i, a) => a.indexOf(v) === i);
}
function relWords(pos, m) {
  const d = mDrop(m);
  if (d) {
    // 打 only when a piece on the board could also go there
    const to = mTo(m), sg = pos.side ? -1 : 1;
    return pos.legalMoves().some(x => !mDrop(x) && mTo(x) === to && pos.b[mFrom(x)] === sg * d) ? '打' : '';
  }
  const others = rivals(pos, m);
  if (!others.length) return '';
  const sd = pos.side, fwd = i => (sd ? rowOf(i) : -rowOf(i)), side = i => (sd ? -colOf(i) : colOf(i)); // larger side() = more to the mover's right
  const from = mFrom(m), to = mTo(m), t = Math.abs(pos.b[from]);
  const vert = i => (fwd(to) > fwd(i) ? '上' : fwd(to) < fwd(i) ? '引' : '寄');
  const myV = vert(from);
  // 龍・馬：two pieces → 右/左 (or 上/引/寄 when they differ)
  const all = others.concat([from]);
  if (t === UM || t === RY) {
    if (others.every(o => vert(o) !== myV)) return myV;
    const mine = side(from);
    if (all.every(o => o === from || side(o) < mine)) return '右';
    if (all.every(o => o === from || side(o) > mine)) return '左';
    return myV;
  }
  // straight forward for golds, silvers and the promoted minors
  if (myV === '上' && colOf(from) === colOf(to) && t !== KE && others.every(o => !(vert(o) === '上' && colOf(o) === colOf(to)))) {
    if ([GI, KI, TO, NY, NK, NG].indexOf(t) >= 0) return '直';
  }
  if (others.every(o => vert(o) !== myV)) return myV;
  const mine = side(from);
  let h = '';
  if (others.every(o => side(o) < mine)) h = '右';
  else if (others.every(o => side(o) > mine)) h = '左';
  if (!h) return myV;
  // 右/左 alone is enough when no other candidate is on the same side of the board line
  return others.length === 1 ? h : h + myV;
}
function promoWord(pos, m) {
  if (mDrop(m)) return '';
  const from = mFrom(m), to = mTo(m), t = Math.abs(pos.b[from]);
  if (mPro(m)) return '成';
  const z = ZONE[pos.side];
  return PROMOTABLE[t] && (z[from] || z[to]) ? '不成' : '';
}
// ▲7六歩 style (pos = the position before the move; prevTo = the last move's destination, padded, for 同)
function kanji(pos, m, prevTo, opt) {
  opt = opt || {};
  const to = mTo(m), d = mDrop(m), t = d || Math.abs(pos.b[mFrom(m)]);
  const mark = pos.side ? '△' : '▲';
  const dest = prevTo && prevTo === to ? '同' + (opt.kif ? '　' : '') : (opt.kif ? ZEN_NUM[fileOf(to)] : fileOf(to)) + KANJI_NUM[rankOf(to)];
  let name = (opt.kif ? KIF_PIECE : KANJI_PIECE)[t];
  if (t === OU && pos.side && !opt.kif) name = '王';
  const rel = opt.kif ? (d ? '打' : '') : relWords(pos, m);
  const s = dest + name + rel + promoWord(pos, m);
  if (opt.kif) return s + (d ? '' : '(' + fileOf(mFrom(m)) + rankOf(mFrom(m)) + ')');
  return (opt.noMark ? '' : mark) + s;
}
// Hodges-style English notation: P-7f, Bx3c+, P*5e, S6h-5g (origin when two pieces of the kind can go there)
function western(pos, m, opt) {
  opt = opt || {};
  const to = mTo(m), d = mDrop(m), dest = fileOf(to) + RANKS[rankOf(to) - 1];
  const mark = opt.noMark ? '' : pos.side ? '☖' : '☗';
  if (d) return mark + EN_PIECE[d] + '*' + dest;
  const from = mFrom(m), t = Math.abs(pos.b[from]), cap = pos.b[to] !== 0;
  const amb = rivals(pos, m).length > 0;
  const pw = promoWord(pos, m);
  return mark + EN_PIECE[t] + (amb ? fileOf(from) + RANKS[rankOf(from) - 1] : '') + (cap ? 'x' : '-') + dest + (pw === '成' ? '+' : pw === '不成' ? '=' : '');
}

// ---------------------------------------------------------------- Game: a whole game with the end rules
const DECL_BIG = [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1];
class Game {
  constructor(sfen) {
    this.start = sfen || START;
    this.pos = new Position(this.start);
    this.moves = [];     // integer moves
    this.usi = [];
    this.checks = [];    // did move i give check
    this.keys = [this.pos.key()];
    this.result = null;  // { winner: 0 | 1 | -1 (draw), reason }
  }
  static fromMoves(sfen, list) { const g = new Game(sfen); for (const u of list || []) if (!g.play(u)) break; return g; }
  get side() { return this.pos.side; }
  lastTo() { const m = this.moves[this.moves.length - 1]; return m ? mTo(m) : 0; }
  notation(i, lang) { // notation of move i (replays from the start)
    const p = new Position(this.start);
    for (let k = 0; k < i; k++) p.make(this.moves[k]);
    const prev = i > 0 ? mTo(this.moves[i - 1]) : 0;
    return lang === 'en' ? western(p, this.moves[i]) : kanji(p, this.moves[i], prev);
  }
  // play a move (usi or integer). Returns the move's notation info or null when illegal / the game is over.
  play(u, opt) {
    if (this.result) return null;
    const pos = this.pos;
    const m = typeof u === 'number' ? (pos.legalMoves().indexOf(u) >= 0 ? u : 0) : pos.parse(u);
    if (!m) return null;
    const prev = this.lastTo();
    const ja = kanji(pos, m, prev), en = western(pos, m);
    pos.make(m);
    this.moves.push(m); this.usi.push(toUsi(m));
    const chk = pos.inCheck();
    this.checks.push(chk);
    const k = pos.key();
    this.keys.push(k);
    if (!(opt && opt.noEnd)) this.judge();
    return { move: m, usi: toUsi(m), ja, en, check: chk, result: this.result };
  }
  judge() {
    const pos = this.pos;
    if (!pos.hasLegalMove()) { this.result = { winner: pos.side ^ 1, reason: 'mate' }; return this.result; }
    // 千日手：the same position (board, hands, side to move) for the fourth time
    const k = this.keys[this.keys.length - 1];
    let first = -1, cnt = 0;
    for (let i = this.keys.length - 1; i >= 0; i--) if (this.keys[i] === k) { cnt++; first = i; }
    if (cnt >= 4) {
      // 連続王手の千日手：from the first of the four positions, every move of one side was a check → that side loses
      const allChk = [true, true];
      for (let i = first; i < this.moves.length; i++) {
        const mover = (this.sideAt(i));
        if (!this.checks[i]) allChk[mover] = false;
      }
      if (allChk[0] !== allChk[1]) this.result = { winner: allChk[0] ? 1 : 0, reason: 'perpetual' };
      else this.result = { winner: -1, reason: 'sennichite' };
    }
    return this.result;
  }
  // side that made move i
  sideAt(i) { const s0 = /\sw(\s|$)/.test(this.start) ? 1 : 0; return (s0 + i) & 1; }
  undo(n) {
    n = n == null ? 1 : n;
    for (let i = 0; i < n && this.moves.length; i++) {
      this.pos.unmake(); this.moves.pop(); this.usi.pop(); this.checks.pop(); this.keys.pop();
    }
    this.result = null;
  }
  resign(sd) { if (!this.result) this.result = { winner: (sd == null ? this.pos.side : sd) ^ 1, reason: 'resign' }; return this.result; }
  timeout(sd) { if (!this.result) this.result = { winner: sd ^ 1, reason: 'time' }; return this.result; }
  end(winner, reason) { if (!this.result) this.result = { winner, reason }; return this.result; }
  // 入玉宣言（27点法）: the side to move; king in the enemy camp, not in check, 10+ other pieces there,
  // points (飛角と成った飛角 5, others 1; pieces in the enemy camp and in hand) ≥ 28 for sente, ≥ 27 for gote.
  declareInfo(sd) {
    const pos = this.pos; if (sd == null) sd = pos.side;
    const sg = sd ? -1 : 1, k = pos.king[sd], zone = ZONE[sd];
    const r = { ok: false, king: !!k && !!zone[k], check: pos.inCheck(sd), pieces: 0, points: 0, need: sd ? 27 : 28 };
    for (let s = 0; s < 81; s++) {
      const i = S2P[s], p = pos.b[i] * sg;
      if (p <= 0 || p === OU || !zone[i]) continue;
      r.pieces++; r.points += DECL_BIG[p] ? 5 : 1;
    }
    for (let t = 1; t < 8; t++) r.points += pos.hand[sd * 8 + t] * (t === KA || t === HI ? 5 : 1);
    r.ok = r.king && !r.check && r.pieces >= 10 && r.points >= r.need && pos.side === sd && !this.result;
    return r;
  }
  declare() {
    const d = this.declareInfo();
    if (!d.ok) return null;
    this.result = { winner: this.pos.side, reason: 'declare' };
    return this.result;
  }
}

// ---------------------------------------------------------------- KIF export
const KIF_RESULT = { resign: '投了', time: '切れ負け', mate: '詰み', sennichite: '千日手', perpetual: '反則負け', declare: '入玉宣言', disc: '切断', abort: '中断' };
function kif(game, o) {
  o = o || {};
  const lines = ['# KIF形式棋譜ファイル', '# ひまつぶし工房「将棋」'];
  if (o.date) lines.push('開始日時：' + o.date);
  if (o.handicap) lines.push('手合割：' + o.handicap);
  else lines.push('手合割：平手');
  const hc = o.handicap && o.handicap !== '平手';
  lines.push((hc ? '下手：' : '先手：') + (o.black || ''));
  lines.push((hc ? '上手：' : '後手：') + (o.white || ''));
  if (game.start !== START && !hc) lines.push('# 開始局面（SFEN）：' + game.start);
  lines.push('手数----指手---------消費時間--');
  const p = new Position(game.start);
  const times = o.times || [];
  game.moves.forEach((m, i) => {
    const prev = i ? mTo(game.moves[i - 1]) : 0;
    const s = kanji(p, m, prev, { kif: true });
    const t = times[i] || 0, mm = Math.floor(t / 60), ss = t % 60;
    lines.push(String(i + 1).padStart(4, ' ') + ' ' + s + '   (' + String(mm).padStart(2, ' ') + ':' + String(ss).padStart(2, '0') + '/)');
    p.make(m);
  });
  const res = game.result;
  if (res) {
    const word = KIF_RESULT[res.reason] || '中断';
    lines.push(String(game.moves.length + 1).padStart(4, ' ') + ' ' + word);
    if (res.winner >= 0) {
      lines.push('まで' + game.moves.length + '手で' + (hc ? (res.winner === 0 ? '下手' : '上手') : (res.winner === 0 ? '先手' : '後手')) + 'の勝ち');
    } else lines.push('まで' + game.moves.length + '手で' + (res.reason === 'sennichite' ? '千日手' : '中断'));
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- search
const INF = 1000000, MATE = 900000;
const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
let TT = null;
function ttInit() {
  if (TT) return TT;
  TT = { k: new Int32Array(TT_SIZE), m: new Int32Array(TT_SIZE), s: new Int32Array(TT_SIZE), d: new Int8Array(TT_SIZE), f: new Int8Array(TT_SIZE) };
  return TT;
}
const MAXPLY = 64;

// evaluation from the side to move: material (incremental) + king safety
function evaluate(pos) {
  const b = pos.b;
  let sc = pos.mat;
  for (let sd = 0; sd < 2; sd++) {
    const k = pos.king[sd];
    if (!k) continue;
    const sg = sd ? -1 : 1;
    let safe = 0, danger = 0;
    const kr = rowOf(k), kc = colOf(k);
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      if (!dr && !dc) continue;
      const q = k + dr * BW + dc, v = b[q];
      if (!v || v === WALL) continue;
      const t = Math.abs(v), near = Math.abs(dr) <= 1 && Math.abs(dc) <= 1;
      if (v * sg > 0) {
        if (t === KI || t === GI || (t >= TO && t <= NG)) safe += near ? 28 : 14;
      } else {
        danger += (near ? 2 : 1) * (t === HI || t === RY || t === KA || t === UM ? 30 : t === OU ? 0 : 18);
      }
    }
    // the enemy's pieces in hand are threats near an open king
    let hand = 0;
    for (let t = 1; t < 8; t++) hand += pos.hand[(sd ^ 1) * 8 + t] * (t >= KA ? 3 : t >= GI ? 2 : 1);
    // a king still in its own camp's last rows is safer in the opening
    const home = sd ? kr <= 1 : kr >= 7;
    const edge = kc <= 1 || kc >= 7 ? 12 : 0;
    const s = safe - danger - hand * (danger ? 4 : 2) + (home ? 20 : 0) + edge;
    sc += sg * s;
  }
  // sliders: open lines (mobility); golds and silvers that wander far from their king
  for (let q = 0; q < 81; q++) {
    const i = S2P[q], v = b[i];
    if (!v) continue;
    const t = v > 0 ? v : -v, sg = v > 0 ? 1 : -1;
    if (t === KA || t === HI || t === UM || t === RY || t === KY) {
      const rays = SLIDE[v > 0 ? 0 : 1][t], w = t === KA || t === UM ? 4 : t === KY ? 1 : 3;
      let mob = 0;
      for (let k = 0; k < rays.length; k++) { let j = i + rays[k]; while (b[j] === 0) { mob++; j += rays[k]; } if (b[j] !== WALL && b[j] * sg < 0) mob++; }
      sc += sg * w * mob;
    } else if (t === KI || t === GI) {
      const k = pos.king[v > 0 ? 0 : 1];
      if (k) { const dd = Math.max(Math.abs(rowOf(k) - rowOf(i)), Math.abs(colOf(k) - colOf(i))); if (dd > 2) sc -= sg * 6 * (dd - 2); }
    }
  }
  return pos.side ? -sc : sc;
}

const MVV = t => VALUE[t] || 0;
class Searcher {
  constructor(pos, opt) {
    this.pos = pos; this.opt = opt || {};
    this.tt = ttInit();
    this.nodes = 0; this.stop = false;
    this.deadline = 0;
    this.killers = new Int32Array(MAXPLY * 2);
    this.hist = new Int32Array(2 * NSQ * NSQ);
    this.bufs = []; this.scores = [];
    for (let i = 0; i < MAXPLY + 8; i++) { this.bufs.push(new Int32Array(1024)); this.scores.push(new Int32Array(1024)); }
    this.pathH1 = new Int32Array(MAXPLY + 8); this.pathH2 = new Int32Array(MAXPLY + 8); this.pathN = 0;
    // positions of the game so far (repetition → draw): { h1, h2 } pairs
    this.histSet = new Set((this.opt.history || []).map(String));
  }
  timeUp() {
    if ((this.nodes & 1023) === 0 && this.deadline && Date.now() > this.deadline) this.stop = true;
    if (this.opt.maxNodes && this.nodes > this.opt.maxNodes) this.stop = true;
    return this.stop;
  }
  order(buf, n, sc, ttMove, ply) {
    const b = this.pos.b, sd = this.pos.side, k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      let s;
      if (m === ttMove) s = 10000000;
      else {
        const cap = b[mTo(m)];
        if (cap) s = 1000000 + MVV(Math.abs(cap)) * 8 - (mDrop(m) ? 0 : (VALUE[Math.abs(b[mFrom(m)])] >> 4));
        else if (mPro(m)) s = 900000;
        else if (m === k1) s = 800000;
        else if (m === k2) s = 790000;
        else s = this.hist[(sd * NSQ + (mDrop(m) ? mDrop(m) : mFrom(m))) * NSQ + mTo(m)];
        if (mPro(m) && cap) s += 50000;
      }
      sc[i] = s;
    }
  }
  pick(buf, sc, n, i) {
    let best = i;
    for (let j = i + 1; j < n; j++) if (sc[j] > sc[best]) best = j;
    if (best !== i) { const m = buf[i]; buf[i] = buf[best]; buf[best] = m; const s = sc[i]; sc[i] = sc[best]; sc[best] = s; }
    return buf[i];
  }
  // try a pseudo move: make it, return false (and unmake) when illegal
  tryMove(m) {
    const pos = this.pos, pd = pos.pawnDropCheck(m);
    pos.make(m);
    if (pos.leftInCheck() || (pd && !pos.hasEvasionNoDrop())) { pos.unmake(); return false; }
    return true;
  }
  qsearch(alpha, beta, ply, qd) {
    const pos = this.pos;
    this.nodes++;
    if (this.timeUp()) return 0;
    const inCheck = pos.inCheck();
    if (!inCheck) {
      const sp = evaluate(pos);
      if (sp >= beta) return sp;
      if (sp > alpha) alpha = sp;
      if (qd > 8 || ply >= MAXPLY) return sp;
    } else if (ply >= MAXPLY) return evaluate(pos);
    const buf = this.bufs[ply], sc = this.scores[ply];
    const n = pos.gen(buf, 0, !inCheck);
    this.order(buf, n, sc, 0, ply);
    let legal = 0, best = inCheck ? -INF : alpha;
    for (let i = 0; i < n; i++) {
      const m = this.pick(buf, sc, n, i);
      if (!this.tryMove(m)) continue;
      legal++;
      const s = -this.qsearch(-beta, -alpha, ply + 1, qd + 1);
      pos.unmake();
      if (this.stop) return 0;
      if (s > best) best = s;
      if (s > alpha) { alpha = s; if (s >= beta) return s; }
    }
    if (inCheck && !legal) return -MATE + ply;
    return inCheck ? best : alpha;
  }
  search(depth, alpha, beta, ply, pv) {
    const pos = this.pos;
    if (depth <= 0) return this.qsearch(alpha, beta, ply, 0);
    this.nodes++;
    if (this.timeUp()) return 0;
    if (ply > 0) {
      for (let i = this.pathN - 2; i >= 0; i -= 2) if (this.pathH1[i] === pos.h1 && this.pathH2[i] === pos.h2) return 0;
      if (this.histSet.size && this.histSet.has(pos.key())) return 0;
      // mate distance pruning
      if (MATE - ply < beta) { beta = MATE - ply; if (alpha >= beta) return beta; }
    }
    const tt = this.tt, ti = pos.h1 & TT_MASK;
    let ttMove = 0;
    if (tt.k[ti] === pos.h2) {
      ttMove = tt.m[ti];
      if (ply > 0 && tt.d[ti] >= depth && !pv) {
        let s = tt.s[ti];
        if (s > MATE - 1000) s -= ply; else if (s < -MATE + 1000) s += ply;
        const f = tt.f[ti];
        if (f === 0 || (f === 1 && s >= beta) || (f === 2 && s <= alpha)) return s;
      }
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    // null move pruning
    if (!pv && !inCheck && depth >= 3 && ply > 0 && evaluate(pos) >= beta) {
      pos.side ^= 1; pos.h1 ^= ZS1; pos.h2 ^= ZS2;
      const s = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.side ^= 1; pos.h1 ^= ZS1; pos.h2 ^= ZS2;
      if (this.stop) return 0;
      if (s >= beta && s < MATE - 1000) return beta;
    }
    const buf = this.bufs[ply], sc = this.scores[ply];
    const n = pos.gen(buf, 0, false);
    this.order(buf, n, sc, ttMove, ply);
    let best = -INF, bestMove = 0, legal = 0;
    const a0 = alpha;
    this.pathH1[this.pathN] = pos.h1; this.pathH2[this.pathN] = pos.h2; this.pathN++;
    for (let i = 0; i < n; i++) {
      const m = this.pick(buf, sc, n, i);
      // skip pawn / bishop / rook moves that could promote but do not (never better)
      if (!mDrop(m) && !mPro(m)) {
        const t = Math.abs(pos.b[mFrom(m)]);
        if ((t === FU || t === KA || t === HI) && (ZONE[pos.side][mFrom(m)] || ZONE[pos.side][mTo(m)]) && !(this.opt.allMoves)) continue;
      }
      const quiet = !pos.b[mTo(m)] && !mPro(m);
      if (!this.tryMove(m)) continue;
      legal++;
      let s;
      if (legal === 1) s = -this.search(depth - 1, -beta, -alpha, ply + 1, pv);
      else {
        // late move reduction for quiet moves
        let r = 0;
        if (quiet && depth >= 3 && legal > 4 && !inCheck && !pos.inCheck()) r = legal > 12 ? 2 : 1;
        s = -this.search(depth - 1 - r, -alpha - 1, -alpha, ply + 1, false);
        if (!this.stop && s > alpha && (r || s < beta)) s = -this.search(depth - 1, -beta, -alpha, ply + 1, pv);
      }
      pos.unmake();
      if (this.stop) { this.pathN--; return 0; }
      if (s > best) { best = s; bestMove = m; if (ply === 0) this.rootBest = m; }
      if (s > alpha) {
        alpha = s;
        if (s >= beta) {
          if (quiet) {
            if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
            const hi = (pos.side * NSQ + (mDrop(m) ? mDrop(m) : mFrom(m))) * NSQ + mTo(m);
            this.hist[hi] += depth * depth;
          }
          break;
        }
      }
    }
    this.pathN--;
    if (!legal) return -MATE + ply;
    let st = best;
    if (st > MATE - 1000) st += ply; else if (st < -MATE + 1000) st -= ply;
    tt.k[ti] = pos.h2; tt.m[ti] = bestMove; tt.s[ti] = st; tt.d[ti] = depth;
    tt.f[ti] = best >= beta ? 1 : best <= a0 ? 2 : 0;
    return best;
  }
  // root: every legal move with a score (for the weak levels' noise)
  rootScores(depth) {
    const pos = this.pos, moves = pos.legalMoves(), out = [];
    for (const m of moves) {
      this.pathH1[0] = pos.h1; this.pathH2[0] = pos.h2; this.pathN = 1;
      pos.make(m);
      const s = -this.search(depth - 1, -INF, INF, 1, true);
      this.pathN = 0;
      pos.unmake();
      out.push({ m, s });
    }
    return out;
  }
}

// CPU levels: 1 入門 … 5 最強
const LEVELS = [null,
  { depth: 1, time: 300, noise: 260 },
  { depth: 2, time: 600, noise: 110 },
  { depth: 4, time: 1200, noise: 25 },
  { depth: 6, time: 2500, noise: 0 },
  { depth: 30, time: 5000, noise: 0 },
];
function search(pos, opt) {
  opt = opt || {};
  const lv = LEVELS[opt.level] || null;
  const timeMs = opt.timeMs != null ? opt.timeMs : lv ? lv.time : 1000;
  const maxDepth = opt.depth || (lv ? lv.depth : 30);
  const noise = opt.noise != null ? opt.noise : lv ? lv.noise : 0;
  const rnd = opt.random || Math.random;
  const se = new Searcher(pos, opt);
  const t0 = Date.now();
  const legal = pos.legalMoves();
  if (!legal.length) return { move: 0, usi: '', score: -MATE, depth: 0, nodes: 0, ms: 0 };
  if (legal.length === 1) return { move: legal[0], usi: toUsi(legal[0]), score: 0, depth: 0, nodes: 0, ms: 0 };
  if (noise > 0) {
    // weak levels: score every move shallowly, add noise, but never miss a mate in one or hang a mate in one
    se.deadline = t0 + timeMs * 3;
    let list = null;
    for (let d = 1; d <= Math.max(1, maxDepth); d++) {
      const l = se.rootScores(d);
      if (se.stop && list) break;
      list = l;
      if (se.stop) break;
    }
    let bestS = -INF;
    for (const x of list) bestS = Math.max(bestS, x.s);
    let pick = list[0], ps = -Infinity;
    for (const x of list) {
      const forced = x.s >= MATE - 100 ? 1e7 : x.s <= -MATE + 100 ? -1e7 : 0;
      const v = x.s + forced + (rnd() * 2 - 1) * noise;
      if (v > ps) { ps = v; pick = x; }
    }
    return { move: pick.m, usi: toUsi(pick.m), score: pick.s, depth: maxDepth, nodes: se.nodes, ms: Date.now() - t0 };
  }
  se.deadline = t0 + timeMs;
  let best = legal[0], bestScore = 0, done = 0;
  for (let d = 1; d <= maxDepth; d++) {
    se.rootBest = 0;
    const s = se.search(d, -INF, INF, 0, true);
    if (se.stop) { if (se.rootBest && d > 1) { /* partial iteration: keep the previous best unless the new one is already better */ } break; }
    best = se.rootBest || best; bestScore = s; done = d;
    if (Math.abs(s) > MATE - 1000) break;
    // do not start an iteration that will not finish
    if (Date.now() - t0 > timeMs * 0.45) break;
  }
  return { move: best, usi: toUsi(best), score: bestScore, depth: done, nodes: se.nodes, ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- 詰将棋 (mate search with checks only)
// returns { mate: plies, pv: [usi] } for the attacker (side to move) or null within maxPly (odd)
function solveMate(pos, maxPly, opt) {
  opt = opt || {};
  const memo = new Map();
  let nodes = 0;
  const limit = opt.maxNodes || 3e6;
  function checks() {
    const out = [];
    for (const m of pos.legalMoves()) { pos.make(m); const c = pos.inCheck(); pos.unmake(); if (c) out.push(m); }
    return out;
  }
  // attacker to move: smallest mate length (≤ n) or Infinity
  function att(n) {
    if (++nodes > limit) throw new Error('mate search limit');
    const key = 'a' + pos.key() + ':' + n;
    if (memo.has(key)) return memo.get(key);
    let best = Infinity;
    for (const m of checks()) {
      pos.make(m);
      const r = def(n - 1);
      pos.unmake();
      if (r + 1 < best) best = r + 1;
      if (best === 1) break;
    }
    memo.set(key, best);
    return best;
  }
  // defender to move (in check): longest resistance; Infinity if escapes. Prefers not to waste drops (interpositions that just lose)
  function def(n) {
    const moves = pos.legalMoves();
    if (!moves.length) return 0;
    if (n <= 0) return Infinity;
    const key = 'd' + pos.key() + ':' + n;
    if (memo.has(key)) return memo.get(key);
    let worst = 0;
    for (const m of moves) {
      pos.make(m);
      const r = att(n - 1);
      pos.unmake();
      if (r === Infinity) { worst = Infinity; break; }
      if (r + 1 > worst) worst = r + 1;
    }
    memo.set(key, worst);
    return worst;
  }
  let len = Infinity;
  for (let n = 1; n <= maxPly; n += 2) { len = att(n); if (len !== Infinity) break; }
  if (len === Infinity) return null;
  // principal variation: attacker's mating moves of the right length; defender's longest (then: no useless interposition drop)
  const pv = [], firsts = [];
  let n = len;
  for (const m of checks()) { pos.make(m); const r = def(n - 1); pos.unmake(); if (r + 1 === n) firsts.push(toUsi(m)); }
  const undo = [];
  while (n > 0) {
    let pick = 0;
    if (pv.length % 2 === 0) {
      for (const m of checks()) { pos.make(m); const r = def(n - 1); pos.unmake(); if (r + 1 === n) { pick = m; break; } }
    } else {
      let bestLen = -1;
      for (const m of pos.legalMoves()) {
        pos.make(m); const r = att(n - 1); pos.unmake();
        const v = r + 1 - (mDrop(m) ? 0.5 : 0);
        if (r !== Infinity && v > bestLen) { bestLen = v; pick = m; }
      }
    }
    if (!pick) break;
    pv.push(toUsi(pick)); pos.make(pick); undo.push(1); n--;
  }
  while (undo.pop()) pos.unmake();
  return { mate: len, pv, firsts, nodes };
}

// ---------------------------------------------------------------- handicaps (上手 = gote moves first)
const HANDICAPS = {
  hirate: START,
  kyo: 'lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  kaku: 'lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  hisha: 'lnsgkgsnl/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  nimai: 'lnsgkgsnl/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
};

const API = {
  START, HANDICAPS, Position, Game, LEVELS, VALUE,
  FU, KY, KE, GI, KI, KA, HI, OU, TO, NY, NK, NG, UM, RY, base, PROMOTABLE,
  toUsi, info, kanji, western, kif, search, solveMate, evaluate,
  pad: s => S2P[s], unpad: i => P2S[i], mk: (from, to, pro, drop) => mk(from < 0 ? 0 : S2P[from], S2P[to], pro, drop || 0),
  zone: (side, sq) => !!ZONE[side][S2P[sq]],
  dead: (side, t, sq) => !!DEAD[side][t * NSQ + S2P[sq]],
  STEP0, SLIDE0, BW,
};

// ---------------------------------------------------------------- Worker: { id, sfen, moves, level, timeMs } → { id, usi, score, depth, nodes, ms }
const isWorker = typeof root.importScripts === 'function' && typeof root.document === 'undefined' && typeof module === 'undefined';
if (isWorker) {
  root.onmessage = e => {
    const d = e.data || {};
    try {
      const g = Game.fromMoves(d.sfen || START, d.moves || []);
      const hist = g.keys.slice(0, -1);
      const r = search(g.pos, { level: d.level, timeMs: d.timeMs, history: hist });
      root.postMessage({ id: d.id, usi: r.usi, score: r.score, depth: r.depth, nodes: r.nodes, ms: r.ms });
    } catch (err) { root.postMessage({ id: d.id, error: String(err && err.message || err) }); }
  };
}
root.ShogiEngine = API;
if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
