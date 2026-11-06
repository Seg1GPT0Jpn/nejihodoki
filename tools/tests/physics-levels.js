#!/usr/bin/env node
// ころころ工房の全レベルを、保存してある答え（physics-solutions.js）で解く（ブラウザなし。physics/engine.js をそのまま使う）
//   node tools/tests/physics-levels.js               … 答えの確認と、目標の部品数が下限以上か（約2秒）
//   node tools/tests/physics-levels.js --adversary   … さらに、下限より少ない部品で星3つが取れないことを総当たりで確かめる（4コアで約20分）
// 各レベル：答えが置ける（トレイの数・盤の中・重なりなし・ガラスの外）→ ゴールして星3つ（歯車ぜんぶ・部品が目標以内）
//           同じ答えを2回流すと最後の状態のハッシュが同じ（決まった結果）／何も置かないとゴールしない
// 難しさの下限（MIN_PARTS）：工房3は部品2つ以上、工房4は3つ以上、3-12 と 4-12 は4つ以上でないと星3つにならない。
//   部品1つの置き方を全部（0.5 マスごと × 15° ごと × トレイの全種類）流して、星3つ（ゴール＋歯車ぜんぶ）が1つもないことを確かめる。
//   下限が3以上のレベルは、部品2つの組み合わせも決まった乱数で抜き出して確かめる。
'use strict';
const path = require('path');
const { fork } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const PE = require(path.join(ROOT, 'physics/engine.js'));
const { LEVELS, WORLDS } = require(path.join(ROOT, 'physics/levels.js'));
const SOL = require('./physics-solutions.js');
let pass = 0, fail = 0;
const check = (name, cond, info) => { if (cond) pass++; else { fail++; console.log('  FAIL ' + name + (info ? '  ' + JSON.stringify(info).slice(0, 300) : '')); } };
const t0 = Date.now();
check('at least 40 levels', LEVELS.length >= 40, LEVELS.length);
check('at least 4 workshops, 12 levels each', WORLDS.length >= 4 && WORLDS.every((W, k) => LEVELS.filter(L => L.world === k).length >= 10), WORLDS.length);
check('level ids are unique', new Set(LEVELS.map(L => L.id)).size === LEVELS.length);
const unpack = a => a.map(q => ({ t: q[0], x: q[1], y: q[2], a: q[3] }));
for (const L of LEVELS) {
  const sol = SOL[L.id];
  if (!sol) { check(L.id + ' has a stored solution', false); continue; }
  const parts = unpack(sol);
  const why = PE.validate(L, parts);
  check(L.id + ' solution fits the tray and the board', !why, why);
  const a = PE.run(L, parts), b = PE.run(L, parts);
  check(L.id + ' solution reaches the goal', a.win, a);
  check(L.id + ' solution earns 3 stars (gears ' + a.gears + '/' + a.gearsAll + ', parts ' + a.parts + '/' + L.par + ')', a.n === 3, a);
  check(L.id + ' same result twice (deterministic)', a.hash === b.hash && a.steps === b.steps, [a.hash, b.hash]);
  const none = PE.run(L, []);
  check(L.id + ' doing nothing does not solve it', !none.win, none);
  check(L.id + ' has gears and a target', (L.gears || []).length >= 1 && L.par >= 1 && L.par <= Object.values(L.parts).reduce((s, n) => s + n, 0), L.par);
}
// the tutorial ghost of 1-1 is a working answer
const L1 = LEVELS[0];
check('1-1 tutorial ghost solves the level', L1.tut && PE.run(L1, L1.tut).win);

// ---- the difficulty curve: no 3-star answer with fewer parts than MIN_PARTS
const MIN_PARTS = L => (L.id === '3-12' || L.id === '4-12' ? 4 : L.world === 3 ? 3 : L.world === 2 ? 2 : 1);
const PAIRS = 1500;
function adversary(L, minParts) { // → the 3-star placements found with fewer parts (empty = none)
  const found = [];
  const types = Object.keys(L.parts);
  const singles = [];
  for (const t of types) {
    const D = PE.PARTS[t], angs = [];
    if (D.rot) for (let a = -165; a <= 180; a += 15) angs.push(a); else angs.push(0);
    for (let x = 0.25; x < 12; x += 0.5) for (let y = 0.25; y < 12; y += 0.5) for (const a of angs) {
      const p = { t, x, y, a }; if (PE.placeProblem(L, [], -1, p)) continue;
      const r = PE.run(L, [p]); if (r.win && r.gears === r.gearsAll) found.push([p]);
      if (r.win) singles.push(p);
    }
  }
  if (minParts >= 3) { // sampled pairs: half are a winning single plus one more part, half fully random
    let seed = 7 + L.index * 131; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pool = []; for (const t of types) for (let i = 0; i < L.parts[t]; i++) pool.push(t);
    const rp = t => ({ t, x: Math.round((0.5 + rnd() * 11) * 4) / 4, y: Math.round((0.5 + rnd() * 11) * 4) / 4, a: PE.PARTS[t].rot ? Math.round(rnd() * 24 - 12) * 15 : 0 });
    for (let i = 0; i < PAIRS && pool.length >= 2; i++) {
      let ps;
      if (singles.length && i % 2 === 0) { const w = singles[Math.floor(rnd() * singles.length)], rest = pool.slice(); rest.splice(rest.indexOf(w.t), 1); ps = [w, rp(rest[Math.floor(rnd() * rest.length)])]; }
      else { const a = Math.floor(rnd() * pool.length); let b = Math.floor(rnd() * pool.length); if (b === a) b = (a + 1) % pool.length; ps = [rp(pool[a]), rp(pool[b])]; }
      if (PE.validate(L, ps)) continue;
      const r = PE.run(L, ps); if (r.win && r.gears === r.gearsAll) found.push(ps);
    }
  }
  return found;
}
if (process.argv[2] === '--worker') {
  process.on('message', id => { if (id == null) process.exit(0); const L = LEVELS.find(l => l.id === id); process.send({ id, found: adversary(L, MIN_PARTS(L)).slice(0, 3) }); });
} else (async () => {
  for (const L of LEVELS) check(L.id + ' target parts (par ' + L.par + ') ≥ the minimum ' + MIN_PARTS(L), L.par >= MIN_PARTS(L), L.par);
  if (process.argv.includes('--adversary')) {
    const ids = LEVELS.filter(L => MIN_PARTS(L) >= 2).map(L => L.id).reverse(); // the slow late levels first
    const all = {}, queue = ids.slice();
    const n = Math.max(1, Math.min(8, require('os').cpus().length));
    await Promise.all(Array.from({ length: n }, () => new Promise((ok, bad) => {
      const w = fork(__filename, ['--worker']);
      const next = () => { const id = queue.shift(); w.send(id == null ? null : id); if (id == null) ok(); };
      w.on('message', m => { all[m.id] = m.found; next(); }); w.on('error', bad); next();
    })));
    for (const id of ids) { const L = LEVELS.find(l => l.id === id); check(id + ': no 3-star answer with fewer than ' + MIN_PARTS(L) + ' parts (every single part' + (MIN_PARTS(L) >= 3 ? ', ' + PAIRS + ' sampled pairs' : '') + ')', !all[id].length, all[id]); }
  }
  console.log(`physics-levels: ${LEVELS.length} levels, pass ${pass}  fail ${fail}  (${Math.round((Date.now() - t0) / 100) / 10}s)`);
  process.exit(fail ? 1 : 0);
})();
