#!/usr/bin/env node
// ころころ工房の全レベルを、保存してある答え（physics-solutions.js）で解く（ブラウザなし。physics/engine.js をそのまま使う）
//   node tools/tests/physics-levels.js        … 約10秒
// 各レベル：答えが置ける（トレイの数・盤の中・重なりなし・ガラスの外）→ ゴールして星3つ（歯車ぜんぶ・部品が目標以内）
//           同じ答えを2回流すと最後の状態のハッシュが同じ（決まった結果）／何も置かないとゴールしない
'use strict';
const path = require('path');
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
console.log(`physics-levels: ${LEVELS.length} levels, pass ${pass}  fail ${fail}  (${Math.round((Date.now() - t0) / 100) / 10}s)`);
process.exit(fail ? 1 : 0);
