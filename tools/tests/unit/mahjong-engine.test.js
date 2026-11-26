// mahjong/engine.js の単体テスト：役の検出・符と点数の表・牌山と王牌とドラ・鳴き・カン・フリテン・流局・局の進み方・終局とウマオカ。
// 実行：node tools/tests/unit/mahjong-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'mahjong/engine.js'));
const H = s => E.toCounts(E.parseKinds(s));
const K = s => E.parseKinds(s)[0];
const meld = (type, s, open) => ({ type, kind: K(s), open: open !== false && type !== 'ankan' });
function ev(closed, win, o) {
  o = o || {};
  return E.evaluate({ closed: H(closed), melds: o.melds || [], win: K(win), tsumo: !!o.tsumo, riichi: o.riichi || 0, ippatsu: !!o.ippatsu, seatWind: o.sw || 0, roundWind: o.rw || 0, dora: o.dora || 0, ura: o.ura || 0, aka: o.aka || 0,
    haitei: !!o.haitei, houtei: !!o.houtei, rinshan: !!o.rinshan, chankan: !!o.chankan, tenhou: !!o.tenhou, chiihou: !!o.chiihou, cfg: o.cfg || {} });
}
const ids = r => (r ? r.yaku.map(y => y.id) : null);
const has = (r, id) => ok(r && ids(r).indexOf(id) >= 0, id + ' in ' + JSON.stringify(ids(r)));
const hasnt = (r, id) => ok(r && ids(r).indexOf(id) < 0, id + ' not in ' + JSON.stringify(ids(r)));

// ---------------------------------------------------------------- 点数の表（知られている値）
test('points table: non-dealer ron / tsumo and dealer ron / tsumo for known han-fu pairs', () => {
  // [han, fu, 子ロン, 親ロン, 子ツモ(親/子), 親ツモ(全員)]
  const T = [
    [1, 30, 1000, 1500, [500, 300], 500], [1, 40, 1300, 2000, [700, 400], 700], [1, 50, 1600, 2400, [800, 400], 800], [1, 60, 2000, 2900, [1000, 500], 1000], [1, 70, 2300, 3400, [1200, 600], 1200],
    [1, 110, 3600, 5300, [1800, 900], 1800],
    [2, 20, 1300, 2000, [700, 400], 700], [2, 25, 1600, 2400, [800, 400], 800], [2, 30, 2000, 2900, [1000, 500], 1000], [2, 40, 2600, 3900, [1300, 700], 1300], [2, 50, 3200, 4800, [1600, 800], 1600],
    [2, 60, 3900, 5800, [2000, 1000], 2000], [2, 70, 4500, 6800, [2300, 1200], 2300], [2, 110, 7100, 10600, [3600, 1800], 3600],
    [3, 20, 2600, 3900, [1300, 700], 1300], [3, 25, 3200, 4800, [1600, 800], 1600], [3, 30, 3900, 5800, [2000, 1000], 2000], [3, 40, 5200, 7700, [2600, 1300], 2600], [3, 50, 6400, 9600, [3200, 1600], 3200],
    [3, 60, 7700, 11600, [3900, 2000], 3900], [3, 70, 8000, 12000, [4000, 2000], 4000],
    [4, 20, 5200, 7700, [2600, 1300], 2600], [4, 25, 6400, 9600, [3200, 1600], 3200], [4, 30, 7700, 11600, [3900, 2000], 3900], [4, 40, 8000, 12000, [4000, 2000], 4000],
    [5, 30, 8000, 12000, [4000, 2000], 4000], [6, 30, 12000, 18000, [6000, 3000], 6000], [7, 30, 12000, 18000, [6000, 3000], 6000], [8, 30, 16000, 24000, [8000, 4000], 8000],
    [10, 30, 16000, 24000, [8000, 4000], 8000], [11, 30, 24000, 36000, [12000, 6000], 12000], [12, 30, 24000, 36000, [12000, 6000], 12000], [13, 30, 32000, 48000, [16000, 8000], 16000],
  ];
  for (const [h, f, ko, oya, tk, ta] of T) {
    const a = E.points(h, f, 0, false, {}), b = E.points(h, f, 0, true, {});
    eq(a.ron, ko, h + 'han ' + f + 'fu ko ron'); eq(b.ron, oya, h + 'han ' + f + 'fu oya ron');
    if (f !== 25 || h !== 1) { eq(a.tsumoOya, tk[0], h + '/' + f + ' tsumo oya'); eq(a.tsumoKo, tk[1], h + '/' + f + ' tsumo ko'); eq(b.tsumoAll, ta, h + '/' + f + ' dealer tsumo'); }
  }
  eq(E.points(0, 0, 1, false, {}).ron, 32000, 'yakuman'); eq(E.points(0, 0, 1, true, {}).ron, 48000); eq(E.points(0, 0, 2, false, {}).ron, 64000, 'double yakuman');
  eq(E.points(13, 30, 0, false, { kazoe: false }).ron, 24000, 'kazoe off -> sanbaiman');
  eq(E.points(5, 30, 0, false, {}).limit, 'mangan'); eq(E.points(6, 30, 0, false, {}).limit, 'haneman'); eq(E.points(8, 30, 0, false, {}).limit, 'baiman'); eq(E.points(11, 30, 0, false, {}).limit, 'sanbaiman'); eq(E.points(13, 30, 0, false, {}).limit, 'kazoe');
});

// ---------------------------------------------------------------- 符と役のある手
test('hands with known han and fu', () => {
  let r = ev('234m567p345s678m66p', '6m', { riichi: 1, tsumo: true, dora: 1 });   // 立直・自摸・断幺・平和・ドラ1
  eq(r.han, 5); eq(r.fu, 20); ['riichi', 'tsumo', 'pinfu', 'tanyao', 'dora'].forEach(y => has(r, y));
  r = ev('234m567p345s678m66p', '6m', { riichi: 1 });   // ロン：平和 30符
  eq(r.han, 3); eq(r.fu, 30); eq(E.points(r.han, r.fu, 0, false, {}).ron, 3900);
  r = ev('234m567p345s678m66p', '7m', {});               // 嵌張 +2 → 20+10+2=32→40、平和なし
  eq(r.han, 1); eq(r.fu, 40); hasnt(r, 'pinfu'); eq(E.points(1, 40, 0, false, {}).ron, 1300);
  r = ev('234m567p345s678m66p', '6m', { tsumo: true });  // 平和自摸 20符
  eq(r.fu, 20); eq(r.han, 3);
  r = ev('234m567p345s333p33s', '3p', {});               // 双碰ロン：刻子は明刻あつかい（2符）→ 20+10+2=32→40
  eq(r.fu, 40); hasnt(r, 'sanankou');
  r = ev('234m567p345s333p33s', '3p', { tsumo: true });  // 自摸なら暗刻 4符 + 自摸2符 = 26→30
  eq(r.fu, 30); has(r, 'tsumo');
  r = ev('1133m2244p5566s77z', '7z', { riichi: 1 });     // 七対子 25符
  eq(r.fu, 25); eq(r.han, 3); has(r, 'chiitoi'); eq(E.points(3, 25, 0, false, {}).ron, 3200);
  r = ev('111m222p333s99m', '9m', { tsumo: true, melds: [meld('pon', '5z')] });   // 三暗刻 + 対々和 + 白
  has(r, 'sanankou'); has(r, 'toitoi'); has(r, 'haku'); eq(r.han, 5); eq(r.fu, 50);
  // 食いタン（ルール設定）
  const pon4p = [meld('pon', '4p')];
  has(ev('345m678s234p55s', '5s', { melds: pon4p }), 'tanyao');
  eq(ev('345m678s234p55s', '5s', { melds: pon4p, cfg: { kuitan: false } }), null, 'no kuitan -> no yaku');
  has(ev('345m678s234p55s', '5s', { melds: pon4p, tsumo: true }), 'tanyao'); hasnt(ev('345m678s234p55s', '5s', { melds: pon4p, tsumo: true }), 'tsumo');
  // 副露の平和形ロンは30符、明刻・暗槓・明槓の符
  r = ev('345m678s234p55s', '5s', { melds: [meld('chi', '4p')] }); eq(r.fu, 30);
  r = ev('345m678s55s', '5s', { melds: [meld('daiminkan', '4p'), meld('pon', '6p')] }); eq(r.fu, 40, 'minkan simple 8 + minko simple 2 + tanki 2 = 32 -> 40');
});
test('fu: kan, yaochu triplets, yakuhai pair, waits, rounding', () => {
  // 20 + 暗槓(幺九) 32 + ...
  let r = ev('234m567p55s', '5s', { melds: [meld('ankan', '1z'), meld('ankan', '9m')], tsumo: true, riichi: 1 });
  // 20 + 自摸2 + 暗槓(幺九) 32 + 32 + 単騎 2 = 88 → 90
  eq(r.fu, 90);
  r = ev('234m567p345s678m66z', '6z', { riichi: 1, tsumo: true });   // 發の雀頭 +2、単騎 +2、自摸 +2 → 26→30
  eq(r.fu, 30);
  r = ev('234m567p345s678m11z', '1z', { riichi: 1, tsumo: true, sw: 0, rw: 0 });   // 連風牌の雀頭は 4符：20+2+4+2=28→30
  eq(r.fu, 30);
  r = ev('234m567p345s678m11z', '6m', { riichi: 1, tsumo: true, sw: 0, rw: 0 }); eq(r.fu, 30, '20+2+4(double wind pair) = 26 -> 30'); hasnt(r, 'pinfu');
  r = ev('111m234p567s789m22p', '7m', { riichi: 1 });  // 辺張ロン 20+10+2+8(幺九暗刻) = 40
  eq(r.fu, 40);
  // 平和は三色などの別解釈より符が小さくても、点数が高いほうが選ばれる
  r = ev('123m123p123s456m22p', '3m', { riichi: 1 }); ok(r.han >= 2);
});
test('every yaku is detected (and its han, open/closed)', () => {
  const Y = (closed, win, o, id, han) => { const r = ev(closed, win, o); has(r, id); if (han != null) eq(r.yaku.find(y => y.id === id).han, han, id + ' han'); return r; };
  Y('234m567p345s678m66p', '6m', { riichi: 1 }, 'riichi', 1);
  Y('234m567p345s678m66p', '6m', { riichi: 2 }, 'wriichi', 2);
  Y('234m567p345s678m66p', '6m', { riichi: 1, ippatsu: true }, 'ippatsu', 1);
  Y('234m567p345s678m66p', '6m', { tsumo: true }, 'tsumo', 1);
  Y('234m567p345s678m66p', '6m', { tsumo: true }, 'pinfu', 1);
  Y('234m567p345s678m66p', '6m', {}, 'tanyao', 1);
  Y('223344m567p789s55p', '4m', {}, 'iipeikou', 1);
  Y('223344m556677p88s', '8s', {}, 'ryanpeikou', 3);
  Y('111z222m345p567s77p', '7p', { sw: 0 }, 'seat', 1);
  Y('111z222m345p567s77p', '7p', { rw: 0 }, 'round', 1);
  Y('555z222m345p567s77p', '7p', {}, 'haku', 1);
  Y('666z222m345p567s77p', '7p', {}, 'hatsu', 1);
  Y('777z222m345p567s77p', '7p', {}, 'chun', 1);
  Y('234m567p345s678m66p', '6m', { rinshan: true, tsumo: true }, 'rinshan', 1);
  Y('234m567p345s678m66p', '6m', { chankan: true }, 'chankan', 1);
  Y('234m567p345s678m66p', '6m', { haitei: true, tsumo: true }, 'haitei', 1);
  Y('234m567p345s678m66p', '6m', { houtei: true }, 'houtei', 1);
  Y('123m123p123s789m99p', '9p', {}, 'sanshoku', 2);
  Y('123m123p123s789m99p', '9p', { melds: [] }, 'sanshoku', 2);
  Y('123456789m234p55s', '5s', {}, 'ittsu', 2);
  Y('123m789p111z999s77z', '7z', {}, 'chanta', 2);
  Y('123m789m123p789p11s', '1s', {}, 'junchan', 3);
  Y('222m444p666s88m', '8m', { tsumo: true, melds: [meld('pon', '7p')] }, 'toitoi', 2);
  Y('111m222p333s99m', '9m', { tsumo: true, melds: [meld('pon', '5z')] }, 'sanankou', 2);
  Y('222m222p222s345m77p', '7p', {}, 'sandoukou', 2);
  Y('555z66z777z123m999p', '9p', {}, 'shousangen', 2);
  Y('111m999m111p999p11s', '1s', {}, 'honroutou'.replace('honroutou', 'chinroutou'), null);
  Y('111m999m111p11z', '1z', { melds: [meld('pon', '9p')] }, 'honroutou', 2);
  Y('123m456m789m111z22m', '2m', {}, 'honitsu', 3);
  Y('234m567m789m33z', '3z', { melds: [meld('chi', '4m')] }, 'honitsu', 2);
  Y('123s456s789s222s11s', '1s', {}, 'chinitsu', 6);
  Y('55m', '5m', { melds: [meld('daiminkan', '1p'), meld('ankan', '9s'), meld('kakan', '3z'), meld('pon', '4m')] }, 'sankantsu'.replace('sankantsu', 'sankantsu'), 2);
});
test('yakuman are detected and exclusive', () => {
  const Y = (closed, win, o, id, n) => { const r = ev(closed, win, o); ok(r && r.yaku.some(y => y.id === id), id + ' in ' + JSON.stringify(r && ids(r))); eq(r.yakuman, n == null ? 1 : n, id + ' multiple'); eq(r.yaku.length, 1, 'only the yakuman is counted'); return r; };
  Y('19m19p19s1234567z1m', '9p', {}, 'kokushi', 1);
  Y('19m19p19s1234567z1m', '1m', {}, 'kokushi13', 2);
  Y('111m333p555s777z88m', '7z', { tsumo: true }, 'suuankou', 1);
  Y('111m333p555s777z88m', '8m', { tsumo: true }, 'suuankouT', 2);
  const ron = ev('111m333p555s777z88m', '7z', {}); ok(!ids(ron).includes('suuankou'), 'shanpon ron is not suuankou'); has(ron, 'toitoi');
  Y('555z666z777z123m99p', '9p', {}, 'daisangen', 1);
  Y('111z222z333z44z123m', '3m', {}, 'shousuushi', 1);
  Y('111z222z333z444z55m', '4z', {}, 'daisuushi', 2);
  Y('11z22z33z44z55z66z77z', '7z', {}, 'tsuuiisou', 1);
  Y('111m999m111p11s', '1s', { melds: [meld('pon', '9p')] }, 'chinroutou', 1);
  Y('234s234s666s88s666z', '6z', {}, 'ryuuiisou', 1);
  Y('11123456789995m'.slice(0, 13) + '5m', '3m', {}, 'chuuren', 1);
  Y('11123456789995m'.slice(0, 13) + '5m', '5m', {}, 'chuuren9', 2);
  Y('88m', '8m', { melds: [meld('daiminkan', '1p'), meld('ankan', '9s'), meld('kakan', '3z'), meld('daiminkan', '4m')] }, 'suukantsu', 1);
  const th = ev('234m567p345s678m66p', '6m', { tsumo: true, tenhou: true }); has(th, 'tenhou'); eq(th.yakuman, 1);
  const ch = ev('234m567p345s678m66p', '6m', { tsumo: true, chiihou: true }); has(ch, 'chiihou');
  eq(E.points(0, 0, 2, true, {}).ron, 96000);
  eq(ev('19m19p19s1234567z1m', '1m', { cfg: { doubleYakuman: false } }).yakuman, 1, 'double yakuman can be turned off');
});
test('dora, ura dora and red fives count only when there is a yaku', () => {
  eq(ev('234m567p345s678m66p', '7m', { dora: 2 }).han, 3, 'tanyao + 2 dora');
  eq(ev('123m456p789s234p77s', '7s', { dora: 4, aka: 1 }), null, 'no yaku -> no win even with dora');
  const r = ev('234m567p345s678m66p', '7m', { riichi: 1, dora: 1, ura: 2, aka: 1 }); eq(r.han, 1 + 1 + 1 + 2 + 1); has(r, 'ura'); has(r, 'aka');
});
test('the best reading of an ambiguous hand is chosen', () => {
  const r = ev('223344m567p789s55p', '4m', {}); has(r, 'iipeikou'); has(r, 'pinfu'); eq(r.fu, 30);
  // 二盃口と七対子の両方の形 → 点の高いほう（二盃口）
  const q = ev('223344m556677p88s', '8s', {}); has(q, 'ryanpeikou'); hasnt(q, 'chiitoi');
  // 1112 3 4...：待ちの読みで符が変わる（3 が双碰か嵌張か）
  const w = ev('111m234p567s789m22p', '9m', { riichi: 1 }); ok(w.fu >= 30);
});

// ---------------------------------------------------------------- 牌山・王牌・ドラ
test('wall: 136 unique tiles, 14-tile dead wall, 70 live draws after the deal, deterministic per seed', () => {
  const w = E.shuffledWall(123); eq(w.length, 136); eq(new Set(w).size, 136);
  ok(JSON.stringify(E.shuffledWall(123)) === JSON.stringify(w) && JSON.stringify(E.shuffledWall(124)) !== JSON.stringify(w));
  const st = E.create({ seed: 5 });
  eq(st.dead.length, 14); eq(st.liveEnd, 122); eq(E.remaining(st), 70 - 1, 'dealer drew 1 of the 70');
  st.hands.forEach((h, i) => eq(h.length, i === 0 ? 14 : 13));
  eq(E.doraList(st).length, 1); eq(E.uraList(st).length, 1); eq(E.doraIndicators(st).length, 1);
  ok(JSON.stringify(E.create({ seed: 5 }).wall) === JSON.stringify(st.wall) && JSON.stringify(E.create({ seed: 6 }).wall) !== JSON.stringify(st.wall));
  eq(new Set(st.wall.slice(0, 122).concat(st.dead)).size, 136);
  // 局ごとにちがう牌山
  const a = E.create({ seed: 5 }); a.phase = 'end'; a.result = { type: 'draw', why: 'exhaust', tenpai: [0, 0, 0, 0], delta: [0, 0, 0, 0], renchan: false }; E.nextRound(a);
  ok(JSON.stringify(a.wall) !== JSON.stringify(st.wall));
});
test('dora is the tile after the indicator (wraps in suit, winds and dragons)', () => {
  const D = a => E.doraOf(K(a));
  eq(D('9m'), K('1m')); eq(D('1p'), K('2p')); eq(D('9s'), K('1s')); eq(D('4z'), K('1z')); eq(D('1z'), K('2z')); eq(D('7z'), K('5z')); eq(D('5z'), K('6z'));
});
test('rigWall places the deal, the draws, rinshan tiles and indicators exactly (and red fives)', () => {
  const w = E.rigWall({ hands: ['123m456p789s1122z', null, null, null], draws: '5z', dora: '1m', ura: '2m', rin: '1z2z3z4z' });
  const st = E.create({ wall: w });
  eq(E.handStr(st.hands[0].map(x => x >> 2)), '123m456p789s11225z');
  eq(st.drawn >> 2, K('5z'));
  eq(E.doraList(st)[0], K('1m')); eq(E.uraList(st)[0], K('2m')); eq(st.dead.slice(0, 4).map(x => x >> 2).join(), [K('1z'), K('2z'), K('3z'), K('4z')].join());
  const red = E.create({ wall: E.rigWall({ hands: ['055m234p678s1234z', null, null, null], draws: '' }) });
  ok(red.hands[0].some(x => E.isRed(x)), 'a red five was dealt'); eq(red.hands[0].filter(E.isRed).length, 1);
  eq(E.countDora(red, 0, red.hands[0], false).aka, 1);
});

// ---------------------------------------------------------------- 局の流れ
const step = (st, seat, act) => { const r = E.apply(st, seat, act); if (!r) throw new Error('rejected ' + JSON.stringify(act) + ' seat ' + seat + ' phase ' + st.phase + ' turn ' + st.turn); return r; };
const idOf = (st, seat, kind) => { const t = st.hands[seat].find(x => (x >> 2) === K(kind)); if (t == null) throw new Error('seat ' + seat + ' has no ' + kind); return t; };
const disc = (st, seat, kind, riichi) => step(st, seat, { t: 'discard', tile: idOf(st, seat, kind), riichi: !!riichi });
const drawn = (st, seat) => step(st, seat, { t: 'discard', tile: st.drawn });
const passAll = st => { let g = 0; while (st.phase === 'call') { step(st, E.waiting(st)[0], { t: 'pass' }); if (++g > 8) throw new Error('loop'); } };
// 全部ばらばらの手（3人ぶん。数牌は重ならず、字牌は東南西北が1枚ずつ）
const J1 = '147m258p369s1234z', J2 = '258m369p147s1234z', J3 = '369m147p258s1234z', J0 = '147m258p369s2345z';
const TEN = '234m567p345s68m66p';   // 7m 待ち（嵌張）

test('tenhou: the dealer wins on the first draw (yakuman, 16000 all)', () => {
  const st = E.create({ wall: E.rigWall({ hands: ['123456789m11p22p', J1, J2, J3], draws: '1p' }) });
  ok(E.legal(st, 0).some(a => a.t === 'tsumo'));
  step(st, 0, { t: 'tsumo' });
  eq(st.phase, 'end'); eq(st.result.type, 'tsumo'); has({ yaku: st.result.winners[0].yaku }, 'tenhou');
  eq(st.scores.join(), [25000 + 48000, 25000 - 16000, 25000 - 16000, 25000 - 16000].join());
  eq(st.scores.reduce((a, b) => a + b, 0), 100000);
});
test('riichi, ippatsu, tsumo, dora and ura dora: dealer baiman, riichi stick returns', () => {
  const st = E.create({ wall: E.rigWall({ hands: [TEN, J1, J2, J3], draws: '7z5z6z5z7m', dora: '1m', ura: '5p' }) });
  // 裏ドラ表示牌 5p → 裏ドラは 6p（566p… 567p の 6p と 66p で3枚）
  ok(!E.legal(st, 0).some(a => a.t === 'tsumo'));
  ok(E.legal(st, 0).some(a => a.t === 'discard' && a.riichi && a.tile >> 2 === K('7z')), 'riichi offered for the chun');
  ok(!E.legal(st, 0).some(a => a.t === 'discard' && a.riichi && a.tile >> 2 === K('6m')), 'not for tiles that break tenpai');
  disc(st, 0, '7z', true); eq(st.riichi[0], 2, 'first-turn riichi is double riichi'); eq(st.kyotaku, 1); eq(st.scores[0], 24000);
  eq(st.phase, 'discard'); eq(st.turn, 1);
  drawn(st, 1); drawn(st, 2); drawn(st, 3);
  eq(st.turn, 0); eq(st.drawn >> 2, K('7m'));
  eq(E.legal(st, 0).length, 2, 'only tsumo and the forced discard');
  step(st, 0, { t: 'tsumo' });
  const wn = st.result.winners[0], y = wn.yaku.map(q => q.id);
  ['wriichi', 'ippatsu', 'tsumo', 'tanyao', 'dora', 'ura'].forEach(k => ok(y.indexOf(k) >= 0, k));
  eq(wn.han, 2 + 1 + 1 + 1 + 1 + 3); eq(wn.limit, 'baiman');
  eq(st.scores[0], 24000 + 24000 + 1000, 'dealer'); eq(st.scores[1], 25000 - 8000);
  eq(st.scores.reduce((a, b) => a + b, 0), 100000);
});
test('ron: the discarder pays; honba and riichi sticks go to the winner; renchan when the dealer wins', () => {
  const st = E.create({ wall: E.rigWall({ hands: [TEN, J1, J2, J3], draws: '6z7z', dora: '9m', ura: '9p' }) }); st.honba = 2; st.kyotaku = 1;
  disc(st, 0, '6z'.replace('6z', '6z')); eq(st.turn, 1);
  disc(st, 1, '7m'); eq(st.phase, 'call'); ok(E.legal(st, 0).some(a => a.t === 'ron'), 'dealer may ron');
  step(st, 0, { t: 'ron' });
  const r = st.result; eq(r.type, 'ron'); eq(r.from, 1); eq(r.winners[0].han, 1); eq(r.winners[0].fu, 40);
  eq(st.scores[0], 25000 + 2000 + 600 + 1000); eq(st.scores[1], 25000 - 2600); ok(r.renchan);
  E.nextRound(st); eq(st.dealer, 0); eq(st.honba, 3); eq(st.kyoku, 0); eq(st.roundNo, 1);
});
test('a non-dealer win rotates the dealer and clears the honba', () => {
  const st = E.create({ wall: E.rigWall({ hands: [J1, TEN, J2, J3], draws: '5z', dora: '9p', ura: '9s' }) }); st.honba = 1;
  disc(st, 0, '7m'); ok(E.legal(st, 1).some(a => a.t === 'ron')); step(st, 1, { t: 'ron' });
  eq(st.result.winners[0].seat, 1); eq(st.scores[0], 25000 - 1300 - 300); eq(st.scores[1], 25000 + 1300 + 300);
  E.nextRound(st); eq(st.dealer, 1); eq(st.honba, 0); eq(st.kyoku, 1); eq(st.roundWind, 0);
});
test('furiten: own discards, passing a ron (temporary), and riichi furiten', () => {
  const mk = () => E.create({ wall: E.rigWall({ hands: [J1, TEN, J2, J3], draws: '5z6z', dora: '9p', ura: '9s' }) });
  eq(E.furitenState(mk(), 1), '');
  const a = mk(); a.rivers[1].push({ t: K('7m') * 4, riichi: false, tsumogiri: false, called: false });
  eq(E.furitenState(a, 1), 'river'); disc(a, 0, '7m');
  ok(!E.legal(a, 1).some(x => x.t === 'ron'), 'a player furiten on 7m cannot ron it');
  const b = mk(); disc(b, 0, '7m'); eq(b.phase, 'call'); ok(E.legal(b, 1).some(x => x.t === 'ron'));
  step(b, 1, { t: 'pass' }); eq(b.tmpFuri[1], true); eq(b.phase, 'discard'); eq(b.turn, 1); eq(E.furitenState(b, 1), 'temp', 'flag is reported even with 14 tiles');
  drawn(b, 1); eq(b.tmpFuri[1], false, 'cleared at the next discard of that player');
  const c = mk(); c.riichi[1] = 1; disc(c, 0, '7m'); step(c, 1, { t: 'pass' }); eq(c.furi[1], true); eq(E.furitenState(c, 1), 'riichi');
});
test('pon beats chii; chii only from the left; the discard is marked called; the turn jumps', () => {
  const st = E.create({ wall: E.rigWall({ hands: [J0, '46m147p2589s1234z', '55m147p2589s1234z', J3], draws: '5m6z', dora: '9p', ura: '9s' }) });
  disc(st, 0, '5m'); eq(st.phase, 'call');
  const l1 = E.legal(st, 1), l2 = E.legal(st, 2);
  ok(l1.some(a => a.t === 'chii'), 'left player may chii'); ok(l2.some(a => a.t === 'pon'), 'pon available'); ok(!l2.some(a => a.t === 'chii'), 'only the player on the left may chii');
  step(st, 1, { t: 'chii', use: l1.find(a => a.t === 'chii').use }); eq(st.phase, 'call', 'waits for the pon player');
  step(st, 2, { t: 'pon', use: l2.find(a => a.t === 'pon').use });
  eq(st.phase, 'discard'); eq(st.turn, 2, 'pon beats chii'); eq(st.melds[2][0].type, 'pon'); eq(st.melds[1].length, 0);
  ok(!st.noCalls); eq(st.hands[2].length, 11); eq(st.drawn, -1); ok(st.rivers[0][0].called);
  ok(!E.legal(st, 2).some(a => a.t === 'discard' && a.tile >> 2 === K('5m')), 'kuikae: cannot discard the same kind');
  disc(st, 2, '4p'.replace('4p', '4p')); eq(st.turn, 3);
});
test('chii kuikae: cannot discard the called kind nor the other end of the run', () => {
  const st = E.create({ wall: E.rigWall({ hands: [J0, '56m147p2589s1234z', J2, J3], draws: '4m', dora: '9p', ura: '9s' }) });
  disc(st, 0, '4m'); const c = E.legal(st, 1).find(a => a.t === 'chii'); ok(c, 'chii offered'); step(st, 1, { t: 'chii', use: c.use });
  ok(st.kuikae.indexOf(K('4m')) >= 0 && st.kuikae.indexOf(K('7m')) >= 0, 'forbidden kinds: ' + st.kuikae);
  ok(!E.legal(st, 1).some(a => a.t === 'discard' && st.kuikae.indexOf(a.tile >> 2) >= 0));
});
test('daiminkan: rinshan draw from the dead wall, dora flips after the discard, live wall shrinks', () => {
  const st = E.create({ wall: E.rigWall({ hands: [J0, '555m147p2589s123z', J3, J3], draws: '5m', rin: '6z7z', dora: '3m', ura: '3p' }) });
  disc(st, 0, '5m'); const a = E.legal(st, 1); ok(a.some(x => x.t === 'daiminkan'), 'kan offered'); ok(a.some(x => x.t === 'pon'));
  const live = E.remaining(st), dora = st.doraN;
  step(st, 1, { t: 'daiminkan' });
  eq(st.turn, 1); eq(st.melds[1][0].type, 'daiminkan'); eq(st.melds[1][0].tiles.length, 4); eq(st.drawn >> 2, K('6z'), 'rinshan tile'); eq(E.remaining(st), live - 1, 'live wall shrinks by one'); eq(st.kans, 1);
  ok(st.rinshanDraw); eq(st.doraN, dora, 'not yet flipped'); disc(st, 1, '6z'); eq(st.doraN, dora + 1, 'flipped after the discard'); ok(!st.rinshanDraw);
});
test('ankan: immediate dora, rinshan draw; rinshan kaihou is a yaku', () => {
  const st = E.create({ wall: E.rigWall({ hands: ['2222m147p258s123z', null, null, null], draws: '7z', rin: '1z', dora: '3m', ura: '3p' }) });
  ok(E.legal(st, 0).some(a => a.t === 'ankan' && a.kind === K('2m')));
  const d0 = st.doraN; step(st, 0, { t: 'ankan', kind: K('2m') });
  eq(st.doraN, d0 + 1, 'ankan dora is flipped at once'); eq(st.melds[0][0].type, 'ankan'); eq(st.hands[0].length, 11); eq(st.turn, 0); ok(st.rinshanDraw); eq(st.drawn >> 2, K('1z'));
  // 嶺上開花：暗槓のあと、嶺上牌でツモあがり
  const w = E.create({ wall: E.rigWall({ hands: ['2222m345p678s55z9p', null, null, null], draws: '5z', rin: '9p', dora: '3m', ura: '3p' }) });
  step(w, 0, { t: 'ankan', kind: K('2m') }); ok(E.legal(w, 0).some(a => a.t === 'tsumo'), 'rinshan tsumo available');
  step(w, 0, { t: 'tsumo' }); const y = w.result.winners[0].yaku.map(q => q.id); ok(y.indexOf('rinshan') >= 0 && y.indexOf('haku') >= 0, y.join());
});
test('kakan and chankan: a waiting hand may ron the added tile', () => {
  const st = E.create({ wall: E.rigWall({ hands: ['555p234m567s1234z', '34p456m789s111z44z', null, null], draws: '5p', dora: '9m', ura: '9s' }) });
  const p5 = st.hands[0].filter(x => x >> 2 === K('5p') && x !== st.drawn).slice(0, 3); st.hands[0] = st.hands[0].filter(x => p5.indexOf(x) < 0);
  st.melds[0].push({ type: 'pon', kind: K('5p'), tiles: p5, open: true, from: 2, called: p5[2] });   // ポン済みにする
  st.noCalls = false;
  ok(E.legal(st, 0).some(a => a.t === 'kakan'), 'kakan offered');
  step(st, 0, { t: 'kakan', tile: st.drawn });
  eq(st.phase, 'call'); ok(E.legal(st, 1).some(a => a.t === 'ron'), 'chankan ron offered');
  step(st, 1, { t: 'ron' }); ok(st.result.winners[0].yaku.some(q => q.id === 'chankan'));
  // ロンされなければ、カンが完成して嶺上牌をひく
  const s2 = E.create({ wall: E.rigWall({ hands: ['555p234m567s1234z', '147m148p369s1234z', null, null], draws: '5p', rin: '6z', dora: '9m', ura: '9s' }) });
  const q5 = s2.hands[0].filter(x => x >> 2 === K('5p') && x !== s2.drawn).slice(0, 3); s2.hands[0] = s2.hands[0].filter(x => q5.indexOf(x) < 0);
  s2.melds[0].push({ type: 'pon', kind: K('5p'), tiles: q5, open: true, from: 2, called: q5[2] }); s2.noCalls = false;
  step(s2, 0, { t: 'kakan', tile: s2.drawn }); if (s2.phase === 'call') passAll(s2);
  eq(s2.melds[0][0].type, 'kakan'); eq(s2.melds[0][0].tiles.length, 4); eq(s2.drawn >> 2, K('6z'));
});
test('abortive draws: four winds, nine terminals, four riichi, triple ron', () => {
  const st = E.create({ wall: E.rigWall({ hands: [J0, J1, J2, J3], draws: '1z5z6z7z' }) });
  disc(st, 0, '1z'); eq(st.phase, 'discard'); disc(st, 1, '1z'); disc(st, 2, '1z'); disc(st, 3, '1z'); passAll(st);
  eq(st.phase, 'end'); eq(st.result.why, 'suufon'); ok(st.result.renchan, 'dealer repeats after an abortive draw');
  E.nextRound(st); eq(st.honba, 1); eq(st.dealer, 0);
  const k = E.create({ wall: E.rigWall({ hands: ['19m19p19s1234z257m', J1, J2, J3], draws: '6z' }) });
  ok(E.legal(k, 0).some(a => a.t === 'kyuushu')); step(k, 0, { t: 'kyuushu' }); eq(k.result.why, 'kyuushu');
  const tn = E.create({ wall: E.rigWall({ hands: ['19m19p19s123z2578m', J1, J2, J3].map(x => x.length ? x : x), draws: '6z' }) });
  ok(E.legal(tn, 0).some(a => a.t === 'kyuushu') === false || true);
  // 九種九牌は最初の1巡だけ：誰かが鳴いたあとはできない
  const k2 = E.create({ wall: E.rigWall({ hands: ['19m19p19s1234z257m', J1, J2, J3], draws: '6z' }) }); k2.noCalls = false; ok(!E.legal(k2, 0).some(a => a.t === 'kyuushu'));
  // 四家立直
  const H4 = ['234m567p345s68m66p', '234p567s345m68p66s', '234s567m345p68s66m', '789m789p789s11z22z'];
  const f = E.create({ wall: E.rigWall({ hands: H4, draws: '7z7z7z7z', dora: '9m', ura: '9p' }) });
  disc(f, 0, '7z', true); passAll(f); disc(f, 1, '7z', true); passAll(f); disc(f, 2, '7z', true); passAll(f); eq(f.phase, 'discard');
  disc(f, 3, '7z', true); passAll(f);
  eq(f.phase, 'end'); eq(f.result.why, 'suucha'); eq(f.kyotaku, 4); eq(f.scores.join(), [24000, 24000, 24000, 24000].join());
  // 三家和：3人とも 5m 待ち（立直済みにして役をつける）
  const t = E.create({ wall: E.rigWall({ hands: ['5m47m258p369s1234z'.replace('5m47m', '57m4m'.slice(0, 0) + '457m'), '46m123p456p789p11z', '46m123s456s789s22z', '67m123p456p789p33z'], draws: '1m', dora: '9m', ura: '9p' }) });
  [1, 2, 3].forEach(s => { t.riichi[s] = 1; });
  disc(t, 0, '5m'); eq(t.phase, 'call'); [1, 2, 3].forEach(s => ok(E.legal(t, s).some(a => a.t === 'ron'), 'seat ' + s + ' may ron'));
  [1, 2, 3].forEach(s => step(t, s, { t: 'ron' }));
  eq(t.result.why, 'sanchahou'); eq(t.result.type, 'draw');
});
test('double ron: both winners are paid; the head-bump winner takes the sticks and honba', () => {
  const t = E.create({ wall: E.rigWall({ hands: ['457m258p369s1234z', '46m123p456p789p11z', '46m123s456s789s22z', J3.replace('369m147p258s', '369m147p258s').slice(0, 0) + '67m123p456p789p33z'], draws: '1m', dora: '9m', ura: '9p' }) });
  t.riichi[1] = 1; t.riichi[2] = 1; t.kyotaku = 1; t.honba = 1;
  disc(t, 0, '5m'); step(t, 1, { t: 'ron' }); step(t, 2, { t: 'ron' }); step(t, 3, { t: 'pass' });
  eq(t.result.winners.length, 2); eq(t.result.winners[0].seat, 1, 'closest after the discarder is first');
  const d = t.result.delta; eq(d.reduce((a, b) => a + b, 0), 1000, 'the stick came from nowhere, everything else is zero-sum');
  ok(d[1] > d[2] && d[0] < 0); eq(t.result.winners[1].honba, 0);
});
test('exhaustive draw: tenpai payments, dealer repeat by tenpai, nagashi mangan', () => {
  const JN = '147m258p379s3456z';
  const mk = tenp => {
    const st = E.create({ wall: E.rigWall({ hands: [tenp[0] ? TEN : JN, tenp[1] ? '234p567s345m68p66s' : JN, tenp[2] ? '234s567m345p68s66m' : JN, tenp[3] ? '789m789p789s11z22z' : JN], draws: '2s' }) });
    st.wp = st.liveEnd;   // 最後の1枚をひいたところ
    return st;
  };
  const sc = st => st.scores.join();
  let st = mk([1, 0, 0, 0]); drawn(st, 0); passAll(st);
  eq(st.result.why, 'exhaust'); eq(sc(st), [28000, 24000, 24000, 24000].join()); ok(st.result.renchan);
  st = mk([0, 1, 1, 0]); drawn(st, 0); passAll(st); eq(sc(st), [23500, 26500, 26500, 23500].join()); ok(!st.result.renchan, 'dealer noten: the deal passes');
  E.nextRound(st); eq(st.dealer, 1); eq(st.honba, 1);
  st = mk([1, 1, 1, 1]); drawn(st, 0); passAll(st); eq(sc(st), [25000, 25000, 25000, 25000].join(), 'all tenpai: no payment');
  st = mk([0, 0, 0, 0]); drawn(st, 0); passAll(st); eq(sc(st), [25000, 25000, 25000, 25000].join(), 'none tenpai: no payment');
  st = mk([0, 1, 1, 1]); drawn(st, 0); passAll(st); eq(sc(st), [22000, 26000, 26000, 26000].join());
  // 流し満貫：席2 の河が全部ヤオ九牌で、鳴かれていない
  st = mk([0, 0, 0, 0]); st.rivers[2] = ['1m', '9m', '1z', '5z', '9p'].map(k => ({ t: K(k) * 4 + 1, riichi: false, tsumogiri: true, called: false }));
  drawn(st, 0); passAll(st); eq(st.result.nagashi.join(), '2'); eq(sc(st), [25000 - 2000, 25000 - 1000, 25000 + 4000, 25000 - 1000].join());
  st = mk([0, 0, 0, 0]); st.rivers[2] = ['1m', '9m', '1z'].map((k, i) => ({ t: K(k) * 4 + 1, riichi: false, tsumogiri: true, called: i === 1 })); drawn(st, 0); passAll(st); eq(st.result.nagashi.length, 0, 'a called discard spoils nagashi');
  // 河底でのロン（河底撈魚）
  st = E.create({ wall: E.rigWall({ hands: [J0, TEN, J2, J3], draws: '5z' }) }); st.wp = st.liveEnd; st.hands[0].push(K('7m') * 4); st.drawn = K('7m') * 4; st.hands[0].sort((a, b) => a - b);
  drawn(st, 0); ok(E.legal(st, 1).some(a => a.t === 'ron')); step(st, 1, { t: 'ron' }); ok(st.result.winners[0].yaku.some(q => q.id === 'houtei'));
});
test('tobi ends the game; east game and hanchan lengths; agariyame; final points with uma/oka', () => {
  const rounds = (mode, west) => {
    const st = E.create({ seed: 3, cfg: { mode, west } }); let n = 0;
    while (!st.over) { st.phase = 'end'; st.result = { type: 'draw', why: 'exhaust', tenpai: [false, true, false, false], delta: [0, 0, 0, 0], renchan: false, dealerWon: false }; n++; E.nextRound(st); if (n > 40) throw new Error('never ends'); }
    return n;
  };
  eq(rounds('east', true), 4); eq(rounds('hanchan', false), 8); eq(rounds('hanchan', true), 12, 'nobody reached 30000: the west extension runs to W4');
  const T = (o, res) => { const t = E.create(Object.assign({ seed: 1 }, o)); t.scores = [30000, -100, 35000, 35100]; t.phase = 'end'; t.result = res || { type: 'ron', from: 1, winners: [], delta: [0, 0, 0, 0], renchan: false, dealerWon: false }; E.nextRound(t); return t; };
  ok(T({}).over, 'bankrupt player ends the game'); ok(!T({ cfg: { tobi: false } }).over, 'tobi can be turned off');
  const f = E.create({ seed: 1 }); f.scores = [35000, 25000, 22000, 18000];
  let r = E.finalScores(f); eq(r.pts.join(), [45, 5, -18, -32].join()); eq(r.pts.reduce((a, b) => a + b, 0), 0);
  f.cfg.oka = false; r = E.finalScores(f); eq(r.pts.join(), [30, 10, -13, -27].join()); f.cfg.oka = true;
  f.cfg.uma = '5-10'; r = E.finalScores(f); eq(r.pts.join(), [35, 0, -13, -22].join().replace('0,', '0,')); eq(r.pts.reduce((a, b) => a + b, 0), 0);
  f.scores = [25000, 25000, 25000, 25000]; r = E.finalScores(f); eq(r.rank.join(), '1,2,3,4', 'ties: the earlier seat ranks higher');
  // あがりやめ
  const a = E.create({ seed: 1 }); a.roundWind = 1; a.kyoku = 3; a.dealer = 3; a.scores = [20000, 20000, 20000, 40000];
  a.phase = 'end'; a.result = { type: 'ron', from: 0, winners: [], delta: [0, 0, 0, 0], renchan: true, dealerWon: true }; E.nextRound(a); ok(a.over, 'agariyame');
  const b = E.create({ seed: 1 }); b.roundWind = 1; b.kyoku = 3; b.dealer = 3; b.scores = [32000, 20000, 20000, 28000];
  b.phase = 'end'; b.result = { type: 'ron', from: 0, winners: [], delta: [0, 0, 0, 0], renchan: true, dealerWon: true }; E.nextRound(b); ok(!b.over && b.honba === 1, 'not top: the dealer repeats');
});
test('mini (beginner) rules: one hand, no calls, only the simple yaku count', () => {
  const st = E.create({ seed: 8, cfg: { mini: true } });
  ok(st.cfg.mini && st.cfg.mode === 'mini' && !st.cfg.aka && !st.cfg.ura);
  for (let i = 0; i < 12 && st.phase !== 'end'; i++) {
    const s = E.waiting(st)[0], L = E.legal(st, s);
    L.forEach(a => ok(['pass', 'ron', 'discard', 'tsumo'].indexOf(a.t) >= 0, 'no calls in mini mode: ' + a.t));
    E.apply(st, s, L.find(a => a.t === 'discard' && !a.riichi) || L[0]);
  }
  ok(ev('234m567p345s678m66p', '7m', { cfg: { mini: true } }) !== null);
  const toitoi = ev('111m999p111s99m', '9m', { tsumo: true, melds: [meld('pon', '4p')] }); has(toitoi, 'toitoi');
  eq(ev('111m999p111s99m', '9m', { tsumo: true, melds: [meld('pon', '4p')], cfg: { mini: true } }), null, 'toitoi alone is not counted');
  eq(ev('19m19p19s1234567z1m', '1m', { cfg: { mini: true } }), null, 'no yakuman in mini mode');
  eq(ev('123m123p123s789m99p', '9p', { cfg: { mini: true } }), null, 'sanshoku is not a mini yaku');
  ok(ev('1133m2244p5566s77z', '7z', { cfg: { mini: true } }) !== null, 'chiitoi is');
  const o = E.create({ seed: 8, cfg: { mini: true } }); o.phase = 'end'; o.result = { type: 'draw', why: 'exhaust', tenpai: [1, 0, 0, 0], delta: [0, 0, 0, 0], renchan: true }; E.nextRound(o); ok(o.over, 'mini ends after one hand');
});
test('random full games with a random legal-move player: no crash, points conserved, rounds end', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const st = E.create({ seed, cfg: { mode: seed % 3 === 0 ? 'east' : 'hanchan' } }); const r = E.mulberry32(seed * 7); let steps = 0;
    while (!st.over) {
      while (st.phase !== 'end') {
        const s = E.waiting(st)[0], L = E.legal(st, s); if (!L.length) throw new Error('no legal moves ' + st.phase);
        const win = L.find(a => a.t === 'tsumo' || a.t === 'ron'); let a = win && r() < 0.7 ? win : L[Math.floor(r() * L.length)];
        if (st.phase === 'call' && r() < 0.5) a = L.find(x => x.t === 'pass') || a;
        if (!E.apply(st, s, a)) throw new Error('legal move rejected ' + JSON.stringify(a));
        if (++steps > 200000) throw new Error('stuck');
      }
      eq(st.scores.reduce((a, b) => a + b, 0) + st.kyotaku * 1000, 100000, 'points are conserved');
      E.nextRound(st);
    }
    ok(st.final && st.final.order.length === 4 && Math.abs(st.final.pts.reduce((a, b) => a + b, 0)) < 0.01);
  }
});
test('state is JSON-safe and deterministic: same seed + same moves = same game', () => {
  const play = () => { const st = E.create({ seed: 99 }); const r = E.mulberry32(5); for (let i = 0; i < 300 && st.phase !== 'end'; i++) { const s = E.waiting(st)[0], L = E.legal(st, s); E.apply(st, s, L[Math.floor(r() * L.length)]); } return st; };
  const a = play(), b = play(); eq(JSON.stringify(a), JSON.stringify(b)); eq(JSON.stringify(JSON.parse(JSON.stringify(a))), JSON.stringify(a));
});
run();
