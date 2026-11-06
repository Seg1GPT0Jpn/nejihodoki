#!/usr/bin/env node
// ころがし工房ゴルフの全ホールを、保存してある答え（minigolf-solutions.js）で流す（ブラウザなし。minigolf/engine.js をそのまま使う）
//   node tools/tests/minigolf-levels.js                 … 全部の確認（数秒）
//   node tools/tests/minigolf-levels.js --solve 2-3,3-1 … 答えをさがして出す（ホールを変えたとき。1ホール数秒〜1分。出力を minigolf-solutions.js に貼る）
//   node tools/tests/minigolf-levels.js --solve all     … 全ホール（4つのプロセスで並べる）
// 各ホール：答えがカップに入る・打数（罰打こみ）がパー以内・2回流して同じ結果（決まった結果）・何もしないと入らない・
//           ティーとカップがフェルトの上（ブロックとインクの外）・動く障害物（歯車・定規）がかべとのあいだに球をはさまない
'use strict';
const path = require('path');
const { fork } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const MG = require(path.join(ROOT, 'minigolf/engine.js'));
const { HOLES, COURSES } = require(path.join(ROOT, 'minigolf/holes.js'));

// ---------------------------------------------------------------- 答えさがし（--solve）
// カップからの道のり（障害物をよけた格子の最短距離。パイプは出口から入り口へつなぐ）を目安に、打数ごとに良い位置を残していく
function distField(h) {
  const P = MG.prep(h), C = 0.2;
  const W = Math.ceil((P.bb.x1 + 1) / C), Hh = Math.ceil((P.bb.y1 + 1) / C);
  const ok = new Uint8Array(W * Hh), cost = new Float32Array(W * Hh);
  const inAny = (list, x, y) => list.some(p => MG.inPoly(p, x, y));
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const x = (i + 0.5) * C, y = (j + 0.5) * C;
    if (!MG.inPoly(h.poly, x, y) || inAny(h.blocks || [], x, y) || inAny(h.ink || [], x, y)) continue;
    if ((h.posts || []).concat(h.bumpers || []).some(q => (x - q[0]) ** 2 + (y - q[1]) ** 2 < (q[2] + 0.1) ** 2)) continue;
    ok[j * W + i] = 1; cost[j * W + i] = inAny(h.sand || [], x, y) ? 2.5 : 1;
  }
  const D = new Float64Array(W * Hh).fill(1e9);
  const cell = (x, y) => { const i = Math.floor(x / C), j = Math.floor(y / C); return i >= 0 && j >= 0 && i < W && j < Hh ? j * W + i : -1; };
  const start = cell(h.cup[0], h.cup[1]);
  D[start] = 0;
  const pipesTo = {}; (h.pipes || []).forEach(p => { const b = cell(p.b[0], p.b[1]); (pipesTo[b] = pipesTo[b] || []).push(cell(p.a[0], p.a[1])); });
  // Dijkstra（小さいので配列から最小を探す二分ヒープで十分）
  const heap = [[0, start]];
  const push = (d, k) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const pi = (i - 1) >> 1; if (heap[pi][0] <= heap[i][0]) break; [heap[pi], heap[i]] = [heap[i], heap[pi]]; i = pi; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, k] = pop(); if (d > D[k]) continue;
    const i = k % W, j = (k - i) / W;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= Hh) continue;
      const nk = nj * W + ni; if (!ok[nk]) continue;
      const nd = d + C * (di && dj ? 1.414 : 1) * cost[nk];
      if (nd < D[nk]) { D[nk] = nd; push(nd, nk); }
    }
    for (const a of pipesTo[k] || []) if (a >= 0 && d + 0.5 < D[a]) { D[a] = d + 0.5; push(d + 0.5, a); }
  }
  return (x, y) => { const k = cell(x, y); return k < 0 ? 1e9 : D[k] >= 1e9 ? 60 : D[k]; };
}
function clone(G) { const g = Object.assign(Object.create(MG.Game.prototype), G); g.events = []; g.shots = G.shots.slice(); return g; }
function trial(G, w, a, p) {
  const g = clone(G);
  for (let k = 0; k < w; k++) g.step();
  MG.settle(g);
  if (g.done() || !g.shoot(a, p)) return null;
  MG.settle(g);
  return g;
}
function solve(h, o = {}) {
  const dist = distField(h);
  const moving = (h.gears || []).length + (h.rulers || []).length > 0;
  const WAITS = moving ? [0, 13, 26, 39, 52, 65] : [0];
  const maxStrokes = o.max || h.par;
  const score = g => (g.st === 'sunk' ? -100 : dist(g.x, g.y)) + g.strokes * 4;
  let beam = [{ G: MG.create(h), shots: [] }];
  let best = null;
  for (let depth = 1; depth <= maxStrokes && !best; depth++) {
    const cand = [];
    for (const node of beam) {
      const G = node.G;
      const aStep = moving ? 3 : 2;
      for (const w of WAITS) for (let a = -180; a < 180; a += aStep) for (let p = 0.06; p <= 1.0001; p += 0.04) {
        const g = trial(G, w, a, p); if (!g) continue;
        const shots = node.shots.concat([[w, MG.qa(a), MG.qp(p)]]);
        if (g.st === 'sunk' && g.strokes <= maxStrokes) { if (!best || g.strokes < best.strokes) best = { strokes: g.strokes, shots }; continue; }
        cand.push({ G: g, shots, s: score(g), w, a, p, node });
      }
      if (best && best.strokes <= depth) break;
      // 良い候補のまわりを細かくさがす（カップに入る手はたいてい細い）
      const top = cand.filter(c => c.node === node).sort((x, y) => x.s - y.s).slice(0, 14);
      for (const c of top) {
        for (let da = -2.5; da <= 2.5; da += 0.25) for (let dp = -0.05; dp <= 0.05; dp += 0.005) {
          const g = trial(G, c.w, c.a + da, c.p + dp); if (!g) continue;
          const shots = node.shots.concat([[c.w, MG.qa(c.a + da), MG.qp(c.p + dp)]]);
          if (g.st === 'sunk' && g.strokes <= maxStrokes) { if (!best || g.strokes < best.strokes) best = { strokes: g.strokes, shots }; break; }
          cand.push({ G: g, shots, s: score(g), w: c.w, a: c.a + da, p: c.p + dp, node: null });
        }
        if (best) break;
      }
      if (best) break;
    }
    if (best) break;
    // 次の打数へ：良い位置を、場所が重ならないように残す
    cand.sort((x, y) => x.s - y.s);
    const seen = new Set(); beam = [];
    for (const c of cand) {
      if (c.G.st !== 'rest') continue;
      const key = Math.round(c.G.x * 2) + ',' + Math.round(c.G.y * 2);
      if (seen.has(key)) continue; seen.add(key); beam.push({ G: c.G, shots: c.shots });
      if (beam.length >= (o.beam || 5)) break;
    }
  }
  return best;
}

// ---------------------------------------------------------------- 確認
function clearance(h) { // 動く障害物と、かべ・ブロックのすきま（いちばんせまいところ）
  const P = MG.prep(h);
  let worst = 1e9;
  const dSeg = (x, y, s) => { const px = x - s.ax, py = y - s.ay; let u = s.l2 ? (px * s.dx + py * s.dy) / s.l2 : 0; u = Math.max(0, Math.min(1, u)); const cx = s.ax + s.dx * u - x, cy = s.ay + s.dy * u - y; return Math.sqrt(cx * cx + cy * cy); };
  const statics = (x, y) => Math.min(...P.walls.map(s => dSeg(x, y, s)), ...P.posts.concat(P.bumpers).map(q => Math.sqrt((x - q.x) ** 2 + (y - q.y) ** 2) - q.r));
  for (let t = 0; t < 12; t += 0.05) {
    for (const r of P.rulers) { const R = MG.rulerAt(r, t); worst = Math.min(worst, statics(R.x1, R.y1) - MG.RULER_TH, statics(R.x2, R.y2) - MG.RULER_TH); }
    for (const g of P.gears) for (const tip of MG.gearArms(g, t)) worst = Math.min(worst, statics(tip.x, tip.y) - MG.GEAR_TH);
  }
  return worst;
}

if (require.main !== module) {
  // required by another script (only the solver is used)
} else if (process.argv[2] === '--worker') {
  process.on('message', ids => { const out = {}; for (const id of ids) { const h = HOLES.find(x => x.id === id); const t = Date.now(); out[id] = solve(h, { beam: +process.env.MG_BEAM || 5, max: h.par + (+process.env.MG_EXTRA || 0) }); out[id + '#ms'] = Date.now() - t; } process.send(out); process.exit(0); });
} else if (process.argv[2] === '--solve') {
  (async () => {
    const want = !process.argv[3] || process.argv[3] === 'all' ? HOLES.map(h => h.id) : process.argv[3].split(',');
    const n = Math.min(4, want.length), chunks = Array.from({ length: n }, (_, k) => want.filter((_, i) => i % n === k));
    const res = Object.assign({}, ...(await Promise.all(chunks.map(ch => new Promise((ok, bad) => { const w = fork(__filename, ['--worker']); w.on('message', ok); w.on('error', bad); w.send(ch); })))));
    for (const id of want) {
      const h = HOLES.find(x => x.id === id), r = res[id];
      console.log(r ? `  '${id}': ${JSON.stringify(r.shots)}, // ${r.strokes}/${h.par} (${Math.round(res[id + '#ms'] / 1000)}s)` : `  // ${id}: no solution within par ${h.par} (${Math.round(res[id + '#ms'] / 1000)}s)`);
    }
  })();
} else {
  const SOL = require('./minigolf-solutions.js');
  let pass = 0, fail = 0;
  const check = (name, cond, info) => { if (cond) pass++; else { fail++; console.log('  FAIL ' + name + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 300) : '')); } };
  const t0 = Date.now();
  check('3 courses × 9 holes', COURSES.length >= 3 && HOLES.length >= 27 && COURSES.every((c, k) => HOLES.filter(h => h.course === k).length === 9), HOLES.length);
  check('hole ids are unique', new Set(HOLES.map(h => h.id)).size === HOLES.length);
  let sumAce = 0;
  for (const h of HOLES) {
    check(h.id + ' par 2–5', h.par >= 2 && h.par <= 5, h.par);
    const onFelt = ([x, y]) => MG.inPoly(h.poly, x, y) && !(h.blocks || []).some(b => MG.inPoly(b, x, y)) && !(h.ink || []).some(b => MG.inPoly(b, x, y));
    check(h.id + ' tee and cup are on the felt', onFelt(h.tee) && onFelt(h.cup));
    const cl = clearance(h);
    check(h.id + ' moving parts never pinch the ball against a wall (gap ' + (cl > 1e8 ? '-' : cl.toFixed(2)) + ')', cl >= 2 * MG.BALL_R + 0.02, cl);
    const none = MG.play(h, []);
    check(h.id + ' doing nothing does not sink it', !none.sunk);
    const sol = SOL[h.id];
    if (!sol) { check(h.id + ' has a stored solution', false); continue; }
    const a = MG.play(h, sol), b = MG.play(h, sol);
    check(h.id + ' solution sinks the ball', a.sunk, a);
    check(h.id + ' solution is within par (' + a.strokes + '/' + h.par + ')', a.sunk && a.strokes <= h.par, a);
    check(h.id + ' same result twice (deterministic)', a.hash === b.hash && a.ticks === b.ticks, [a.hash, b.hash]);
    check(h.id + ' every shot is a real shot', sol.every(s => s.length === 3 && s[0] >= 0 && s[2] > 0 && s[2] <= 1));
    if (a.strokes === 1) sumAce++;
  }
  // the solutions are full replays: shooting one more time after the ball sank does nothing
  const h0 = HOLES[0], g = MG.play(h0, SOL[h0.id].concat([[0, 0, 0.5]]));
  check('shots after the cup are ignored', g.sunk && g.strokes === MG.play(h0, SOL[h0.id]).strokes, g);
  console.log(`minigolf-levels: ${HOLES.length} holes (${sumAce} aces in the stored answers), pass ${pass}  fail ${fail}  (${Math.round((Date.now() - t0) / 100) / 10}s)`);
  process.exit(fail ? 1 : 0);
}

module.exports = { solve, distField };
