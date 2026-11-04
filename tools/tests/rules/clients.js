// 本物のクライアント（common/versus.js と hole/index.html）を2人で動かし、RTDB への書き込みを全部記録する。
// 本番（--live）でも、エミュレーター（新しいルール）でも同じ手順で動かす。
//   エミュレーター：firebase-config.js の databaseURL をエミュレーターに差し替え、Auth の通信をエミュレーターへ回す。
// 記録：firebase-database-compat.js の後ろに、Reference の set / update / push / remove / transaction / onDisconnect を
//       包むコードを足す（ゲームのコードは変えない）。書き込みごとに、パス・中身・だれが・結果（ok / error / aborted）。
'use strict';
const { chromium } = require('playwright');
const server = require('../lib/server');

const SDK_RE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/firebase@10\.12\.2\/firebase-database-compat\.js/;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const RECORDER = `
;(function () {
  try {
    var R = firebase.database.Reference.prototype;
    if (R.__rulesRec) return; R.__rulesRec = 1;
    var log = window.__rulesLog = window.__rulesLog || [];
    var uidOf = function (ref) { try { return ref.database.app.auth().currentUser.uid; } catch (e) { return null; } };
    var pathOf = function (ref) { try { return decodeURIComponent(new URL(ref.toString()).pathname).replace(/^\\//, ''); } catch (e) { return '?'; } };
    var clone = function (v) { try { return v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch (e) { return '?'; } };
    var rec = function (op, ref, val, p) {
      var e = { op: op, path: pathOf(ref), uid: uidOf(ref), val: clone(val), at: Date.now(), res: 'pending' };
      log.push(e);
      if (p && typeof p.then === 'function') p.then(function () { if (e.res === 'pending') e.res = 'ok'; }, function (err) { e.res = 'error'; e.err = String(err && (err.code || err.message)); });
      return e;
    };
    ['set', 'update', 'remove'].forEach(function (m) {
      var o = R[m];
      R[m] = function () { var p = o.apply(this, arguments); rec(m, this, arguments[0], p); return p; };
    });
    var oPush = R.push;
    R.push = function (v) { var r = oPush.apply(this, arguments); if (arguments.length && v !== undefined) rec('push', r, v, r); return r; };
    var oT = R.transaction;
    R.transaction = function (fn, cb, local) {
      var e = rec('transaction', this, null, null), ref = this;
      var wrap = function (cur) { var v = fn(cur); e.val = clone(v); return v; };
      return oT.call(ref, wrap, function (err, ok, snap) {
        e.res = err ? 'error' : ok ? 'ok' : 'aborted'; if (err) e.err = String(err.code || err.message || err);
        if (cb) return cb(err, ok, snap);
      }, local);
    };
    var oD = R.onDisconnect;
    R.onDisconnect = function () {
      var od = oD.apply(this, arguments), ref = this;
      ['set', 'update', 'remove', 'cancel'].forEach(function (m) {
        var f = od[m]; if (!f) return;
        od[m] = function () { var p = f.apply(od, arguments); rec('onDisconnect.' + m, ref, arguments[0], p); return p; };
      });
      return od;
    };
  } catch (e) { console.warn('rules recorder', e); }
})();
`;

async function newPage(browser, env, T, nick, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 375, height: 667 }, locale: 'ja-JP', serviceWorkers: 'block' });
  const errs = [];
  await ctx.addInitScript(n => { try { localStorage.setItem('kobo.nick', n); } catch (e) {} }, nick);
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (SDK_RE.test(url)) {
      const r = await route.fetch();
      return route.fulfill({ response: r, body: (await r.text()) + RECORDER });
    }
    if (T.emu) {
      if (url.startsWith(env.url + '/firebase-config.js')) {
        return route.fulfill({ status: 200, contentType: 'text/javascript', body:
          `window.NEJI_FIREBASE = { apiKey: 'fake-api-key', authDomain: 'demo-kobo.firebaseapp.com', projectId: 'demo-kobo', ` +
          `databaseURL: 'http://127.0.0.1:${T.ports.database}/?ns=${T.ns}', appId: '1:1:web:1' };` });
      }
      const m = /^https:\/\/(identitytoolkit|securetoken)\.googleapis\.com\/(.*)$/.exec(url);
      if (m) {
        const req = route.request();
        const r = await fetch(`http://127.0.0.1:${T.ports.auth}/${m[1]}.googleapis.com/${m[2]}`, { method: req.method(), headers: { 'Content-Type': req.headers()['content-type'] || 'application/json' }, body: req.postData() || undefined });
        const body = Buffer.from(await r.arrayBuffer());
        return route.fulfill({ status: r.status, body, headers: { 'Content-Type': r.headers.get('content-type') || 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || /permission|PERMISSION/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
  page.errs = errs; page.ctx = ctx;
  return page;
}
const getLog = p => p.evaluate(() => (window.__rulesLog || []).slice());

// ---------------------------------------------------------------- versus.js（blocks）：2人で1試合 + 1人で並んでやめる
async function runVersus(browser, env, T, opt = {}) {
  const url = `${env.url}/blocks/index.html?debug&vsdur=${opt.dur || 10}`;
  const P = [await newPage(browser, env, T, 'ルールA'), await newPage(browser, env, T, 'RulesB')];
  for (const p of P) { await p.goto(url); }
  await sleep(1500);
  const info = { steps: [] };
  for (let i = 0; i < P.length; i++) {
    await P[i].click('#vsSlot .kvs-entry');
    await P[i].waitForFunction(() => window.__koboVs && __koboVs.state.phase === 'queue', null, { timeout: 30000 });
    await sleep(800);
  }
  for (const p of P) await p.waitForFunction(() => ['countdown', 'play'].includes(__koboVs.state.phase), null, { timeout: 60000 });
  const st = await Promise.all(P.map(p => p.evaluate(() => ({ uid: __koboVs.state.uid, rid: __koboVs.state.rid, seed: __koboVs.state.seed, pl: __koboVs.state.pl }))));
  info.uids = st.map(s => s.uid); info.room = st[0].rid;
  info.steps.push(['match formed, same room', st[0].rid && st[0].rid === st[1].rid]);
  info.steps.push(['same seed', st[0].seed === st[1].seed]);
  for (const p of P) await p.waitForFunction(() => __koboVs.state.phase === 'result', null, { timeout: 90000 });
  const res = await Promise.all(P.map(p => p.evaluate(() => [...document.querySelectorAll('.kvs-res li')].length)));
  info.steps.push(['both see a result with 2 rows', res.every(n => n === 2)]);
  await sleep(9000); // the deciding player removes the room 6 s after the result
  // the second page waits alone in the queue and cancels (queue remove, onDisconnect cancel)
  await P[1].evaluate(() => KoboVersus.close());
  await sleep(300);
  await P[1].click('#vsSlot .kvs-entry').catch(() => {});
  await P[1].waitForFunction(() => __koboVs.state.phase === 'queue', null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await P[1].evaluate(() => KoboVersus.close());
  await sleep(1500);
  const logs = await Promise.all(P.map(getLog));
  info.errors = P.flatMap((p, i) => p.errs.map(e => 'P' + i + ' ' + e));
  for (const p of P) await p.ctx.close();
  return { client: 'versus', info, ops: normalize(logs, info.uids, 'vs/rooms/') };
}

// ---------------------------------------------------------------- hole：2人＋CPU 2つで1ラウンド。物の取り合いと、のみこみ（人と CPU）
async function runHole(browser, env, T, opt = {}) {
  const url = `${env.url}/hole/index.html?debug&olen=${opt.len || 30}`;
  const P = [await newPage(browser, env, T, 'Aoi'), await newPage(browser, env, T, 'Ben')];
  for (const p of P) await p.goto(url);
  await sleep(2500);
  const info = { steps: [] };
  for (const p of P) { await p.click('#btnOnline'); await sleep(700); }
  for (const p of P) await p.waitForFunction(() => __hole.net.phase === 'play', null, { timeout: 60000 });
  const st = await Promise.all(P.map(p => p.evaluate(() => ({ uid: __hole.net.uid, rid: __hole.net.rid, host: __hole.net.host, seats: __hole.holes.filter(h => h.inMatch).length }))));
  info.uids = st.map(s => s.uid); info.room = st[0].rid;
  info.steps.push(['same room', st[0].rid === st[1].rid]);
  info.steps.push(['4 seats (2 players + 2 CPU)', st.every(s => s.seats === 4)]);
  const H = st.findIndex(s => s.host), G = 1 - H;
  info.steps.push(['exactly one host', H >= 0 && !st[G].host]);
  // wait for the start (3.5 s) and the spawn protection (2.5 s)
  await sleep(7000);
  for (const p of P) await p.evaluate(() => __hole.bot(true));
  await sleep(4000);
  // the guest's hole is swallowed by the (much bigger) host hole: the guest reports k { v: guest }
  await P[H].evaluate(() => { __hole.aiOff(true); __hole.setPts(__hole.player, 4000); });
  await sleep(1500);
  const hp = await P[H].evaluate(() => [__hole.player.x, __hole.player.z]);
  await P[G].evaluate(([x, z]) => { __hole.G.bot = false; __hole.teleport(__hole.player, x, z); }, hp);
  await sleep(2500);
  // a CPU hole (run by the host) is swallowed by the guest: the host reports k { v: 'b1' }
  await sleep(3500); // guest respawn + protection
  await P[G].evaluate(() => __hole.setPts(__hole.player, 9000));
  await sleep(1500);
  const gp = await P[H].evaluate(() => { const h = __hole.holes.find(o => o.inMatch && o.nid !== __hole.net.uid && !o.isBot); return [h.x, h.z]; });
  await P[H].evaluate(([x, z]) => { const b = __hole.holes.find(o => o.inMatch && o.isBot && o.alive); if (b) { b.inv = 0; __hole.teleport(b, x, z); } }, gp);
  await sleep(2500);
  await P[H].evaluate(() => __hole.aiOff(false));
  for (const p of P) await p.waitForFunction(() => !document.getElementById('ovResult').hidden, null, { timeout: 90000 });
  info.steps.push(['both see the result', true]);
  await sleep(9000); // host removes the room 6 s after the result
  // guest goes back to the queue and cancels
  await P[G].click('#btnOnline').catch(() => {});
  await P[G].waitForFunction(() => __hole.net.phase === 'queue', null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await P[G].click('#onCancel').catch(() => {});
  await sleep(1500);
  const logs = await Promise.all(P.map(getLog));
  info.errors = P.flatMap((p, i) => p.errs.map(e => 'P' + i + ' ' + e));
  info.host = H;
  for (const p of P) await p.ctx.close();
  return { client: 'hole', info, ops: normalize(logs, info.uids, 'hole/rooms/') };
}

// パスの uid を A/B、部屋の ID を $room、物の番号を $gi、push の ID を $kid に置き換える
function normalize(logs, uids, roomPrefix) {
  const role = u => { const i = uids.indexOf(u); return i < 0 ? (u ? 'other' : '?') : 'AB'[i]; };
  const rooms = new Map();
  const out = [];
  logs.forEach((log, pi) => log.forEach(e => {
    let p = e.path;
    uids.forEach((u, i) => { if (u) p = p.split(u).join('{' + 'AB'[i] + '}'); });
    if (p.startsWith(roomPrefix)) {
      const id = p.slice(roomPrefix.length).split('/')[0];
      if (!rooms.has(id)) rooms.set(id, '$room' + (rooms.size ? rooms.size + 1 : ''));
      p = roomPrefix + rooms.get(id) + p.slice(roomPrefix.length + id.length);
    }
    p = p.replace(/\/o\/\d+$/, '/o/$gi').replace(/\/k\/-[A-Za-z0-9_-]+$/, '/k/$kid');
    const keys = e.val && typeof e.val === 'object' ? Object.keys(e.val).map(k => { let x = k; uids.forEach((u, i) => { if (u) x = x.split(u).join('{' + 'AB'[i] + '}'); }); return x; }).sort() : null;
    out.push({ page: 'AB'[pi], by: role(e.uid), op: e.op, path: p, keys, res: e.res, err: e.err || undefined, val: e.val });
  }));
  return out;
}

// 同じ種類（だれが・操作・パス・キー）をまとめる
function inventory(ops) {
  const m = new Map();
  for (const o of ops) {
    const by = o.by;
    const path = o.path.replace(/\{A\}|\{B\}/g, s => (s === '{' + by + '}' ? '{me}' : '{other}'));
    const keys = o.keys ? o.keys.map(k => k.replace(/\{A\}|\{B\}/g, s => (s === '{' + by + '}' ? '{me}' : '{other}'))).join(',') : '';
    const k = [o.op, path, keys].join(' | ');
    const r = m.get(k) || { op: o.op, path, keys, n: 0, res: {} };
    r.n++; r.res[o.res] = (r.res[o.res] || 0) + 1;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => (a.path + a.op).localeCompare(b.path + b.op));
}

// これが全部出てくること（クライアントの書き込みの種類の一覧。docs と照らし合わせたもの）
const REQUIRED = {
  versus: [
    'onDisconnect.remove vs/queue/blocks/{me}', 'set vs/queue/blocks/{me}', 'update vs/queue/blocks/{me}', 'remove vs/queue/blocks/{me}',
    'set vs/rooms/$room', 'onDisconnect.remove vs/rooms/$room/m/{me}', 'set vs/rooms/$room/m/{me}', 'set vs/rooms/$room/go',
    'set vs/rooms/$room/s/{me}', 'update vs/rooms/$room', 'set vs/rooms/$room/res', 'remove vs/rooms/$room', 'remove vs/rooms/$room/m/{me}',
  ],
  hole: [
    'onDisconnect.remove hole/queue/{me}', 'set hole/queue/{me}', 'update hole/queue/{me}', 'remove hole/queue/{me}',
    'set hole/rooms/$room', 'onDisconnect.remove hole/rooms/$room/m/{me}', 'onDisconnect.remove hole/rooms/$room/p/{me}', 'set hole/rooms/$room/m/{me}',
    'set hole/rooms/$room/g', 'update hole/rooms/$room/p', 'transaction hole/rooms/$room/o/$gi', 'push hole/rooms/$room/k/$kid',
    'remove hole/rooms/$room/m/{me}', 'remove hole/rooms/$room/p/{me}', 'remove hole/rooms/$room',
  ],
};

function judge(run) {
  const inv = inventory(run.ops);
  const seen = new Set(inv.map(r => r.op + ' ' + r.path));
  const rows = [];
  for (const s of run.info.steps) rows.push({ group: 'client:' + run.client, name: s[0], expect: 'true', got: String(!!s[1]), pass: !!s[1] });
  for (const k of REQUIRED[run.client]) rows.push({ group: 'client:' + run.client, name: 'write seen: ' + k, expect: 'seen', got: seen.has(k) ? 'seen' : 'missing', pass: seen.has(k) });
  // p update must include CPU holes (b1/b2) written by the host
  const botWrite = run.client !== 'hole' || run.ops.some(o => o.op === 'update' && /\/p$/.test(o.path) && (o.keys || []).some(k => /^b\d$/.test(k)) && o.res === 'ok');
  if (run.client === 'hole') {
    rows.push({ group: 'client:hole', name: 'host wrote CPU holes (p/b1, p/b2) and was allowed', expect: 'true', got: String(botWrite), pass: botWrite });
    const kills = run.ops.filter(o => o.op === 'push' && /\/k\//.test(o.path));
    const kSelf = kills.some(o => o.res === 'ok' && o.val && o.val.v === run.info.uids['AB'.indexOf(o.by)]);
    const kBot = kills.some(o => o.res === 'ok' && o.val && /^b\d$/.test(o.val.v));
    rows.push({ group: 'client:hole', name: 'kill event: a player reports own death (k { v: me })', expect: 'true', got: String(kSelf), pass: kSelf });
    rows.push({ group: 'client:hole', name: 'kill event: the host reports a CPU hole\'s death (k { v: b1 })', expect: 'true', got: String(kBot), pass: kBot });
  }
  const bad = run.ops.filter(o => o.res === 'error');
  rows.push({ group: 'client:' + run.client, name: 'no write was refused', expect: '0', got: String(bad.length), pass: bad.length === 0, detail: bad.slice(0, 5).map(o => o.op + ' ' + o.path + ' ' + o.err).join(' / ') });
  const pend = run.ops.filter(o => o.res === 'pending' && !o.op.startsWith('onDisconnect'));
  rows.push({ group: 'client:' + run.client, name: 'no write left unanswered', expect: '0', got: String(pend.length), pass: pend.length === 0, detail: pend.slice(0, 5).map(o => o.op + ' ' + o.path).join(' / ') });
  const perr = run.info.errors.filter(e => /permission|PERMISSION|pageerror/.test(e));
  rows.push({ group: 'client:' + run.client, name: 'no page errors / permission errors in the console', expect: '0', got: String(perr.length), pass: perr.length === 0, detail: perr.slice(0, 5).join(' / ') });
  return { rows, inventory: inv };
}

async function runClients(T, opt = {}) {
  const env = await server.start();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = [];
  try {
    for (const which of opt.only || ['versus', 'hole']) {
      if (opt.log) opt.log({ group: 'client', name: 'running ' + which + ' (2 players, ' + T.name + ')…' });
      let run;
      try { run = which === 'versus' ? await runVersus(browser, env, T, opt) : await runHole(browser, env, T, opt); }
      catch (e) { out.push({ client: which, error: String(e && e.stack || e), rows: [{ group: 'client:' + which, name: 'run finished', expect: 'true', got: 'false', pass: false, detail: String(e && e.message || e).slice(0, 300) }] }); continue; }
      const j = judge(run);
      out.push(Object.assign(run, j));
    }
  } finally { await browser.close(); await env.close(); }
  return out;
}

module.exports = { runClients, inventory, REQUIRED };
