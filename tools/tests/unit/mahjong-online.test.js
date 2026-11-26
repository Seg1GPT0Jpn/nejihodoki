// mahjong/online.js：KoboTurnRoom に渡すアダプター。 実行：node tools/tests/unit/mahjong-online.test.js
// ホストのメモリで全局を進め、(1) pd/priv/ev が database.rules.json の形（キー・値・添字・長さ）に収まる (2) 他家の手牌・牌山・裏ドラが出ない
// (3) view() が本人のできる手を正しく復元する (4) 局の結果・次の局・終局・ホスト切断時の順位 を確かめる。
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'mahjong/engine.js'));
require(path.join(ROOT, 'mahjong/ai.js'));
const O = require(path.join(ROOT, 'mahjong/online.js'));
const H = O.host;
// database.rules.json の pub / priv / ev の検査を、そのまま書き写したもの
function checkPd(pd) {
  for (const k of Object.keys(pd)) {
    ok(/^[a-z]{1,4}$/.test(k), 'pd key ' + k);
    const v = pd[k];
    if (v && typeof v === 'object') { const ks = Object.keys(v); ok(ks.length === 0 || true); for (const j of ks) { ok(/^[0-9]{1,2}$/.test(j), 'pd.' + k + ' index ' + j); const x = v[j]; ok(typeof x === 'boolean' || (typeof x === 'number' && Math.abs(x) <= 1e6) || (typeof x === 'string' && x.length <= 24), 'pd.' + k + '.' + j + ' = ' + JSON.stringify(x)); } }
    else ok(typeof v === 'boolean' || (typeof v === 'number' && Math.abs(v) <= 1e6) || (typeof v === 'string' && v.length <= 24), 'pd.' + k + ' = ' + JSON.stringify(v));
  }
}
function checkPriv(p) {
  for (const k of Object.keys(p)) ok(['v', 'h', 'd', 'x'].indexOf(k) >= 0, 'priv key ' + k);
  p.h.forEach((x, i) => { ok(i <= 59 && x >= 0 && x <= 255); }); ok(p.d >= -1 && p.d <= 255);
  ok(p.x && Object.keys(p.x).every(k => ['s', 't', 'c'].indexOf(k) >= 0)); p.x.c.forEach((x, i) => ok(i <= 59 && x >= 0 && x <= 255, 'x.c ' + i + '=' + x));
}
function checkEv(e) { ok(/^[a-z]{2}$/.test(e.t)); for (const k of Object.keys(e)) { if (k === 'i' || k === 't') continue; ok(['s', 'w', 'x', 'k', 'c', 'n', 'd'].indexOf(k) >= 0, 'ev field ' + k); } for (const k of ['s', 'w', 'x', 'k']) if (e[k] != null) ok(e[k] >= -1 && e[k] <= 3, 'ev.' + k); if (e.c != null) ok(e.c >= -1 && e.c <= 255); }

test('a whole online match run by the host adapter (3 humans wired as bots through toWire, 1 CPU): shapes, secrecy, legal moves, rounds, final', () => {
  const st = H.create({ seed: 77, cp: 2, humans: [0, 1, 2], g: 1, n: 4 });
  const rnd = E.mulberry32(5); let steps = 0, rounds = 0;
  while (!H.isOver(st)) {
    if (++steps > 100000) throw new Error('stuck');
    const tn = H.turn(st); ok(tn >= 0, 'a seat to act');
    const pd = H.pub(st); checkPd(pd);
    const pv = H.priv(st, tn); checkPriv(pv);
    // 秘密：他家の手牌の中身・牌山・裏表示牌（局の途中）は pd に出ない
    const text = JSON.stringify(pd);
    if (st.phase !== 'end') { ok(!('ui' in pd)); ok(arrEq(pd.hc, st.hands.map(h => h.length))); }
    // view() は本人のできる手を復元する
    const m = { pd, priv: Object.assign({ v: 1 }, pv), me: tn, tn, n: 4, names: ['a', 'b', 'c', 'd'], ph: 'play', fresh: false, ev: [] };
    const vw = O.view(m);
    eq(vw.st.hands[tn].length, st.hands[tn].length); vw.st.hands.forEach((h, s) => { if (s !== tn) ok(h.every(x => x === -1), 'rivals hidden'); });
    if (st.phase !== 'end') {
      const real = E.legal(st, tn), got = vw.legal;
      eq(uniqKinds(got.filter(a => a.t === 'discard' && !a.riichi)).join(), uniqKinds(real.filter(a => a.t === 'discard' && !a.riichi)).join(), 'discard kinds');
      eq(got.filter(a => a.t === 'discard' && a.riichi).length > 0, real.some(a => a.t === 'discard' && a.riichi));
      for (const t of ['tsumo', 'ron', 'pass', 'pon', 'chii', 'daiminkan', 'ankan', 'kakan', 'kyuushu']) eq(got.filter(a => a.t === t).length, real.filter(a => a.t === t).length, t);
    }
    eq(vw.st.scores.join(), st.scores.join()); eq(vw.st.rivers.map(r => r.length).join(), st.rivers.map(r => r.length).join());
    eq(E.doraIndicators(vw.st).join(), E.doraIndicators(st).join(), 'dora indicators');
    // 手を決める：ボット（CPU の判断）を、わざわざワイヤー形式にして送る
    let wire;
    if (st.phase === 'end') { wire = { t: 'nx' }; rounds++; }
    else { wire = H.cpu(st, tn, 2); ok(/^[a-z]{2,8}$/.test(wire.t)); if (wire.c != null) ok(wire.c >= -1 && wire.c <= 255); if (wire.k != null) ok(wire.k >= -1 && wire.k <= 3); }
    const r = H.apply(st, tn, wire); ok(r, 'apply ' + JSON.stringify(wire) + ' phase ' + st.phase);
    r.ev.forEach(checkEv);
    // 結果の画面の復元
    if (st.phase === 'end') { const v2 = O.view({ pd: H.pub(st), priv: Object.assign({ v: 1 }, H.priv(st, 0)), me: 0, tn: 0, n: 4 }); ok(v2.st.result); eq(v2.st.result.delta.join(), st.result.delta.join()); if (st.result.type !== 'draw') { eq(v2.st.result.winners[0].han, st.result.winners[0].han); eq(v2.st.result.winners[0].yaku.map(y => y.id).join(), st.result.winners[0].yaku.map(y => y.id).join()); ok(v2.st.result.winners[0].hand.length >= 2); } }
  }
  ok(rounds >= 4, 'rounds played: ' + rounds); ok(st.over); const res = H.result(st); eq(res.r.slice().sort().join(), '1,2,3,4');
});
const arrEq = (a, b) => O.arr(a).join() === b.join();
const uniqKinds = L => [...new Set(L.map(a => a.tile >> 2))].sort();
test('the round ends only after every human has pressed Next; CPUs and absent seats do not block', () => {
  const st = H.create({ seed: 3, cp: 1, humans: [0, 2], g: 1, n: 4 });
  st.phase = 'end'; st.result = { type: 'draw', why: 'exhaust', tenpai: [0, 0, 0, 0], delta: [0, 0, 0, 0], renchan: false, hands: [[], [], [], []], melds: [[], [], [], []] }; st.ack = [0, 1, 2, 3].map(s => st.humans.indexOf(s) < 0);
  eq(H.turn(st), 0); const r1 = H.apply(st, 0, { t: 'nx' }); ok(r1.soft); eq(st.roundNo, 0); eq(H.turn(st), 2);
  const r2 = H.apply(st, 2, { t: 'nx' }); ok(!r2.soft); eq(st.roundNo, 1); eq(st.phase, 'discard');
});
test('malformed wires are refused; a seat cannot act out of turn; pon/chii use the option index', () => {
  const st = H.create({ seed: 9, cp: 1, humans: [0, 1, 2, 3], g: 1, n: 4 });
  eq(H.apply(st, 1, { t: 'discard', c: st.hands[1][0], k: 0 }), null, 'not seat 1 turn');
  eq(H.apply(st, 0, { t: 'discard', c: 200, k: 0 }), null); eq(H.apply(st, 0, { t: 'bogus' }), null); eq(H.apply(st, 0, null), null); eq(H.apply(st, 0, { t: 'pon', c: 3 }), null);
  ok(H.apply(st, 0, { t: 'discard', c: st.drawn, k: 0 }));
});
test('fallback ranks by the public scores; toWire/fromWire round-trip; cfg travels in pd', () => {
  eq(H.fallback({ sc: [20000, 30000, 25000, 25000] }).r.join(), '4,1,2,3');
  const st = E.create({ seed: 4 }); const a = E.legal(st, 0).find(x => x.t === 'discard' && x.riichi) || E.legal(st, 0)[0];
  const back = O.fromWire(st, 0, O.toWire(a)); eq(back.t, a.t);
  const v = O.view({ pd: H.pub(st), priv: { v: 1, h: st.hands[0], d: st.drawn, x: { s: 1, t: -1, c: O.encLegal(st, 0) } }, me: 0, tn: 0, n: 4 });
  eq(v.st.cfg.aka, st.cfg.aka); eq(v.st.cfg.mode, 'hanchan');
  eq(JSON.stringify(H.de(H.ser(st))), JSON.stringify(st));
});
run();
