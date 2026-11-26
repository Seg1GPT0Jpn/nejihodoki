// wordwolf/online.js：KoboTurnRoom に渡すアダプター。 実行：node tools/tests/unit/wordwolf-online.test.js
// ホストのメモリで1ゲームを進め、(1) pd/priv が database.rules.json の形（キー・値・添字・長さ）に収まる (2) ウルフ・ほかの人のことば・答えが結果の前に出ない
// (3) view() が本人のことば・選べるヒント・結果を正しく復元する (4) 手の検査（順番・重複投票・自分への投票・決選の候補）(5) 保存と復元 (6) ホスト切断時の順位。
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'wordwolf/engine.js'));
const O = require(path.join(ROOT, 'wordwolf/online.js'));
const H = O.host;
function checkPd(pd) {
  for (const k of Object.keys(pd)) {
    ok(/^[a-z]{1,4}$/.test(k), 'pd key ' + k); const v = pd[k];
    if (v && typeof v === 'object') for (const j of Object.keys(v)) { ok(/^[0-9]{1,2}$/.test(j), 'index ' + k + j); const x = v[j]; ok(typeof x === 'boolean' || (typeof x === 'number' && Math.abs(x) <= 1e6) || (typeof x === 'string' && x.length <= 24), 'pd.' + k + '.' + j); }
    else ok(typeof v === 'boolean' || (typeof v === 'number' && Math.abs(v) <= 1e6) || (typeof v === 'string' && v.length <= 24), 'pd.' + k);
  }
}
function checkPriv(p) { for (const k of Object.keys(p)) ok(['v', 'h', 'd', 'x'].includes(k)); ok(Object.keys(p.x).every(k => ['s', 't', 'c'].includes(k))); ok(p.x.s >= 0 && p.x.s <= 1e7); }
function checkWire(a) { ok(/^[a-z]{2,8}$/.test(a.t)); for (const k of Object.keys(a)) { if (k === 't') continue; ok(['c', 'k', 'w', 'x'].includes(k)); ok(a[k] >= -1 && a[k] <= 255); } if (a.k != null) ok(a.k <= 7); }
function play(n, cfg, seed, humansN) {
  O.setCfg(cfg); const st = H.create({ n, seed, cp: 2, humans: Array.from({ length: humansN }, (_, i) => i), g: 1 }); let guard = 0; const seenPh = new Set();
  while (!H.isOver(st)) {
    if (++guard > 2000) throw new Error('stuck'); const tn = H.turn(st); ok(tn >= 0 && tn < n, 'a seat to act'); seenPh.add(st.ph);
    const pd = H.pub(st); checkPd(pd); const pv = H.priv(st, tn); checkPriv(pv);
    const text = JSON.stringify(pd);
    for (const k of ['wl', 'pi', 'mj', 'pt']) ok(!(k in pd) || st.ph === 'e', 'secret ' + k + ' hidden until the result');
    ok(!('go' in pd) || st.ph === 'g' || st.ph === 'e'); void text;
    const m = { pd, priv: Object.assign({ v: 1 }, pv), me: tn, tn, n, names: [], ph: 'play' }; const vw = O.view(m);
    eq(vw.myWord.ja, E.wordOf(st.S, tn).ja, 'own word');
    if (st.ph === 'h') { eq(vw.choices.join(), E.hintChoices(st.S, tn).join(), 'choices'); ok(vw.choices.length >= 10); }
    const a = H.cpu(st, tn); checkWire(a); const wire = O.toWire(a); const r = H.apply(st, tn, JSON.parse(JSON.stringify(wire))); ok(r, 'legal ' + JSON.stringify(wire));
  }
  const pd = H.pub(st); checkPd(pd); return { st, pd, seenPh };
}
test('whole games for 3..8 seats, 1-2 wolves, both knows modes: shapes fit the rules, phases h -> v (-> v) (-> g) -> e, result decodes', () => {
  for (const n of [3, 4, 5, 6, 8]) for (const wolves of [1, 2]) for (const knows of [false, true]) {
    const { st, pd, seenPh } = play(n, { rounds: 2, wolves, knows }, 'o' + n + wolves + knows, 2);
    ok(seenPh.has('h') && seenPh.has('v')); eq(st.ph, 'e'); eq(pd.n, n); eq(pd.kk, n >= 5 ? wolves : 1);
    const v = O.view({ pd, priv: { x: H.priv(st, 0).x }, me: 0, tn: -1, n }); eq(v.ph, 'e'); eq(v.fin.pts.join(), st.S.outcome.pts.join()); eq(v.fin.wolves.join(), st.S.wolves.join()); eq(v.fin.maj.ja, E.majorityWord(st.S).ja); eq(v.fin.wolfW.ja, E.wolfWord(st.S).ja);
    const r = H.result(st); eq(r.r.length, n); ok(r.r.every(x => x >= 1 && x <= n));
    eq(v.knowsWolf, knows && st.S.players[0].wolf);
  }
});
test('hidden information: priv carries only the seat\'s own word (+ wolf flag only in knows mode); pd never names the wolf before the result', () => {
  O.setCfg({ rounds: 1, wolves: 1, knows: false }); const st = H.create({ n: 5, seed: 'sec', cp: 2, humans: [0, 1, 2, 3, 4], g: 1 });
  for (let s = 0; s < 5; s++) { const x = H.priv(st, s).x.s; eq(x & 1, 0, 'no wolf flag without knows'); eq(x >> 2, st.S.pair); eq((x >> 1) & 1, E.sideOf(st.S, s) === 'b' ? 1 : 0); }
  const pd = JSON.stringify(H.pub(st)); ok(!/"wl"|"pi"/.test(pd));
  O.setCfg({ knows: true }); const k = H.create({ n: 5, seed: 'sec', cp: 2, humans: [0, 1, 2, 3, 4], g: 1 }); for (let s = 0; s < 5; s++) eq(H.priv(k, s).x.s & 1, k.S.players[s].wolf ? 1 : 0);
  O.setCfg({ knows: false });
});
test('move validation: only the seat on turn may hint; one ballot per seat; no self vote, no duplicates, only runoff candidates; wrong phase refused', () => {
  O.setCfg({ rounds: 1, wolves: 1, knows: false }); const st = H.create({ n: 4, seed: 'val', cp: 2, humans: [0, 1, 2, 3], g: 1 });
  const t = H.turn(st), other = (t + 1) % 4;
  eq(H.apply(st, other, { t: 'hn', c: 0 }), null); eq(H.apply(st, t, { t: 'hn', c: 999 }), null); eq(H.apply(st, t, { t: 'vt', c: 1 }), null);
  ok(H.apply(st, t, { t: 'hn', c: 0 })); while (st.ph === 'h') { const q = H.turn(st); ok(H.apply(st, q, { t: 'hn', c: 0 })); }
  eq(st.ph, 'v'); eq(H.apply(st, 0, { t: 'vt', c: 0 }), null, 'no self vote'); eq(H.apply(st, 0, { t: 'vt', c: 9 }), null);
  const r1 = H.apply(st, 0, { t: 'vt', c: 1 }); ok(r1 && r1.soft); eq(H.apply(st, 0, { t: 'vt', c: 2 }), null, 'one ballot per seat');
  eq(H.turn(st), 1, 'turn = first seat that has not voted'); ok(H.pub(st).vd[0] === 1 && H.pub(st).vd[1] === 0);
  ok(H.apply(st, 1, { t: 'vt', c: 0 })); ok(H.apply(st, 2, { t: 'vt', c: 3 })); const last = H.apply(st, 3, { t: 'vt', c: 2 }); ok(last && !last.soft);
  eq(st.ph === 'v' && st.S.revote === 1, true, 'a 2-2 tie starts a runoff'); eq(H.pub(st).cd.length, 4, 'runoff among the tied'); eq(H.pub(st).vd.join(), '0,0,0,0');
});
test('timeouts: auto() plays a legal move in every phase; fallback ranks everyone equal; save and restore keeps the game', () => {
  O.setCfg({ rounds: 2, wolves: 1, knows: false }); const st = H.create({ n: 6, seed: 'auto', cp: 2, humans: [0], g: 1 }); let guard = 0;
  while (!H.isOver(st) && guard++ < 500) { if (guard === 8) { const again = H.de(H.ser(st)); eq(JSON.stringify(H.pub(again)), JSON.stringify(H.pub(st))); eq(H.turn(again), H.turn(st)); } const t = H.turn(st); ok(H.apply(st, t, H.auto(st, t))); }
  ok(H.isOver(st)); const f = H.fallback({ n: 6 }); eq(f.r.join(), '1,1,1,1,1,1'); eq(f.w, -1);
});
run('wordwolf-online');
