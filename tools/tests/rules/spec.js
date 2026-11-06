// ルールの中の「ゲームの一覧」と「上限」が、登録簿（common/games.js）と同じかを確かめる（ネットなし）。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const REG = require(path.join(ROOT, 'common/games.js'));
const CAPS = {};
for (const g of REG.games) CAPS[g.id] = g.score.cap;
// common/versus.js を使うゲーム（vs/queue/{game} に入るもの）
const VS_GAMES = REG.games.filter(g => g.versus === 'common').map(g => g.id);

function checkSpec() {
  const out = [];
  const add = (name, pass, detail) => out.push({ group: 'spec', name, expect: 'match', got: pass ? 'match' : 'differ', pass, detail });
  const fsr = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const gm = /function games\(\)\s*\{\s*return\s*\[([^\]]*)\]/.exec(fsr);
  const ruleGames = gm ? gm[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)) : [];
  add('firestore.rules games() == registry ids', JSON.stringify(ruleGames.slice().sort()) === JSON.stringify(Object.keys(CAPS).sort()), ruleGames.join(','));
  const cm = /function caps\(\)\s*\{\s*return\s*\{([^}]*)\}/.exec(fsr);
  const ruleCaps = {};
  if (cm) for (const m of cm[1].matchAll(/'([^']+)':\s*(\d+)/g)) ruleCaps[m[1]] = +m[2];
  add('firestore.rules caps() == registry score.cap', JSON.stringify(ruleCaps) === JSON.stringify(Object.fromEntries(Object.keys(ruleCaps).map(k => [k, CAPS[k]]))) && Object.keys(ruleCaps).length === Object.keys(CAPS).length, JSON.stringify(ruleCaps));
  for (const id of Object.keys(CAPS)) {
    add(`firestore.rules okLegacyScores() checks ${id}`, new RegExp(`okCap\\(s\\.get\\('${id}', 0\\), c\\['${id}'\\]\\)`).test(fsr));
    add(`firestore.rules plus1('${id}')`, fsr.includes(`plus1('${id}')`));
  }
  let db = null;
  try { db = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')); add('database.rules.json is valid JSON', true); }
  catch (e) { add('database.rules.json is valid JSON', false, e.message); return out; }
  const re = /\^\(([^)]*)\)\$/.exec(db.rules.vs.queue.$game['.read']);
  const vsRule = re ? re[1].split('|') : [];
  add('database.rules.json vs game ids == games with versus: common', JSON.stringify(vsRule.slice().sort()) === JSON.stringify(VS_GAMES.slice().sort()), vsRule.join(','));
  const all = JSON.stringify(db);
  const alts = all.match(/\^\((?:neji|blocks)[^)]*\)\$/g) || [];
  add('database.rules.json uses one game list everywhere', new Set(alts).size === 1, [...new Set(alts)].join(' / '));
  return out;
}

module.exports = { CAPS, VS_GAMES, checkSpec };
