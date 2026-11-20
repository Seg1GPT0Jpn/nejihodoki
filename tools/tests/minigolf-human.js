// ころがし工房ゴルフ：「ふつうの人」のまねをして、ホールのむずかしさを数える（node だけ。minigolf/engine.js をそのまま使う）
//   human(h, sol, o)  … 保存した答えを、角度と強さにばらつき（段ごとの NOISE）を入れて n 回打つ。
//                       ずれたら、その場所から次のねらい（答えの次の止まる場所かカップ）を近くでさがし直して打つ（人がねらい直すのと同じ）。
//                       戻り値 { rate（パー以内に入った割合）, ace（1打で入った割合） }
//   randomAce(h, n)   … ティーからでたらめに打って、1打で入る割合
// ばらつきは決まった種から作るので、何度流しても同じ数になる。
'use strict';
const path = require('path');
const MG = require(path.join(__dirname, '..', '..', 'minigolf/engine.js'));

// 段（tier）ごとの腕前：先の段ほど、うまくなった人を考える（角度 ±a 度・強さ ±p・打つ時刻 ±w 刻み、一様）
const NOISE = { 1: { a: 3, p: 0.08, w: 4 }, 2: { a: 2.5, p: 0.07, w: 4 }, 3: { a: 2, p: 0.06, w: 3 }, 4: { a: 1.75, p: 0.05, w: 3 }, 5: { a: 1.5, p: 0.04, w: 2 } };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; }
function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

// 動く障害物がそろってくり返す長さ（刻み）。見つからなければいちばん長い周期
function period(h) {
  const P = MG.prep(h), per = [];
  P.rulers.forEach(r => per.push(r.per * 60));
  P.gears.forEach(g => per.push(2 * Math.PI / (g.n * Math.abs(g.w)) * 60));
  if (!per.length) return 0;
  for (let T = 30; T <= 1200; T++) if (per.every(p => { const k = T / p; return Math.abs(k - Math.round(k)) * p < 1.5 && Math.round(k) >= 1; })) return T;
  return Math.round(Math.max(...per));
}

function clone(G) { const g = Object.assign(Object.create(MG.Game.prototype), G); g.events = []; g.shots = G.shots.slice(); return g; }
function fire(G, w, a, p) { const g = clone(G); for (let k = 0; k < w; k++) g.step(); MG.settle(g); if (g.done() || !g.shoot(a, p)) return null; MG.settle(g); return g; }

// 答えをそのまま流したときの、各打の止まる場所と打った時刻
function route(h, sol) {
  const G = MG.create(h), pts = [], ticks = [];
  for (const s of sol) { MG.settle(G); if (G.done()) break; for (let k = 0; k < s[0]; k++) G.step(); MG.settle(G); ticks.push(G.tick); G.shoot(s[1], s[2]); MG.settle(G); pts.push({ x: G.x, y: G.y, open: G.open, st: G.st, strokes: G.strokes }); }
  return { pts, ticks };
}

// ねらい直し：基本の打ち方のまわりを格子でさがし、まわりも良いところ（少しずれても良い）をえらぶ
function replan(G, h, base, target, final, left, wait, N, dist, out) {
  const A = [], NA = 17, NP = 9;
  for (let i = 0; i < NA; i++) for (let j = 0; j < NP; j++) {
    const a = base[1] + (i - (NA - 1) / 2) * 0.75, p = Math.max(0.03, Math.min(1, base[2] + (j - (NP - 1) / 2) * 0.02));
    const g = fire(G, wait, a, p);
    let sc;
    if (!g) sc = 99;
    else if (g.st === 'sunk') sc = g.strokes - G.strokes <= left ? 0 : 50;
    else if (g.pen > G.pen || g.st === 'over') sc = 40;
    else if (final || !target) sc = 2 + dist(g);
    else sc = Math.sqrt((g.x - target.x) ** 2 + (g.y - target.y) ** 2) + (g.open !== target.open ? 8 : 0);
    A.push(sc);
  }
  // ばらつきの幅と同じくらいの範囲の平均がいちばん良いところ（はしっこをねらわない）
  const ka = Math.max(1, Math.round(N.a / 0.75 * 0.7)), kp = Math.max(1, Math.round(N.p * base[2] / 0.02 * 0.7));
  let best = -1, bs = 1e9;
  for (let i = 0; i < NA; i++) for (let j = 0; j < NP; j++) {
    let s = 0, n = 0;
    for (let di = -ka; di <= ka; di++) for (let dj = -kp; dj <= kp; dj++) { const ii = i + di, jj = j + dj; const v = ii < 0 || jj < 0 || ii >= NA || jj >= NP ? 60 : A[ii * NP + jj]; s += Math.min(60, v); n++; }
    s = s / n + A[i * NP + j] * 0.3;
    if (s < bs) { bs = s; best = i * NP + j; }
  }
  const i = Math.floor(best / NP), j = best % NP;
  if (out) out.score = bs;
  return [wait, base[1] + (i - (NA - 1) / 2) * 0.75, Math.max(0.03, Math.min(1, base[2] + (j - (NP - 1) / 2) * 0.02))];
}

// ずれて答えの道から外れたとき：ぐるっと粗く打ってみて、カップまでの道のりが短くなる打ち方を近くでさがし直す
function sweep(G, h, left, wait, N, dist) {
  const c = [];
  for (let a = -180; a < 180; a += 6) for (let p = 0.12; p <= 1.0001; p += 0.16) {
    const g = fire(G, wait, a, p); if (!g) continue;
    const sc = g.st === 'sunk' ? (g.strokes - G.strokes <= left ? -100 : 50) : g.pen > G.pen || g.st === 'over' ? 40 : dist(g);
    c.push([sc, a, p]);
  }
  c.sort((x, y) => x[0] - y[0]);
  let best = null;
  for (const k of c.slice(0, 2)) {
    const o = {}; const s = replan(G, h, [wait, k[1], k[2]], null, true, left, wait, N, dist, o);
    if (!best || o.score < best.score) best = { s, score: o.score };
  }
  return best ? best.s : [wait, -90, 0.5];
}

function human(h, sol, o = {}) {
  const N = NOISE[o.tier || 1], n = o.n || 32, par = o.par || h.par;
  const R = route(h, sol), T = period(h), dist = o.dist || require('./minigolf-levels.js').stateDist(h);
  const rnd = rng(hashStr(h.id + '|' + (o.salt || '')));
  const U = () => rnd() * 2 - 1;
  let ok = 0, ace = 0;
  const cache = new Map();
  for (let t = 0; t < n; t++) {
    let G = MG.create(h), exact = true;
    for (let i = 0; i < par; i++) {
      MG.settle(G); if (G.done()) break;
      let s;
      const base = sol[Math.min(i, sol.length - 1)];
      let wait = base[0];
      if (T) { const want = R.ticks[Math.min(i, R.ticks.length - 1)]; wait = (((want - G.tick) % T) + T) % T; if (exact && i < sol.length) wait = base[0]; }
      const key = [G.tick, G.x, G.y, G.strokes, G.open].join('|');
      if (cache.has(key)) s = cache.get(key);
      else {
        const final = i >= sol.length - 1;
        const tgt = R.pts[Math.min(i, R.pts.length - 1)];
        const ro = {};
        if (i < sol.length) s = replan(G, h, base, tgt, final, par - G.strokes, wait, N, dist, ro);
        // 答えの手のまわりに良い手がない（大きくずれた）：ぐるっとさがす
        if (i >= sol.length || (final ? ro.score > 1 : ro.score > 1.2 + Math.min(3, Math.sqrt((G.x - (R.pts[i - 1] || { x: h.tee[0] }).x) ** 2 + (G.y - (R.pts[i - 1] || { y: h.tee[1] }).y) ** 2)))) s = sweep(G, h, par - G.strokes, wait, N, dist);
        if (cache.size < 4000) cache.set(key, s);
      }
      const w = Math.max(0, s[0] + (T ? Math.round(U() * N.w) : 0));
      const g = fire(G, w, s[1] + U() * N.a, s[2] * (1 + U() * N.p));
      if (!g) break;
      G = g;
      const tp = R.pts[i];
      exact = exact && tp && Math.abs(G.x - tp.x) < 1e-9 && Math.abs(G.y - tp.y) < 1e-9 && G.strokes === tp.strokes;
    }
    MG.settle(G);
    if (G.st === 'sunk' && G.strokes <= par) ok++;
    if (G.st === 'sunk' && G.strokes === 1) ace++;
  }
  return { rate: ok / n, ace: ace / n };
}

function randomAce(h, n = 200) {
  const rnd = rng(hashStr('ace|' + h.id));
  let k = 0;
  for (let i = 0; i < n; i++) { const r = MG.play(h, [[Math.floor(rnd() * 60), rnd() * 360 - 180, 0.1 + rnd() * 0.9]]); if (r.sunk && r.strokes === 1) k++; }
  return k / n;
}

// 形の似ている度合い：0.25 マスの格子で、場所ごとの種類（外・フェルト・かべ・インク・おがくず・坂・ほか）をくらべる
function raster(h) {
  const P = MG.prep(h), C = 0.25, out = [];
  for (let y = 0; y < 18; y += C) for (let x = 0; x < 10; x += C) {
    const px = x + C / 2, py = y + C / 2;
    let k = 0;
    if (MG.inPoly(h.poly, px, py)) {
      k = 1;
      if ((h.blocks || []).concat(h.doors || []).some(b => MG.inPoly(b, px, py))) k = 2;
      else if ((h.ink || []).some(b => MG.inPoly(b, px, py))) k = 3;
      else if ((h.sand || []).some(b => MG.inPoly(b, px, py))) k = 4;
      else if ((h.slopes || []).some(s => MG.inPoly(s.p, px, py))) k = 5;
      else if (P.gears.some(g => (px - g.x) ** 2 + (py - g.y) ** 2 < g.r * g.r) || P.rulers.some(r => Math.abs(py - (r.ay + r.by) / 2) < 0.4 && px > Math.min(r.ax, r.bx) - r.len / 2 && px < Math.max(r.ax, r.bx) + r.len / 2)) k = 6;
      else if (P.bumpers.concat(P.posts).some(q => (px - q.x) ** 2 + (py - q.y) ** 2 < (q.r + 0.1) ** 2)) k = 7;
    }
    out.push(k);
  }
  return out;
}
// 0〜1：フェルト以外（外・かべ・インク・おがくず・坂・動くもの・ばね）のマスのうち、同じ種類のものの割合
function similarity(A, B) {
  let same = 0, any = 0;
  for (let i = 0; i < A.length; i++) { if ((A[i] === 1 && B[i] === 1) || (!A[i] && !B[i])) continue; any++; if (A[i] === B[i]) same++; }
  return any ? same / any : 1;
}

module.exports = { NOISE, human, randomAce, period, route, raster, similarity, rng, fire };
