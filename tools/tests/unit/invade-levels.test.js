// invade/levels.js + bot.js：45 の面の作り（ぜんぶ形がちがう・5 面ごとにボス・ボーナス面・新しい敵の紹介）と、
// ボットが 45 面ぜんぶをクリアできること（3 回まで挑戦。種を変える）、クラシックの序盤・デイリーも通れること
// 実行：node tools/tests/unit/invade-levels.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'invade/engine.js'));
const LV = require(path.join(ROOT, 'invade/levels.js'));
const Bot = require(path.join(ROOT, 'invade/bot.js'));

test('45 designed stages: unique formations, a boss every 5th, six bonus stages, thirty ordinary waves, bilingual names', () => {
  eq(LV.CAMPAIGN.length, 45);
  eq(new Set(LV.CAMPAIGN.map(s => s.kind + s.mask.join('|'))).size, 45, 'all different');
  LV.CAMPAIGN.forEach((s, i) => { eq(s.kind === 'boss', (i + 1) % 5 === 0, 'boss at ' + (i + 1)); ok(s.name.ja && s.name.en, 'name ' + i); ok(!/[ぁ-んァ-ン一-龥]/.test(s.name.en), 'english name ' + s.name.en); });
  eq(LV.CAMPAIGN.filter(s => s.kind === 'bonus').length, 6); eq(LV.CAMPAIGN.filter(s => s.kind === 'wave').length, 30); eq(LV.CAMPAIGN.filter(s => s.kind === 'boss').length, 9);
  eq(new Set(LV.CAMPAIGN.filter(s => s.kind === 'boss').map(s => s.boss)).size, 9, 'nine different bosses');
  for (const s of LV.CAMPAIGN) { ok(s.mask.length >= 2 && s.mask.length <= 7, s.id + ' rows'); ok(s.mask.every(r => r.length <= 11), s.id + ' columns'); ok(s.mask.join('').replace(/\./g, '').length >= 8, s.id + ' not empty'); ok(/^[bzspdhmg.]+$/.test(s.mask.join('')), s.id + ' letters'); }
  eq(new Set(LV.CAMPAIGN.map(s => s.shape + s.paint)).size >= 38, true, 'a rich set of shapes');
});

test('enemy types are introduced one at a time with a tip, and every type appears in the campaign', () => {
  const seen = new Set(); const intro = {};
  LV.CAMPAIGN.forEach((s, i) => { for (const ch of new Set(s.mask.join('').replace(/\./g, ''))) { if (!seen.has(ch)) { seen.add(ch); intro[ch] = i + 1; } } });
  for (const ch of 'bzspmdhg') ok(seen.has(ch), 'type ' + ch);
  ok(intro.b === 1 && intro.z === 3 && intro.s <= 7 && intro.p <= 9 && intro.m <= 11 && intro.d <= 16 && intro.h <= 17, JSON.stringify(intro));
  for (const [ch, n] of Object.entries(intro)) if ('zspmdh'.includes(ch)) ok(LV.CAMPAIGN[n - 1].tip && LV.CAMPAIGN[n - 1].tip.ja && LV.CAMPAIGN[n - 1].tip.en, 'tip at ' + n + ' for ' + ch);
  for (let i = 1; i < 45; i++) { const a = LV.CAMPAIGN[i - 1], b = LV.CAMPAIGN[i]; if (a.kind === 'wave' && b.kind === 'wave') ok(b.di >= a.di, 'pressure only grows'); }
  const e = LV.ENEMY; eq(e.length, 9); ok(e.every(x => x.ja && x.en && x.pts > 0 && x.col));
});

test('every campaign stage is winnable: the bot clears each of the 45 in at most 3 tries (3 lives each)', () => {
  const lost = [];
  for (let i = 0; i < 45; i++) {
    let won = false;
    for (let t = 1; t <= 3 && !won; t++) { const S = E.newGame({ mode: 'campaign', level: i, seed: t * 101 }); Bot.play(S, { max: 60 * 60 * 6 }); won = S.won; if (won) { ok(S.stars >= 1 && S.stars <= 3); eq(S.phase, 'done'); } }
    if (!won) lost.push(i + 1);
  }
  deep(lost, [], 'stages the bot could not clear');
});

test('the bot plays long classic runs, survival and endless without ever getting stuck; co-op too', () => {
  for (const mode of ['classic', 'survival', 'endless']) {
    const S = E.newGame({ mode, seed: 31 }); const r = Bot.play(S, { max: 60 * 60 * 12 });
    ok(S.wave >= 15, mode + ' reached wave ' + S.wave + ' (' + S.phase + ', ' + r.frames + ' frames)'); ok(S.score > 20000 && S.score <= E.SCORE_CAP);
    ok(S.st.saucers >= 1 && S.st.caps >= 3, 'saucers and capsules happen in ' + mode);
  }
  const C = E.newGame({ mode: 'classic', seed: 8, np: 2 }); Bot.play(C, { max: 60 * 60 * 6 }); ok(C.wave >= 8, 'co-op wave ' + C.wave);
});

test('the daily challenge can be cleared by the bot on a spread of days (six waves, two rules)', () => {
  let cleared = 0, n = 0;
  for (let d = 20261101; d < 20261111; d++) {
    const dl = E.dailyFor(d); n++; let won = false;
    for (let t = 0; t < 3 && !won; t++) { const S = E.newGame({ mode: 'daily', seed: dl.seed + t, mods: dl.mods, rot: dl.rot, dkey: d }); Bot.play(S, { max: 60 * 60 * 10 }); won = S.won; }
    if (won) cleared++;
  }
  ok(cleared >= 8, 'cleared ' + cleared + ' of ' + n);
});

test('every daily rule changes the game it applies to', () => {
  const base = E.newGame({ mode: 'daily', seed: 1, mods: [] });
  for (const m of LV.MODS) { const S = E.newGame({ mode: 'daily', seed: 1, mods: [m.id], rot: 0 }); ok(m.ja && m.en && m.dja && m.den, m.id + ' texts'); const d = JSON.stringify([S.spec.bi, S.spec.fi, S.spec.mb, S.spec.sh, S.spec.allb, S.spec.arm, S.spec.su, S.spec.dv, S.spec.dvAny, S.lives, S.pl[0].hw, S.mods, S.al.map(a => a.hp + '' + a.t).join('')]); ok(d !== JSON.stringify([base.spec.bi, base.spec.fi, base.spec.mb, base.spec.sh, base.spec.allb, base.spec.arm, base.spec.su, base.spec.dv, base.spec.dvAny, base.lives, base.pl[0].hw, base.mods, base.al.map(a => a.hp + '' + a.t).join('')]), 'rule ' + m.id + ' has an effect'); }
});

run('invade-levels');
