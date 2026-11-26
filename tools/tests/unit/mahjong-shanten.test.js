// mahjong/engine.js の向聴数（一般形・七対子・国士）を、まったく別のやり方（「完成形との牌の重なり」を全部ためす力ずく）と、ランダムな手何千個で比べる。
// 実行：node tools/tests/unit/mahjong-shanten.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'mahjong/engine.js'));

// ---- 力ずく：向聴数 = (完成形の枚数) - 1 - (手と完成形で重なる最大の枚数)。完成形 = 4面子1雀頭（副露ぶんは固定）／七対子／国士
const SETS = []; for (let k = 0; k < 34; k++) SETS.push([k, k, k]); for (let s = 0; s < 3; s++) for (let a = 0; a < 7; a++) SETS.push([s * 9 + a, s * 9 + a + 1, s * 9 + a + 2]);
function overlapOf(h, T) { let o = 0; for (let k = 0; k < 34; k++) o += Math.min(h[k], T[k]); return o; }
function brute(h, nm) {
  const need = 4 - nm; let best = 0;
  const T = new Array(34).fill(0);
  const size = h.reduce((a, b) => a + b, 0);
  // 手の中の牌に重なる面子だけを選ぶ（重ならない面子は「何でもよい穴うめ」で、重なりを増やさない）
  const cand = SETS.filter(s => s.some(k => h[k] > 0));
  function rec(from, left, ov) {
    if (ov + 3 * left + 2 <= best) return;
    if (left === 0 || from >= cand.length) {
      for (let p = 0; p < 34; p++) {
        T[p] += 2; if (T[p] <= 4) { const o = overlapOf(h, T); if (o > best) best = o; } T[p] -= 2;
      }
      return;
    }
    for (let i = from; i < cand.length; i++) {
      const s = cand[i]; let okc = true; for (const k of s) { T[k]++; if (T[k] > 4) okc = false; }
      if (okc) rec(i, left - 1, overlapOf(h, T));
      for (const k of s) T[k]--;
    }
    rec(cand.length, 0, ov);   // 残りは穴うめ
  }
  rec(0, need, 0);
  let res = best;   // 重なり（副露ぶんは手の外）
  let total = 14 - 3 * nm;
  let sh = total - 1 - res;
  if (nm === 0) {
    // 七対子：種類の違う7つの対
    const ov = []; for (let k = 0; k < 34; k++) ov.push(Math.min(h[k], 2)); ov.sort((a, b) => b - a);
    const chi = 14 - 1 - ov.slice(0, 7).reduce((a, b) => a + b, 0);
    sh = Math.min(sh, chi);
    // 国士
    const Y = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]; let bk = 0;
    for (const p of Y) { let o = 0; for (const y of Y) o += Math.min(h[y], y === p ? 2 : 1); bk = Math.max(bk, o); }
    sh = Math.min(sh, 14 - 1 - bk);
  }
  return sh;
}
function randHand(r, n) { const w = []; for (let k = 0; k < 34; k++) for (let i = 0; i < 4; i++) w.push(k); for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [w[i], w[j]] = [w[j], w[i]]; } return E.toCounts(w.slice(0, n)); }
// 偏った手（一色・字牌・七対子寄り・国士寄り）も混ぜる
function biasHand(r, n, mode) {
  const pool = [];
  for (let k = 0; k < 34; k++) { const ok = mode === 0 ? k < 9 || k >= 27 : mode === 1 ? k < 9 : mode === 2 ? E.isYao(k) : k < 18; if (ok) for (let i = 0; i < 4; i++) pool.push(k); }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return E.toCounts(pool.slice(0, n));
}

test('known shanten values (standard, chiitoitsu, kokushi)', () => {
  const S = s => E.shanten(E.toCounts(E.parseKinds(s)), 0);
    eq(S('23m456p789s111z22z'), 0, 'ryanmen tenpai');
  eq(S('11m22p33s44z55z66z77z'), -1, 'seven pairs complete');
  eq(S('119m19p19s1234567z'), -1, 'kokushi complete');
  eq(S('19m19p19s1234567z'), 0, 'kokushi 13-sided tenpai');
  eq(S('19m19p19s123456z2m'), 1, 'kokushi 12 kinds, no pair');
  eq(S('123m456p789s111z22z'), -1, 'normal complete');
  eq(S('11m22p33s44z55z66z7z'), 0, 'seven pairs tenpai');
  eq(S('1357m1357p1357s12z'), 4, 'scattered hand (cross-checked by brute force)');
});
test('shanten: 3000 random 13- and 14-tile hands match the brute-force checker', () => {
  const r = E.mulberry32(20261126); let bad = 0, t0 = Date.now(), n = 0; const dist = {};
  for (let i = 0; i < 3000; i++) {
    const size = i % 2 ? 14 : 13;
    const h = i % 5 === 4 ? biasHand(r, size, i % 4) : randHand(r, size);
    const a = E.shanten(h, 0), b = brute(h, 0); n++; dist[a] = (dist[a] || 0) + 1;
    if (a !== b) { bad++; if (bad < 4) console.log('  mismatch', E.handStr(h.flatMap((c, k) => Array(c).fill(k))), a, b); }
  }
  eq(bad, 0, 'mismatches'); ok(Object.keys(dist).length >= 5, 'varied: ' + JSON.stringify(dist));
  console.log('  ' + n + ' hands, ' + (Date.now() - t0) + ' ms, distribution ' + JSON.stringify(dist));
});
test('shanten with open melds (1-3 melds): 1500 random hands match', () => {
  const r = E.mulberry32(77); let bad = 0;
  for (let i = 0; i < 1500; i++) {
    const nm = 1 + (i % 3), size = (i % 2 ? 14 : 13) - 3 * nm;
    const h = randHand(r, size);
    const a = E.shanten(h, nm), b = brute(h, nm);
    if (a !== b) { bad++; if (bad < 4) console.log('  mismatch', nm, E.handStr(h.flatMap((c, k) => Array(c).fill(k))), a, b); }
  }
  eq(bad, 0);
});
test('near-complete hands: shanten equals the minimum number of tile swaps to a complete hand (ground truth by isComplete)', () => {
  const r = E.mulberry32(5); let bad = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    // 完成形から 0〜2 枚を別の牌に差しかえる
    let h; do { h = randHand(r, 14); const kinds = h.flatMap((c, k) => Array(c).fill(k)); h = null;
      // 完成形を作る：4面子1雀頭をランダムに
      const hh = new Array(34).fill(0); let okk = true;
      for (let s = 0; s < 4; s++) { if (r() < 0.5) { const k = Math.floor(r() * 34); hh[k] += 3; } else { const su = Math.floor(r() * 3), a = Math.floor(r() * 7); for (let q = 0; q < 3; q++) hh[su * 9 + a + q]++; } }
      const p = Math.floor(r() * 34); hh[p] += 2; if (hh.some(x => x > 4)) okk = false; if (okk) h = hh; } while (!h);
    const sw = i % 3;
    for (let q = 0; q < sw; q++) { const have = []; h.forEach((c, k) => { if (c) have.push(k); }); const a = have[Math.floor(r() * have.length)]; let b; do { b = Math.floor(r() * 34); } while (h[b] >= 4 || b === a); h[a]--; h[b]++; }
    // 真の最小交換数：1枚取って1枚足す、を d 回で完成形になる最小の d（d ≤ 2 を全探索。それ以上は「3以上」）
    let truth = 3; const comp = x => E.isComplete(x, 0);
    if (comp(h)) truth = 0;
    else {
      outer1: for (let a = 0; a < 34; a++) if (h[a]) { h[a]--; for (let b = 0; b < 34; b++) if (h[b] < 4) { h[b]++; if (comp(h)) { truth = 1; h[b]--; h[a]++; break outer1; } h[b]--; } h[a]++; }
      if (truth === 3) {
        outer2: for (let a = 0; a < 34; a++) if (h[a]) { h[a]--; for (let a2 = a; a2 < 34; a2++) if (h[a2]) { h[a2]--; for (let b = 0; b < 34; b++) if (h[b] < 4) { h[b]++; for (let b2 = b; b2 < 34; b2++) if (h[b2] < 4) { h[b2]++; if (comp(h)) { truth = 2; } h[b2]--; if (truth === 2) break; } h[b]--; if (truth === 2) break; } h[a2]++; if (truth === 2) break; } h[a]++; if (truth === 2) break outer2; }
      }
    }
    const sh = E.shanten(h, 0);
    // 七対子・国士の完成形は comp にも含まれる。向聴数 = 交換数 - 1（交換数 3 以上のときは 2 以上）
    if (truth < 3) { n++; if (sh !== truth - 1 && !(sh < truth - 1)) { bad++; console.log('  mismatch', E.handStr(h.flatMap((c, k) => Array(c).fill(k))), sh, truth - 1); } else if (sh < truth - 1) { bad++; } }
    else if (sh < 2) { bad++; console.log('  too low', sh); }
  }
  eq(bad, 0); ok(n > 30, 'enough samples: ' + n);
});
test('waits: every wait completes the hand; non-waits do not', () => {
  const r = E.mulberry32(9);
  for (let i = 0; i < 400; i++) {
    const h = randHand(r, 13); const w = E.waits(h, 0), s = E.shanten(h, 0);
    eq(w.length > 0, s === 0, 'tenpai iff waits: ' + E.handStr(h.flatMap((c, k) => Array(c).fill(k))));
    for (const k of w) { h[k]++; ok(E.isComplete(h, 0)); eq(E.shanten(h, 0), -1); h[k]--; }
  }
  const W = s => E.waits(E.toCounts(E.parseKinds(s)), 0).map(k => E.kindName(k, true)).join(',');
  eq(W('1112345678999m'), '1m,2m,3m,4m,5m,6m,7m,8m,9m', 'nine gates');
  eq(W('23m456p789s111z22z'), '1m,4m', 'two-sided');
  eq(E.waits(E.toCounts(E.parseKinds('19m19p19s1234567z')), 0).length, 13, 'kokushi 13 waits');
  eq(W('11m22p33s44z55z66z7z'), 'Red', 'seven pairs wait');
});
run();
