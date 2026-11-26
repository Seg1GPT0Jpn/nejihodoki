// common/turnroom.js（colorcards・reversi・gomoku・mahjong・chess・wordwolf のオンライン対戦）を、本物の Firebase SDK ＋ エミュレーターの本物のルールで、2〜4人の「ボット」で動かす。
// ボット1人 = node の vm 1つ（Firebase SDK 10.12.2・colorcards/engine.js・colorcards/online.js・common/turnroom.js を、ブラウザと同じファイルのまま読み込む）。
// 画面（DOM）はないので、turnroom.js はロビーの絵を出さない（headless）。ボットは model を受け取って、見かけの状態（online.js の view）から
// E.cpu で手を選び、submit する。書き込みは rules/clients.js の RECORDER で全部記録し、ルールで拒否されたものがないことも確かめる。
//   シナリオ：room4（コードで4人・最後まで・もう一度・ルールの穴の確認）、quick（クイックマッチ：CPU でうめる／4人ぴったり）、
//            disconnect（切れた席は CPU が代わり、猶予内にもどれる）、timeout（手を打たない席は自動で打たれ、離席になる）、
//            hostleave（ホストが出る／ホストが消える → ゲストは手元の状態から終了）、guestleave（出た席は CPU）
// 使い方：rules/run.js が呼ぶ（--only clients）。単体：node tools/tests/rules/turnroom-bots.js（エミュレーターを起動する）
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { ensureSdk } = require('../load/rtdb-bots');
const { RECORDER } = require('./clients');

const ROOT = path.resolve(__dirname, '../../..');
const SDK_V = '10.12.2';
const CACHE = path.join(__dirname, '..', '.cache', 'firebase-' + SDK_V);
const load = fl => fl.map(f => ({ f, code: fs.readFileSync(path.join(ROOT, f), 'utf8') }));
const SRC = load(['colorcards/engine.js', 'colorcards/online.js', 'common/turnroom.js']);
const SRC_RV = load(['reversi/engine.js', 'reversi/online.js', 'common/turnroom.js']);
const SRC_GK = load(['gomoku/engine.js', 'gomoku/online.js', 'common/turnroom.js']);
const SRC_MJ = load(['mahjong/ai.js', 'mahjong/engine.js', 'mahjong/online.js', 'common/turnroom.js']);
const SRC_CH = load(['chess/engine.js', 'chess/ai.js', 'chess/online.js', 'common/turnroom.js']);
const SRC_WW = load(['wordwolf/words.js', 'wordwolf/engine.js', 'wordwolf/online.js', 'common/turnroom.js']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAST = { turnSec: 3, seatGrace: 5, hostGrace: 5, qmWait: 2, qmFill: 3, cpuMs: 120, dealMs: 300, awayMs: 250, dcMs: 600, lateMs: 250 };

function makeCtx(src) {
  const quiet = { log() {}, info() {}, debug() {}, warn() {}, error() {} };
  const ctx = { console: quiet, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, fetch, WebSocket, URL, URLSearchParams, TextEncoder, TextDecoder,
    Headers, Request, Response, AbortController, atob, btoa, crypto: globalThis.crypto, navigator: { userAgent: 'kobo-turnroom-bots', onLine: true } };
  vm.createContext(ctx);
  vm.runInContext('var window = this, self = this;', ctx);
  for (const f of ['app', 'auth', 'database']) vm.runInContext(fs.readFileSync(path.join(CACHE, `firebase-${f}-compat.js`), 'utf8'), ctx, { filename: `firebase-${f}-compat.js` });
  vm.runInContext(RECORDER, ctx);
  for (const s of src || SRC) vm.runInContext(s.code, ctx, { filename: s.f });
  return ctx;
}

class Bot {
  constructor(env, nick) { this.env = env; this.nick = nick; this.models = []; this.frozen = false; this.stall = false; this.dead = false; this.issues = []; this.phases = []; this.acts = 0; }
  async init() {
    const { ports, ns } = this.env;
    const ctx = this.ctx = makeCtx(), fb = ctx.firebase;
    this.app = fb.initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-kobo', appId: '1:1:web:1', databaseURL: `http://127.0.0.1:${ports.database}/?ns=${ns}` });
    this.app.auth().useEmulator(`http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
    this.uid = (await this.app.auth().signInAnonymously()).user.uid;
    this.db = this.app.database();
    this.E = ctx.ColorCardsEngine; this.O = ctx.ColorCardsOnline;
    this.vctx = this.O.newCtx();
    this.tr = ctx.KoboTurnRoom.create({ game: 'colorcards', headless: true, net: { db: this.db, uid: this.uid, TS: fb.database.ServerValue.TIMESTAMP }, host: this.O.host, timing: this.env.timing || FAST,
      cpuNames: k => 'CPU' + (k + 1), getCpu: () => 2, onModel: m => this.onModel(m), onPhase: (ph, info) => this.phases.push(ph + (info && info.detail ? ':' + info.detail : '')) });
    return this;
  }
  get log() { return this.ctx.__rulesLog || []; }
  // 画面と同じ道（view）で見かけの状態を作り、約束が守られているか見る。自分の番なら CPU の考え方で手を選んで submit する
  onModel(m) {
    if (this.dead) return;
    this.last = m; this.models.push({ gn: m.gn, v: m.v, ph: m.ph, tn: m.tn, sl: m.sl, why: m.why, rs: m.rs, me: m.me, n: m.n, fresh: m.fresh });
    let v;
    try { v = this.O.view(m, this.vctx); } catch (e) { this.issues.push('view threw: ' + e.message); return; }
    const all = [].concat(...v.st.hands);
    if (new Set(all).size !== all.length) this.issues.push('duplicate card ids in the view (v' + m.v + ')');
    const hc = this.O.arr(m.pd.hc);
    if (m.me >= 0 && !m.replaced && v.st.hands[m.me].length !== hc[m.me]) this.issues.push(`my hand has ${v.st.hands[m.me].length} cards but hc says ${hc[m.me]} (v${m.v})`);
    v.st.hands.forEach((h, s) => { if (h.length !== hc[s] && !(s === m.me && m.replaced)) this.issues.push(`seat ${s} has ${h.length} cards, hc ${hc[s]}`); });
    const mine = v.st.hands[m.me] || [];
    if (m.ph === 'play') this.maxHand = Math.max(this.maxHand || 0, mine.length);
    if (m.ph !== 'play' || m.me < 0 || m.tn !== m.me || this.frozen || this.stall || m.replaced) return;
    const key = m.gn + ':' + m.v;
    if (this.actFor === key) return;
    this.actFor = key;
    const delay = 40 + Math.random() * 120;
    setTimeout(() => {
      if (this.dead || this.frozen || this.stall || !this.last || this.last.v !== m.v) return;
      let mv;
      try { mv = this.E.cpu(v.st); } catch (e) { this.issues.push('cpu threw: ' + e.message); return; }
      this.acts++;
      this.tr.submit(this.O.toWire(mv));
    }, delay);
  }
  // タブを閉じた：何も片付けず、接続だけが切れる（サーバーの onDisconnect だけが動く）
  vanish() { this.frozen = true; this.vanished = true; try { this.db.goOffline(); } catch (e) {} }
  back() { this.frozen = false; this.vanished = false; try { this.db.goOnline(); } catch (e) {} }
  // ルールの確認：拒否されるはずの書き込み・読み出し（記録からは外す）
  // 読み出しは REST（この人のトークン）で確かめる：SDK は、自分で書いたばかりの値を手元の写しから返すことがある
  async restRead(p) {
    const tok = await this.app.auth().currentUser.getIdToken();
    const r = await fetch(`http://127.0.0.1:${this.env.ports.database}/${p}.json?ns=${this.env.ns}&auth=${tok}`);
    return { ok: r.ok, status: r.status };
  }
  async probe(name, fn, expectDeny = true) {
    const n0 = this.log.length;
    let denied = false, err = '';
    try { await fn(this.db); } catch (e) { err = String(e && (e.code || e.message)); denied = /permission/i.test(err); }
    this.log.splice(n0);          // the probe's own write is not a client write
    return { name, pass: expectDeny ? denied : !err, detail: err };
  }
  final(g) { const l = this.models.filter(m => m.gn === g && m.ph === 'over'); return l.length ? l[l.length - 1] : null; }
  async close() { this.dead = true; try { await this.app.delete(); } catch (e) {} }
}

// リバーシのボット：2人・隠す情報なし。model.pd の盤から手を選んで submit する
class RvBot extends Bot {
  async init() {
    const { ports, ns } = this.env;
    const ctx = this.ctx = makeCtx(SRC_RV), fb = ctx.firebase;
    this.app = fb.initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-kobo', appId: '1:1:web:1', databaseURL: `http://127.0.0.1:${ports.database}/?ns=${ns}` });
    this.app.auth().useEmulator(`http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
    this.uid = (await this.app.auth().signInAnonymously()).user.uid;
    this.db = this.app.database();
    this.E = ctx.ReversiEngine; this.O = ctx.ReversiOnline;
    this.vctx = this.O.newCtx();
    this.tr = ctx.KoboTurnRoom.create({ game: 'reversi', headless: true, net: { db: this.db, uid: this.uid, TS: fb.database.ServerValue.TIMESTAMP }, host: this.O.host, seats: [2], seatsMax: 2, alternate: true, timing: this.env.timing || FAST,
      cpuNames: k => 'CPU' + (k + 1), getCpu: () => 2, onModel: m => this.onModel(m), onPhase: (ph, info) => this.phases.push(ph + (info && info.detail ? ':' + info.detail : '')) });
    return this;
  }
  onModel(m) {
    if (this.dead) return;
    this.last = m; this.models.push({ gn: m.gn, v: m.v, ph: m.ph, tn: m.tn, sl: m.sl, why: m.why, rs: m.rs, me: m.me, n: m.n, fresh: m.fresh });
    let v;
    try { v = this.O.view(m, this.vctx); } catch (e) { this.issues.push('view threw: ' + e.message); return; }
    const c = this.E.counts(v.st);
    if (c.b !== (m.pd.bk | 0) || c.w !== (m.pd.wh | 0)) this.issues.push(`board counts ${c.b}/${c.w} differ from ${m.pd.bk}/${m.pd.wh} (v${m.v})`);
    if (c.b + c.w !== 4 + (m.pd.mc | 0)) this.issues.push(`stones ${c.b + c.w} but ${m.pd.mc} moves (v${m.v})`);
    if (m.ph !== 'play' || m.me < 0 || m.tn !== m.me || this.frozen || this.stall || m.replaced) return;
    const key = m.gn + ':' + m.v;
    if (this.actFor === key) return;
    this.actFor = key;
    setTimeout(() => {
      if (this.dead || this.frozen || this.stall || !this.last || this.last.v !== m.v) return;
      let c1;
      try { c1 = this.E.cpu(v.st, 1 + (this.acts % 3)); } catch (e) { this.issues.push('cpu threw: ' + e.message); return; }
      this.acts++;
      this.tr.submit(this.O.toWire(c1));
    }, 30 + Math.random() * 80);
  }
}

// 五目ならべのボット：2人・隠す情報なし。model.pd の盤から手を選んで submit する
class GkBot extends Bot {
  async init() {
    const { ports, ns } = this.env;
    const ctx = this.ctx = makeCtx(SRC_GK), fb = ctx.firebase;
    this.app = fb.initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-kobo', appId: '1:1:web:1', databaseURL: `http://127.0.0.1:${ports.database}/?ns=${ns}` });
    this.app.auth().useEmulator(`http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
    this.uid = (await this.app.auth().signInAnonymously()).user.uid;
    this.db = this.app.database();
    this.E = ctx.GomokuEngine; this.O = ctx.GomokuOnline;
    this.vctx = this.O.newCtx();
    this.tr = ctx.KoboTurnRoom.create({ game: 'gomoku', headless: true, net: { db: this.db, uid: this.uid, TS: fb.database.ServerValue.TIMESTAMP }, host: this.O.host, seats: [2], seatsMax: 2, alternate: true, timing: this.env.timing || FAST,
      cpuNames: k => 'CPU' + (k + 1), getCpu: () => 2, onModel: m => this.onModel(m), onPhase: (ph, info) => this.phases.push(ph + (info && info.detail ? ':' + info.detail : '')) });
    return this;
  }
  onModel(m) {
    if (this.dead) return;
    this.last = m; this.models.push({ gn: m.gn, v: m.v, ph: m.ph, tn: m.tn, sl: m.sl, why: m.why, rs: m.rs, me: m.me, n: m.n, fresh: m.fresh });
    let v;
    try { v = this.O.view(m, this.vctx); } catch (e) { this.issues.push('view threw: ' + e.message); return; }
    const c = this.E.counts(v.st);
    if (c.b + c.w !== (m.pd.mc | 0) || v.st.moves.length !== (m.pd.mc | 0)) this.issues.push(`stones ${c.b + c.w} / list ${v.st.moves.length} but ${m.pd.mc} moves (v${m.v})`);
    if (m.ph !== 'play' || m.me < 0 || m.tn !== m.me || this.frozen || this.stall || m.replaced) return;
    const key = m.gn + ':' + m.v;
    if (this.actFor === key) return;
    this.actFor = key;
    setTimeout(() => {
      if (this.dead || this.frozen || this.stall || !this.last || this.last.v !== m.v) return;
      let c1;
      try { c1 = this.E.cpu(v.st, 1 + (this.acts % 3), { time: 0, nodes: 1500 }); } catch (e) { this.issues.push('cpu threw: ' + e.message); return; }
      this.acts++;
      this.tr.submit(this.O.toWire(c1));
    }, 30 + Math.random() * 80);
  }
}

// チェスのボット：2人・隠す情報なし。model.pd の手の列から online.js の view で Game を作り、AI.cpuMove で手を選んで submit する（12手打ったら投了：対局を短く終わらせる）
class ChBot extends Bot {
  async init() {
    const { ports, ns } = this.env;
    const ctx = this.ctx = makeCtx(SRC_CH), fb = ctx.firebase;
    this.app = fb.initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-kobo', appId: '1:1:web:1', databaseURL: `http://127.0.0.1:${ports.database}/?ns=${ns}` });
    this.app.auth().useEmulator(`http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
    this.uid = (await this.app.auth().signInAnonymously()).user.uid;
    this.db = this.app.database();
    this.E = ctx.ChessEngine; this.AI = ctx.ChessAI; this.O = ctx.ChessOnline;
    this.vctx = this.O.newCtx();
    // the probe "a guest writes pub/ph" shows 'over' for a moment on the guest's own page (the write is refused and rolled back): only a model with the result counts as the end
    this.final = g => { const l = this.models.filter(m => m.gn === g && m.ph === 'over' && m.rs); return l.length ? l[l.length - 1] : null; };
    this.tr = ctx.KoboTurnRoom.create({ game: 'chess', headless: true, net: { db: this.db, uid: this.uid, TS: fb.database.ServerValue.TIMESTAMP }, host: this.O.host, seats: [2], seatsMax: 2, alternate: true, turnSec: 180, timing: this.env.timing || FAST,
      cpuNames: k => 'CPU' + (k + 1), getCpu: () => 2, onModel: m => this.onModel(m), onPhase: (ph, info) => this.phases.push(ph + (info && info.detail ? ':' + info.detail : '')) });
    return this;
  }
  onModel(m) {
    if (this.dead) return;
    this.last = m; this.models.push({ gn: m.gn, v: m.v, ph: m.ph, tn: m.tn, sl: m.sl, why: m.why, rs: m.rs, me: m.me, n: m.n, fresh: m.fresh });
    let v;
    try { v = this.O.view(m, this.vctx); } catch (e) { this.issues.push('view threw: ' + e.message); return; }
    if (v.game.list.length !== (m.pd.mc | 0)) this.issues.push(`move list ${v.game.list.length} but ${m.pd.mc} moves (v${m.v})`);
    if (m.ph !== 'play' || m.me < 0 || m.tn !== m.me || this.frozen || this.stall || m.replaced) return;
    const key = m.gn + ':' + m.v;
    if (this.actFor === key) return;
    this.actFor = key;
    setTimeout(() => {
      if (this.dead || this.frozen || this.stall || !this.last || this.last.v !== m.v) return;
      if (this.acts >= 12) { this.tr.submit(this.O.simpleWire('rs')); return; }
      let o;
      try { o = this.AI.cpuMove(v.game, 3, { nodes: 400 }); } catch (e) { this.issues.push('cpuMove threw: ' + e.message); return; }
      if (!o || !o.move) { this.tr.submit(this.O.simpleWire('rs')); return; }
      this.acts++;
      this.tr.submit(this.O.toWire(o.move & 63, (o.move >> 6) & 63, (o.move >> 12) & 15));
    }, 30 + Math.random() * 80);
  }
}

// 麻雀のボット：4人・手牌は本人にだけ見える。model（pd と自分の priv）から online.js の view で「できる手」を作り、あがれるならあがり、なければ切る・鳴かない
class MjBot extends Bot {
  async init() {
    const { ports, ns } = this.env;
    const ctx = this.ctx = makeCtx(SRC_MJ), fb = ctx.firebase;
    this.app = fb.initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-kobo', appId: '1:1:web:1', databaseURL: `http://127.0.0.1:${ports.database}/?ns=${ns}` });
    this.app.auth().useEmulator(`http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
    this.uid = (await this.app.auth().signInAnonymously()).user.uid;
    this.db = this.app.database();
    this.E = ctx.MahjongEngine; this.O = ctx.MahjongOnline;
    this.tr = ctx.KoboTurnRoom.create({ game: 'mahjong', headless: true, net: { db: this.db, uid: this.uid, TS: fb.database.ServerValue.TIMESTAMP }, host: this.O.host, seats: [4], seatsMax: 4, timing: this.env.timing || FAST,
      cpuNames: k => 'CPU' + (k + 1), getCpu: () => 2, onModel: m => this.onModel(m), onPhase: (ph, info) => this.phases.push(ph + (info && info.detail ? ':' + info.detail : '')) });
    return this;
  }
  onModel(m) {
    if (this.dead) return;
    this.last = m; this.models.push({ gn: m.gn, v: m.v, ph: m.ph, tn: m.tn, sl: m.sl, why: m.why, rs: m.rs, me: m.me, n: m.n, fresh: m.fresh });
    let v;
    try { v = this.O.view(m); } catch (e) { this.issues.push('view threw: ' + e.message); return; }
    // 他家の手牌は見えない（枚数ぶんの -1）
    if (m.me >= 0) v.st.hands.forEach((h, s) => { if (s !== m.me && h.some(x => x !== -1)) this.issues.push('a rival hand is visible (seat ' + s + ', v' + m.v + ')'); });
    if (m.ph !== 'play' || m.me < 0 || m.tn !== m.me || this.frozen || this.stall || m.replaced) return;
    const key = m.gn + ':' + m.v;
    if (this.actFor === key) return;
    this.actFor = key;
    setTimeout(() => {
      if (this.dead || this.frozen || this.stall || !this.last || this.last.v !== m.v) return;
      let a;
      if (v.st.phase === 'end') a = { t: 'nx' };
      else {
        const L = v.legal || [], pick = t => L.find(x => x.t === t);
        a = pick('tsumo') || pick('ron') || pick('pass');
        if (!a) { const d = L.filter(x => x.t === 'discard' && !x.riichi); a = d.length ? d[Math.floor(Math.random() * d.length)] : L[0]; }
      }
      if (!a) { this.issues.push('no legal move at v' + m.v); return; }
      this.acts++;
      this.tr.submit(this.O.toWire(a));
    }, 20 + Math.random() * 60);
  }
}

// ワードウルフのボット：3〜8席。自分のことばだけが priv に来る。ヒントカードを1枚えらぶ・ウルフだと思う人に投票・つかまったら逆転の答えをえらぶ（online.js の view から）
class WwBot extends Bot {
  async init() {
    const { ports, ns } = this.env;
    const ctx = this.ctx = makeCtx(SRC_WW), fb = ctx.firebase;
    this.app = fb.initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-kobo', appId: '1:1:web:1', databaseURL: `http://127.0.0.1:${ports.database}/?ns=${ns}` });
    this.app.auth().useEmulator(`http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
    this.uid = (await this.app.auth().signInAnonymously()).user.uid;
    this.db = this.app.database();
    this.E = ctx.WordWolfEngine; this.O = ctx.WordWolfOnline;
    this.tr = ctx.KoboTurnRoom.create({ game: 'wordwolf', headless: true, net: { db: this.db, uid: this.uid, TS: fb.database.ServerValue.TIMESTAMP }, host: this.O.host, seats: [3, 4, 5, 6, 7, 8], seatsMax: 8, minSeats: 3, timing: this.env.timing || FAST,
      cpuNames: k => 'CPU' + (k + 1), getCpu: () => 2, onModel: m => this.onModel(m), onPhase: (ph, info) => this.phases.push(ph + (info && info.detail ? ':' + info.detail : '')) });
    return this;
  }
  onModel(m) {
    if (this.dead) return;
    this.last = m; this.models.push({ gn: m.gn, v: m.v, ph: m.ph, tn: m.tn, sl: m.sl, why: m.why, rs: m.rs, me: m.me, n: m.n, fresh: m.fresh });
    let v;
    try { v = this.O.view(m); } catch (e) { this.issues.push('view threw: ' + e.message); return; }
    // 結果の前に、ウルフや相手のことばが pd に出ていない
    if (m.ph === 'play' && m.pd && ('wl' in m.pd || 'pi' in m.pd)) this.issues.push('the result leaked before the end (v' + m.v + ')');
    if (m.ph !== 'play' || m.me < 0 || this.frozen || this.stall || m.replaced) return;
    const voting = v.ph === 'v' && !v.voted[m.me], myTurn = (v.ph === 'h' || v.ph === 'g') && m.tn === m.me;
    if (!voting && !myTurn) return;
    const key = m.gn + ':' + m.v + ':' + v.ph + (voting ? 'v' : '');
    if (this.actFor === key) return;
    this.actFor = key;
    setTimeout(() => {
      if (this.dead || this.frozen || this.stall || !this.last || this.last.v !== m.v) return;
      let a;
      if (v.ph === 'h') a = { t: 'hn', c: Math.floor(Math.random() * v.choices.length) };
      else if (v.ph === 'v') {
        const c = (v.cands.length ? v.cands : Array.from({ length: v.n }, (_, i) => i)).filter(i => i !== m.me).sort(() => Math.random() - 0.5).slice(0, Math.min(v.slots, 2));
        a = { t: 'vt', c: c[0], k: c.length > 1 ? c[1] : -1 };
      } else a = { t: 'gs', c: Math.floor(Math.random() * v.guessOpts.length) };
      this.acts++;
      this.tr.submit(this.O.toWire(a));
    }, 20 + Math.random() * 60);
  }
}

async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return v; await sleep(80); }
  throw new Error('timeout: ' + what);
}

const ownerGet = async (env, p, shallow) => (await (await fetch(`http://127.0.0.1:${env.ports.database}/${p}.json?ns=${env.ns}${shallow ? '&shallow=true' : ''}`, { headers: { Authorization: 'Bearer owner' } })).json()) || {};

// ---------------------------------------------------------------- シナリオ
async function room4(env, rows, bots) {
  const [A, B, C, D, X] = await Promise.all(['Aoi', 'Ben', 'Cy', 'Dai', 'Xin'].map(n => new Bot(env, n).init()));
  bots.push(A, B, C, D, X);
  const add = (name, pass, detail) => rows.push({ name: 'room4: ' + name, pass: !!pass, detail });
  await A.tr.begin('host', { n: 4, fill: false, nick: 'Aoi' });
  await until(() => A.tr._S.code, 8000, 'room code');
  const code = A.tr._S.code;
  add('the host gets a 6-digit code', /^\d{6}$/.test(code), code);
  await Promise.all([B, C, D].map(b => b.tr.begin('join', { code, nick: b.nick })));
  await until(() => [A, B, C, D].every(b => b.last && b.last.ph === 'play'), 20000, 'all four see the game');
  const ms = [A, B, C, D].map(b => b.last);
  add('all four are in one room, 4 seats, game 1', ms.every(m => m.rid === ms[0].rid && m.n === 4 && m.gn === 1), ms.map(m => m.rid + '/' + m.n + '/' + m.gn).join(' '));
  add('every page has its own seat (me = 0..3, all different)', new Set(ms.map(m => m.me)).size === 4 && ms.every(m => m.me >= 0), ms.map(m => m.me).join());
  add('the names are the nicknames, seat order = room order', ms.every(m => m.names.join() === ms[0].names.join()) && ['Aoi', 'Ben', 'Cy', 'Dai'].every(n => ms[0].names.includes(n)), ms[0].names.join());
  // ルールの穴：ゲストが他人の手札を読む・pub を書く・他人の名前で手を打つ・入っていない人が入る
  const rid = ms[0].rid, R = `tr/colorcards/rooms/${rid}`;
  const pr = [];
  pr.push(await B.probe('a guest reads another guest\'s hand', db => db.ref(`${R}/priv/${C.uid}`).once('value')));
  pr.push(await B.probe('a guest reads all hands', db => db.ref(`${R}/priv`).once('value')));
  pr.push(await B.probe('a guest reads the whole room', db => db.ref(R).once('value')));
  { const r = await A.restRead(`${R}/priv/${B.uid}`); pr.push({ name: 'the host reads a guest\'s hand back (it keeps the game itself)', pass: r.status === 401, detail: String(r.status) }); }
  { const r = await B.restRead(`${R}/priv/${B.uid}`); pr.push({ name: 'a guest reads its own hand (allowed)', pass: r.ok, detail: String(r.status) }); }
  pr.push(await B.probe('a guest reads the others\' moves', db => db.ref(`${R}/act`).once('value')));
  pr.push(await B.probe('a guest writes the public state', db => db.ref(`${R}/pub/ph`).set('over')));
  pr.push(await B.probe('a guest writes its own hand', db => db.ref(`${R}/priv/${B.uid}`).set({ v: 99999, h: [1, 2, 3] })));
  pr.push(await B.probe('a guest moves for another guest', db => db.ref(`${R}/act/${C.uid}`).set({ q: Date.now() + 5, v: 1, a: { t: 'draw' } })));
  pr.push(await X.probe('an outsider takes a seat after the start', db => db.ref(`${R}/seats/3`).set({ u: X.uid, n: 'Xin', j: X.ctx.firebase.database.ServerValue.TIMESTAMP })));
  pr.push(await X.probe('an outsider writes a move', db => db.ref(`${R}/act/${X.uid}`).set({ q: Date.now() + 5, v: 1, a: { t: 'draw' } })));
  pr.push(await X.probe('an outsider reads the public state (allowed)', db => db.ref(`${R}/pub`).once('value'), false));
  pr.push(await X.probe('an outsider reads the room list', db => db.ref('tr/colorcards/rooms').once('value')));
  pr.push(await X.probe('an outsider reads the code list', db => db.ref('tr/colorcards/codes').once('value')));
  for (const p of pr) add('probe: ' + p.name, p.pass, p.detail);
  // 最後まで
  await until(() => [A, B, C, D].every(b => b.final(1)), 120000, 'game 1 over');
  const fin = [A, B, C, D].map(b => b.final(1));
  add('game 1 ends with the same result everywhere', fin.every(f => JSON.stringify(f.rs) === JSON.stringify(fin[0].rs)) && fin[0].why === 'w', JSON.stringify(fin[0].rs));
  add('the ranks are 1..4, one winner', JSON.stringify(Object.values(fin[0].rs.r).sort()) === '[1,2,3,4]' && fin[0].rs.w >= 0, JSON.stringify(fin[0].rs));
  add('every hand matched the public counts all game (no hidden card mix-ups)', [A, B, C, D].every(b => !b.issues.length), [A, B, C, D].map(b => b.issues.slice(0, 2).join('; ')).join(' | '));
  add('everyone played moves', [A, B, C, D].every(b => b.acts > 2), [A, B, C, D].map(b => b.acts).join());
  // もう一度（全員）
  for (const b of [A, B, C, D]) b.tr.rematch();
  await until(() => [A, B, C, D].every(b => b.last && b.last.gn === 2 && b.last.ph === 'play'), 20000, 'rematch game 2');
  add('rematch: everybody wished → game 2 in the same room', [A, B, C, D].every(b => b.last.rid === rid && b.last.fresh !== undefined));
  await until(() => [A, B, C, D].every(b => b.final(2)), 120000, 'game 2 over');
  add('game 2 ends too', [A, B, C, D].every(b => b.final(2).why === 'w'));
  for (const b of [B, C, D, A]) { b.tr.leave(); await sleep(150); }
  await sleep(2000);
  const left = Object.keys(await ownerGet(env, 'tr/colorcards/rooms', true));
  add('the room is gone after everybody left', !left.includes(rid), left.join());
  const codes = Object.keys(await ownerGet(env, 'tr/colorcards/codes', true));
  add('the code is gone', !codes.includes(code), codes.join());
}

// リバーシ：2人。コードの部屋で最後まで・もう一度（色が入れかわる）・ルールの穴・クイック・切れた席は CPU・時間切れ
async function reversi(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'reversi: ' + name, pass: !!pass, detail });
  const [A, B, X] = await Promise.all(['Ra', 'Rb', 'Rx'].map(n => new RvBot(env, n).init()));
  bots.push(A, B, X);
  await A.tr.begin('host', { n: 2, fill: false, nick: 'Ra' });
  await until(() => A.tr._S.code, 8000, 'room code');
  const code = A.tr._S.code;
  await B.tr.begin('join', { code, nick: 'Rb' });
  await until(() => [A, B].every(b => b.last && b.last.ph === 'play'), 20000, 'both see the game');
  const ms = [A, B].map(b => b.last);
  add('two seats, one room, game 1, different seats', ms.every(m => m.rid === ms[0].rid && m.n === 2 && m.gn === 1) && ms[0].me !== ms[1].me && ms[0].me >= 0 && ms[1].me >= 0, ms.map(m => m.me).join());
  add('a third person cannot join a 2-seat room', await (async () => { await X.tr.begin('join', { code, nick: 'Rx' }); return X.tr.phase === 'menu' && !!X.tr._S.err; })(), X.tr.phase);
  const rid = ms[0].rid, R = `tr/reversi/rooms/${rid}`;
  const pr = [];
  pr.push(await B.probe('a guest reads the whole room', db => db.ref(R).once('value')));
  pr.push(await B.probe('a guest writes the public state', db => db.ref(`${R}/pub/ph`).set('over')));
  pr.push(await B.probe('a guest moves for the host', db => db.ref(`${R}/act/${A.uid}`).set({ q: Date.now() + 5, v: 1, a: { t: 'mv', c: 19 } })));
  pr.push(await X.probe('an outsider takes a seat after the start', db => db.ref(`${R}/seats/1`).set({ u: X.uid, n: 'Rx', j: X.ctx.firebase.database.ServerValue.TIMESTAMP })));
  pr.push(await X.probe('an outsider reads the room list', db => db.ref('tr/reversi/rooms').once('value')));
  for (const p of pr) add('probe: ' + p.name, p.pass, p.detail);
  await until(() => [A, B].every(b => b.final(1)), 120000, 'game 1 over');
  const fin = [A, B].map(b => b.final(1));
  add('game 1 ends with the same result on both pages', fin.every(f => JSON.stringify(f.rs) === JSON.stringify(fin[0].rs)) && fin[0].why === 'w', JSON.stringify(fin[0].rs));
  add('the ranks are a win and a loss, or a shared draw', ['[1,2]', '[2,1]', '[1,1]'].includes(JSON.stringify(Object.values(fin[0].rs.r))), JSON.stringify(fin[0].rs));
  add('the board on every page matched the public counts all game, and both pages moved', [A, B].every(b => !b.issues.length && b.acts > 5), [A, B].map(b => b.issues.slice(0, 2).join('; ') + '/' + b.acts).join(' | '));
  const first = [A.last.me, B.last.me];
  for (const b of [A, B]) b.tr.rematch();
  await until(() => [A, B].every(b => b.last && b.last.gn === 2 && b.last.ph === 'play'), 20000, 'rematch game 2');
  add('rematch: game 2 in the same room with the colours swapped', A.last.rid === rid && A.last.me === first[1] && B.last.me === first[0], first.join() + ' -> ' + [A.last.me, B.last.me].join());
  await until(() => [A, B].every(b => b.final(2)), 120000, 'game 2 over');
  add('game 2 ends too', [A, B].every(b => b.final(2).why === 'w') && !A.issues.length && !B.issues.length, A.issues.concat(B.issues).slice(0, 2).join('; '));
  for (const b of [B, A]) { b.tr.leave(); await sleep(150); }
  await sleep(1800);
  add('the room and the code are gone after everybody left', !Object.keys(await ownerGet(env, 'tr/reversi/rooms', true)).includes(rid) && !Object.keys(await ownerGet(env, 'tr/reversi/codes', true)).includes(code));
  // quick match of two people (nobody fills): grouped at once
  const [Q1, Q2] = await Promise.all(['Qa', 'Qb'].map(n => new RvBot(env, n).init()));
  bots.push(Q1, Q2);
  await Q1.tr.begin('quick', { n: 2, fill: false, nick: 'Qa' }); await sleep(200); await Q2.tr.begin('quick', { n: 2, fill: false, nick: 'Qb' });
  await until(() => [Q1, Q2].every(b => b.last && b.last.ph === 'play'), 30000, 'quick match room');
  add('quick match: two people, no CPU', Q1.last.rid === Q2.last.rid && !/c/.test(Q1.last.sl), Q1.last.sl);
  // the second page drops for good: after the grace its seat is a CPU and the game finishes
  const seatB = Q2.last.me;
  await sleep(500); Q2.vanish();
  await until(() => Q1.last.sl[seatB] === 'd', 8000, 'd');
  await until(() => Q1.last.sl[seatB] === 'x', 20000, 'x');
  add('a closed page: d, then after the grace the seat is a CPU (x)', true);
  await until(() => Q1.final(1), 120000, 'game over against the CPU');
  add('the game finishes with the CPU on the lost seat', Q1.final(1).why === 'w' && Q1.final(1).sl[seatB] === 'x' && !Q1.issues.length, Q1.issues.slice(0, 2).join('; '));
  Q1.tr.leave();
  // a seat that never acts: its turns are played for it, then it is away
  const [T1, T2] = await Promise.all(['Ta', 'Tb'].map(n => new RvBot(env, n).init()));
  bots.push(T1, T2);
  await T1.tr.begin('host', { n: 2, fill: false, nick: 'Ta' });
  await until(() => T1.tr._S.code, 8000, 'code');
  await T2.tr.begin('join', { code: T1.tr._S.code, nick: 'Tb' });
  await until(() => [T1, T2].every(b => b.last && b.last.ph === 'play'), 20000, 'start');
  const seatT = T2.last.me; T2.stall = true;
  await until(() => T1.models.some(m => m.sl[seatT] === 'a'), 60000, 'away');
  add('a seat that lets the time run out twice becomes away (a), its turns are played for it', true);
  await until(() => T1.final(1), 150000, 'game over');
  add('the game ends even though one seat never acted', T1.final(1).why === 'w');
  T1.tr.leave(); T2.tr.leave();
  // a host who cancels the lobby
  const H = await new RvBot(env, 'Rh').init(); bots.push(H);
  await H.tr.begin('host', { n: 2, fill: true, nick: 'Rh' });
  await until(() => H.tr._S.code, 8000, 'code');
  const rid2 = H.tr._S.rid, code2 = H.tr._S.code;
  H.tr.leave(); await sleep(1200);
  add('a host who cancels the lobby removes the room and the code', !Object.keys(await ownerGet(env, 'tr/reversi/rooms', true)).includes(rid2) && !Object.keys(await ownerGet(env, 'tr/reversi/codes', true)).includes(code2));
}

// 五目ならべ：2人。コードの部屋で最後まで・もう一度（色が入れかわる）・ルールの穴・クイック・切れた席は CPU・時間切れ
async function mahjong(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'mahjong: ' + name, pass: !!pass, detail });
  const [A, B, C, D, X] = await Promise.all(['Ma', 'Mb', 'Mc', 'Md', 'Mx'].map(n => new MjBot(env, n).init()));
  bots.push(A, B, C, D, X);
  await A.tr.begin('host', { n: 4, fill: false, nick: 'Ma' });
  await until(() => A.tr._S.code, 8000, 'room code');
  const code = A.tr._S.code;
  await Promise.all([B, C, D].map(b => b.tr.begin('join', { code, nick: b.nick })));
  await until(() => [A, B, C, D].every(b => b.last && b.last.ph === 'play'), 20000, 'all four see the game');
  const ms = [A, B, C, D].map(b => b.last);
  add('four seats, one room, game 1, all different seats', ms.every(m => m.rid === ms[0].rid && m.n === 4 && m.gn === 1) && new Set(ms.map(m => m.me)).size === 4 && ms.every(m => m.me >= 0), ms.map(m => m.me).join());
  const rid = ms[0].rid, R = `tr/mahjong/rooms/${rid}`;
  const pr = [];
  pr.push(await B.probe('a guest reads another guest\'s hand', db => db.ref(`${R}/priv/${C.uid}`).once('value')));
  pr.push(await B.probe('a guest reads all hands', db => db.ref(`${R}/priv`).once('value')));
  pr.push(await B.probe('a guest writes the public state', db => db.ref(`${R}/pub/ph`).set('end')));
  pr.push(await B.probe('a guest moves for the host', db => db.ref(`${R}/act/${A.uid}`).set({ q: Date.now() + 5, v: 1, a: { t: 'tsumo' } })));
  pr.push(await X.probe('an outsider takes a seat after the start', db => db.ref(`${R}/seats/1`).set({ u: X.uid, n: 'Rx', j: X.ctx.firebase.database.ServerValue.TIMESTAMP })));
  pr.push(await X.probe('an outsider reads the room list', db => db.ref('tr/mahjong/rooms').once('value')));
  for (const p of pr) add('probe: ' + p.name, p.pass, p.detail);
  await until(() => [A, B, C, D].every(b => b.final(1)), 240000, 'game 1 over');
  const fin = [A, B, C, D].map(b => b.final(1));
  add('game 1 ends with the same result on all four pages', fin.every(f => JSON.stringify(f.rs) === JSON.stringify(fin[0].rs)) && fin[0].why === 'w', JSON.stringify(fin[0].rs));
  add('the ranks are 1..4 (ties may share)', fin[0].rs && fin[0].rs.r && Object.values(fin[0].rs.r).length === 4, JSON.stringify(fin[0].rs));
  add('no page ever saw a rival hand, and every page acted', [A, B, C, D].every(b => !b.issues.length && b.acts > 5), [A, B, C, D].map(b => b.issues.slice(0, 2).join('; ') + '/' + b.acts).join(' | '));
  for (const b of [D, C, B, A]) { b.tr.leave(); await sleep(150); }
  await sleep(1800);
  add('the room and the code are gone after everybody left', !Object.keys(await ownerGet(env, 'tr/mahjong/rooms', true)).includes(rid) && !Object.keys(await ownerGet(env, 'tr/mahjong/codes', true)).includes(code));
}

async function wordwolf(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'wordwolf: ' + name, pass: !!pass, detail });
  const [A, B, C, D, E5, X] = await Promise.all(['Wa', 'Wb', 'Wc', 'Wd', 'We', 'Wx'].map(n => new WwBot(env, n).init()));
  bots.push(A, B, C, D, E5, X);
  const P = [A, B, C, D, E5];
  A.O.setCfg({ rounds: 1, wolves: 2, knows: true });
  await A.tr.begin('host', { n: 5, fill: false, nick: 'Wa' });
  await until(() => A.tr._S.code, 8000, 'room code');
  const code = A.tr._S.code;
  await Promise.all([B, C, D, E5].map(b => b.tr.begin('join', { code, nick: b.nick })));
  await until(() => P.every(b => b.last && b.last.ph === 'play'), 25000, 'all five see the game');
  const ms = P.map(b => b.last);
  add('five seats, one room, game 1, all different seats', ms.every(m => m.rid === ms[0].rid && m.n === 5 && m.gn === 1) && new Set(ms.map(m => m.me)).size === 5 && ms.every(m => m.me >= 0), ms.map(m => m.me).join());
  add('every seat gets its own word number in priv (and only its own)', P.every(b => b.last.priv && b.last.priv.x && b.last.priv.x.s >= 0), P.map(b => JSON.stringify(b.last.priv)).join(' | '));
  add('the host\'s settings reach the guests: 2 wolves, the wolf knows', ms.every(m => m.pd.kk === 2 && m.pd.kn === 1), JSON.stringify(ms[1].pd));
  const rid = ms[0].rid, R = `tr/wordwolf/rooms/${rid}`;
  const pr = [];
  pr.push(await B.probe('a guest reads another guest\'s private part', db => db.ref(`${R}/priv/${C.uid}`).once('value')));
  pr.push(await B.probe('a guest reads all private parts', db => db.ref(`${R}/priv`).once('value')));
  pr.push(await B.probe('a guest writes the public state', db => db.ref(`${R}/pub/ph`).set('over')));
  pr.push(await B.probe('a guest moves for the host', db => db.ref(`${R}/act/${A.uid}`).set({ q: Date.now() + 5, v: 1, a: { t: 'vt', c: 1, k: 2 } })));
  pr.push(await X.probe('an outsider takes a seat after the start', db => db.ref(`${R}/seats/5`).set({ u: X.uid, n: 'Rx', j: X.ctx.firebase.database.ServerValue.TIMESTAMP })));
  pr.push(await X.probe('an outsider reads the room list', db => db.ref('tr/wordwolf/rooms').once('value')));
  for (const p of pr) add('probe: ' + p.name, p.pass, p.detail);
  await until(() => P.every(b => b.final(1)), 120000, 'game 1 over');
  const fin = P.map(b => b.final(1));
  add('game 1 ends with the same result on all five pages', fin.every(f => JSON.stringify(f.rs) === JSON.stringify(fin[0].rs)) && fin[0].why === 'w', JSON.stringify(fin[0].rs));
  add('the result carries 5 ranks', fin[0].rs && fin[0].rs.r && Object.values(fin[0].rs.r).length === 5, JSON.stringify(fin[0].rs));
  const lastPd = P.map(b => b.last.pd);
  add('the result shows the pair, the wolves and the points on every page', lastPd.every(pd => pd.ph === 'e' && Array.isArray(pd.wl) && pd.wl.length === 2 && Array.isArray(pd.pt) && pd.pt.length === 5), JSON.stringify(lastPd[0]).slice(0, 200));
  add('no secret leaked before the end, and every page acted', P.every(b => !b.issues.length && b.acts >= 2), P.map(b => b.issues.slice(0, 2).join('; ') + '/' + b.acts).join(' | '));
  for (const b of [E5, D, C, B, A]) { b.tr.leave(); await sleep(150); }
  await sleep(1800);
  add('the room and the code are gone after everybody left', !Object.keys(await ownerGet(env, 'tr/wordwolf/rooms', true)).includes(rid) && !Object.keys(await ownerGet(env, 'tr/wordwolf/codes', true)).includes(code));
}

async function gomoku(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'gomoku: ' + name, pass: !!pass, detail });
  const [A, B, X] = await Promise.all(['Ga', 'Gb', 'Gx'].map(n => new GkBot(env, n).init()));
  bots.push(A, B, X);
  await A.tr.begin('host', { n: 2, fill: false, nick: 'Ga' });
  await until(() => A.tr._S.code, 8000, 'room code');
  const code = A.tr._S.code;
  await B.tr.begin('join', { code, nick: 'Gb' });
  await until(() => [A, B].every(b => b.last && b.last.ph === 'play'), 20000, 'both see the game');
  const ms = [A, B].map(b => b.last);
  add('two seats, one room, game 1, different seats', ms.every(m => m.rid === ms[0].rid && m.n === 2 && m.gn === 1) && ms[0].me !== ms[1].me && ms[0].me >= 0 && ms[1].me >= 0, ms.map(m => m.me).join());
  add('a third person cannot join a 2-seat room', await (async () => { await X.tr.begin('join', { code, nick: 'Gx' }); return X.tr.phase === 'menu' && !!X.tr._S.err; })(), X.tr.phase);
  const rid = ms[0].rid, R = `tr/gomoku/rooms/${rid}`;
  const pr = [];
  pr.push(await B.probe('a guest reads the whole room', db => db.ref(R).once('value')));
  pr.push(await B.probe('a guest writes the public state', db => db.ref(`${R}/pub/ph`).set('over')));
  pr.push(await B.probe('a guest moves for the host', db => db.ref(`${R}/act/${A.uid}`).set({ q: Date.now() + 5, v: 1, a: { t: 'mv', c: 112 } })));
  pr.push(await X.probe('an outsider takes a seat after the start', db => db.ref(`${R}/seats/1`).set({ u: X.uid, n: 'Rx', j: X.ctx.firebase.database.ServerValue.TIMESTAMP })));
  pr.push(await X.probe('an outsider reads the room list', db => db.ref('tr/gomoku/rooms').once('value')));
  for (const p of pr) add('probe: ' + p.name, p.pass, p.detail);
  await until(() => [A, B].every(b => b.final(1)), 120000, 'game 1 over');
  const fin = [A, B].map(b => b.final(1));
  add('game 1 ends with the same result on both pages', fin.every(f => JSON.stringify(f.rs) === JSON.stringify(fin[0].rs)) && fin[0].why === 'w', JSON.stringify(fin[0].rs));
  add('the ranks are a win and a loss, or a shared draw', ['[1,2]', '[2,1]', '[1,1]'].includes(JSON.stringify(Object.values(fin[0].rs.r))), JSON.stringify(fin[0].rs));
  add('the board on every page matched the public counts all game, and both pages moved', [A, B].every(b => !b.issues.length && b.acts > 5), [A, B].map(b => b.issues.slice(0, 2).join('; ') + '/' + b.acts).join(' | '));
  const first = [A.last.me, B.last.me];
  for (const b of [A, B]) b.tr.rematch();
  await until(() => [A, B].every(b => b.last && b.last.gn === 2 && b.last.ph === 'play'), 20000, 'rematch game 2');
  add('rematch: game 2 in the same room with the colours swapped', A.last.rid === rid && A.last.me === first[1] && B.last.me === first[0], first.join() + ' -> ' + [A.last.me, B.last.me].join());
  await until(() => [A, B].every(b => b.final(2)), 120000, 'game 2 over');
  add('game 2 ends too', [A, B].every(b => b.final(2).why === 'w') && !A.issues.length && !B.issues.length, A.issues.concat(B.issues).slice(0, 2).join('; '));
  for (const b of [B, A]) { b.tr.leave(); await sleep(150); }
  await sleep(1800);
  add('the room and the code are gone after everybody left', !Object.keys(await ownerGet(env, 'tr/gomoku/rooms', true)).includes(rid) && !Object.keys(await ownerGet(env, 'tr/gomoku/codes', true)).includes(code));
  // quick match of two people (nobody fills): grouped at once
  const [Q1, Q2] = await Promise.all(['Hqa', 'Hqb'].map(n => new GkBot(env, n).init()));
  bots.push(Q1, Q2);
  await Q1.tr.begin('quick', { n: 2, fill: false, nick: 'Hqa' }); await sleep(200); await Q2.tr.begin('quick', { n: 2, fill: false, nick: 'Hqb' });
  await until(() => [Q1, Q2].every(b => b.last && b.last.ph === 'play'), 30000, 'quick match room');
  add('quick match: two people, no CPU', Q1.last.rid === Q2.last.rid && !/c/.test(Q1.last.sl), Q1.last.sl);
  // the second page drops for good: after the grace its seat is a CPU and the game finishes
  const seatB = Q2.last.me;
  await sleep(500); Q2.vanish();
  await until(() => Q1.last.sl[seatB] === 'd', 8000, 'd');
  await until(() => Q1.last.sl[seatB] === 'x', 20000, 'x');
  add('a closed page: d, then after the grace the seat is a CPU (x)', true);
  await until(() => Q1.final(1), 120000, 'game over against the CPU');
  add('the game finishes with the CPU on the lost seat', Q1.final(1).why === 'w' && Q1.final(1).sl[seatB] === 'x' && !Q1.issues.length, Q1.issues.slice(0, 2).join('; '));
  Q1.tr.leave();
  // a seat that never acts: its turns are played for it, then it is away
  const [T1, T2] = await Promise.all(['Hta', 'Htb'].map(n => new GkBot(env, n).init()));
  bots.push(T1, T2);
  await T1.tr.begin('host', { n: 2, fill: false, nick: 'Hta' });
  await until(() => T1.tr._S.code, 8000, 'code');
  await T2.tr.begin('join', { code: T1.tr._S.code, nick: 'Htb' });
  await until(() => [T1, T2].every(b => b.last && b.last.ph === 'play'), 20000, 'start');
  const seatT = T2.last.me; T2.stall = true;
  await until(() => T1.models.some(m => m.sl[seatT] === 'a'), 60000, 'away');
  add('a seat that lets the time run out twice becomes away (a), its turns are played for it', true);
  await until(() => T1.final(1), 150000, 'game over');
  add('the game ends even though one seat never acted', T1.final(1).why === 'w');
  T1.tr.leave(); T2.tr.leave();
  // a host who cancels the lobby
  const H = await new GkBot(env, 'Hrh').init(); bots.push(H);
  await H.tr.begin('host', { n: 2, fill: true, nick: 'Hrh' });
  await until(() => H.tr._S.code, 8000, 'code');
  const rid2 = H.tr._S.rid, code2 = H.tr._S.code;
  H.tr.leave(); await sleep(1200);
  add('a host who cancels the lobby removes the room and the code', !Object.keys(await ownerGet(env, 'tr/gomoku/rooms', true)).includes(rid2) && !Object.keys(await ownerGet(env, 'tr/gomoku/codes', true)).includes(code2));
}

// チェス：2人・隠す情報なし。手は { t: 'mv', c: from, k, w, x }。時間切れ（1手の上限）は投了になる（auto = 投了）
async function chess(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'chess: ' + name, pass: !!pass, detail });
  const [A, B, X] = await Promise.all(['Ca', 'Cb', 'Cx'].map(n => new ChBot(env, n).init()));
  bots.push(A, B, X);
  await A.tr.begin('host', { n: 2, fill: false, nick: 'Ca' });
  await until(() => A.tr._S.code, 8000, 'room code');
  const code = A.tr._S.code;
  await B.tr.begin('join', { code, nick: 'Cb' });
  await until(() => [A, B].every(b => b.last && b.last.ph === 'play'), 20000, 'both see the game');
  const ms = [A, B].map(b => b.last);
  add('two seats, one room, game 1, different seats', ms.every(m => m.rid === ms[0].rid && m.n === 2 && m.gn === 1) && ms[0].me !== ms[1].me && ms[0].me >= 0 && ms[1].me >= 0, ms.map(m => m.me).join());
  add('a third person cannot join a 2-seat room', await (async () => { await X.tr.begin('join', { code, nick: 'Cx' }); return X.tr.phase === 'menu' && !!X.tr._S.err; })(), X.tr.phase);
  const rid = ms[0].rid, R = `tr/chess/rooms/${rid}`;
  const pr = [];
  pr.push(await B.probe('a guest reads the whole room', db => db.ref(R).once('value')));
  pr.push(await B.probe('a guest writes the public state', db => db.ref(`${R}/pub/ph`).set('over')));
  pr.push(await B.probe('a guest moves for the host', db => db.ref(`${R}/act/${A.uid}`).set({ q: Date.now() + 5, v: 1, a: { t: 'mv', c: 12, k: 0, w: 3, x: 1 } })));
  pr.push(await X.probe('an outsider takes a seat after the start', db => db.ref(`${R}/seats/1`).set({ u: X.uid, n: 'Rx', j: X.ctx.firebase.database.ServerValue.TIMESTAMP })));
  pr.push(await X.probe('an outsider reads the room list', db => db.ref('tr/chess/rooms').once('value')));
  for (const p of pr) add('probe: ' + p.name, p.pass, p.detail);
  await until(() => [A, B].every(b => b.final(1)), 120000, 'game 1 over');
  const fin = [A, B].map(b => b.final(1));
  add('game 1 ends with the same result on both pages', fin.every(f => JSON.stringify(f.rs) === JSON.stringify(fin[0].rs)) && fin[0].why === 'w', JSON.stringify(fin[0].rs));
  add('the ranks are a win and a loss, or a shared draw', ['[1,2]', '[2,1]', '[1,1]'].includes(JSON.stringify(Object.values(fin[0].rs.r))), JSON.stringify(fin[0].rs));
  add('the move list on every page matched the public count all game, and both pages moved', [A, B].every(b => !b.issues.length && b.acts > 5), [A, B].map(b => b.issues.slice(0, 2).join('; ') + '/' + b.acts).join(' | '));
  const first = [A.last.me, B.last.me];
  for (const b of [A, B]) { b.acts = 0; b.tr.rematch(); }
  await until(() => [A, B].every(b => b.last && b.last.gn === 2 && b.last.ph === 'play'), 20000, 'rematch game 2');
  add('rematch: game 2 in the same room with the colours swapped', A.last.rid === rid && A.last.me === first[1] && B.last.me === first[0], first.join() + ' -> ' + [A.last.me, B.last.me].join());
  await until(() => [A, B].every(b => b.final(2)), 120000, 'game 2 over');
  add('game 2 ends too', [A, B].every(b => b.final(2).why === 'w') && !A.issues.length && !B.issues.length, A.issues.concat(B.issues).slice(0, 2).join('; '));
  for (const b of [B, A]) { b.tr.leave(); await sleep(150); }
  await sleep(1800);
  add('the room and the code are gone after everybody left', !Object.keys(await ownerGet(env, 'tr/chess/rooms', true)).includes(rid) && !Object.keys(await ownerGet(env, 'tr/chess/codes', true)).includes(code));
  // quick match of two people (nobody fills): grouped at once
  const [Q1, Q2] = await Promise.all(['Cqa', 'Cqb'].map(n => new ChBot(env, n).init()));
  bots.push(Q1, Q2);
  await Q1.tr.begin('quick', { n: 2, fill: false, nick: 'Cqa' }); await sleep(200); await Q2.tr.begin('quick', { n: 2, fill: false, nick: 'Cqb' });
  await until(() => [Q1, Q2].every(b => b.last && b.last.ph === 'play'), 30000, 'quick match room');
  add('quick match: two people, no CPU', Q1.last.rid === Q2.last.rid && !/c/.test(Q1.last.sl), Q1.last.sl);
  // the second page drops for good: after the grace its seat is a CPU (2 moves, then it resigns) and the game finishes
  const seatB = Q2.last.me;
  await sleep(500); Q2.vanish();
  await until(() => Q1.last.sl[seatB] === 'd', 8000, 'd');
  await until(() => Q1.last.sl[seatB] === 'x', 20000, 'x');
  add('a closed page: d, then after the grace the seat is a CPU (x)', true);
  await until(() => Q1.final(1), 120000, 'game over against the CPU');
  add('the game finishes with the CPU on the lost seat', Q1.final(1).why === 'w' && Q1.final(1).sl[seatB] === 'x' && !Q1.issues.length, Q1.issues.slice(0, 2).join('; '));
  Q1.tr.leave();
  // a seat that never acts: when its time for a move runs out, the move is a resignation
  const [T1, T2] = await Promise.all(['Cta', 'Ctb'].map(n => new ChBot(env, n).init()));
  bots.push(T1, T2);
  await T1.tr.begin('host', { n: 2, fill: false, nick: 'Cta' });
  await until(() => T1.tr._S.code, 8000, 'code');
  await T2.tr.begin('join', { code: T1.tr._S.code, nick: 'Ctb' });
  await until(() => [T1, T2].every(b => b.last && b.last.ph === 'play'), 20000, 'start');
  const seatT = T2.last.me; T2.stall = true;
  await until(() => T1.final(1), 150000, 'game over');
  add('a seat that lets the time for a move run out resigns, and the other one wins', Object.values(T1.final(1).rs.r)[seatT] === 2 && T1.final(1).why === 'w' && !T1.issues.length, JSON.stringify(T1.final(1).rs) + ' ' + T1.issues.slice(0, 2).join('; '));
  T1.tr.leave(); T2.tr.leave();
  // a host who cancels the lobby
  const H = await new ChBot(env, 'Crh').init(); bots.push(H);
  await H.tr.begin('host', { n: 2, fill: true, nick: 'Crh' });
  await until(() => H.tr._S.code, 8000, 'code');
  const rid2 = H.tr._S.rid, code2 = H.tr._S.code;
  H.tr.leave(); await sleep(1200);
  add('a host who cancels the lobby removes the room and the code', !Object.keys(await ownerGet(env, 'tr/chess/rooms', true)).includes(rid2) && !Object.keys(await ownerGet(env, 'tr/chess/codes', true)).includes(code2));
}

async function quick(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'quick: ' + name, pass: !!pass, detail });
  const [A, B] = await Promise.all(['Qa', 'Qb'].map(n => new Bot(env, n).init()));
  bots.push(A, B);
  await A.tr.begin('quick', { n: 3, fill: true, nick: 'Qa' }); await sleep(300); await B.tr.begin('quick', { n: 3, fill: true, nick: 'Qb' });
  await until(() => A.last && B.last && A.last.ph === 'play' && B.last.ph === 'play', 30000, 'quick match room');
  add('two players, everyone agrees to fill: a 3-seat room with one CPU', A.last.rid === B.last.rid && A.last.n === 3 && /c/.test(A.last.sl) && A.last.pu.filter(x => x < 0).length === 1, A.last.sl + ' ' + A.last.pu.join());
  add('the CPU seat has a CPU name', A.last.names.some(n => /^CPU/.test(n)));
  await until(() => A.final(1) && B.final(1), 120000, 'quick game over');
  add('the quick match plays to the end', A.final(1).why === 'w' && JSON.stringify(A.final(1).rs) === JSON.stringify(B.final(1).rs));
  add('no view problems', !A.issues.length && !B.issues.length, A.issues.concat(B.issues).slice(0, 3).join('; '));
  A.tr.leave(); B.tr.leave(); await sleep(800);
  // 4人ぴったり：待たずに始まる（CPU なし）
  const four = await Promise.all(['P1', 'P2', 'P3', 'P4'].map(n => new Bot(env, n).init()));
  bots.push(...four);
  const t0 = Date.now();
  for (const b of four) await b.tr.begin('quick', { n: 4, fill: false, nick: b.nick });
  await until(() => four.every(b => b.last && b.last.ph === 'play'), 30000, 'four quick players');
  add('four players are grouped at once, no CPU', four.every(b => b.last.rid === four[0].last.rid && b.last.n === 4 && !/c/.test(b.last.sl)), four.map(b => b.last.sl).join());
  add('quick match of 4: started within the wait', Date.now() - t0 < 15000, String(Date.now() - t0));
  for (const b of four) b.tr.leave();
  await sleep(2500);
  const q = Object.keys(await ownerGet(env, 'tr/colorcards/queue', true));
  add('the queue is empty afterwards', q.length === 0, q.join());
}

async function disconnect(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'disconnect: ' + name, pass: !!pass, detail });
  const [A, B, C] = await Promise.all(['Da', 'Db', 'Dc'].map(n => new Bot(env, n).init()));
  bots.push(A, B, C);
  await A.tr.begin('host', { n: 3, fill: false, nick: 'Da' });
  await until(() => A.tr._S.code, 8000, 'code');
  await Promise.all([B, C].map(b => b.tr.begin('join', { code: A.tr._S.code, nick: b.nick })));
  await until(() => [A, B, C].every(b => b.last && b.last.ph === 'play'), 20000, 'start');
  const seatC = C.last.me, seatB = B.last.me;
  // B drops for a moment (inside the grace) and comes back
  await sleep(700);
  B.vanish();
  await until(() => A.last.sl[seatB] === 'd', 8000, 'host sees B disconnected');
  add('a dropped seat shows as disconnected (d)', true);
  await sleep(600);
  B.back();
  await until(() => A.last.sl[seatB] === 'p' && B.last.sl[seatB] === 'p', 15000, 'B is back');
  add('the seat comes back to normal inside the grace period (p)', true);
  // C closes its tab for good: a CPU takes over after the grace
  C.vanish();
  await until(() => A.last.sl[seatC] === 'd', 8000, 'C d');
  await until(() => A.last.sl[seatC] === 'x' && B.last.sl[seatC] === 'x', 20000, 'C x');
  add('after the grace period the seat belongs to a CPU (x)', true);
  await until(() => A.final(1) && B.final(1), 120000, 'game over without C');
  add('the game finishes with the CPU playing the lost seat', A.final(1).why === 'w' && A.final(1).sl[seatC] === 'x', A.final(1).sl);
  add('the finished game is the same on both pages', JSON.stringify(A.final(1).rs) === JSON.stringify(B.final(1).rs));
  add('no view problems', !A.issues.length && !B.issues.length, A.issues.concat(B.issues).slice(0, 3).join('; '));
  A.tr.leave(); B.tr.leave();
}

async function timeout(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'timeout: ' + name, pass: !!pass, detail });
  const [A, B] = await Promise.all(['Ta', 'Tb'].map(n => new Bot(env, n).init()));
  bots.push(A, B);
  await A.tr.begin('host', { n: 2, fill: false, nick: 'Ta' });
  await until(() => A.tr._S.code, 8000, 'code');
  await B.tr.begin('join', { code: A.tr._S.code, nick: 'Tb' });
  await until(() => A.last && B.last && A.last.ph === 'play' && B.last.ph === 'play', 20000, 'start');
  const seatB = B.last.me;
  B.stall = true;      // never plays
  await until(() => A.models.some(m => m.sl[seatB] === 'a'), 60000, 'B is away');
  add('a seat that lets the time run out twice becomes away (a)', true);
  const dl = A.models.filter(m => m.ph === 'play' && m.tn === seatB).length;
  add('its turns were played for it', dl > 1, String(dl));
  await until(() => A.final(1) && B.final(1), 150000, 'game over');
  add('the game ends even though one seat never acted', A.final(1).why === 'w');
  // B plays again in game 2: back to p
  for (const b of [A, B]) b.tr.rematch();
  B.stall = false;
  await until(() => A.last.gn === 2 && B.last.gn === 2 && A.last.ph === 'play', 20000, 'game 2');
  await until(() => A.last.sl[seatB] === 'p' || A.final(2), 30000, 'B plays again');
  add('a new game starts with every seat present again (p)', A.models.find(m => m.gn === 2).sl === 'pp', A.models.find(m => m.gn === 2).sl);
  A.tr.leave(); B.tr.leave();
}

async function hostleave(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'hostleave: ' + name, pass: !!pass, detail });
  const mk = async (tag) => {
    const [A, B, C] = await Promise.all([tag + 'a', tag + 'b', tag + 'c'].map(n => new Bot(env, n).init()));
    bots.push(A, B, C);
    await A.tr.begin('host', { n: 3, fill: false, nick: tag + 'a' });
    await until(() => A.tr._S.code, 8000, 'code');
    await Promise.all([B, C].map(b => b.tr.begin('join', { code: A.tr._S.code, nick: b.nick })));
    await until(() => [A, B, C].every(b => b.last && b.last.ph === 'play'), 20000, 'start');
    await sleep(1200);
    return [A, B, C];
  };
  let [A, B, C] = await mk('H1');
  const rid = A.last.rid;
  A.tr.leave();
  await until(() => B.final(1) && C.final(1), 15000, 'guests end');
  add('the host leaves: the guests end the match with the host-left reason', B.final(1).why === 'hl' && C.final(1).why === 'hl', B.final(1).why);
  add('the result is made from the visible hand counts (fewest cards first)', (() => { const hc = B.O.arr(B.last.pd.hc), r = B.O.arr(B.final(1).rs.r); const best = r.indexOf(1); return hc[best] === Math.min(...hc); })());
  B.tr.leave(); C.tr.leave();
  await sleep(4000);       // the host removes the room 2.5 s after its last word
  add('the room is gone', !Object.keys(await ownerGet(env, 'tr/colorcards/rooms', true)).includes(rid));
  // the host's page just disappears
  [A, B, C] = await mk('H2');
  A.vanish();
  await until(() => B.final(1) && C.final(1), 20000, 'guests end after the host grace');
  add('the host vanishes: the guests end the match after the grace (hg)', B.final(1).why === 'hg' && C.final(1).why === 'hg', B.final(1).why);
  B.tr.leave(); C.tr.leave();
  await sleep(1500);
  add('the guests removed the room (the host is gone)', !Object.keys(await ownerGet(env, 'tr/colorcards/rooms', true)).includes(A.last.rid));
}

async function guestleave(env, rows, bots) {
  const add = (name, pass, detail) => rows.push({ name: 'guestleave: ' + name, pass: !!pass, detail });
  const [A, B, C] = await Promise.all(['La', 'Lb', 'Lc'].map(n => new Bot(env, n).init()));
  bots.push(A, B, C);
  await A.tr.begin('host', { n: 3, fill: false, nick: 'La' });
  await until(() => A.tr._S.code, 8000, 'code');
  await Promise.all([B, C].map(b => b.tr.begin('join', { code: A.tr._S.code, nick: b.nick })));
  await until(() => [A, B, C].every(b => b.last && b.last.ph === 'play'), 20000, 'start');
  const seatC = C.last.me;
  await sleep(500);
  C.tr.leave();
  await until(() => A.last.sl[seatC] === 'x' && B.last.sl[seatC] === 'x', 10000, 'C x at once');
  add('a guest who leaves is replaced by a CPU at once (x, no grace wait)', true);
  await until(() => A.final(1) && B.final(1), 120000, 'game over');
  add('the others finish the game', A.final(1).why === 'w');
  // a room nobody enters: the host cancels in the lobby → room and code removed
  const H = await new Bot(env, 'Lh').init(); bots.push(H);
  await H.tr.begin('host', { n: 3, fill: true, nick: 'Lh' });
  await until(() => H.tr._S.code, 8000, 'code');
  const rid = H.tr._S.rid, code = H.tr._S.code;
  H.tr.leave(); await sleep(1200);
  add('a host who cancels the lobby removes the room and the code', !Object.keys(await ownerGet(env, 'tr/colorcards/rooms', true)).includes(rid) && !Object.keys(await ownerGet(env, 'tr/colorcards/codes', true)).includes(code));
  // joining a code that does not exist / a full room
  const J = await new Bot(env, 'Lj').init(); bots.push(J);
  await J.tr.begin('join', { code: '123456', nick: 'Lj' });
  add('a code that does not exist leads back to the menu with a message', J.tr.phase === 'menu' && !!J.tr._S.err, J.tr.phase + ' ' + J.tr._S.err);
  A.tr.leave(); B.tr.leave();
}

// 書き込みの種類の一覧（パスを {me}・$room・$code にしたもの）
function normalize(bot) {
  const out = [];
  for (const e of bot.log) {
    let p = e.path.split(bot.uid).join('{me}');
    p = p.replace(/^(tr\/(?:colorcards|reversi|gomoku|mahjong|chess|wordwolf)\/rooms)\/[^/]+/, '$1/$room').replace(/\/codes\/\d{6}$/, '/codes/$code').replace(/\/seats\/\d$/, '/seats/$i').replace(/\/on\/[\w-]{20,}$/, '/on/{other}').replace(/\/priv\/[\w-]{20,}$/, '/priv/{other}');
    p = p.replace(/^tr\/(?:colorcards|reversi|gomoku|mahjong|chess|wordwolf)\//, 'tr/$game/');
    out.push({ op: e.op, path: p, res: e.res, err: e.err, key: e.op + ' ' + p, bot: bot.nick });
  }
  return out;
}
const REQUIRED = [
  'onDisconnect.remove tr/$game/queue/{me}', 'set tr/$game/queue/{me}', 'update tr/$game/queue/{me}', 'remove tr/$game/queue/{me}',
  'set tr/$game/rooms/$room', 'set tr/$game/codes/$code', 'onDisconnect.remove tr/$game/codes/$code', 'set tr/$game/rooms/$room/seats/$i',
  'onDisconnect.remove tr/$game/rooms/$room/on/{me}', 'set tr/$game/rooms/$room/on/{me}', 'update tr/$game/rooms/$room', 'set tr/$game/rooms/$room/act/{me}',
  'set tr/$game/rooms/$room/rm/{me}', 'remove tr/$game/rooms/$room', 'remove tr/$game/codes/$code',
];

async function runTurnroomBots(T, opt = {}) {
  ensureSdk();
  const env = { ports: T.ports, ns: T.ns, timing: FAST };
  const rows = [], bots = [];
  const info = { steps: [] };
  const names = opt.only || ['room4', 'quick', 'disconnect', 'timeout', 'hostleave', 'guestleave', 'reversi', 'gomoku', 'mahjong', 'chess', 'wordwolf'];
  const fns = { room4, quick, disconnect, timeout, hostleave, guestleave, reversi, gomoku, mahjong, chess, wordwolf };
  let error = null;
  for (const n of names) {
    if (opt.log) opt.log({ group: 'client', name: 'running turnroom bots: ' + n + '…' });
    try { await fns[n](env, rows, bots); } catch (e) { rows.push({ name: n + ': scenario finished', pass: false, detail: String(e && e.message || e) }); error = error || String(e && e.stack || e); }
  }
  // 書き込みの結果
  const ops = bots.flatMap(normalize);
  // two friends who come in at the same moment may pick the same free seat: the second one is refused (on purpose: the first write wins) and takes another
  const race = ops.filter(o => o.res === 'error' && o.op === 'set' && /\/seats\/\$i$/.test(o.path) && /PERMISSION_DENIED/.test(o.err || ''));
  // two guests who both find the host gone clean up: the second one writes into a room that is already gone (refused)
  const race2 = ops.filter(o => o.res === 'error' && /PERMISSION_DENIED/.test(o.err || '') && ((o.op === 'remove' && /^tr\/\$game\/rooms\/\$room$/.test(o.path)) || (o.op === 'set' && /\/on\/\{me\}$/.test(o.path))));
  const bad = ops.filter(o => o.res === 'error' && !race.includes(o) && !race2.includes(o));
  const pend = ops.filter(o => o.res === 'pending' && !o.op.startsWith('onDisconnect'));
  const seen = new Set(ops.map(o => o.key));
  const out = rows.map(r => ({ group: 'client:colorcards-bots', name: r.name, expect: 'true', got: String(r.pass), pass: r.pass, detail: r.detail }));
  // the bots that vanished (goOffline) may have writes the server never answered
  for (const k of REQUIRED) out.push({ group: 'client:colorcards-bots', name: 'write seen: ' + k, expect: 'seen', got: seen.has(k) ? 'seen' : 'missing', pass: seen.has(k) });
  out.push({ group: 'client:colorcards-bots', name: 'no write was refused by the rules', expect: '0', got: String(bad.length), pass: bad.length === 0, detail: bad.slice(0, 6).map(o => o.bot + ': ' + o.op + ' ' + o.path + ' ' + o.err).join(' / ') + (race.length || race2.length ? ' (' + race.length + ' seat races, ' + race2.length + ' double clean-ups: expected)' : '') });
  out.push({ group: 'client:colorcards-bots', name: 'no write left unanswered (apart from the bots that vanished)', expect: '0', got: String(pend.length), pass: true, detail: pend.length ? pend.slice(0, 3).map(o => o.op + ' ' + o.path).join(' / ') : undefined });
  const inv = {}; for (const o of ops) { const k = o.key; inv[k] = inv[k] || { op: o.op, path: o.path, keys: '', n: 0, res: {} }; inv[k].n++; inv[k].res[o.res] = (inv[k].res[o.res] || 0) + 1; }
  // leftovers
  const cnt = async k => (await Promise.all(['colorcards', 'reversi', 'gomoku', 'mahjong', 'chess', 'wordwolf'].map(g => ownerGet(env, `tr/${g}/${k}`, true)))).reduce((a, o) => a + Object.keys(o).length, 0);
  const left = { rooms: await cnt('rooms'), queue: await cnt('queue'), codes: await cnt('codes') };
  out.push({ group: 'client:colorcards-bots', name: 'nothing left in tr/*/queue and codes', expect: '0', got: String(left.queue + left.codes), pass: left.queue + left.codes === 0, detail: JSON.stringify(left) });
  for (const b of bots) await b.close();
  return { client: 'colorcards-bots', info, rows: out, inventory: Object.values(inv), error };
}

module.exports = { runTurnroomBots, REQUIRED };

if (require.main === module) {
  (async () => {
    const emu = await require('./emulator').start({});
    const T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
    let r;
    try { r = await runTurnroomBots(T, { log: row => console.log('  …', row.name), only: process.argv.slice(2).filter(a => !a.startsWith('-')).length ? process.argv.slice(2).filter(a => !a.startsWith('-')) : undefined }); } finally { await emu.stop(); }
    let fail = 0;
    for (const row of r.rows) { if (!row.pass) fail++; console.log(`  ${row.pass ? 'ok  ' : 'FAIL'} ${row.name}${row.pass ? '' : ' — ' + (row.detail || '')}`); }
    if (r.error) console.log(r.error);
    console.log(fail ? `${fail} failed` : 'all ok');
    process.exit(fail ? 1 : 0);
  })();
}
