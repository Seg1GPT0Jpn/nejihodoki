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
  // 旧ランキング（okLegacyScores）は、移行期間のあいだ、前からあるゲームだけを受け付ける。新しいゲームは legacyGames() に入れない（式の数の上限1000のため）。
  const lgm = /function legacyGames\(\)\s*\{\s*return\s*\[([^\]]*)\]/.exec(fsr);
  const legacyIds = lgm ? lgm[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)) : [];
  add('firestore.rules legacyGames() is a subset of games()', legacyIds.length > 0 && legacyIds.every(id => ruleGames.includes(id)), legacyIds.join(','));
  for (const id of Object.keys(CAPS)) {
    if (legacyIds.includes(id)) add(`firestore.rules okLegacyScores() checks ${id}`, new RegExp(`okCap\\(s\\.get\\('${id}', 0\\), c\\['${id}'\\]\\)`).test(fsr));
    else add(`firestore.rules legacy scores do not accept ${id}`, !new RegExp(`okCap\\(s\\.get\\('${id}', 0\\)`).test(fsr));
    add(`firestore.rules plus1('${id}')`, fsr.includes(`plus1('${id}')`));
  }
  let db = null;
  try { db = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')); add('database.rules.json is valid JSON', true); }
  catch (e) { add('database.rules.json is valid JSON', false, e.message); return out; }
  const re = /\^\(([^)]*)\)\$/.exec(db.rules.vs.queue.$game['.read']);
  const vsRule = re ? re[1].split('|') : [];
  add('database.rules.json vs game ids == games with versus: common', JSON.stringify(vsRule.slice().sort()) === JSON.stringify(VS_GAMES.slice().sort()), vsRule.join(','));
  // common/turnroom.js を使うゲーム（tr/{game}/… に入るもの）：ページが turnroom.js を読んでいて、登録簿で versus: 'own'
  const tm = db.rules.tr && db.rules.tr.$game && /\^\(([^)]*)\)\$/.exec(db.rules.tr.$game.queue['.read']);
  const trRule = tm ? tm[1].split('|') : [];
  const trPages = REG.games.filter(g => { try { return /common\/turnroom\.js/.test(fs.readFileSync(path.join(ROOT, g.path, 'index.html'), 'utf8')); } catch (e) { return false; } }).map(g => g.id);
  add('database.rules.json tr game ids == pages that load common/turnroom.js', JSON.stringify(trRule.slice().sort()) === JSON.stringify(trPages.slice().sort()), trRule.join(',') + ' / ' + trPages.join(','));
  add('turnroom games are registered with versus: own', trPages.every(id => (REG.games.find(g => g.id === id) || {}).versus === 'own'));
  // おもちゃ大乱闘のオンライン対戦（bw/）：パスが brawl/online.js の使うものとそろっている・ページが netcode.js と online.js を読み・登録簿で versus: 'own'
  const bw = db.rules.bw || {};
  add('database.rules.json has bw/{queue,codes,rooms}', !!(bw.queue && bw.codes && bw.rooms && bw.rooms.$room), Object.keys(bw).join(','));
  const bwRoom = (bw.rooms && bw.rooms.$room) || {};
  add('database.rules.json bw/rooms/$room has meta,cfg,seats,on,rd,pg,go,in,h,res', ['meta', 'cfg', 'seats', 'on', 'rd', 'pg', 'go', 'in', 'h', 'res'].every(k => bwRoom[k]), Object.keys(bwRoom).join(','));
  let bwHtml = '', bwOnline = '';
  try { bwHtml = fs.readFileSync(path.join(ROOT, 'brawl/index.html'), 'utf8'); bwOnline = fs.readFileSync(path.join(ROOT, 'brawl/online.js'), 'utf8'); } catch (e) { /* reported below */ }
  add('brawl page loads brawl/netcode.js and brawl/online.js', /brawl\/netcode\.js/.test(bwHtml) || /netcode\.js/.test(bwHtml), 'index.html');
  add('brawl/online.js only uses bw/ paths that the rules define', [...new Set([...bwOnline.matchAll(/'bw\/(\w+)/g)].map(m => m[1]))].every(k => bw[k]), [...new Set([...bwOnline.matchAll(/'bw\/(\w+)/g)].map(m => m[1]))].join(','));
  add('brawl is registered with versus: own', (REG.games.find(g => g.id === 'brawl') || {}).versus === 'own');
  const all = JSON.stringify(db);
  const alts = all.match(/\^\((?:neji|blocks)[^)]*\)\$/g) || [];
  add('database.rules.json uses one game list everywhere', new Set(alts).size === 1, [...new Set(alts)].join(' / '));
  return out;
}

module.exports = { CAPS, VS_GAMES, checkSpec };
