// P1-2 の単体テストを、端末のタイムゾーン（TZ）を変えて全部実行する。
// 日本時間の日付（jstDateKey など）が、端末のタイムゾーンと夏時間に左右されないことを確かめる。
// 実行：node tools/tests/unit/run-tz.js [--tz Asia/Tokyo,America/New_York]
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const FILES = ['registry.test.js', 'platform.test.js', 'game.test.js'];
const DEFAULT_TZ = [
  'UTC', 'Asia/Tokyo',                          // 基準と、日本
  'America/New_York', 'America/Los_Angeles',    // 夏時間あり（北米）
  'Europe/London', 'Europe/Berlin',             // 夏時間あり（欧州）
  'Australia/Sydney', 'Australia/Lord_Howe',    // 南半球の夏時間（30分ずれる夏時間も）
  'Pacific/Auckland', 'Pacific/Chatham',        // +12:45 / +13:45
  'Asia/Kolkata', 'Asia/Kathmandu',             // 夏時間なし、30分・45分ずれ
  'Pacific/Kiritimati', 'Pacific/Pago_Pago',    // +14 / −11（日付が日本と最大で2日違う）
  'America/St_Johns', 'Asia/Seoul',             // −3:30（夏時間あり）/ 日本と同じ +9
];
const arg = process.argv.indexOf('--tz');
const zones = arg > 0 ? process.argv[arg + 1].split(',') : DEFAULT_TZ;
let failed = 0, ran = 0;
for (const tz of zones) {
  for (const f of FILES) {
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' });
    ran++;
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status !== 0) { failed++; process.stdout.write(out); }
    else process.stdout.write(out.split('\n').filter(l => /passed/.test(l)).join('\n') + '\n');
  }
}
console.log(`\nunit (P1-2): ${ran - failed}/${ran} runs passed across ${zones.length} time zones`);
process.exitCode = failed ? 1 : 0;
