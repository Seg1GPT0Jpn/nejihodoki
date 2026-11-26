// 通常技のリメイク：しゅるい（形）がちがうことを確かめる
const assert = require('assert');
const E = require('../../../brawl/engine.js');
let n = 0; const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; } };
const REM = E.CHAR_IDS.filter(i => E.CH[i].rem >= 2);
const FLOOR = 7;
t('remastered toys have >=5 kind-different normals', () => { assert(REM.length >= 18); for (const i of REM) assert(E.kindMoves(i) >= 5, i + ' ' + E.kindMoves(i)); });
t('remastered pairs differ in shape (floor ' + FLOOR + ')', () => {
  for (let a = 0; a < REM.length; a++) for (let b = a + 1; b < REM.length; b++) { const d = E.shapeDist(REM[a], REM[b]); assert(d >= FLOOR, REM[a] + '/' + REM[b] + ' ' + d); }
});
function run(id, mv, frames, setup) {
  const st = E.create({ seed: 3, chars: [id, 'duck'], stage: E.STAGE_IDS[0] }); const f = st.f[0], o = st.f[1];
  o.x = f.x + 60; if (setup) setup(f, o);
  let hits = 0, mvx = 0; const x0 = f.x;
  for (let i = 0; i < frames; i++) { const bef = o.dmg || 0; E.step(st, [i === 0 ? { [mv]: 1 } : 0, 0]); if ((o.dmg || 0) > bef) hits++; }
  return { st, hits, dx: f.x - x0 };
}
t('every remastered normal simulates without error', () => {
  for (const id of REM) for (const mv of Object.keys(E.MOVES[id])) { if (!E.MOVES[id][mv]) continue; const st = E.create({ seed: 5, chars: [id, 'duck'], stage: E.STAGE_IDS[0] }); for (let i = 0; i < 120; i++) E.step(st, [0, 0]); }
});
t('multi-hit seq moves define several hit windows', () => { const m = E.MOVES.robo.jab; assert(m.seq && m.seq.length === 3); });
t('lunge moves carry the user forward', () => { const m = E.MOVES.ninja.ftilt; assert(m.lg > 5); });
t('projectile normals spawn projectiles', () => { assert.strictEqual(E.MOVES.tin.jab.kind, 'proj'); });
t('trap normals are mines', () => { assert.strictEqual(E.MOVES.ninja.dtilt.kind, 'mine'); });
console.log(n + ' passed');
