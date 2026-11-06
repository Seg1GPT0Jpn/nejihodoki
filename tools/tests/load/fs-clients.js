// 負荷テスト（Firestore）：本物のクライアントのコード（common/games.js・platform.js・achievements.js・cloud.js・rank.js）を、
// 1人ずつ別の node の vm に読み込み、Firebase の SDK の代わりに shim.js（エミュレーターの REST）につないで、同時にたくさん動かす。
// 1人の流れ（ハブを開く → 2つのゲームを数回遊ぶ → ランキングを見る → ページを閉じる）は、ページが KoboPlatform に送るイベント
// （play_start / best / play_end）と、ハブ・ランキングのページが呼ぶ関数（kbPlays の get、KoboRank.top / overall）でまねる。
// kbPlays への +1 は、今のクライアントにはまだない（platform.js の plays.pending() を送る役がない）。ルールが想定している書き方
// （FieldValue.increment(1) を merge で、1ゲーム1日1回）で送り、結果では「模擬」と分けて出す。
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { makeFirebase, signUp } = require('./shim');

const ROOT = path.resolve(__dirname, '../../..');
const FILES = ['games', 'platform', 'achievements', 'cloud', 'rank'];
const SCRIPTS = {};
for (const f of FILES) SCRIPTS[f] = new vm.Script(fs.readFileSync(path.join(ROOT, 'common', f + '.js'), 'utf8'), { filename: 'common/' + f + '.js' });
const STORAGE = new vm.Script(`
class Storage {
  constructor(src) { Object.defineProperty(this, '_m', { value: src }); }
  getItem(k) { k = String(k); return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; }
  setItem(k, v) { this._m[String(k)] = String(v); }
  removeItem(k) { delete this._m[String(k)]; }
  clear() { for (const k of Object.keys(this._m)) delete this._m[k]; }
  get length() { return Object.keys(this._m).length; }
  key(i) { return Object.keys(this._m)[i] ?? null; }
}
this.Storage = Storage; this.localStorage = new Storage(__ls); this.sessionStorage = new Storage({});`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
// 遊ぶゲーム（rankSource のキーがそのまま数値のものと、保存の中の best のもの）
const GAMES = [
  { id: 'blocks', key: 'kusoge.blocks.best', max: 60000 },
  { id: 'drop', key: 'kusoge.drop.best', max: 80000 },
  { id: 'n59049', key: 'kusoge.n59049.best', max: 200000 },
  { id: 'td', key: 'kusoge.td.save', field: 'best', max: 90000 },
  { id: 'hitblow', key: 'kusoge.hitblow.save', field: 'best', max: 900 },
];

class Client {
  constructor(i, T, metrics, opt) {
    this.i = i; this.T = T; this.metrics = metrics; this.opt = opt;
    this.store = {}; this.timers = new Set(); this.intervals = new Set(); this.log = []; this.done = false;
    this.google = !!opt.google; this.nick = opt.nick === false ? '' : 'P' + String(i).padStart(3, '0');
    const r = (i * 2654435761) >>> 0;
    this.games = [GAMES[r % GAMES.length], GAMES[(r >>> 8) % GAMES.length]];
    if (this.games[1] === this.games[0]) this.games[1] = GAMES[(GAMES.indexOf(this.games[0]) + 1) % GAMES.length];
  }
  // ---- 1ページぶんの環境（window・document・localStorage・タイマー）
  page(pathname) {
    const me = this;
    const winL = {}, docL = {};
    const ctx = {
      console: { log() {}, info() {}, debug() {}, warn: (...a) => me.log.push(['warn', a.map(String).join(' ').slice(0, 300)]), error: (...a) => me.log.push(['error', a.map(String).join(' ').slice(0, 300)]) },
      setTimeout: (f, ms, ...a) => { const id = setTimeout(() => { me.timers.delete(id); if (!me.done) f(...a); }, ms); me.timers.add(id); return id; },
      clearTimeout: id => { clearTimeout(id); me.timers.delete(id); },
      setInterval: (f, ms) => { const id = setInterval(() => { if (!me.done) f(); }, ms); me.intervals.add(id); return id; },
      clearInterval: id => { clearInterval(id); me.intervals.delete(id); },
      queueMicrotask, URL, __ls: this.store,
    };
    vm.createContext(ctx);
    vm.runInContext('var window = this, self = this;', ctx);
    STORAGE.runInContext(ctx);
    ctx.location = { protocol: 'https:', hostname: 'neji-5913a.web.app', host: 'neji-5913a.web.app', origin: 'https://neji-5913a.web.app', pathname, search: '', hash: '', href: 'https://neji-5913a.web.app' + pathname, reload() { me.log.push(['reload', pathname]); } };
    ctx.navigator = { onLine: true, userAgent: 'kobo-load-test', language: 'ja' };
    ctx.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
    ctx.addEventListener = (t, f) => { (winL[t] = winL[t] || []).push(f); };
    ctx.removeEventListener = () => {};
    const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, append() {}, appendChild() {}, remove() {}, addEventListener() {} });
    ctx.document = {
      head: { appendChild: s => me.loadScript(ctx, s) }, body: { appendChild() {}, classList: { add() {}, remove() {} } }, documentElement: { setAttribute() {}, removeAttribute() {} },
      createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      currentScript: null, visibilityState: 'visible', hidden: false, readyState: 'complete',
      addEventListener: (t, f) => { (docL[t] = docL[t] || []).push(f); }, removeEventListener() {},
    };
    ctx.NEJI_FIREBASE = { apiKey: this.T.apiKey, projectId: this.T.project, authDomain: 'demo-kobo.firebaseapp.com', appId: '1:1:web:1' };
    ctx.firebase = makeFirebase(this.T, this.metrics, { persisted: this.persisted, client: this.i });
    ctx.__hide = () => { ctx.document.visibilityState = 'hidden'; ctx.document.hidden = true; (docL.visibilitychange || []).forEach(f => { try { f({}); } catch (e) {} }); (winL.pagehide || []).forEach(f => { try { f({}); } catch (e) {} }); };
    return ctx;
  }
  loadScript(ctx, s) {
    const src = String(s.src || ''), m = /common\/(\w+)\.js/.exec(src);
    Promise.resolve().then(() => {
      if (m && SCRIPTS[m[1]]) { if (!ctx['__loaded_' + m[1]]) { ctx['__loaded_' + m[1]] = 1; SCRIPTS[m[1]].runInContext(ctx); } s.onload && s.onload(); }
      else if (/firebase-.*-compat\.js/.test(src)) s.onload && s.onload(); // the shim is already in place
      else s.onerror && s.onerror(new Error('unknown script ' + src));
    });
  }
  run(ctx, f) { ctx.document.currentScript = { src: 'https://neji-5913a.web.app/common/' + f + '.js' }; ctx['__loaded_' + f] = 1; SCRIPTS[f].runInContext(ctx); ctx.document.currentScript = null; }
  // ---- ページを開く（<head> の games.js・platform.js・achievements.js、</body> の前の cloud.js・rank.js）
  open(pathname) {
    const ctx = this.page(pathname);
    ctx.KOBO_NO_ACH = true;
    for (const f of FILES) this.run(ctx, f);
    ctx.KoboCloud.sync(ctx.KoboPlatform.syncMap());
    this.ctx = ctx;
    return ctx;
  }
  async prepare() {
    if (this.google) {
      const u = await signUp(this.T, this.metrics, { email: `load${this.i}@example.com`, password: 'load-test-pw', returnSecureToken: true });
      this.persisted = { uid: u.uid, token: u.token, name: 'Google ' + this.i };
    }
    if (this.nick) this.store['kobo.nick'] = this.nick;
  }
  // ハブの「人気」（index.html の loadPopular と同じ読み方：今週と先週の kbPlays を get、6時間キャッシュ）
  async hubPopular(ctx) {
    const P = ctx.KoboPlatform, wk = P.jstWeekKey(), c = P.store.get('kobo.playsCache', null), t = Date.now();
    if (c && c.wk === wk && t - c.at < 6 * 3600000) return;
    if (!(await ctx.KoboCloud.ready())) return;
    const db = ctx.firebase.firestore();
    const r = await Promise.all([wk, wk - 1].map(w => db.collection('kbPlays').doc('w' + w).get().then(d => (d.exists ? d.data() || {} : {}), () => null)));
    P.store.set('kobo.playsCache', { at: Date.now(), wk, cur: r[0] || {}, prev: r[1] || {} });
  }
  // 模擬：プレイ回数 +1（kbPlays/w<週>。1ゲーム1日1回。今のクライアントにはない送信）
  async sendPlays(ctx) {
    const P = ctx.KoboPlatform, C = ctx.KoboCloud;
    const pend = P.plays.pending(); if (!pend.length) return;
    const u = await C.ensureGuest(); if (!u) return;
    const db = ctx.firebase.firestore();
    for (const x of pend) {
      if (x.week !== 'w' + P.jstWeekKey()) { P.plays.markSent(x.dateKey, x.game); continue; }
      const n0 = this.metrics.ops.length;
      await db.collection('kbPlays').doc(x.week).set({ [x.game]: ctx.firebase.firestore.FieldValue.increment(1) }, { merge: true }).catch(e => this.log.push(['warn', 'kbPlays ' + e.code]));
      for (let k = n0; k < this.metrics.ops.length; k++) { const x = this.metrics.ops[k]; if (x.coll === 'kbPlays' && x.client === this.i && x.op !== 'get') x.sim = true; }
      P.plays.markSent(x.dateKey, x.game);
    }
  }
  async play(ctx, g, playMs) {
    const P = ctx.KoboPlatform;
    const t = Date.now();
    P.emit('play_start', { game: g.id, mode: 'normal', t });
    await sleep(playMs);
    const score = 1 + Math.floor(Math.random() * g.max);
    const raw = this.store[g.key];
    let best = 0;
    try { const v = JSON.parse(raw || '0'); best = g.field ? Number(v && v[g.field]) || 0 : Number(v) || 0; } catch (e) {}
    if (score > best) {
      if (g.field) { let o = {}; try { o = JSON.parse(raw || '{}') || {}; } catch (e) {} o[g.field] = score; ctx.localStorage.setItem(g.key, JSON.stringify(o)); }
      else ctx.localStorage.setItem(g.key, String(score));
      P.emit('best', { game: g.id, value: score });
    }
    P.emit('play_end', { game: g.id, mode: 'normal', score, durationMs: Math.max(playMs, 90000 + Math.floor(Math.random() * 120000)), wallMs: 120000, reason: 'over' });
  }
  async rankingPage() {
    // ランキングのページ（ranking/index.html）を開いて、2つのゲームの週間・日間・通算と、総合を見る。
    // ログインはハブのページのものを引き継ぐ（ブラウザでは IndexedDB に残る）
    const prev = this.ctx && this.ctx.firebase.auth().currentUser;
    if (prev) this.persisted = { uid: prev.uid, token: prev.token, name: prev.displayName, anon: prev.isAnonymous };
    const ctx = this.page('/ranking/');
    ctx.KOBO_NO_ACH = true;
    for (const f of FILES) this.run(ctx, f);
    ctx.KoboCloud.sync({});
    const R = ctx.KoboRank, out = [];
    for (const g of this.games) for (const per of ['week', 'day', 'all']) out.push(await R.top(g.id, per));
    out.push(await R.overall());
    // 同じボードをもう一度（5分のキャッシュから。読み取り0のはず）
    const again = await R.top(this.games[0].id, 'week');
    this.rankReads = out.reduce((s, r) => s + (r.reads || 0), 0); this.rankAgainReads = again.reads || 0;
    this.rankErrors = out.filter(r => r.error).map(r => String(r.error.code || r.error.message));
    ctx.__hide();
  }
  async session() {
    const o = this.opt, t0 = Date.now();
    const ctx = this.open('/');
    await sleep(1200);
    await this.hubPopular(ctx).catch(e => this.log.push(['warn', 'popular ' + e.code]));
    for (let k = 0; k < o.plays; k++) {
      const g = this.games[k % 2];
      await this.play(ctx, g, o.playMs);
      if (o.sendPlays) await this.sendPlays(ctx).catch(e => this.log.push(['warn', 'plays ' + e.code]));
      await sleep(500 + Math.random() * 1500);
    }
    if (o.ranking) await this.rankingPage().catch(e => this.log.push(['error', 'ranking ' + e.message]));
    await sleep(o.tailMs); // cloud.js（30秒あけて送る）・rank.js（3秒→60秒）・achievements.js（15秒）の送信を待つ
    ctx.__hide();
    await sleep(2500);
    this.ms = Date.now() - t0;
  }
  close() { this.done = true; for (const id of this.timers) clearTimeout(id); for (const id of this.intervals) clearInterval(id); this.timers.clear(); this.intervals.clear(); }
}

// n 人を ramp ミリ秒かけて開始して、全員の終わりを待つ
async function runFirestoreLoad(T, metrics, opt = {}) {
  const o = Object.assign({ clients: 200, ramp: 20000, plays: 4, playMs: 10000, tailMs: 22000, google: 0.4, nickless: 0.1, sendPlays: true, ranking: true }, opt);
  const list = [];
  for (let i = 0; i < o.clients; i++) list.push(new Client(i, T, metrics, Object.assign({}, o, { google: (i % 10) < o.google * 10, nick: !((i % 10) >= 10 - o.nickless * 10) })));
  for (const c of list) await c.prepare();
  metrics.t0 = Date.now();
  const startOps = metrics.ops.length;
  let live = 0, peak = 0;
  const runs = list.map((c, i) => sleep(Math.floor(o.ramp * i / o.clients)).then(async () => {
    live++; peak = Math.max(peak, live);
    try { await c.session(); } catch (e) { c.log.push(['error', 'session ' + (e && e.stack || e)]); }
    finally { live--; c.close(); }
  }));
  await Promise.all(runs);
  return { clients: list, peak, startOps, opt: o };
}

module.exports = { runFirestoreLoad, Client, GAMES };
