// チェス工房：考えるところ（評価・探索・CPU・オープニング・ヒント・パズルの確かめ。node でもブラウザでも動く）
// ---------------------------------------------------------------------------------
// engine.js の上に作る。評価は「駒の価値＋マスの点（序盤と終盤を混ぜる）＋ポーンの形＋ルークの筋＋動ける数＋キングの守り＋終盤の追いこみ」。
// 探索は、アルファ・ベータ（PVS）・置換表・反復深化（時間の上限つき）・静止探索・ヌルムーブ・LMR・キラー／ヒストリー・チェックの延長。
// CPU の強さ（level 1〜6）：1 でたらめ／2 目の前の駒をとる欲ばり／3 2手読み（駒の価値だけ）／4 3手＋静止探索／5 6手まで・260ms／6 14手まで・380ms。
//   強さは「読む深さ」と「ときどき悪い手を選ぶ率（blunder）」で決める。同じ局面・同じ種なら必ず同じ手（乱数は種から作る）。
// オープニングの小さな本（BOOK_LINES）は、よく知られた序盤の考え方（中央・展開・キャスリング）にそって自分で並べたもの。
(function (root) {
  'use strict';
  const E = root.ChessEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const { P, N, B, R, Q, K, F_CAP, F_EP, F_KC, F_QC } = E;
  const gen = E.gen, attackedBy = E.attackedBy, RAY = E.RAY, KNT = E.KNT, KNG = E.KNG;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const INF = 32000, MATE = 30000, MATE_IN = MATE - 200;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- 乱数・ハッシュ ----------
  function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- 評価 ----------
  // マスの点：白から見た向き（段 0 が自分の側）。黒は sq ^ 56 で上下を返して使う
  const PMG = [], PEG = [];
  for (let t = 0; t <= 6; t++) { PMG.push(new Int16Array(64)); PEG.push(new Int16Array(64)); }
  (function buildPst() {
    for (let s = 0; s < 64; s++) {
      const f = s & 7, r = s >> 3, d = Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5)), cen = 3.5 - d, cenX = 3.5 - (Math.abs(f - 3.5) + Math.abs(r - 3.5)) / 2;
      const center = f === 3 || f === 4;
      PMG[P][s] = r === 0 || r === 7 ? 0 : (r - 1) * 4 + (center ? (r >= 3 ? 14 : r === 1 ? -14 : 0) : 0) + (f === 0 || f === 7 ? -6 : 0) + ((f === 2 || f === 5) && r === 2 ? 6 : 0);
      PEG[P][s] = r === 0 || r === 7 ? 0 : (r - 1) * 11 + (center ? 3 : 0);
      PMG[N][s] = Math.round(cen * 11 + cenX * 3 - (f === 0 || f === 7 ? 10 : 0) - (r === 0 ? 10 : 0)); PEG[N][s] = Math.round(cen * 8 + cenX * 3);
      PMG[B][s] = Math.round(cen * 6 + cenX * 2 - (r === 0 ? 8 : 0)); PEG[B][s] = Math.round(cen * 4 + cenX * 2);
      PMG[R][s] = (r === 6 ? 10 : 0) + (center ? 4 : 0) - (f === 0 || f === 7 ? 2 : 0); PEG[R][s] = r === 6 ? 10 : 0;
      PMG[Q][s] = Math.round(cen * 3) - (r === 0 && f !== 3 ? 0 : 0); PEG[Q][s] = Math.round(cen * 7 + cenX * 2);
      PMG[K][s] = r === 0 ? (f === 1 || f === 6 ? 32 : f === 2 ? 22 : f === 0 || f === 7 ? 10 : f === 5 ? 8 : 0) : -r * 22 - (center ? 8 : 0);
      PEG[K][s] = Math.round(cen * 15 + cenX * 4);
    }
  })();
  const PASSED = [0, 6, 12, 24, 44, 72, 110, 0];
  const _hi = [new Int8Array(8), new Int8Array(8)], _lo = [new Int8Array(8), new Int8Array(8)], _cnt = [new Int8Array(8), new Int8Array(8)];
  const centerDist = s => { const f = s & 7, r = s >> 3; return Math.abs(f - 3.5) + Math.abs(r - 3.5); };
  const kdist = (a, b2) => Math.max(Math.abs((a & 7) - (b2 & 7)), Math.abs((a >> 3) - (b2 >> 3)));
  // 白から見た点（センチポーン）。駒がたりない引き分けは 0
  function evalWhite(pos) {
    const b = pos.b;
    let mg0 = 0, eg0 = 0, mg1 = 0, eg1 = 0, phase = 0, np0 = 0, np1 = 0, bp0 = 0, bp1 = 0, minors0 = 0, minors1 = 0, pawnsTotal = 0;
    for (let c = 0; c < 2; c++) { _hi[c].fill(-1); _lo[c].fill(8); _cnt[c].fill(0); }
    let wr = 0, br = 0, rookSq0 = [], rookSq1 = [];
    for (let s = 0; s < 64; s++) {
      const p = b[s]; if (!p) continue;
      const c = p >> 3, t = p & 7, i = c ? s ^ 56 : s, f = s & 7, r = s >> 3;
      let mg = VAL[t] + PMG[t][i], eg = VAL[t] + PEG[t][i];
      if (t === P) { const rr = c ? 7 - r : r; _cnt[c][f]++; if (rr > _hi[c][f]) _hi[c][f] = rr; if (rr < _lo[c][f]) _lo[c][f] = rr; pawnsTotal++; }
      else if (t === N) {
        phase += 1; let n = 0; const kn = KNT[s]; for (let k = 0; k < kn.length; k++) { const q = b[kn[k]]; if (!q || (q >> 3) !== c) n++; }
        mg += (n - 4) * 4; eg += (n - 4) * 4; if (c) minors1++; else minors0++;
      } else if (t === B) {
        phase += 1; let n = 0;
        for (let d = 4; d < 8; d++) { const ray = RAY[s * 8 + d]; for (let k = 0; k < ray.length; k++) { const q = b[ray[k]]; if (!q) n++; else { if ((q >> 3) !== c) n++; break; } } }
        mg += (n - 6) * 3; eg += (n - 6) * 4; if (c) { bp1++; minors1++; } else { bp0++; minors0++; }
      } else if (t === R) {
        phase += 2; let n = 0;
        for (let d = 0; d < 4; d++) { const ray = RAY[s * 8 + d]; for (let k = 0; k < ray.length; k++) { const q = b[ray[k]]; if (!q) n++; else { if ((q >> 3) !== c) n++; break; } } }
        mg += (n - 7) * 2; eg += (n - 7) * 4; (c ? rookSq1 : rookSq0).push(s);
      } else if (t === Q) {
        phase += 4; let n = 0;
        for (let d = 0; d < 8; d++) { const ray = RAY[s * 8 + d]; for (let k = 0; k < ray.length; k++) { const q = b[ray[k]]; if (!q) n++; else { if ((q >> 3) !== c) n++; break; } } }
        mg += (n - 14) * 1; eg += (n - 14) * 2;
      }
      if (t !== P && t !== K) { if (c) np1 += VAL[t]; else np0 += VAL[t]; }
      if (c) { mg1 += mg; eg1 += eg; } else { mg0 += mg; eg0 += eg; }
    }
    // ポーンの形
    for (let c = 0; c < 2; c++) {
      let mg = 0, eg = 0; const o = c ^ 1;
      for (let f = 0; f < 8; f++) {
        const n = _cnt[c][f]; if (!n) continue;
        if (n > 1) { mg -= 10 * (n - 1); eg -= 18 * (n - 1); }
        const iso = (f === 0 || !_cnt[c][f - 1]) && (f === 7 || !_cnt[c][f + 1]);
        if (iso) { mg -= 11 * n; eg -= 15 * n; }
        // 通せんぼのないポーン（いちばん進んだ1本だけ見る）
        const rr = _hi[c][f]; let passed = true;
        for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1) && passed; g++) if (_cnt[o][g] && (7 - _lo[o][g]) > rr) passed = false;
        if (passed) { mg += PASSED[rr] * 0.6; eg += PASSED[rr] * 1.4; }
      }
      if (c) { mg1 += mg; eg1 += eg; } else { mg0 += mg; eg0 += eg; }
    }
    // ルークの筋・ビショップの組
    for (let c = 0; c < 2; c++) {
      let mg = 0, eg = 0; const rs = c ? rookSq1 : rookSq0;
      for (const s of rs) { const f = s & 7; if (!_cnt[c][f]) { if (!_cnt[c ^ 1][f]) { mg += 18; eg += 8; } else { mg += 9; eg += 4; } } }
      if ((c ? bp1 : bp0) >= 2) { mg += 30; eg += 45; }
      if (c) { mg1 += mg; eg1 += eg; } else { mg0 += mg; eg0 += eg; }
    }
    // キングの守り（序盤の重みだけ）
    for (let c = 0; c < 2; c++) {
      const ks = pos.ksq[c], f = ks & 7, r = ks >> 3, rr = c ? 7 - r : r; let mg = 0;
      if (rr <= 1) {
        const dir = c ? -8 : 8, pawn = c * 8 + P;
        for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) {
          const a1 = ks - f + g + dir, a2 = a1 + dir, has = (a1 >= 0 && a1 < 64 && b[a1] === pawn) || (a2 >= 0 && a2 < 64 && b[a2] === pawn);
          mg += has ? 9 : -12;
          if (!_cnt[c][g] && !_cnt[c ^ 1][g]) mg -= 10;
        }
      }
      if (c) mg1 += mg; else mg0 += mg;
    }
    phase = Math.min(24, phase);
    let mg = mg0 - mg1, eg = eg0 - eg1;
    const blend = (mg * phase + eg * (24 - phase)) / 24;
    let score = blend >= 0 ? Math.floor(blend + 0.5) : -Math.floor(-blend + 0.5);          // 0.5 は 0 から遠いほうへ丸める（白黒を入れかえても同じ点になるように）
    // 終盤の追いこみ（相手がキングだけ）と、勝ちにくい形
    const mat0 = np0 + 0, mat1 = np1 + 0, p0 = _cnt[0].reduce((a, x) => a + x, 0), p1 = _cnt[1].reduce((a, x) => a + x, 0);
    if (p1 === 0 && mat1 === 0 && (mat0 >= 500 || (minors0 >= 2 && (bp0 >= 1)) || p0 > 0)) score += mopUp(pos, 0, bp0, minors0, mat0);
    else if (p0 === 0 && mat0 === 0 && (mat1 >= 500 || (minors1 >= 2 && (bp1 >= 1)) || p1 > 0)) score -= mopUp(pos, 1, bp1, minors1, mat1);
    else {
      if (score > 0 && p0 === 0 && mat0 - mat1 <= 330) score = Math.round(score / 3);
      else if (score < 0 && p1 === 0 && mat1 - mat0 <= 330) score = Math.round(score / 3);
    }
    if (E.insufficient(pos)) return 0;
    void wr; void br; void pawnsTotal;
    return score;
  }
  // strong が、相手のキングを隅へ追いこむ点。ビショップ＋ナイトだけのメイトは、ビショップと同じ色の隅へ（隅までの道のりを、1マスごとに大きく点にする）
  function mopUp(pos, strong, bishops, minors, mat) {
    const weak = pos.ksq[strong ^ 1], mine = pos.ksq[strong];
    const md = Math.abs((weak & 7) - (mine & 7)) + Math.abs((weak >> 3) - (mine >> 3));
    if (mat === 650 || (minors === 2 && bishops === 1 && mat < 700)) {
      let bsq = -1; for (let s = 0; s < 64; s++) if (pos.b[s] === strong * 8 + B) bsq = s;
      if (bsq >= 0) {
        const lightB = ((bsq >> 3) + (bsq & 7)) & 1, corners = lightB ? [7, 56] : [0, 63];
        const man = c => Math.abs((weak & 7) - (c & 7)) + Math.abs((weak >> 3) - (c >> 3)), d = Math.min(man(corners[0]), man(corners[1]));
        return Math.round((14 - d) * 70 + (14 - md) * 14);
      }
    }
    return Math.round(centerDist(weak) * 12 + (14 - md) * 5);
  }
  // 手番から見た点
  function evaluate(pos) { const s = evalWhite(pos); return (pos.side ? -s : s) + 8; }
  // 駒の価値だけ（レベル3用）：手番から見た
  function materialOnly(pos) { let s = 0; const b = pos.b; for (let i = 0; i < 64; i++) { const p = b[i]; if (p) s += (p >> 3 ? -1 : 1) * VAL[p & 7]; } return pos.side ? -s : s; }

  // ---------- 置換表と探索の状態 ----------
  const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const tk1 = new Int32Array(TT_SIZE), tk2 = new Int32Array(TT_SIZE), tmv = new Int32Array(TT_SIZE), tsc = new Int32Array(TT_SIZE), tdp = new Int8Array(TT_SIZE), tfl = new Int8Array(TT_SIZE), tag = new Uint8Array(TT_SIZE);
  const SS = { nodes: 0, stop: false, deadline: 0, maxNodes: 0, age: 0, killers: new Int32Array(256 * 2), hist: new Int32Array(2 * 64 * 64), pv: new Int32Array(64 * 64), pvLen: new Int32Array(64), maxPly: 0, mvbuf: [], scbuf: [] };
  for (let i = 0; i < 128; i++) { SS.mvbuf.push([]); SS.scbuf.push([]); }
  function ttClear() { tk1.fill(0); tk2.fill(0); tmv.fill(0); tdp.fill(0); tfl.fill(0); }
  const toTT = (s, ply) => (s >= MATE_IN ? s + ply : s <= -MATE_IN ? s - ply : s), fromTT = (s, ply) => (s >= MATE_IN ? s - ply : s <= -MATE_IN ? s + ply : s);
  function timeUp() { if (SS.maxNodes && SS.nodes >= SS.maxNodes) { SS.stop = true; return true; } if (SS.deadline && now() >= SS.deadline) { SS.stop = true; return true; } return false; }

  function isDrawish(pos, ply) {
    if (pos.half >= 100) return true;
    const lim = Math.max(0, pos.n - pos.half);
    for (let i = pos.n - 2; i >= lim; i -= 2) if (pos.uH1[i] === pos.h1 && pos.uH2[i] === pos.h2) return true;     // uH はその手を指す前のハッシュ（= そのときの局面）
    return false;
  }
  const moveScoreCap = (b, m) => {
    const to = (m >> 6) & 63, fl = m >> 16, pr = (m >> 12) & 15; let s = 0;
    const v = fl & F_EP ? P : b[to] & 7;
    if (v) s = 100000 + VAL[v] * 16 - VAL[b[m & 63] & 7] / 10 + 0;
    if (pr) s += 90000 + VAL[pr];
    return s;
  };
  function orderMoves(pos, mv, sc, ttMove, ply) {
    const b = pos.b, us = pos.side;
    for (let i = 0; i < mv.length; i++) {
      const m = mv[i]; let s;
      if (m === ttMove) s = 2000000;
      else if ((m >> 16) & F_CAP || ((m >> 12) & 15)) s = moveScoreCap(b, m) + 100000;
      else if (m === SS.killers[ply * 2]) s = 90000; else if (m === SS.killers[ply * 2 + 1]) s = 80000;
      else s = SS.hist[us * 4096 + (m & 63) * 64 + ((m >> 6) & 63)];
      sc[i] = s;
    }
  }
  function pick(mv, sc, i) { let bi = i, bs = sc[i]; for (let j = i + 1; j < mv.length; j++) if (sc[j] > bs) { bs = sc[j]; bi = j; } if (bi !== i) { const tm = mv[i]; mv[i] = mv[bi]; mv[bi] = tm; const ts = sc[i]; sc[i] = sc[bi]; sc[bi] = ts; } return mv[i]; }

  function qsearch(pos, alpha, beta, ply, qd) {
    SS.nodes++;
    if ((SS.nodes & 2047) === 0 && timeUp()) return 0;
    if (SS.stop) return 0;
    const inChk = pos.inCheck();
    if (inChk && qd > 6) return evaluate(pos);
    let best = -INF;
    if (!inChk) {
      const stand = evaluate(pos);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
    }
    if (ply >= 100) return evaluate(pos);
    const mv = SS.mvbuf[Math.min(ply, 127)], sc = SS.scbuf[Math.min(ply, 127)];
    gen(pos, mv, !inChk || qd > 6);
    orderMoves(pos, mv, sc, 0, 0);
    let legal = 0; const b = pos.b;
    for (let i = 0; i < mv.length; i++) {
      const m = pick(mv, sc, i);
      if (!inChk && !((m >> 12) & 15)) { const v = (m >> 16) & F_EP ? P : b[(m >> 6) & 63] & 7; if (best + VAL[v] + 220 < alpha && alpha > -MATE_IN) continue; }       // 小さな損得ははぶく
      if (!pos.makeLegal(m)) continue;
      legal++;
      const v = -qsearch(pos, -beta, -alpha, ply + 1, qd + 1);
      pos.unmake();
      if (SS.stop) return 0;
      if (v > best) { best = v; if (v > alpha) { alpha = v; if (v >= beta) return v; } }
    }
    if (inChk && !legal) return -MATE + ply;
    return best;
  }

  function negamax(pos, depth, alpha, beta, ply, allowNull) {
    SS.pvLen[ply] = 0;
    SS.nodes++;
    if ((SS.nodes & 2047) === 0 && timeUp()) return 0;
    if (SS.stop) return 0;
    if (ply > 0) { if (isDrawish(pos, ply)) return 0; }
    if (ply > SS.maxPly) SS.maxPly = ply;
    const inChk = pos.inCheck();
    if (inChk && ply < 60) depth++;
    if (depth <= 0 || ply >= 90) return qsearch(pos, alpha, beta, ply, 0);
    const isPv = beta - alpha > 1;
    // 置換表
    const idx = pos.h1 & TT_MASK; let ttMove = 0;
    if (tk1[idx] === pos.h1 && tk2[idx] === pos.h2) {
      ttMove = tmv[idx];
      if (tdp[idx] >= depth && ply > 0 && !isPv) {
        const s = fromTT(tsc[idx], ply), f = tfl[idx];
        if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
      }
    }
    // 静的評価での枝切りとヌルムーブ
    if (!isPv && !inChk && ply > 0) {
      const stat = evaluate(pos);
      if (depth <= 3 && stat - 130 * depth >= beta && beta > -MATE_IN && beta < MATE_IN) return stat;
      if (allowNull && depth >= 3 && stat >= beta) {
        const us = pos.side; let hasPiece = false; const b = pos.b;
        for (let s = 0; s < 64; s++) { const p = b[s]; if (p && (p >> 3) === us && (p & 7) > P && (p & 7) < K) { hasPiece = true; break; } }
        if (hasPiece) {
          pos.makeNull();
          const v = -negamax(pos, depth - 1 - (depth >= 6 ? 3 : 2), -beta, -beta + 1, ply + 1, false);
          pos.unmakeNull();
          if (SS.stop) return 0;
          if (v >= beta) return v >= MATE_IN ? beta : v;
        }
      }
    }
    const mv = SS.mvbuf[ply], sc = SS.scbuf[ply];
    gen(pos, mv, false);
    orderMoves(pos, mv, sc, ttMove, ply);
    let best = -INF, bestMove = 0, legal = 0, flag = 3; const us = pos.side, b = pos.b;
    for (let i = 0; i < mv.length; i++) {
      const m = pick(mv, sc, i);
      const quiet = !((m >> 16) & F_CAP) && !((m >> 12) & 15);
      if (!pos.makeLegal(m)) continue;
      legal++;
      let v;
      const gives = pos.inCheck();
      if (legal === 1) v = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let red = 0;
        if (depth >= 3 && legal > 4 && quiet && !inChk && !gives) red = legal > 10 ? 2 : 1;
        v = -negamax(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && (red || v < beta)) v = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (SS.stop) return 0;
      if (v > best) {
        best = v; bestMove = m;
        if (v > alpha) {
          alpha = v; flag = 1;
          SS.pv[ply * 64] = m; const l = SS.pvLen[ply + 1]; for (let k = 0; k < l; k++) SS.pv[ply * 64 + 1 + k] = SS.pv[(ply + 1) * 64 + k]; SS.pvLen[ply] = l + 1;
          if (v >= beta) {
            flag = 2;
            if (quiet) {
              if (SS.killers[ply * 2] !== m) { SS.killers[ply * 2 + 1] = SS.killers[ply * 2]; SS.killers[ply * 2] = m; }
              const hi = us * 4096 + (m & 63) * 64 + ((m >> 6) & 63); SS.hist[hi] = Math.min(60000, SS.hist[hi] + depth * depth);
            }
            break;
          }
        }
      }
    }
    void b;
    if (!legal) return inChk ? -MATE + ply : 0;
    if (!SS.stop) {
      if (tk1[idx] !== pos.h1 || tdp[idx] <= depth || tag[idx] !== SS.age) { tk1[idx] = pos.h1; tk2[idx] = pos.h2; tmv[idx] = bestMove; tsc[idx] = toTT(best, ply); tdp[idx] = depth; tfl[idx] = flag; tag[idx] = SS.age; }
    }
    return best;
  }

  // 局面 pos を読む。opts：{ depth（上限）, ms（時間）, nodes（手数の上限。テスト用）, full（全部の手を窓いっぱいで点にする）, skip（読まない手）}
  // 戻り：{ move, score（手番から見た）, depth, nodes, ms, pv:[手…], all:[{ move, score }…]（full のとき。その深さで）}
  function search(pos, opts) {
    opts = opts || {};
    const t0 = now(), maxD = opts.depth || 64;
    SS.nodes = 0; SS.stop = false; SS.maxNodes = opts.nodes || 0; SS.deadline = opts.ms ? t0 + opts.ms : 0; SS.age = (SS.age + 1) & 255; SS.killers.fill(0);
    for (let i = 0; i < SS.hist.length; i++) SS.hist[i] >>= 3;
    if (opts.fresh) ttClear();
    const root = E.legalMoves(pos);
    const skip = opts.skip ? new Set(opts.skip) : null, cand = skip ? root.filter(m => !skip.has(m)) : root;
    if (!cand.length) return { move: 0, score: root.length ? -INF : (pos.inCheck() ? -MATE : 0), depth: 0, nodes: 0, ms: 0, pv: [], all: [] };
    let bestMove = cand[0], bestScore = -INF, doneDepth = 0, pvOut = [bestMove], all = [];
    if (cand.length === 1 && !opts.full && !opts.analysis) return { move: cand[0], score: evaluate(pos), depth: 0, nodes: 0, ms: 0, pv: [cand[0]], all: [{ move: cand[0], score: evaluate(pos) }], only: true };
    let order = cand.slice();
    for (let d = 1; d <= maxD; d++) {
      let alpha = -INF; const beta = INF; let iterBest = 0, iterScore = -INF; const scores = [];
      // 前の反復の最善手を先頭に
      if (d > 1) { const i = order.indexOf(bestMove); if (i > 0) { order.splice(i, 1); order.unshift(bestMove); } }
      let aborted = false;
      for (let i = 0; i < order.length; i++) {
        const m = order[i];
        pos.make(m); let v;
        if (opts.full) v = -negamax(pos, d - 1, -INF, INF, 1, true);
        else if (i === 0) v = -negamax(pos, d - 1, -beta, -alpha, 1, true);
        else { v = -negamax(pos, d - 1, -alpha - 1, -alpha, 1, true); if (v > alpha && !SS.stop) v = -negamax(pos, d - 1, -beta, -alpha, 1, true); }
        pos.unmake();
        if (SS.stop) { aborted = true; break; }
        scores.push({ move: m, score: v });
        if (v > iterScore) {
          iterScore = v; iterBest = m;
          if (v > alpha) alpha = v;
          const pv = [m]; const l = SS.pvLen[1]; for (let k = 0; k < l; k++) pv.push(SS.pv[64 + k]);
          if (!opts.full || v >= iterScore) pvOut = pv;
        }
      }
      if (aborted) {
        // この深さの途中：最後まで読めた新しい最善手があれば、それを使う（なければ前の深さの手）
        if (iterBest && iterScore > -INF && doneDepth > 0) { bestMove = iterBest; bestScore = iterScore; }
        else if (iterBest && doneDepth === 0) { bestMove = iterBest; bestScore = iterScore; }
        break;
      }
      bestMove = iterBest; bestScore = iterScore; doneDepth = d; all = scores;
      order.sort((a, b2) => { const sa = scores.find(x => x.move === a), sb = scores.find(x => x.move === b2); return (sb ? sb.score : -INF) - (sa ? sa.score : -INF); });
      if (Math.abs(bestScore) >= MATE_IN && d >= MATE - Math.abs(bestScore) && !opts.analysis) break;
      if (opts.ms && now() - t0 > opts.ms * 0.55) break;
    }
    const pvList = []; for (const m of pvOut) pvList.push(m);
    return { move: bestMove, score: bestScore, depth: doneDepth, nodes: SS.nodes, ms: Math.round(now() - t0), pv: pvList, all };
  }
  // 全部の手の点（その深さまで、窓いっぱい）。ヒント・間違い選び・パズルの確かめに
  function scoreMoves(pos, depth, opts) {
    const r = search(pos, Object.assign({ depth, full: true, analysis: true }, opts || {}));
    return r.all.slice().sort((a, b) => b.score - a.score);
  }

  // ---------- オープニングの小さな本 ----------
  const BOOK_LINES = [
    'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O',
    'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O',
    'e4 e5 Nf3 Nc6 Bc4 Nf6 d4 exd4 O-O Nxe4 Re1 d5 Bxd5 Qxd5 Nc3 Qa5',
    'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6',
    'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7',
    'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6 Bg5 Bxc3 bxc3 Qe7',
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7',
    'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bg5 e6 Qd2 a6 O-O-O Bd7',
    'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6 O-O Qc7 Qe2 d6',
    'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 Be3 e5',
    'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5',
    'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3 cxd4 cxd4 Bd7 O-O',
    'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6',
    'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7',
    'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5',
    'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Be2 c5',
    'e4 g6 d4 Bg7 Nc3 d6 Be3 Nf6 Qd2 O-O O-O-O',
    'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6',
    'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 a6',
    'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6',
    'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6',
    'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6',
    'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O Nc3 Ne4',
    'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Rb1 O-O',
    'd4 d5 Nf3 Nf6 Bf4 e6 e3 Bd6 Bg3 O-O Nbd2 c5 c3 Nc6',
    'd4 d5 Bf4 Nf6 e3 e6 Nf3 Bd6 Bg3 O-O Nbd2 c5 c3 Nc6',
    'd4 Nf6 Nf3 g6 Bf4 Bg7 e3 O-O h3 d6 Nbd2 Nbd7',
    'd4 Nf6 Nf3 e6 e3 b6 Bd3 Bb7 O-O Be7 c4 O-O Nc3 d5',
    'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7',
    'c4 c5 Nf3 Nf6 Nc3 Nc6 g3 g6 Bg2 Bg7 O-O O-O d4 cxd4 Nxd4',
    'c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7 Bg5 O-O e3 h6 Bh4 b6',
    'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4 Nc6',
    'Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4 O-O Be2 e5 O-O',
    'Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O b3 c5 Bb2 Nc6',
    'Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 e4 e5 Nc3 Nc6',
  ];
  let BOOK = null;
  function buildBook() {
    BOOK = new Map(); const bad = [];
    BOOK_LINES.forEach((line, li) => {
      const g = new E.Game();
      for (const san of line.split(' ')) {
        const r = E.parseMove(g.pos, san); if (r.error) { bad.push(li + ':' + san); break; }
        const key = E.posKey(g.pos); let arr = BOOK.get(key); if (!arr) BOOK.set(key, arr = []);
        const u = E.uci(r.move), f = arr.find(x => x.u === u); if (f) f.w++; else arr.push({ u, w: 1 });
        g.play(r.move);
      }
    });
    BOOK.bad = bad; return BOOK;
  }
  function bookMoves(pos) { if (!BOOK) buildBook(); const a = BOOK.get(E.posKey(pos)); return a ? a.slice() : []; }
  function bookMove(pos, r) {
    const a = bookMoves(pos); if (!a.length) return 0;
    const lg = E.legalMoves(pos); let tot = 0; for (const x of a) tot += x.w;
    let t = r() * tot; for (const x of a) { t -= x.w; if (t <= 0) { const m = lg.find(y => E.uci(y) === x.u); if (m) return m; } }
    return lg.find(y => E.uci(y) === a[0].u) || 0;
  }

  // ---------- CPU の強さ ----------
  // kind：random・greedy・shallow（駒の価値だけで depth 手）・search（評価つきの探索）。blunder：ときどき悪い手を選ぶ確率。margin：悪い手でも、最善よりどれだけ下までなら選ぶか（cp）
  const LEVELS = [null,
    { id: 1, kind: 'random', book: 0, blunder: 0 },
    { id: 2, kind: 'greedy', book: 0, blunder: 0 },
    { id: 3, kind: 'shallow', depth: 2, book: 4, blunder: 0.2, margin: 300 },
    { id: 4, kind: 'search', depth: 3, ms: 120, book: 8, blunder: 0.1, margin: 150, scan: 2 },
    { id: 5, kind: 'search', depth: 6, ms: 260, book: 14, blunder: 0.04, margin: 70, scan: 3 },
    { id: 6, kind: 'search', depth: 14, ms: 380, book: 30, blunder: 0, margin: 0, scan: 0 },
  ];
  const LEVEL_COUNT = 6;
  function shallowScore(pos, depth) {
    if (depth === 0) return materialOnly(pos);
    const mv = []; gen(pos, mv, false); let best = -INF, any = false;
    for (let i = 0; i < mv.length; i++) { if (!pos.makeLegal(mv[i])) continue; any = true; const v = -shallowScore(pos, depth - 1); pos.unmake(); if (v > best) best = v; }
    if (!any) return pos.inCheck() ? -MATE + 50 : 0;
    return best;
  }
  function seedFor(game, level, seed) { return hash32(E.toFen(game.pos) + ':' + game.list.length + ':' + level + ':' + (seed | 0)); }
  // CPU の手：game（engine の Game）・level 1..6。opts：{ seed, ms（上限 400）, nodes, book:false }。戻り：{ move, info }
  function cpuMove(game, level, opts) {
    opts = opts || {};
    level = clamp(level | 0 || 3, 1, LEVEL_COUNT);
    const L = LEVELS[level], pos = game.pos, r = rng(seedFor(game, level, opts.seed));
    const lg = E.legalMoves(pos);
    if (!lg.length) return { move: 0, info: { kind: 'none' } };
    if (lg.length === 1) return { move: lg[0], info: { kind: 'only' } };
    // メイトの1手があれば、2 以上は必ず指す
    if (level >= 2) { for (const m of lg) { pos.make(m); const mate = pos.inCheck() && !E.hasLegal(pos); pos.unmake(); if (mate) return { move: m, info: { kind: 'mate1' } }; } }
    if (L.kind === 'random') return { move: lg[Math.floor(r() * lg.length)], info: { kind: 'random' } };
    if (L.kind === 'greedy') {
      let best = -1e9, pool = [];
      for (const m of lg) {
        const to = (m >> 6) & 63, fl = m >> 16; let s = fl & F_EP ? 100 : VAL[pos.b[to] & 7];
        if ((m >> 12) & 15) s += VAL[(m >> 12) & 15] - 100;
        pos.make(m); if (pos.inCheck()) s += 20; pos.unmake();
        s += r() * 8;
        if (s > best) { best = s; pool = [m]; }
      }
      return { move: pool[0], info: { kind: 'greedy' } };
    }
    if (opts.book !== false && L.book && game.list.length < L.book) { const bm = bookMove(pos, r); if (bm) return { move: bm, info: { kind: 'book' } }; }
    if (L.kind === 'shallow') {
      const sc = lg.map(m => { pos.make(m); const v = -shallowScore(pos, L.depth - 1) + (r() * 6 | 0); pos.unmake(); return { move: m, score: v }; });
      sc.sort((a, b) => b.score - a.score);
      if (r() < L.blunder) { const pool = sc.filter(x => x.score >= sc[0].score - L.margin && x.move !== sc[0].move && x.score > -MATE_IN); if (pool.length) return { move: pool[Math.floor(r() * pool.length)].move, info: { kind: 'blunder' } }; }
      return { move: sc[0].move, info: { kind: 'shallow', score: sc[0].score } };
    }
    const ms = Math.min(400, opts.ms || L.ms);
    const wantBlunder = !!L.blunder && r() < L.blunder;          // 悪い手を選ぶ回は、本読みの時間を短くして、あとの「ほかの手の点」を出す時間にあてる（合計は上限のまま）
    const res = search(pos, { depth: L.depth, ms: wantBlunder ? Math.round(ms * 0.5) : ms, nodes: opts.nodes });
    let move = res.move, kind = 'search';
    if (wantBlunder && res.score < MATE_IN && res.score > -MATE_IN) {
      const sc = scoreMoves(pos, L.scan || 2, { nodes: opts.nodes ? Math.round(opts.nodes / 2) : 0, ms: Math.round(ms * 0.35) });
      if (sc.length > 1) {
        const top = sc[0].score, pool = sc.filter(x => x.move !== res.move && x.score >= top - L.margin && x.score > -MATE_IN && x.score < MATE_IN);
        if (pool.length) { move = pool[Math.floor(r() * pool.length)].move; kind = 'blunder'; }
      }
    }
    return { move, info: { kind, score: res.score, depth: res.depth, nodes: res.nodes, ms: res.ms, pv: res.pv } };
  }

  // ---------- 点の見せ方（評価バー） ----------
  // 手番から見た点を、白から見た点にして、メイトなら { mate: 手数, side }
  function whiteScore(score, side) { return side ? -score : score; }
  function describeScore(score, side) {
    const w = whiteScore(score, side);
    if (Math.abs(w) >= MATE_IN) { const n = Math.ceil((MATE - Math.abs(w)) / 2); return { cp: w > 0 ? 100000 : -100000, mate: w > 0 ? n : -n }; }
    return { cp: w, mate: 0 };
  }
  // 白の割合（0..1）。評価バーの高さ
  const barFrac = cp => 1 / (1 + Math.exp(-cp / 350));
  function analyze(pos, o) {
    o = o || {}; const res = search(pos, { depth: o.depth || 8, ms: o.ms || 250, nodes: o.nodes, analysis: true });
    const d = describeScore(res.score, pos.side);
    return { move: res.move, cp: d.cp, mate: d.mate, depth: res.depth, pv: res.pv, nodes: res.nodes, frac: barFrac(d.cp) };
  }

  // ---------- 詰みの確かめ（パズル用。完全に調べる） ----------
  function isMate(pos) { return pos.inCheck() && !E.hasLegal(pos); }
  // 手番の側が、n 手以内（自分の手の数）で必ずメイトできるか
  function attackerMates(pos, n) {
    if (n <= 0) return false;
    const mv = []; gen(pos, mv, false);
    for (let i = 0; i < mv.length; i++) {
      if (!pos.makeLegal(mv[i])) continue;
      let win;
      if (n === 1) win = pos.inCheck() && !E.hasLegal(pos);
      else if (pos.inCheck() && !E.hasLegal(pos)) win = true;
      else win = defenderLoses(pos, n - 1);
      pos.unmake();
      if (win) return true;
    }
    return false;
  }
  // 手番の側（守る側）のどの手でも、相手が n 手以内でメイトできる。動ける手がない：チェックならメイト済み（true）、そうでなければステイルメイト（false）
  function defenderLoses(pos, n) {
    const mv = []; gen(pos, mv, false); let any = false;
    for (let i = 0; i < mv.length; i++) {
      if (!pos.makeLegal(mv[i])) continue;
      any = true;
      const ok = attackerMates(pos, n);
      pos.unmake();
      if (!ok) return false;
    }
    return any ? true : pos.inCheck();
  }
  // 手 m を指すと、n 手以内の強制メイトになるか（m は pos の合法手）
  function moveMates(pos, m, n) {
    pos.make(m); let ok;
    if (pos.inCheck() && !E.hasLegal(pos)) ok = true; else ok = n > 1 ? defenderLoses(pos, n - 1) : false;
    pos.unmake(); return ok;
  }
  // n 手以内のメイトになる手の一覧（全部の合法手を調べる）
  function matingMoves(pos, n) { const out = []; for (const m of E.legalMoves(pos)) if (moveMates(pos, m, n)) out.push(m); return out; }
  // メイトの手順：[攻め, 受け, 攻め, …]
  function mateLine(pos, n) {
    const out = []; let k = n; const p = pos.clone();
    while (k > 0) {
      const ms = matingMoves(p, k); if (!ms.length) break;
      // いちばん早く詰む手（手数の少ない）を選ぶ
      let m = ms[0]; for (let j = 1; j <= k; j++) { const f = ms.find(x => moveMates(p, x, j)); if (f) { m = f; break; } }
      out.push(m); p.make(m);
      if (p.inCheck() && !E.hasLegal(p)) break;
      const d = bestDefenseFrom(p, k - 1); if (!d) break; out.push(d); p.make(d); k--;
    }
    return out;
  }
  function bestDefenseFrom(p, n) {
    let best = 0, bestLen = -1;
    for (const d of E.legalMoves(p)) { p.make(d); let len = n + 1; for (let k = 1; k <= n; k++) if (attackerMates(p, k)) { len = k; break; } p.unmake(); if (len > bestLen) { bestLen = len; best = d; } }
    return best;
  }

  // ---------- ヒントの説明 ----------
  const pieceVal = t => VAL[t] || 0;
  // 手番の側の「とられそうな駒」（駒の価値が 3 以上で、相手に利かれていて、守りがないか安い駒に利かれている）
  function enPrise(pos, color) {
    const out = [], b = pos.b;
    for (let s = 0; s < 64; s++) {
      const p = b[s]; if (!p || (p >> 3) !== color || (p & 7) < N || (p & 7) === K) continue;
      const att = E.attackers(b, s, color ^ 1); if (!att.length) continue;
      const low = Math.min.apply(null, att.map(a => pieceVal(b[a] & 7))), def = E.attackers(b, s, color).length;
      if (!def || low < pieceVal(p & 7) - 40) out.push(s);
    }
    return out;
  }
  // 手 m の理由の一覧（優先順）：{ k, … }。ja/en の文章は index.html が付ける
  function explainMove(pos, m, res) {
    const out = [], b = pos.b, from = m & 63, to = (m >> 6) & 63, fl = m >> 16, pr = (m >> 12) & 15, pc = b[from], t = pc & 7, us = pos.side;
    const victim = fl & F_EP ? P : b[to] & 7;
    const inChk = pos.inCheck(), before = enPrise(pos, us);
    const full = pos.full;
    pos.make(m);
    const mate = pos.inCheck() && !E.hasLegal(pos), chk = pos.inCheck();
    const after = enPrise(pos, us), movedSafe = after.indexOf(to) < 0;
    // 相手の守り（動かしたあとの相手のとれる駒）
    let forkTargets = [];
    if (!mate) {
      const nb = pos.b;
      const att = []; // to から利いている相手の駒
      const tt = nb[to] & 7;
      const tryTarget = s => { const q = nb[s]; if (q && (q >> 3) !== us) att.push(s); };
      if (tt === N) for (const s of KNT[to]) tryTarget(s);
      else if (tt === P) for (const s of E.PAT[us][to]) tryTarget(s);
      else if (tt === K) for (const s of KNG[to]) tryTarget(s);
      else { const d0 = tt === B ? 4 : 0, d1 = tt === R ? 4 : 8; for (let d = d0; d < d1; d++) { const ray = RAY[to * 8 + d]; for (let k = 0; k < ray.length; k++) { const q = nb[ray[k]]; if (q) { if ((q >> 3) !== us) att.push(ray[k]); break; } } } }
      forkTargets = att.filter(s => { const q = nb[s] & 7; return q === K || pieceVal(q) > pieceVal(tt) + 20 || !E.attackers(nb, s, us ^ 1).length; });
    }
    // 相手がパスしたらメイトできるか（メイトの脅し）
    let threat = false;
    if (!mate && !chk) { pos.makeNull(); const mm = []; gen(pos, mm, false); for (let i = 0; i < mm.length && !threat; i++) { if (!pos.makeLegal(mm[i])) continue; if (pos.inCheck() && !E.hasLegal(pos)) threat = true; pos.unmake(); } pos.unmakeNull(); }
    pos.unmake();
    if (mate) out.push({ k: 'mate' });
    if (res && res.score >= MATE_IN && !mate) out.push({ k: 'mateIn', n: Math.ceil((MATE - res.score) / 2) });
    if (fl & (F_KC | F_QC)) out.push({ k: 'castle', side: fl & F_KC ? 'k' : 'q' });
    if (pr) out.push({ k: 'promote', p: pr });
    if (victim) {
      const defended = E.attackers(b, to, us ^ 1).length > 0;
      if (!defended) out.push({ k: 'win', p: victim });
      else if (pieceVal(victim) > pieceVal(t) + 20) out.push({ k: 'winTrade', p: victim, q: t });
      else out.push({ k: 'capture', p: victim, q: t });
    }
    if (forkTargets.length >= 2 && movedSafe) out.push({ k: 'fork', ps: forkTargets.map(s => b[s] & 7).slice(0, 3) });
    if (chk && !mate) out.push({ k: 'check' });
    const saved = before.filter(s => s === from || after.indexOf(s) < 0);
    if (saved.length && !victim) out.push({ k: 'save', p: b[saved[0]] & 7 });
    if (inChk && !victim) out.push({ k: 'escape' });
    if (threat) out.push({ k: 'threat' });
    if (full <= 12 && (t === N || t === B) && (from >> 3) === (us ? 7 : 0)) out.push({ k: 'develop', p: t });
    if (t === P && full <= 10 && (to === 27 || to === 28 || to === 35 || to === 36)) out.push({ k: 'center' });
    if (!out.length) out.push({ k: 'best' });
    return out;
  }
  // ヒント：{ move, san, score（白から見た）, reasons, pv:[SAN…], depth }
  function hint(game, opts) {
    opts = opts || {}; const pos = game.pos, lg = E.legalMoves(pos); if (!lg.length) return null;
    const res = search(pos, { depth: opts.depth || 10, ms: opts.ms || 380, nodes: opts.nodes, analysis: true });
    const m = res.move || lg[0], d = describeScore(res.score, pos.side);
    const san = E.toSan(pos, m, lg);
    const pvSan = []; const tmp = pos.clone();
    for (const x of res.pv.slice(0, 6)) { const l2 = E.legalMoves(tmp); if (l2.indexOf(x) < 0) break; pvSan.push(E.toSan(tmp, x, l2)); tmp.make(x); }
    return { move: m, san, uci: E.uci(m), cp: d.cp, mate: d.mate, reasons: explainMove(pos, m, res), pv: pvSan, depth: res.depth, frac: barFrac(d.cp) };
  }

  // ---------- 毎日のパズル ----------
  function dailySet(seed, bank, count) {
    count = count || 5; const list = (bank && bank.list) || []; if (!list.length) return [];
    const tiers = []; for (let t = 0; t < count; t++) tiers.push([]);
    for (let i = 0; i < list.length; i++) tiers[Math.min(count - 1, Math.floor(i * count / list.length))].push(i);
    const rnd = rng(hash32('chess:daily:' + seed)), out = [];
    for (let t = 0; t < count; t++) { const T = tiers[t]; out.push(T[Math.floor(rnd() * T.length)]); }
    return out;
  }
  const puzzlePoints = ok => (ok ? 200 : 0);
  // 問題：{ f: FEN, k: 'm1'|'m2'|'m3'|'w', s: [UCI…]（答えの手順。最初が正解の手）, g: 勝てる点（w のとき。cp） }
  // 手 m が正解か（m は pos の合法手）。メイトの問題は「その手で n 手以内のメイトが残る」ことを調べる。駒をとる問題は、答えの手と同じ手
  function puzzleOk(p, pos, m, step) {
    if (p.k === 'w') return E.uci(m) === p.s[0];
    const n = +p.k[1] - (step || 0);
    return moveMates(pos, m, n);
  }
  // 問題の続き：メイトの問題で、あなたが正解を指したあと相手が指す手（なければ 0＝メイト済み）。残りの手数 n
  function puzzleReply(p, pos, m, step) {
    if (p.k === 'w') return 0;
    const n = +p.k[1] - (step || 0);
    pos.make(m); if (pos.inCheck() && !E.hasLegal(pos)) { pos.unmake(); return 0; }
    const stored = p.s[(step || 0) * 2 + 1]; let reply = 0;
    if (stored && (step || 0) === 0 && E.uci(m) === p.s[0]) reply = E.legalMoves(pos).find(x => E.uci(x) === stored) || 0;
    if (!reply) reply = bestDefenseFrom(pos, n - 1);
    pos.unmake(); return reply;
  }

  const API = {
    INF, MATE, MATE_IN, VAL, LEVELS, LEVEL_COUNT, BOOK_LINES, hash32, rng,
    evaluate, evalWhite, materialOnly, search, scoreMoves, analyze, describeScore, barFrac, whiteScore, ttClear,
    buildBook, bookMoves, bookMove, cpuMove, isMate, attackerMates, defenderLoses, moveMates, matingMoves, mateLine, bestDefenseFrom,
    enPrise, explainMove, hint, dailySet, puzzlePoints, puzzleOk, puzzleReply, timeUp,
  };
  root.ChessAI = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
