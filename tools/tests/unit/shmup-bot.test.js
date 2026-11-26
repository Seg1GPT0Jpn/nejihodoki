// ペーパーウイングのボット（shmup/bot.js）が、「やさしい」でステージ1をクリアできることを示す（＝ちゃんとクリアできる難しさだという証拠）。
// 弾を先読みして一番安全な動きを選ぶだけのボット。入力は人と同じビットだけ（敵の乱数の先は見ない）。
// 実行：node tools/tests/unit/shmup-bot.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'shmup/engine.js'));
const Bot = require(path.join(ROOT, 'shmup/bot.js'));

function play(opts, maxFrames) {
  const S = E.newGame(opts), bot = Bot.make(), inputs = [];
  while (S.phase !== 'done' && S.frame < maxFrames) {
    if (S.over && S.conts >= S.maxConts) break;
    const i = bot(S); E.step(S, i); inputs.push(i & 255); S.ev.length = 0;
  }
  return { S, inputs };
}

test('the bot clears stage 1 on Easy (every ship, several seeds) without using a continue, and is far from perfect-score-only', () => {
  for (const ship of [0, 1, 2]) for (const seed of [1, 2, 3]) {
    const { S } = play({ mode: 'practice', stage: 0, diff: 0, ship, seed }, 20000);
    eq(S.phase, 'done', 'ship ' + ship + ' seed ' + seed + ' reached the end'); ok(S.cleared); eq(S.conts, 0, 'no continue'); ok(S.lives >= 1, 'alive'); ok(S.st.bosses & 1, 'the stage-1 boss is down'); ok(S.score > 100000, 'score ' + S.score);
  }
});

test('the whole Arcade run on Easy can be cleared by the bot (7 stages, 7 bosses); assisted runs too', () => {
  const { S } = play({ mode: 'arcade', diff: 0, ship: 0, seed: 11 }, 90000);
  eq(S.phase, 'done'); ok(S.cleared); eq(S.st.stages, 7); eq(S.st.bosses, 127); ok(S.score > 1000000, 'score ' + S.score);
  const B = play({ mode: 'arcade', diff: 0, ship: 2, seed: 4, assist: 2 }, 90000).S; eq(B.phase, 'done', 'with auto-bomb'); eq(B.st.bosses, 127);
});

test('the bot also gets through Normal stage 1 and the Boss Rush start, and every run it plays replays exactly', () => {
  const r = play({ mode: 'practice', stage: 0, diff: 1, ship: 1, seed: 9 }, 20000); eq(r.S.phase, 'done');
  const o = { mode: 'practice', stage: 0, diff: 1, ship: 1, seed: 9 }; const rec = E.replay.make(o, r.inputs, { score: r.S.score });
  eq(E.hash(E.replay.run(E.replay.decode(E.replay.encode(rec)))), E.hash(r.S), 'the recorded run replays to the same state');
  const rush = play({ mode: 'rush', diff: 0, ship: 0, seed: 2 }, 40000); eq(rush.S.phase, 'done'); eq(rush.S.st.bosses, 127);
});

test('difficulty is real: Ghost throws more and faster bullets than Easy at the same moment in stage 1', () => {
  const peak = diff => { const S = E.newGame({ mode: 'practice', stage: 2, diff, seed: 3 }); const bot = Bot.make(); let m = 0; for (let i = 0; i < 2500 && S.phase !== 'over'; i++) { E.step(S, bot(S)); S.ev.length = 0; m = Math.max(m, E.count(S.bul)); } return m; };
  const e = peak(0), g = peak(3); ok(g > e * 1.5, 'peak bullets easy ' + e + ' vs ghost ' + g);
});

run('shmup-bot');
