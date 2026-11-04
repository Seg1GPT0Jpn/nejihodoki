// Firebase エミュレーター（Auth・Firestore・Realtime Database）を起動して、リポジトリのルールを読み込ませる。
// firebase-tools はリポジトリに入れない（npm のパッケージを足さない決まり）。次の順で探す：
//   1. 環境変数 FIREBASE_TOOLS（firebase の実行ファイルのパス）
//   2. PATH の firebase
//   3. npx --yes firebase-tools@13（初回はダウンロードする。エミュレーターの jar も初回にダウンロードされる）
// Java 11 以上が必要。プロジェクトは demo-kobo（demo- で始まるので、本物のプロジェクトには一切つながない）。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const PORTS = { auth: 19099, firestore: 18080, database: 19000, ui: 0 };
const RTDB_NS = 'neji-5913a-default-rtdb';
const PROJECT = 'demo-kobo';

function findTools() {
  if (process.env.FIREBASE_TOOLS) return { cmd: process.env.FIREBASE_TOOLS, pre: [] };
  try { execFileSync('which', ['firebase'], { stdio: 'pipe' }); return { cmd: 'firebase', pre: [] }; } catch (e) {}
  return { cmd: 'npx', pre: ['--yes', 'firebase-tools@13'] };
}

async function waitPort(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function loadRules() {
  const rt = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
  let r = await fetch(`http://127.0.0.1:${PORTS.database}/.settings/rules.json?ns=${RTDB_NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rt });
  if (!r.ok) throw new Error('RTDB rules rejected by the emulator: ' + (await r.text()));
  const fsRules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  r = await fetch(`http://127.0.0.1:${PORTS.firestore}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: fsRules }] } }),
  });
  const j = await r.text();
  // エミュレーターは、文法の誤りを issues として返す（警告も含む）
  let o = null; try { o = JSON.parse(j); } catch (e) {}
  const issues = (o && o.issues) || [];
  if (!r.ok || issues.some(i => i.severity === 'ERROR')) throw new Error('Firestore rules rejected by the emulator: ' + j);
  return { firestoreIssues: issues };
}

async function clearData() {
  await fetch(`http://127.0.0.1:${PORTS.database}/.json?ns=${RTDB_NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: 'null' });
  await fetch(`http://127.0.0.1:${PORTS.firestore}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

async function start(opt = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kobo-rules-'));
  const H = '127.0.0.1';
  const cfg = { emulators: { auth: { host: H, port: PORTS.auth }, firestore: { host: H, port: PORTS.firestore, websocketPort: 19150 }, database: { host: H, port: PORTS.database },
    hub: { host: H, port: 14400 }, logging: { host: H, port: 14500 }, ui: { enabled: false }, singleProjectMode: true } };
  fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify(cfg));
  const t = findTools();
  const args = t.pre.concat(['emulators:start', '--only', 'auth,firestore,database', '--project', PROJECT, '--config', path.join(dir, 'firebase.json')]);
  const proc = spawn(t.cmd, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  proc.stdout.on('data', d => { log += d; if (opt.verbose) process.stdout.write(d); });
  proc.stderr.on('data', d => { log += d; if (opt.verbose) process.stderr.write(d); });
  const ok = (await waitPort(`http://127.0.0.1:${PORTS.database}/.json?ns=${RTDB_NS}`, 120000))
    && (await waitPort(`http://127.0.0.1:${PORTS.firestore}/`, 60000))
    && (await waitPort(`http://127.0.0.1:${PORTS.auth}/`, 60000));
  const exited = new Promise(r => proc.on('exit', r));
  const stop = async () => {
    try { process.kill(-proc.pid, 'SIGINT'); } catch (e) {}
    await Promise.race([exited, new Promise(r => setTimeout(r, 15000))]);
    try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  };
  if (!ok) { await stop(); throw new Error('emulators did not start (' + t.cmd + ' ' + args.join(' ') + ')\n' + log.slice(-2000)); }
  await loadRules();
  return { ports: PORTS, ns: RTDB_NS, project: PROJECT, stop, loadRules, clearData };
}

module.exports = { start, PORTS, RTDB_NS, PROJECT };
