#!/usr/bin/env node
// ルールのテスト（P1-4）。リポジトリの一番上で：
//
//   node tools/tests/rules/run.js                 エミュレーターで、リポジトリの firestore.rules と database.rules.json を確かめる
//                                                 （REST の許可・拒否のテスト ＋ 本物のクライアントを2人で動かすテスト）
//   node tools/tests/rules/run.js --live          本番（neji-5913a）に、公開されているルールのまま同じテストを流す
//                                                 （匿名アカウントを作る。作った行と部屋は最後に消す）
//   オプション：--only rest|clients|spec（カンマで複数）  --verbose  --record（クライアントの書き込みの一覧を recorded-writes.<target>.json に書く）
//
// エミュレーターには firebase-tools と Java が要る（emulator.js の先頭を参照。FIREBASE_TOOLS=<firebase のパス> で指定できる）。
// 本番のテストで「拒否のはずが許可」になるのは、新しいルールを貼り付ける前なら正常（今のルールの穴の一覧になる）。
// 結果：tools/tests/rules/out/<target>.json と画面の表。1つでも不合格があると終了コードは 1。
'use strict';
const fs = require('fs');
const path = require('path');
const { LIVE, emulatorTarget } = require('./rest');
const { runCases } = require('./cases');
const { checkSpec } = require('./spec');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const only = (val('--only') || 'spec,rest,clients').split(',');
const verbose = has('--verbose');
const OUT = path.join(__dirname, 'out');

function log(row) {
  if (!row.expect) { console.log('  … ' + row.name); return; }
  if (!row.pass || verbose) console.log(`  ${row.pass ? 'ok  ' : 'FAIL'} [${row.group}] ${row.name} — expect ${row.expect}, got ${row.got}${row.status ? ' (' + row.status + ')' : ''}${row.detail && !row.pass ? '\n       ' + row.detail : ''}`);
}

(async () => {
  const live = has('--live');
  let emu = null, T;
  const rows = [];
  const report = { target: live ? 'live' : 'emulator', at: new Date().toISOString(), rows, clients: [] };
  try {
    if (only.includes('spec')) { console.log('spec (rules ⇔ common/games.js)'); for (const r of checkSpec()) { rows.push(r); log(r); } }
    if (live) T = LIVE;
    else if (only.includes('rest') || only.includes('clients')) {
      console.log('starting the Firebase emulators…');
      emu = await require('./emulator').start({ verbose });
      T = Object.assign(emulatorTarget(emu.ports), { emu: true, ports: emu.ports, ns: emu.ns });
    }
    if (only.includes('rest')) {
      console.log(`REST allow/deny (${T.name})`);
      for (const r of await runCases(T, { log, verbose })) rows.push(r);
    }
    if (only.includes('clients')) {
      console.log(`clients: 2-player runs of common/versus.js (blocks), hole online and shogi online (${T.name})`);
      const { runClients } = require('./clients');
      if (emu) await emu.clearData();
      const runs = await runClients(T, { log });
      for (const run of runs) {
        for (const r of run.rows) { rows.push(r); log(r); }
        report.clients.push({ client: run.client, info: run.info, inventory: run.inventory, error: run.error });
        if (run.inventory && verbose) for (const i of run.inventory) console.log(`     ${i.op.padEnd(20)} ${i.path.padEnd(42)} ${i.keys.padEnd(40)} x${i.n} ${JSON.stringify(i.res)}`);
      }
      if (has('--record')) {
        const f = path.join(__dirname, `recorded-writes.${T.name}.json`);
        fs.writeFileSync(f, JSON.stringify(runs.map(r => ({ client: r.client, recordedAt: report.at, target: T.name, inventory: r.inventory })), null, 1) + '\n');
        console.log('wrote ' + path.relative(process.cwd(), f));
      }
    }
  } catch (e) {
    rows.push({ group: 'run', name: 'test run', expect: 'finished', got: 'crashed', pass: false, detail: String(e && e.stack || e) });
    console.error(e);
  } finally {
    if (emu) await emu.stop();
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, report.target + '.json'), JSON.stringify(report, null, 1));
  const groups = {};
  for (const r of rows) { const g = groups[r.group] || (groups[r.group] = { pass: 0, fail: 0 }); r.pass ? g.pass++ : g.fail++; }
  console.log('\n' + report.target + ':');
  for (const [g, c] of Object.entries(groups)) console.log(`  ${g.padEnd(18)} pass ${String(c.pass).padStart(3)}  fail ${c.fail}`);
  const fail = rows.filter(r => !r.pass).length;
  console.log(`total: pass ${rows.length - fail}, fail ${fail}`);
  process.exit(fail ? 1 : 0);
})();
