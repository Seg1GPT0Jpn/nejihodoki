#!/usr/bin/env node
// 詰将棋の問題づくり：ランダムな配置を作り、shogi/engine.js の solveMate で
//   「ちょうど n 手で詰む・最短ではない手順がない・初手が1つだけ」を確かめたものだけを出す。
// 使い方：node tools/shogi-puzzle-gen.js [--seed 1] [--secs 200] [--want 1:3,3:10,5:10,7:5]
//   → 標準出力に JSON（{ id, n, sfen, first }）の行。shogi/puzzles.js に貼る（id は自動で振らない）。
// 遊ぶ側は「攻め方の玉なし・玉方は残りの駒をすべて持ち駒」。
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'shogi/engine.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
let seed = +arg('seed', 1) >>> 0 || 1;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = n => Math.floor(rnd() * n);
const secs = +arg('secs', 200);
const want = {}; for (const kv of String(arg('want', '1:3,3:10,5:10,7:5')).split(',')) { const [a, b] = kv.split(':'); want[+a] = +b; }
const TOTAL = { R: 2, B: 2, G: 4, S: 4, N: 4, L: 4, P: 18 };
const pick = a => a[ri(a.length)];

function build(n) {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(''));
  const used = { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 };
  const hands = { b: {}, w: {} };
  const kr = ri(3), kc = ri(9);
  grid[kr][kc] = 'k';
  const free = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9 && !grid[r][c];
  const put = (ch, r, c) => { if (!free(r, c)) return false; const t = ch.replace('+', '').toUpperCase(); if (used[t] >= TOTAL[t]) return false; used[t]++; grid[r][c] = ch; return true; };
  // defender's board pieces near the king
  const nd = ri(n >= 5 ? 4 : 3);
  for (let i = 0; i < nd; i++) {
    const ch = pick(['g', 's', 'p', 'p', 'l', 'n', 'g']);
    const r = kr + ri(3) - (kr > 0 ? 1 : 0), c = kc + ri(5) - 2;
    if (ch === 'p' && r === 0) continue;
    if (ch === 'l' && r === 0) continue;
    if (ch === 'n' && r < 2) continue;
    put(ch, r, c);
  }
  // attacker: board pieces + hand pieces
  const na = (n === 1 ? 1 : 2) + ri(n >= 5 ? 3 : 2);
  const nh = n === 1 ? 1 : ri(3);
  const kinds = n === 1 ? ['G', 'S', 'B', 'R', 'N', 'L', '+P'] : ['R', 'B', 'G', 'S', 'N', 'L', 'P', '+P', 'R', 'B'];
  let placed = 0;
  for (let k = 0; k < 40 && placed < na; k++) {
    const ch = pick(kinds);
    const r = Math.min(8, Math.max(0, kr + ri(6) - 1)), c = Math.min(8, Math.max(0, kc + ri(9) - 4));
    if (put(ch, r, c)) placed++;
  }
  for (let k = 0; k < nh; k++) {
    const t = pick(['G', 'S', 'N', 'L', 'B', 'R', 'P', 'G', 'S']);
    if (used[t] < TOTAL[t]) { used[t]++; hands.b[t] = (hands.b[t] || 0) + 1; }
  }
  if (!placed && !Object.keys(hands.b).length) return null;
  for (const t of Object.keys(TOTAL)) if (TOTAL[t] - used[t] > 0) hands.w[t] = TOTAL[t] - used[t];
  const rows = grid.map(row => { let s = '', e = 0; for (const x of row) { if (!x) e++; else { if (e) s += e; e = 0; s += x.length === 2 ? '+' + (x[1] === x[1].toUpperCase() ? x[1] : x[1]) : x; } } if (e) s += e; return s; });
  // sente pieces are uppercase, gote lowercase; "+P" => '+P'
  const hs = (h, up) => 'RBGSNLP'.split('').filter(t => h[t]).map(t => (h[t] > 1 ? h[t] : '') + (up ? t : t.toLowerCase())).join('');
  const hand = hs(hands.b, true) + hs(hands.w, false) || '-';
  return rows.join('/') + ' b ' + hand + ' 1';
}

const found = [], seen = new Set(), t0 = Date.now();
const left = () => Object.keys(want).some(k => want[k] > 0);
let tries = 0, bad = 0;
while (left() && Date.now() - t0 < secs * 1000) {
  const ns = Object.keys(want).filter(k => want[k] > 0).map(Number);
  const n = pick(ns);
  const sfen = build(n);
  if (!sfen) continue;
  tries++;
  let pos;
  try { pos = new E.Position(sfen); } catch (e) { bad++; continue; }
  if (pos.inCheck(1) || seen.has(sfen)) continue;
  seen.add(sfen);
  try {
    // quick reject: no mate within n
    const r = E.solveMate(pos, n, { maxNodes: n >= 7 ? 400000 : 150000 });
    if (!r || r.mate !== n || r.firsts.length !== 1) continue;
    if (n > 1 && E.solveMate(new E.Position(sfen), n - 2, { maxNodes: 400000 })) continue;
    // the mating line must use most of the attacker's material
    const mine = new Set(r.pv.filter((_, i) => i % 2 === 0).map(u => u.slice(0, 2) + (u[1] === '*' ? '' : '')));
    if (n >= 3 && mine.size < 2) continue;
    // little unused material: attacker pieces (board + hand) at most (attacker moves + 1)
    const [bd, , hd] = sfen.split(' ');
    let mat = (bd.match(/[A-Z]/g) || []).length;
    for (const m of hd.matchAll(/(\d*)([A-Z])/g)) mat += m[1] ? +m[1] : 1;
    if (mat > (n + 1) / 2 + 1) continue;
    // a first-move drop that is a bare check with no follow-up value is fine; skip positions where the defender has no real choice at n>=3
    found.push({ n, sfen, first: r.firsts[0] });
    want[n]--;
    process.stderr.write(`found n=${n} ${r.firsts[0]} (${found.length}) tries=${tries}\n`);
  } catch (e) { /* node limit: skip */ }
}
for (const f of found) console.log(JSON.stringify(f));
process.stderr.write(`done tries=${tries} bad=${bad} left=${JSON.stringify(want)}\n`);
