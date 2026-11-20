#!/usr/bin/env node
// ころがし工房ゴルフ：ホールを部品から組み立てる道具（コース4から先）。
//   node tools/minigolf-gen.js --course 4[,5,6] [--cand 24] [--replace]   … （すでにあるコースは --replace のときだけ作り直す） そのコースの候補を作って、答えをさがし、人のまねでむずかしさを数え、9ホールえらんで
//                                                              minigolf/holes-gen.js と tools/tests/minigolf-solutions-gen.json に書く（コースごとに置きかえ）
//   node tools/minigolf-gen.js --show 4 --seed 7               … 1つの候補を JSON で出す（見るだけ）
// 組み立て方：ホールは下（ティー）から上（カップ）へ「帯」を積む。帯と帯のあいだは仕切り（すきま・スイッチの扉・はね戸・パイプ）。
// 帯の中には、コースの主題の部品（インクの池・川と橋・歯車・定規・ばね・坂・おがくず）を置く。むずかしい帯ほどティーの近く（はじめ）に置く。
// 段（tier）が上がるほど、すきまがせまく、帯が多く、インクが線の近くに来て、パーはきびしくなる。
// えらび方：答えがパー以内・でたらめに打って1打で入らない・人のまね（minigolf-human.js）の成功率が段の目安の中・ほかのホールと形が似ていない。
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const MG = require(path.join(ROOT, 'minigolf/engine.js'));
const HU = require(path.join(__dirname, 'tests/minigolf-human.js'));
const GEN_FILE = path.join(ROOT, 'minigolf/holes-gen.js');
const SOL_FILE = path.join(__dirname, 'tests/minigolf-solutions-gen.json');

// ひねりのホールの一言
const TWIST_TIP = {
  7: ['橋がかたむいている。まっすぐ打つとインクへ', 'This bridge tilts. Hit it straight and you slide into the ink'],
  8: ['2つの歯車が、反対向きに回る', 'Two gears, turning opposite ways'],
  9: ['2本の定規が、すれちがう', 'Two rulers slide past each other'],
  10: ['にせのパイプ：入るとティーへもどる', 'A trick pipe: it takes you back to the tee'],
  11: ['のぼり坂。弱いと、もどってくる', 'Uphill. Too soft and it rolls back'],
  12: ['戸口の向こうに、ばねが待つ', 'A spring waits just past the door'],
};
// 段ごとの目安（人のまねの成功率）。minigolf-levels.js の帯と同じ考え
const BAND = { 1: [0.8, 1], 2: [0.4, 0.9], 3: [0.3, 0.7], 4: [0.15, 0.45], 5: [0.04, 0.25] };
const TIER = c => (c <= 3 ? 1 : c <= 7 ? 2 : c <= 12 ? 3 : c <= 17 ? 4 : 5);

// コースごとの主題：仕切りの種類と、帯の中の部品の重み
const THEME = {
  4: { seps: ['door'], parts: { inkside: 2, plain: 2, bumper: 1, sand: 1 } },
  5: { seps: ['switch', 'door'], parts: { inkside: 2, plain: 2, sand: 1 } },
  6: { seps: ['gate', 'door'], parts: { slope: 3, inkside: 2, plain: 1 } },
  7: { seps: ['door'], parts: { river: 4, inkside: 1 } },
  8: { seps: ['door'], parts: { gear: 4, inkside: 1 } },
  9: { seps: ['door'], parts: { ruler: 4, inkside: 1 } },
  10: { seps: ['pipe', 'door'], parts: { inkside: 2, plain: 1, sand: 1 } },
  11: { seps: ['door'], parts: { slope: 4, inkside: 2 } },
  12: { seps: ['door'], parts: { bumper: 3, inkside: 2 } },
};
const MIX = { seps: ['door', 'door', 'switch', 'gate', 'pipe'], parts: { inkside: 3, river: 2, gear: 2, ruler: 2, slope: 2, bumper: 1, sand: 1 } };

const r2 = v => Math.round(v * 20) / 20;
const R = (x0, y0, x1, y1) => [[r2(x0), r2(y0)], [r2(x1), r2(y0)], [r2(x1), r2(y1)], [r2(x0), r2(y1)]];

function make(course, seed) {
  const rnd = HU.rng(seed * 7919 + course * 104729), U = (a, b) => a + rnd() * (b - a), pick = a => a[Math.floor(rnd() * a.length)];
  const T = TIER(course), th = THEME[course] || MIX;
  const wpick = w => { const ks = Object.keys(w), tot = ks.reduce((s, k) => s + w[k], 0); let x = rnd() * tot; for (const k of ks) { x -= w[k]; if (x <= 0) return k; } return ks[0]; };
  const W = pick([7, 7.5, 8]), x0 = r2((9 - W) / 2), x1 = x0 + W;
  // V3（コース7から）：帯を高くして部品を大きく、帯ごとに2つめの部品、コースの「ひねり」（seed が4の倍数）
  const V3 = course >= 7, twist = V3 && seed % 4 === 0;
  const nb = V3 ? { 2: 3, 3: 4, 4: 4, 5: 5 }[T] + (rnd() < 0.35 && !(th.parts.gear || th.parts.ruler || th.seps[0] === 'pipe') ? 1 : 0) : T + (T <= 2 ? 1 : 2) + (rnd() < 0.4 ? 1 : 0) - (T === 5 && rnd() < 0.3 ? 1 : 0); // 帯の数（ティーとカップの帯を入れて）
  const bh = V3 ? Math.min(3.9, Math.max(3.0, 15.5 / nb)) : Math.min(3.8, Math.max(2.8, 14.5 / nb));
  const Ht = r2(bh * nb), y0 = 1, y1 = r2(y0 + Ht);
  const gw = U(...{ 2: [1.15, 1.5], 3: [0.95, 1.2], 4: [0.8, 1.0], 5: [0.68, 0.85] }[T] || [1.3, 1.6]);
  const h = { id: 'gen', n: ['', ''], par: 3, poly: R(x0, y0, x1, y1), blocks: [], ink: [], sand: [], slopes: [], bumpers: [], gears: [], rulers: [], pipes: [], doors: [], switches: [], gates: [] };
  // 仕切り（下から）。すきまは左右交互
  let side = rnd() < 0.5 ? -1 : 1;
  const seps = [];
  for (let k = 1; k < nb; k++) {
    const ys = r2(y1 - bh * k);
    let kind = k === 1 || rnd() < 0.7 ? th.seps[0] : pick(th.seps);
    if (kind === 'switch' && T <= 2 && seps.some(q => q.kind === 'switch')) kind = 'door'; // 職人の段：スイッチは1つまで
    const m = 0.5 + gw / 2;
    const gx = r2(side < 0 ? U(x0 + m, x0 + W * 0.38) : U(x1 - W * 0.38, x1 - m));
    side = -side;
    seps.push({ ys, gx, kind });
  }
  const bandTop = k => (k < nb - 1 ? seps[k].ys : y0), bandBot = k => (k === 0 ? y1 : seps[k - 1].ys);
  seps.forEach((s, k) => {
    const t = 0.2, a = s.gx - gw / 2, b = s.gx + gw / 2;
    if (s.kind === 'pipe') {
      h.blocks.push(R(x0, s.ys - t, x1, s.ys + t));
      const lo = bandBot(k) - 0.8, ex = r2(U(x0 + 1, x1 - 1));
      h.pipes.push({ a: [r2(s.gx), r2(Math.max(s.ys + 0.9, lo - U(0, 0.6)))], b: [ex, r2(s.ys - 0.75)], d: pick([-90, -60, -120, 180, 0]) });
      // ひねり：にせのパイプ（入り口は戸口のそば、出口はティーの帯へもどる）
      if (twist && k > 0) h.pipes.push({ a: [r2(s.gx < (x0 + x1) / 2 ? x1 - 1 : x0 + 1), r2(s.ys + 0.9)], b: [r2((x0 + x1) / 2), r2(y1 - 0.8)], d: -90 });
      return;
    }
    h.blocks.push(R(x0, s.ys - t, a, s.ys + t), R(b, s.ys - t, x1, s.ys + t));
    if (s.kind === 'switch') {
      const bit = h.doors.length;
      h.doors.push(R(a, s.ys - t, b, s.ys + t));
      // スイッチ：下の帯のすみ（すきまと反対がわ）
      const sx = r2(s.gx < (x0 + x1) / 2 ? U(x1 - 1.6, x1 - 0.6) : U(x0 + 0.6, x0 + 1.6));
      const sy = r2(U(bandTop(k) + 0.7, bandBot(k) - (k === 0 ? 2.2 : 0.7)));
      h.switches.push([sx, sy, 0.32, 1 << bit]);
    } else if (s.kind === 'gate') {
      h.gates.push({ a: [r2(a), s.ys], b: [r2(b), s.ys], d: -90 });
    }
  });
  // 帯の中の部品。主題の部品は、はじめの帯（ティーに近いほう）ほど強く
  const clearOf = (x, y, r) => Math.abs(x - 0) >= 0 && h.blocks.every(b => !MG.inPoly(b, x, y)) && seps.every(s => Math.abs(y - s.ys) > r + 0.25 || Math.abs(x - s.gx) > gw / 2 + r + 0.3);
  for (let k = 0; k < nb; k++) {
    const top = bandTop(k) + 0.2, bot = bandBot(k) - 0.2, mid = (top + bot) / 2;
    const isTee = k === 0, isCup = k === nb - 1;
    const doorUp = k < nb - 1 ? seps[k] : null, doorDn = k > 0 ? seps[k - 1] : null;
    const hard = 1 - k / nb; // はじめの帯ほど 1 に近い
    const n = isCup ? (T >= 3 ? 1 : 0) : isTee ? (T >= 3 ? 1 : 0) : 1 + (rnd() < 0.25 * T * hard ? 1 : 0) + (V3 && rnd() < 0.6 ? 1 : 0);
    for (let q = 0; q < n; q++) {
      // 主題の部品（いちばんティーに近い帯にはかならず）と、2つめはほかの部品（おがくず・坂・インク・ばね）
      const part = isCup ? 'inkside' : V3 && isTee ? wpick({ sand: 1, inkside: 2, bumper: 1 }) : V3 && q > 0 ? wpick({ sand: 2, slope: 1, inkside: 2, bumper: 1 }) : wpick(th.parts);
      const tight = 0.25 + 0.15 * (5 - T); // 線とインクのあいだ
      if (part === 'inkside') {
        // すみのインク池：戸口の口をふさがない
        const left = rnd() < 0.5, w = U(1.2, 1.2 + W * 0.25), hh = U(0.8, Math.min(2.2, bot - top - 0.6));
        const yy = r2(U(top + 0.1, bot - hh - 0.1));
        const bx0 = left ? x0 : x1 - w, bx1 = left ? x0 + w : x1;
        const blocked = [doorUp, doorDn].some(s => s && s.gx + gw / 2 + tight > bx0 && s.gx - gw / 2 - tight < bx1 && Math.min(Math.abs(yy - s.ys), Math.abs(yy + hh - s.ys)) < 0.9);
        if (!blocked) h.ink.push(R(bx0, yy, bx1, yy + hh));
      } else if (part === 'river' && bot - top > 2.6) {
        const ry = r2(mid - 0.45), bw = r2(U(...{ 2: [1.1, 1.4], 3: [0.9, 1.1], 4: [0.75, 0.95], 5: [0.6, 0.8] }[T])), bx = r2(U(x0 + 1 + bw / 2, x1 - 1 - bw / 2));
        h.ink.push(R(x0, ry, bx - bw / 2, ry + 0.9), R(bx + bw / 2, ry, x1, ry + 0.9));
        if (twist) h.slopes.push({ p: R(bx - bw / 2, ry, bx + bw / 2, ry + 0.9), g: [r2((rnd() < 0.5 ? -1 : 1) * U(1.5, 2.5)), 0] }); // ひねり：かたむいた橋
      } else if (part === 'gear' && bot - top > 2.4) {
        const r = r2(Math.min(1.6, (bot - top) / 2 - (V3 ? 0.5 : 0.35))), gm = V3 ? 0.6 : 0.45, gx = doorUp ? r2(Math.max(x0 + r + gm, Math.min(x1 - r - gm, doorUp.gx + U(-0.6, 0.6)))) : r2((x0 + x1) / 2);
        if (twist && x1 - x0 >= 7.5) { // ひねり：ならんだ2つの歯車が、反対に回る
          const r3 = r2(Math.min(r, (x1 - x0) / 4 - 0.6)), w3 = r2(U(1.3, 1.8));
          h.gears.push({ x: r2(x0 + (x1 - x0) / 4), y: r2(mid), r: r3, arms: 3, w: w3, ph: r2(rnd()) }, { x: r2(x1 - (x1 - x0) / 4), y: r2(mid), r: r3, arms: 3, w: -w3, ph: r2(rnd()) });
        } else h.gears.push({ x: gx, y: r2(mid), r, arms: pick([2, 3, 4]), w: r2((rnd() < 0.5 ? -1 : 1) * U(1.0, 1.0 + 0.25 * T)), ph: r2(rnd()) });
      } else if (part === 'ruler' && doorUp) {
        const y = r2(doorUp.ys + 0.75), len = r2(Math.min(2.4, gw + 0.9));
        const per = pick([2, 2.4, 3]), ph = r2(rnd()), rm = V3 ? 0.62 : 0.45;
        h.rulers.push({ a: [r2(Math.max(x0 + len / 2 + rm, doorUp.gx - 1.6)), y], b: [r2(Math.min(x1 - len / 2 - rm, doorUp.gx + 1.6)), y], len, ang: 0, per, ph });
        if (twist && bot - top > 2.4) h.rulers.push({ a: [r2(Math.min(x1 - len / 2 - rm, doorUp.gx + 1.6)), r2(y + 0.8)], b: [r2(Math.max(x0 + len / 2 + rm, doorUp.gx - 1.6)), r2(y + 0.8)], len, ang: 0, per, ph: r2((ph + 0.5) % 1) }); // ひねり：2本が反対に
      } else if (part === 'bumper') {
        for (let b = 0; b < 2; b++) { const x = r2(U(x0 + 1, x1 - 1)), y = r2(U(top + 0.6, bot - 0.6)); if (clearOf(x, y, 0.45)) h.bumpers.push([x, y, 0.4]); }
        if (twist && doorUp && q === 0) { const x = r2(doorUp.gx), y = r2(doorUp.ys - 0.95); if (h.blocks.every(b => !MG.inPoly(b, x, y))) h.bumpers.push([x, y, 0.35]); } // ひねり：戸口の向こうにばね
      } else if (part === 'slope') {
        const g = r2(U(1.2, 1.2 + 0.4 * T)) * (rnd() < 0.5 ? -1 : 1);
        const down = th.seps.includes('gate') && rnd() < 0.6; // はね戸の上は、戸のほうへ下る坂
        const climb = twist && q === 0; // ひねり：ティーのほうへ下るのぼり坂（弱いともどってくる）
        h.slopes.push({ p: R(x0, top, x1, bot), g: down || climb ? [0, Math.abs(g)] : [g, 0] });
        const nearDoor = V3 && [doorUp, doorDn].some(s => s && (g > 0 ? s.gx > x1 - 1.6 : s.gx < x0 + 1.6));
        if (!down && !climb && !nearDoor) h.ink.push(R(g > 0 ? x1 - 0.9 : x0, top + 0.4, g > 0 ? x1 : x0 + 0.9, bot - 0.4));
      } else if (part === 'sand') {
        const w = U(1.4, 2.6), x = U(x0, x1 - w), y = U(top, bot - 1); h.sand.push(R(x, y, x + w, y + 1));
      }
    }
  }
  // ティーとカップ
  const tb = bandTop(0), cupBand = [y0, nb > 1 ? seps[nb - 2].ys : y1];
  h.tee = [r2(U(x0 + 1.2, x1 - 1.2)), r2(y1 - 1.1)];
  h.cup = [r2(U(x0 + 1.2, x1 - 1.2)), r2(cupBand[0] + U(1.0, Math.min(1.8, cupBand[1] - cupBand[0] - 1.1)))];
  if (T >= 3 && rnd() < 0.6) h.ink.push(R(Math.max(x0, h.cup[0] - 1.6), y0, Math.min(x1, h.cup[0] + 1.6), r2(h.cup[1] - 0.65))); // カップの向こうにインク：強すぎるとおちる
  else if (rnd() < 0.5) h.blocks.push(R(h.cup[0] - 0.65, h.cup[1] + 0.6, h.cup[0] + 0.65, h.cup[1] + 0.9)); // カップの前のついたて
  for (const k of Object.keys(h)) if (Array.isArray(h[k]) && !h[k].length && k !== 'blocks') delete h[k];
  void tb;
  // V3：パイプの口・ティー・カップにかかるインクはとる
  if (V3 && h.ink) {
    const keep = [h.tee, h.cup].concat(...(h.pipes || []).map(p => [p.a, p.b]));
    h.ink = h.ink.filter(P => { const b = MG.bbox(P); return keep.every(([x, y]) => x < b.x0 - 0.6 || x > b.x1 + 0.6 || y < b.y0 - 0.6 || y > b.y1 + 0.6); });
    if (!h.ink.length) delete h.ink;
  }
  if (twist && twisted(h, course)) { h.twist = 1; const tt = TWIST_TIP[course]; if (tt) h.tip = tt; }
  return h;
}

// ひねりの部品が、ほんとうに置けたか（置けなかったら、ふつうのホール）
function twisted(h, c) {
  const g = h.gears || [], r = h.rulers || [];
  return c === 7 ? (h.slopes || []).some(s => s.g[1] === 0 && MG.bbox(s.p).x1 - MG.bbox(s.p).x0 < 2)
    : c === 8 ? g.some(a => g.some(b => a !== b && a.y === b.y && a.w === -b.w))
    : c === 9 ? r.some(a => r.some(b => a !== b && a.per === b.per && a.a[1] !== b.a[1]))
    : c === 10 ? (h.pipes || []).some(p => p.b[1] > h.tee[1] - 1)
    : c === 11 ? (h.slopes || []).some(s => s.g[0] === 0 && s.g[1] > 0)
    : c === 12 ? (h.bumpers || []).some(b => b[2] === 0.35) : false;
}
// 見た目：ばね・くいどうしが重ならない
function tidy(h) {
  const q = (h.bumpers || []).concat(h.posts || []);
  for (let i = 0; i < q.length; i++) for (let j = 0; j < i; j++) if ((q[i][0] - q[j][0]) ** 2 + (q[i][1] - q[j][1]) ** 2 < (q[i][2] + q[j][2] + 0.45) ** 2) return false;
  return true;
}
function valid(h) {
  const onFelt = ([x, y], r = 0.35) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => MG.inPoly(h.poly, x + dx, y + dy) && !(h.blocks || []).concat(h.doors || [], h.ink || []).some(b => MG.inPoly(b, x + dx, y + dy)));
  if (!onFelt(h.tee) || !onFelt(h.cup)) return false;
  if ((h.switches || []).some(s => !onFelt(s, 0.3))) return false;
  if ((h.pipes || []).some(p => !onFelt(p.a, 0.3) || !onFelt(p.b, 0.4))) return false;
  if ((h.bumpers || []).some(b => (b[0] - h.tee[0]) ** 2 + (b[1] - h.tee[1]) ** 2 < 1 || (b[0] - h.cup[0]) ** 2 + (b[1] - h.cup[1]) ** 2 < 1)) return false;
  if (!tidy(h)) return false;
  const { clearance } = require('./tests/minigolf-levels.js');
  if ((h.gears || h.rulers) && clearance(h) < 2 * MG.BALL_R + 0.02) return false;
  // 動く部品がティーとカップにかからない
  if ((h.gears || []).some(g => [h.tee, h.cup].some(p => (p[0] - g.x) ** 2 + (p[1] - g.y) ** 2 < (g.r + 0.5) ** 2))) return false;
  if (MG.play(h, []).sunk) return false;
  return true;
}

// 1つの候補を調べる：答え → パーをえらぶ → 人のまね
function evaluate(course, seed) {
  const T = TIER(course);
  const h = make(course, seed);
  h.id = 'g' + course + '-' + seed;
  if (!valid(h)) return { seed, bad: 'invalid' };
  const ace = HU.randomAce(h, 150);
  if (ace > (T <= 2 ? 0.02 : 0.005)) return { seed, bad: 'ace ' + ace };
  const { solve } = require('./tests/minigolf-levels.js');
  const maxS = Math.min(5, T + 2);
  const sol = solve(h, { beam: 4, max: maxS + ((h.doors || []).length ? 1 : 0), deadline: Date.now() + ((h.doors || []).length ? 150000 : (h.gears || h.rulers) ? 110000 : 60000) });
  if (!sol) return { seed, bad: 'nosol' };
  if (sol.strokes < 2) return { seed, bad: 'ace-solution' };
  const [lo, hi] = BAND[T], mid = (lo + hi) / 2;
  let best = null;
  for (const par of T <= 3 ? [sol.strokes, sol.strokes + 1, sol.strokes + 2] : [sol.strokes, sol.strokes + 1]) {
    if (par > 5 || par < 2) continue;
    const r = HU.human(h, sol.shots, { tier: T, n: 16, par });
    const d = r.rate < lo ? lo - r.rate : r.rate > hi ? r.rate - hi : 0;
    const sc = d * 10 + Math.abs(r.rate - mid);
    if (!best || sc < best.sc) best = { par, rate: r.rate, sc, inBand: d === 0 };
    if (r.rate >= lo) break; // パーを1つゆるめるのは、きびしすぎるときだけ
  }
  h.par = best.par;
  return { seed, h, shots: sol.shots, strokes: sol.strokes, rate: best.rate, inBand: best.inBand, ace };
}

// ---------- いくつものプロセスで ----------
if (process.argv[2] === '--worker') {
  // 1つずつ受けて、1つずつ返す（親がすぐ保存するので、とちゅうで止まっても調べた分は残る）
  process.on('message', j => {
    if (!j) process.exit(0);
    let r;
    try { const t = Date.now(); r = Object.assign({ course: j.course }, evaluate(j.course, j.seed)); process.stderr.write(`  ${j.course}/${j.seed}: ${r.bad || 'par ' + r.h.par + ' ' + Math.round(r.rate * 100) + '%'} ${Math.round((Date.now() - t) / 1000)}s\n`); }
    catch (e) { r = { course: j.course, seed: j.seed, bad: String(e.stack || e).slice(0, 300) }; }
    process.send(r);
  });
} else if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  if (arg('--show')) { console.log(JSON.stringify(make(+arg('--show'), +(arg('--seed') || 1)))); process.exit(0); }
  const courses = (arg('--course') || '4').split(',').map(Number), cand = +(arg('--cand') || 24), base = +(arg('--base') || 1);
  // 調べた結果はとっておく（1つ調べるたびに書く。えらび直すだけなら、もう一度は調べない）。生成のしかたを変えたら CACHE_V を上げる
  const CACHE = path.join(__dirname, 'tests/out/minigolf-gen-cache.json'), CACHE_V = 2; // V3 の作り方はコース7からなので、4〜6の結果はそのまま使える
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
  const ck = j => CACHE_V + '|' + j.course + '|' + j.seed;
  const saveCache = () => { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE + '.tmp', JSON.stringify(cache)); fs.renameSync(CACHE + '.tmp', CACHE); };
  const jobs = [];
  for (const c of courses) for (let s = base; s < base + cand; s++) jobs.push({ course: c, seed: s });
  const todo = jobs.filter(j => !cache[ck(j)] || (cache[ck(j)].bad === 'nosol' && !process.argv.includes('--no-retry'))); // 時間切れは、もう一度（--no-retry でしない）
  const left = {}; courses.forEach(c => { left[c] = todo.filter(j => j.course === c).length; });
  const t0 = Date.now();
  // コースの候補がそろったら、すぐにえらんで holes-gen.js に書く
  const finish = c => { try { select(c, jobs.filter(j => j.course === c).map(j => cache[ck(j)]), cand); } catch (e) { console.log('course ' + c + ': ' + (e.stack || e)); } };
  courses.forEach(c => { if (!left[c]) finish(c); });
  let next = 0, live = 0;
  const worker = () => {
    if (next >= todo.length) return;
    const w = fork(__filename, ['--worker']); live++;
    const give = () => { if (next < todo.length) w.send(todo[next++]); else { w.send(null); } };
    w.on('message', r => { cache[ck(r)] = r; saveCache(); if (--left[r.course] === 0) finish(r.course); give(); });
    w.on('exit', () => { if (--live === 0) console.log('evaluated', todo.length, 'in', Math.round((Date.now() - t0) / 1000) + 's'); });
    give();
  };
  for (let k = 0; k < 4; k++) worker();
}

function select(c, res, cand) {
  delete require.cache[require.resolve(GEN_FILE)];
  let gen = require(GEN_FILE).slice();
  const hand = require(path.join(ROOT, 'minigolf/holes.js')).HOLES.slice(0, 27);
  const sols = fs.existsSync(SOL_FILE) ? JSON.parse(fs.readFileSync(SOL_FILE, 'utf8')) : {};
  // 公開したコースのホールは変えない（保存の記録が合わなくなる）。作り直すときだけ --replace
  if (gen.some(h => h.id.startsWith(c + '-')) && !process.argv.includes('--replace')) { console.log(`course ${c}: already in holes-gen.js — kept (use --replace to rebuild it)`); return; }
  const ok = res.filter(r => r && r.h && tidy(r.h));
  console.log(`course ${c}: ${ok.length} solved of ${cand}; rejected: ` + JSON.stringify(res.filter(r => r && !r.h).reduce((m, r) => { const k = String(r.bad).split(' ')[0]; m[k] = (m[k] || 0) + 1; return m; }, {})));
  const mid = (BAND[TIER(c)][0] + BAND[TIER(c)][1]) / 2;
  ok.sort((a, b) => (b.inBand - a.inBand) || (Math.abs(a.rate - mid) - Math.abs(b.rate - mid)));
  const { mirror } = require('./tests/minigolf-levels.js');
  const others0 = hand.concat(gen.filter(h => !h.id.startsWith(c + '-')));
  const others = others0.map(HU.raster).concat(others0.map(h => HU.raster(mirror(h))));
  const pickd = [];
  for (const r of ok) {
    if (pickd.length >= 9) break;
    const ra = HU.raster(r.h);
    const sim = Math.max(0, ...others.concat(pickd.map(p => p.ra), pickd.map(p => HU.raster(mirror(p.h)))).map(o => HU.similarity(ra, o)));
    if (sim > 0.7) continue;
    pickd.push(Object.assign(r, { ra, sim }));
  }
  if (pickd.length < 9) { console.log(`course ${c}: only ${pickd.length} usable holes — run with more --cand or another --base`); return; }
  // コースの中は、やさしい順（成功率の高い順）
  pickd.sort((a, b) => b.rate - a.rate);
  // 主題を見せて、くり返して、さいごにひねる：ひねりのホールは8・9番に（あれば2つまで）
  const tw = pickd.filter(r => r.h.twist).slice(-2);
  if (tw.length) { const rest = pickd.filter(r => !tw.includes(r)); pickd.length = 0; pickd.push(...rest, ...tw); }
  gen = gen.filter(h => !h.id.startsWith(c + '-'));
  pickd.forEach((r, i) => {
    const id = c + '-' + (i + 1);
    const h = Object.assign({ id, n: NAMES(c, i), par: r.h.par }, r.h, { id, n: NAMES(c, i), seed: r.seed });
    delete sols[r.h.id]; sols[id] = r.shots;
    gen.push(h);
    console.log(`  ${id} seed ${r.seed} par ${h.par} (solver ${r.strokes}) human ${Math.round(r.rate * 100)}%${r.inBand ? '' : ' (outside band)'} sim ${r.sim.toFixed(2)}${r.h.twist ? ' twist' : ''}`);
  });
  gen.sort((a, b) => { const [ca, ha] = a.id.split('-').map(Number), [cb, hb] = b.id.split('-').map(Number); return ca - cb || ha - hb; });
  write(gen, sols);
}

function NAMES(c, i) {
  const A = { 11: [['坂', 'Slope'], ['インクの坂', 'Ink Slope']], 12: [['ばね', 'Spring'], ['ばねの部屋', 'Spring Room']], 4: [['戸口', 'Doorway'], ['すきま', 'Gap']], 5: [['スイッチ', 'Switch'], ['扉', 'Door']], 6: [['はね戸', 'Flap'], ['坂の戸', 'Slope Gate']], 7: [['橋', 'Bridge'], ['川', 'River']], 8: [['歯車', 'Gear'], ['回廊', 'Hall']], 9: [['関所', 'Checkpoint'], ['定規', 'Ruler']], 10: [['パイプ', 'Pipe'], ['管', 'Tube']] };
  const nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const base = (A[c] || [['工房', 'Workshop'], ['台', 'Bench']])[i % 2];
  return [base[0] + 'の' + nums[i], base[1] + ' ' + (i + 1)];
}

function write(gen, sols) {
  const keys = ['id', 'n', 'par', 'poly', 'tee', 'cup', 'blocks', 'doors', 'switches', 'gates', 'ink', 'sand', 'slopes', 'bumpers', 'posts', 'gears', 'rulers', 'pipes', 'tip', 'twist', 'seed'];
  const line = h => '    {' + keys.filter(k => h[k] !== undefined && !(Array.isArray(h[k]) && !h[k].length)).map(k => ' ' + k + ': ' + JSON.stringify(h[k])).join(',') + ' },';
  const src = fs.readFileSync(GEN_FILE, 'utf8');
  const head = src.slice(0, src.indexOf('  var H = ['));
  const tail = src.slice(src.indexOf('  if (typeof module'));
  fs.writeFileSync(GEN_FILE + '.tmp', head + '  var H = [\n' + gen.map(line).join('\n') + '\n  ];\n' + tail); fs.renameSync(GEN_FILE + '.tmp', GEN_FILE);
  const sk = Object.keys(sols).sort((a, b) => { const [ca, ha] = a.split('-').map(Number), [cb, hb] = b.split('-').map(Number); return ca - cb || ha - hb; });
  fs.writeFileSync(SOL_FILE + '.tmp', '{\n' + sk.map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(sols[k])).join(',\n') + '\n}\n'); fs.renameSync(SOL_FILE + '.tmp', SOL_FILE);
  console.log('wrote', path.relative(process.cwd(), GEN_FILE), gen.length, 'holes');
}

module.exports = { make, evaluate, valid, twisted, BAND, TIER };
