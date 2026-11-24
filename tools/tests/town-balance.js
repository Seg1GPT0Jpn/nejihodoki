#!/usr/bin/env node
// ひまつぶしタウンの経済のバランス：ボットが「いちばん得な買いもの」を選んで遊び、目標・ひらきなおしの時間を出す。
//   node tools/tests/town-balance.js [分（既定 240）] [idle]    … idle は旅人にさわらない遊び方
'use strict';
const T = require('../../town/engine');
const Bot = require('./lib/town-bot');
const min = +process.argv[2] || 240, idle = process.argv[3] === 'idle';
const S = T.newState(1.8e12, 1);
const tl = Bot.play(S, 1.8e12, { minutes: min, auto: true, taps: !idle, log: 600 });
console.log('goals (s):', tl.quests.map(q => q.id + '@' + Math.round(q.t)).join(' '));
console.log('new towns (min):', tl.prestiges.map(p => `#${p.from + 1} at ${Math.round(p.t / 60)} (pop ${p.pop}, renown +${p.gain})`).join('; ') || 'none');
console.log('best population', S.best, 'tier', S.tier, 'renown', S.renown);
