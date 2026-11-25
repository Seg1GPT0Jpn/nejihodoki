#!/usr/bin/env node
// 全ステージを解いて、par（押す回数の最小・歩数の最小）を出す／書き直す開発用の道具。
//   node crates/pars.js            … 一覧を出す（解けない・上限に当たったものも）
//   node crates/pars.js --write    … levels.js の par:[…] を書き直す（全部解けたときだけ）
//   node crates/pars.js 5-3 7-1    … 指定のステージだけ
'use strict';
const fs = require('fs'), path = require('path');
const E = require('./engine.js'), LV = require('./levels.js');
const args = process.argv.slice(2), write = args.includes('--write'), ids = args.filter(a => !a.startsWith('--'));
const out = []; let bad = 0;
for (const l of LV.ALL) {
  if (ids.length && !ids.includes(l.id)) continue;
  let L; try { L = E.parse(l.rows); } catch (e) { console.log(l.id, 'PARSE', e.message); bad++; out.push(l.par); continue; }
  const t0 = Date.now();
  const a = E.solve(L, L.start, { mode: 'pushes', maxNodes: 600000 });
  let b = null;
  if (a.status === 'solved') b = E.solve(L, L.start, { mode: 'moves', maxNodes: 1500000 });
  const ms = Date.now() - t0;
  if (a.status !== 'solved' || b.status !== 'solved') { console.log(l.id, a.status, b && b.status, 'nodes', a.nodes, ms + 'ms'); bad++; out.push(l.par); continue; }
  console.log(l.id, 'size', L.W + 'x' + L.H, 'boxes', L.nb, 'pushes', a.pushes, 'moves', b.moves, '(pushes of move-opt', b.pushes + ')', 'nodes', a.nodes + '/' + b.nodes, ms + 'ms');
  out.push([a.pushes, b.moves]);
}
if (write) {
  if (bad || ids.length) { console.log('not writing (some levels failed or a subset was given)'); process.exit(1); }
  const f = path.join(__dirname, 'levels.js'); let s = fs.readFileSync(f, 'utf8'), i = 0;
  s = s.replace(/par: \[[^\]]*\]/g, () => 'par: [' + out[i++].join(', ') + ']');
  fs.writeFileSync(f, s); console.log('wrote', i, 'pars');
}
process.exit(bad ? 1 : 0);
