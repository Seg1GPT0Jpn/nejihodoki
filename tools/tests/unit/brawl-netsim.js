// brawl/netcode.js を、画面も Firebase もなしで動かす小さな通信シミュレーター（仮想の時計）。
// 人数ぶんの「ボット」が、本物の Session（ロールバック）を使って対戦する。回線は、遅れ・ゆれ・取りこぼし・順番ちがい・重複を入れられる。
// 使い方：const r = simulate({ n: 2, lat: 80, jit: 20, loss: 0.05, frames: 3000, ... }); r.bots[i].sess ...
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const E = require(path.join(ROOT, 'brawl/engine.js'));
const NET = require(path.join(ROOT, 'brawl/netcode.js'));

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 1本の回線（送り手 → 受け手）。msg は JSON にして運ぶ（本物の RTDB も値のコピーを運ぶ）
class Link {
  constructor(o, seed) { this.o = Object.assign({ lat: 0, jit: 0, loss: 0, dup: 0, reorder: 0, down: null }, o); this.r = rng(seed); this.q = []; }
  send(kind, payload, now) {
    const o = this.o;
    if (o.down && now >= o.down[0] && now < o.down[1]) return;                 // 回線が切れている間は消える
    if (this.r() < o.loss) return;
    const copies = this.r() < o.dup ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      let d = o.lat + (o.jit ? (this.r() * 2 - 1) * o.jit : 0);
      if (this.r() < o.reorder) d += this.r() * 80;                              // たまに追いこされる
      this.q.push({ at: now + Math.max(0, d), kind, payload: JSON.stringify(payload) });
    }
  }
  take(now, out) { const rest = []; for (const m of this.q) { if (m.at <= now) out.push(m); else rest.push(m); } this.q = rest; }
}

// ボットの入力：いまの予想の状態を「コピーして」CPU に聞く（本物の人のように、見えているものに反応する）。コピーなので状態は汚れない
function botBits(sess, me, lvl, rand) {
  if (me < 0) return 0;
  const c = E.clone(sess.st);
  c.fighters[me].lvl = lvl || 2;   // CPU の強さ（コピーの中だけ）
  let b = E.cpu(c, me);
  if (rand && rand() < 0.02) b ^= E.B.J;                                         // ちょっとミスや気まぐれ
  return b & 0xffff;
}

// o: n（人数）, frames（最大のフレーム）, stage, chars[], seed, stocks, mode, time, lat/jit/loss/dup/reorder（回線）, links（席ごとの上書き）, delay, hashEvery,
//    skew（席ごとの開始のおくれ ms）, maxMs, hook(bot, tickIndex, vt)（毎フレームの前に呼ぶ）, drift（席ごとの時計の速さ。1＝ふつう）, lvl
function simulate(o) {
  const n = o.n || 2;
  const chars = o.chars || E.CHAR_IDS.slice(0, n);
  const create = { seed: o.seed || 12345, stage: o.stage || 'bench', fighters: chars.slice(0, n).map(ch => ({ ch, lvl: 0, tj: 1 })), mode: o.mode || 'stock', stocks: o.stocks || 1, time: o.time || 20, cap: o.cap || 60 };
  const bots = [];
  for (let p = 0; p < n; p++) {
    const b = { p, sess: new NET.Session({ E, create, me: p, delay: o.delay != null ? (Array.isArray(o.delay) ? o.delay[p] : o.delay) : 3, g: 1, onEvents: (evs, f) => { b.events += evs.length; } }),
      events: 0, acc: 0, clock: 0, start: (o.skew && o.skew[p]) || 0, rand: rng(777 + p * 31), hashes: [], stalls: 0, ticks: 0, outbox: [], rbDepths: [], dead: false, forfeitFired: false };
    bots.push(b);
  }
  const links = {};
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) links[a + '>' + b] = new Link(Object.assign({}, o, (o.links && o.links[a + '>' + b]) || {}), 1000 + a * 10 + b);
  const dt = 1, FR = 1000 / 60;
  const maxMs = o.maxMs || 400000;
  let vt = 1000;
  const t0 = Date.now();
  const deliver = () => {
    for (const b of bots) for (let a = 0; a < n; a++) {
      if (a === b.p) continue;
      const tmp = []; links[a + '>' + b.p].take(vt, tmp);
      for (const m of tmp) { const pl = JSON.parse(m.payload); if (m.kind === 'in') b.sess.receive(a, pl, vt); else b.sess.receiveHash(a, pl); }
    }
  };
  const flush = b => {
    const m = b.sess.pollSend(vt, false);
    if (m) for (let q = 0; q < n; q++) if (q !== b.p) links[b.p + '>' + q].send('in', Object.assign({ from: b.p }, m), vt);
    let h; while ((h = b.sess.takeHash())) { b.hashes.push(h); for (let q = 0; q < n; q++) if (q !== b.p) links[b.p + '>' + q].send('h', Object.assign({ from: b.p }, h), vt); }
  };
  for (; vt < 1000 + maxMs; vt += dt) {
    deliver();
    for (const b of bots) {
      if (b.dead) continue;
      if (vt - 1000 - b.start < 0) continue;
      b.acc += dt * ((o.drift && o.drift[b.p]) || 1);
      while (b.acc >= FR && !(b.sess.done && b.sess.done !== 'over')) {
        b.acc -= FR; b.ticks++;
        if (o.hook) o.hook(b, b.ticks, vt);
        const r = b.sess.tick(() => botBits(b.sess, b.p, o.lvl, b.rand), vt);
        if (r.resim) b.rbDepths.push(r.resim);
        if (r.waiting) b.stalls++;
        flush(b);
        for (const p of b.sess.silent(vt)) b.sess.forfeit(p, vt);
        if (b.sess.done === 'over') break;
      }
      flush(b);                                                 // 勝負がついたあとも、送りつづける（相手の最後のフレームを確定させるため）
    }
    if (bots.every(b => b.sess.done || b.dead)) { // みんな終わった：のこりの回線を流して、最後の指紋をくらべる
      for (let spin = 0; spin < 600; spin++, vt++) { deliver(); for (const b of bots) flush(b); }
      break;
    }
  }
  return { bots, vt, wallMs: Date.now() - t0, create };
}

// 席ごとの「いちばん確かな入力の記録」から、ふつうに（ロールバックなしで）通しで進めた状態を作る。ロールバックの結果と同じになるはず
function straightThrough(create, bot, frames) {
  const st = E.create(create), n = create.fighters.length;
  const upto = frames == null ? bot.sess.st.f : frames;
  for (let k = 1; k <= upto && !st.over; k++) { const ins = []; for (let p = 0; p < n; p++) ins.push(Math.max(0, bot.sess.inp[p][k])); E.step(st, ins); }
  return st;
}

module.exports = { simulate, straightThrough, Link, rng, E, NET };
