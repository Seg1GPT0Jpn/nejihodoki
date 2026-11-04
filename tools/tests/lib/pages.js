// ページの一覧。common/games.js（P1-2 のレジストリ）が読めればそこから作り、読めなければ下の一覧を使う。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./server');

const FALLBACK_GAMES = [
  { id: 'neji', three: true }, { id: 'blocks' }, { id: 'drop' }, { id: 'raft', three: true }, { id: 'gates', three: true },
  { id: 'n59049', three: true }, { id: 'water' }, { id: 'parking', three: true }, { id: 'hole', three: true }, { id: 'hitsumabushi' },
];

function fromRegistry() {
  const f = path.join(ROOT, 'common/games.js');
  if (!fs.existsSync(f)) return null;
  try {
    const win = {};
    const sandbox = { window: win, self: win, globalThis: win, console: { log() {}, warn() {}, error() {} }, document: undefined, location: { pathname: '/' } };
    sandbox.window.window = win;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { timeout: 1000 });
    const reg = win.KoboGames || sandbox.KoboGames || win.KOBO_REGISTRY;
    let list = reg && (Array.isArray(reg) ? reg : (reg.list ? (typeof reg.list === 'function' ? reg.list() : reg.list) : reg.games || (reg.all && reg.all())));
    if (!Array.isArray(list) || !list.length) return null;
    list = list.filter(g => g && typeof g.id === 'string');
    const ids = list.map(g => g.id);
    // レジストリが今のゲームを全部含んでいないなら、まだ作りかけとみなして使わない
    if (!FALLBACK_GAMES.every(g => ids.includes(g.id))) return null;
    return list.map(g => {
      const fb = FALLBACK_GAMES.find(x => x.id === g.id) || {};
      const three = g.three != null ? !!g.three : (g.tech ? /three|3d/i.test(String(g.tech)) : !!fb.three);
      return { id: g.id, three };
    });
  } catch (e) { return null; }
}

function games() {
  const reg = fromRegistry();
  const list = reg || FALLBACK_GAMES;
  return list.map(g => ({ id: g.id, path: '/' + g.id + '/', kind: 'game', three: !!g.three, source: reg ? 'registry' : 'fallback' }));
}
function pages() {
  return [{ id: 'hub', path: '/', kind: 'hub' }, { id: 'ranking', path: '/ranking/', kind: 'ranking' }, { id: 'profile', path: '/profile/', kind: 'profile' }, ...games()];
}
function filter(list, spec) {
  if (!spec) return list;
  const want = String(spec).split(',').map(s => s.trim()).filter(Boolean);
  const bad = want.filter(w => !list.some(p => p.id === w));
  if (bad.length) throw new Error('unknown page/game: ' + bad.join(', ') + ' (known: ' + list.map(p => p.id).join(', ') + ')');
  return list.filter(p => want.includes(p.id));
}
module.exports = { pages, games, filter, FALLBACK_GAMES };
