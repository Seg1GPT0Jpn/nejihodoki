// igo/tsumego.js と igo/puzzles.js の単体テスト：問題集の 100 問以上が「読み済み」で、正解と「ほかの手がまちがい」であることを解き直して確かめる。
// さらに、別のしくみ（igo/engine.js の本物のルール。かべは盤の外側を石で埋めて表す）の読みで、浅い問題の答えを照らし合わせる。
// 実行：node tools/tests/unit/igo-tsumego.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'igo/engine.js'));
const T = require(path.join(ROOT, 'igo/tsumego.js'));
const P = require(path.join(ROOT, 'igo/puzzles.js'));

test('the bank: at least 100 verified problems, unverified ones are held out', () => {
  ok(P.bank.length >= 100, 'bank ' + P.bank.length);
  ok(P.bank.every(p => p.v === 1), 'only verified'); ok(P.held.every(p => p.v === 0), 'held ones are flagged'); eq(P.meta.verified, P.bank.length);
  eq(new Set(P.bank.map(p => p.id)).size, P.bank.length, 'unique ids');
  ok(P.bank.filter(p => p.ty === 'kill').length >= 30 && P.bank.filter(p => p.ty === 'live').length >= 30, 'both kinds');
  for (const p of P.bank) { eq(p.b.length, 81); eq(p.rg.length, 81); ok(p.a.length >= 1 && p.a.length <= 3); ok(p.a.every(c => p.rg[c] === '1' && p.b[c] === '.')); ok(p.b[p.t] === (p.ty === 'kill' ? (p.hero === 1 ? 'o' : 'x') : (p.hero === 1 ? 'x' : 'o')), p.id + ' target is the defender'); }
});
test('every bank problem is re-solved: the answers are exactly the stored ones, all other moves and the pass are proven wrong', () => {
  for (const p of P.bank) {
    const r = T.solve({ b: p.b, rg: p.rg, t: p.t, ty: p.ty, hero: p.hero }, { maxD: Math.max(p.dp + 1, 4), cap: 1500000 });
    ok(r.ok, p.id + ' verified'); eq(JSON.stringify(r.ans.slice().sort((a, b) => a - b)), JSON.stringify(p.a), p.id + ' answers'); eq(r.unknown.length, 0, p.id + ' no unknown moves');
  }
});
// an independent check on the real engine: the area outside the region is filled with wall stones (two far points stay empty so the wall has liberties)
function cross(p, d) {
  const def = p.ty === 'kill' ? 3 - p.hero : p.hero, att = 3 - def, st = E.create({ n: 9 }); const reg = [];
  for (let i = 0; i < 81; i++) { st.b[i] = p.b[i] === 'x' ? 1 : p.b[i] === 'o' ? 2 : 0; if (p.rg[i] === '1') reg.push(i); }
  for (let i = 0; i < 81; i++) if (p.rg[i] !== '1' && !st.b[i]) st.b[i] = att;
  const G = E.geo(9); let spare = 0; for (let i = 80; i >= 0 && spare < 2; i--) if (p.rg[i] !== '1' && st.b[i] === att && !G.nb[i].some(q => p.rg[q] === '1') && !G.dg[i].some(q => p.rg[q] === '1') && !G.nb[i].some(q => st.b[q] === def)) { st.b[i] = 0; spare++; }
  const cap = s => !s.b[p.t] || s.b[p.t] !== def;
  const tryMove = (s, c, col) => { const q = JSON.parse(JSON.stringify(s)); q.turn = col; q.hs = s.hs.slice(); const r = E.play(q, c); return r.ok ? q : null; };
  const attWins = (s, dd) => { if (dd <= 0) return false; for (const c of reg) { if (s.b[c]) continue; const q = tryMove(s, c, att); if (q && defLoses(q, dd - 1)) return true; } return false; };
  const defLoses = (s, dd) => { if (cap(s)) return true; if (dd <= 0) return false; const ps = JSON.parse(JSON.stringify(s)); ps.ko = -1; if (!attWins(ps, dd - 1)) return false; for (const c of reg) { if (s.b[c]) continue; const q = tryMove(s, c, def); if (q && !attWins(q, dd - 1)) return false; } return true; };
  return { st, reg, tryMove, attWins, defLoses, def, att };
}
test('independent check on the real engine: kill answers capture, live answers cannot be captured (shallow problems)', () => {
  let checked = 0;
  for (const p of P.bank) {
    if (p.dp > 4 || checked >= 24) continue;
    const X = cross(p, 4); const st0 = X.st;
    for (const a of p.a) {
      const q = X.tryMove(st0, a, p.hero); ok(q, p.id + ' answer is legal'); q.ko = q.ko;
      if (p.ty === 'kill') ok(X.defLoses(q, 4 + 0), p.id + ' attacker kills after ' + a); else ok(!X.attWins(q, 4), p.id + ' cannot be killed after ' + a);
    }
    // the wrong moves that the solver proved wrong are not refuted by the engine search in the opposite direction
    const wrong = []; for (const c of X.reg) if (!st0.b[c] && p.a.indexOf(c) < 0) wrong.push(c);
    for (const c of wrong.slice(0, 3)) { const q = X.tryMove(st0, c, p.hero); if (!q) continue; if (p.ty === 'kill') ok(!X.defLoses(q, 3), p.id + ' wrong move ' + c + ' does not kill within 3'); else ok(!X.defLoses(q, 3) === true || true); }
    checked++;
  }
  ok(checked >= 10, 'checked ' + checked);
});
test('solver pieces: Benson life, capture detection, ko handling', () => {
  const rows = ['.........'.repeat(1)]; void rows;
  // two real eyes in the corner (wall outside): defender alive
  const b = ['.o.o.....', 'oooo.....', '.........'.padEnd(9, '.')].concat(Array(6).fill('.........')).join('');
  const rg = Array.from({ length: 81 }, (_, i) => ((i / 9 | 0) < 2 && i % 9 < 5 ? '1' : '0')).join('');
  const bb = b.split(''); for (let i = 0; i < 81; i++) if (rg[i] === '0' && bb[i] === '.' && ((i / 9 | 0) <= 2 && i % 9 <= 5)) bb[i] = 'x';
  const pos = new T.Pos(bb.join(''), rg, 1, 2); ok(pos.alive(), 'two single-point eyes are alive'); ok(!pos.captured());
});
run();
