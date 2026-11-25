// おもちゃ大乱闘（brawl）：オンライン対戦の「ロックステップ＋ロールバック」の中身（GGPO 方式）。画面も Firebase も使わない。node でもブラウザでも動く（window.BrawlNet）。
// ---------------------------------------------------------------------------------------------------------------------
// 考え方：engine.js は「状態 ＝ 種と入力だけで決まる」ので、みんなが同じ入力を同じフレームに使えば同じ試合になる。
//   ・自分の入力は「いまのフレーム＋入力ディレイ（2〜5）」のフレームの入力として決め、すぐ相手へ送る。
//   ・相手の入力がまだ届いていないフレームは「さっきと同じボタン」と予想して先へ進む（予測）。
//   ・本物の入力が届いて予想とちがっていたら、そのフレームの直前に保存した状態へもどして（ロールバック）、本物の入力で撃ち直す。
//   ・予想で先へ進めるのは MAX_PRED（12）フレームまで。それ以上は相手を待つ（止まる）。
//   ・60フレームごとに状態の指紋（engine の hash）を交換して、ちがっていたら desync（結果なし）。
// 人数は n（2〜4）。席 p ＝ engine のファイターの番号。
// 通信の形は、1回に送る「入力のまとめ」msg（送り手の入力フレームごとに 3文字。まだ相手が受け取ったと言っていない分と、さいきんの8フレーム分を入れる＝取りこぼし・順番ちがいに強い）。
//   msg = { g: 何試合目, f: 送り手のいまのフレーム, s: 入っている最後のフレーム, b: 先頭のフレーム, d: 入力（3文字ずつ）, a: 各席から受け取った最後の連続フレーム "n0,n1,..", t: 送った時刻, e: 相手の t, w: e を受け取ってから送るまで(ms) }
(function (root) {
  'use strict';
  const MAX_PRED = 12;     // 予想だけで先へ進めるフレーム数のうえ限
  const RING = 32;         // 残しておく状態（スナップショット）の数
  const START_FRAMES = 6;  // 最初の6フレームは、みんな入力なし（入力ディレイがどれでも同じにするため）
  const SEND_MS = 40;      // 入力のまとめを送る間隔（約3フレーム）
  const REDUNDANT = 8;     // さいきんの何フレームを毎回入れなおすか
  const MAX_BATCH = 64;    // 1回に入れるフレームのうえ限
  const CK_EVERY = 60;     // 指紋をくらべる間隔
  const MIN_DELAY = 2, MAX_DELAY = 5, FRAME_MS = 1000 / 60;
  const SILENT_MS = 5000;  // これだけ何も届かなければ、相手は切れたとみなす
  const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const AI = {}; for (let i = 0; i < 64; i++) AI[AL[i]] = i;
  // 16ビットの入力 → 3文字 / もどす
  const enc3 = v => AL[(v >> 12) & 63] + AL[(v >> 6) & 63] + AL[v & 63];
  const dec3 = (s, i) => { const a = AI[s[i]], b = AI[s[i + 1]], c = AI[s[i + 2]]; return a === undefined || b === undefined || c === undefined ? -1 : ((a << 12) | (b << 6) | c) & 0xffff; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const T30 = 0x3fffffff;

  class Session {
    // o: { E（BrawlEngine）, create（E.create の引数。人数ぶんの fighters を含む）, me（自分の席）, delay（入力ディレイ。省略で3）, rtt（わかっていれば）,
    //      onEvents(evs, frame, st)（そのフレームではじめて起きた出来事。ロールバックで撃ち直した分は、同じものを二度出さない）, maxPred }
    constructor(o) {
      const E = this.E = o.E;
      this.n = Math.max(1, (o.create.fighters || []).length);
      this.me = o.me | 0;
      this.g = o.g | 0;                  // 何試合目か（もう一度のたびに増える。ちがう試合の入力は捨てる）
      this.maxPred = o.maxPred || MAX_PRED;
      this.st = E.create(o.create);
      this.onEvents = o.onEvents || null;
      const cap = (this.st.cap || 36000) + this.maxPred + 400;
      this.cap = cap;
      this.inp = []; this.used = []; this.cf = []; this.peerAck = []; this.lastRecv = []; this.peerF = []; this.peerAt = []; this.echo = []; this.echoAt = [];
      this.peerCk = [];
      for (let p = 0; p < this.n; p++) {
        const a = new Int32Array(cap).fill(-1), u = new Int32Array(cap).fill(-1);
        for (let k = 1; k <= START_FRAMES; k++) a[k] = 0;
        this.inp.push(a); this.used.push(u); this.cf.push(START_FRAMES); this.peerAck.push(START_FRAMES);
        this.lastRecv.push(0); this.peerF.push(0); this.peerAt.push(0); this.echo.push(-1); this.echoAt.push(0); this.peerCk.push(new Map());
      }
      this.lf = START_FRAMES;            // 自分の入力が決まっている最後のフレーム
      this.delay = clamp(o.delay == null ? 3 : o.delay | 0, MIN_DELAY, MAX_DELAY);
      this.rtt = o.rtt || 0;             // ms（なめらかにした値）
      this.rttN = 0;
      this.snap = new Array(RING).fill(null);
      this.snap[0] = { f: 0, st: E.clone(this.st) };
      this.rbFrom = 0;                   // ロールバックで撃ち直しを始めるフレーム（0＝なし）
      this.evSeen = new Array(RING).fill(null);
      this.emitMax = 0;
      this.nextCk = CK_EVERY; this.ckOut = []; this.mine = new Map();
      this.lastSend = -1e9; this.started = 0;
      this.done = null;                  // null | 'over' | 'forfeit'（2人のとき、相手が切れた）| 'abort'（3人以上で1人が切れた）| 'desync'
      this.result = null;
      this.forfeited = [];
      this.skipCtr = 0; this.holdTick = 0;
      this.stats = { ticks: 0, steps: 0, rollbacks: 0, resim: 0, maxRb: 0, lastRb: 0, stalls: 0, skips: 0, delayChanges: 0, msgsIn: 0, msgsOut: 0, badMsgs: 0, maxResimMs: 0, maxPredNow: 0 };
      this.rbRecent = 0;                 // 画面に出す「いまロールバックしている」の目安（減っていく）
      this.waiting = false;              // 相手待ちで止まっている
      this.stepMs = 0;
    }

    // ---------------------------------------------------------------- 入力の知識
    minCf() { let m = 1e9; for (let p = 0; p < this.n; p++) if (!this.forfeited[p] && this.cf[p] < m) m = this.cf[p]; return m; }
    minRemoteCf() { let m = 1e9; for (let p = 0; p < this.n; p++) if (p !== this.me && !this.forfeited[p] && this.cf[p] < m) m = this.cf[p]; return m; }
    input(p, k) {
      const v = this.inp[p][k];
      if (v >= 0) return v;
      if (this.forfeited[p]) return 0;
      const c = this.cf[p]; return this.inp[p][c] >= 0 ? this.inp[p][c] : 0;   // 予想：最後にわかった入力と同じ
    }
    setDelay(d) { d = clamp(d | 0, MIN_DELAY, MAX_DELAY); if (d !== this.delay) { this.delay = d; this.stats.delayChanges++; } }
    // 往復の時間（ms）から入力ディレイ（フレーム）をきめる。1フレーム16.7ms。片道の長さぶん〜ちょっと少なめ
    // 片道のフレーム数より1つ少なめ（のこりは予想とロールバックで受けもつ。入力のもたつきと、撃ち直しの見た目のバランス）
    static delayFor(rttMs) { return clamp(Math.round((rttMs / 2) / FRAME_MS) - 1, MIN_DELAY, MAX_DELAY); }

    // ---------------------------------------------------------------- 受け取り
    // from: 送った席。msg: 上の形。now: 自分の時計（ms。performance.now() など）
    receive(from, msg, now) {
      if (this.done && this.done !== 'over') return;
      if (from === this.me || from < 0 || from >= this.n || !msg || typeof msg !== 'object') return;
      const b = msg.b | 0, s = msg.s | 0, d = typeof msg.d === 'string' ? msg.d : '';
      if (b < 1 || s < b - 1 || s >= this.cap || d.length !== (s - b + 1) * 3 || d.length > MAX_BATCH * 3 * 4) { this.stats.badMsgs++; return; }
      this.stats.msgsIn++;
      this.lastRecv[from] = now;
      const inp = this.inp[from], used = this.used[from];
      let rb = 0;
      for (let k = b, i = 0; k <= s; k++, i += 3) {
        if (inp[k] >= 0) continue;
        const v = dec3(d, i); if (v < 0) { this.stats.badMsgs++; continue; }
        inp[k] = v;
        if (k <= this.st.f && used[k] >= 0 && used[k] !== v && (!rb || k < rb)) rb = k;     // 予想がはずれた
      }
      if (rb && (!this.rbFrom || rb < this.rbFrom)) this.rbFrom = rb;
      let c = this.cf[from]; while (c + 1 < this.cap && inp[c + 1] >= 0) c++; this.cf[from] = c;
      if ((msg.f | 0) >= this.peerF[from]) { this.peerF[from] = msg.f | 0; this.peerAt[from] = now; }
      // 相手が受け取ってくれた分
      if (typeof msg.a === 'string') { const a = msg.a.split(','); const v = +a[this.me]; if (v >= 0 && v > this.peerAck[from]) this.peerAck[from] = Math.min(v, this.lf); }
      // 往復の時間：相手が受け取って返してきた、わたしの時刻 e
      if (typeof msg.t === 'number') { this.echo[from] = msg.t | 0; this.echoAt[from] = now; }
      if (typeof msg.e === 'number' && msg.e >= 0 && typeof msg.w === 'number' && msg.w >= 0 && msg.w < 5000) {
        const rtt = ((((now | 0) - (msg.e | 0)) & T30) - msg.w);
        if (rtt >= 0 && rtt < 5000) { this.rtt = this.rttN++ ? this.rtt * 0.85 + rtt * 0.15 : rtt; }
      }
    }
    // 指紋が届いた
    receiveHash(from, h) {
      if (from === this.me || !h || this.done === 'desync') return;
      const f = h.f | 0, k = this.peerCk[from]; if (f <= 0) return;
      k.set(f, [h.a >>> 0, h.b >>> 0]); if (k.size > 24) k.delete(k.keys().next().value);
      this._compare(from, f);
    }
    _compare(p, f) {
      const m = this.mine.get(f), o = this.peerCk[p].get(f);
      if (m && o && (m[0] !== o[0] || m[1] !== o[1]) && (!this.done || this.done === 'over')) { this.done = 'desync'; this.result = { why: 'desync', f, win: -1, peer: p, mine: m, theirs: o }; }   // 最後の指紋のずれも見つける
    }
    forfeit(p, now) { // 相手が切れた：その席は負け（ほかが残っていれば続ける。2人なら試合は終わる）
      if (this.done && this.done !== 'over') return;
      if (this.forfeited[p]) return;
      this.forfeited[p] = true;
      const left = []; for (let i = 0; i < this.n; i++) if (!this.forfeited[i]) left.push(i);
      if (this.n <= 2) this.done = 'forfeit', this.result = { why: 'forfeit', win: left.length ? left[0] : -1, f: this.st.f, loser: p };
      else this.done = 'abort', this.result = { why: 'abort', win: -1, f: this.st.f, loser: p };   // 3人以上：のこった人どうしで「その席の最後のフレーム」をそろえる手順がまだない。結果なしで終える
    }
    silent(now, ms) { // ms（既定5秒）だけ何も届かない席（試合が始まって、まだ続いているとき）
      const out = [];
      if (this.done && this.done !== 'over') return out;
      for (let p = 0; p < this.n; p++) if (p !== this.me && !this.forfeited[p] && this.started && now - Math.max(this.lastRecv[p], this.started) > (ms || SILENT_MS)) out.push(p);
      return out;
    }

    // ---------------------------------------------------------------- 送る
    // 一定の間隔で呼ぶと、送るまとめ（msg）か null を返す。force＝すぐ
    pollSend(now, force) {
      if (!force && now - this.lastSend < SEND_MS) return null;
      this.lastSend = now;
      let ack = 1e9; for (let p = 0; p < this.n; p++) if (p !== this.me && !this.forfeited[p] && this.peerAck[p] < ack) ack = this.peerAck[p];
      if (ack === 1e9) ack = this.lf;
      const lf = this.lf;
      let from = Math.min(ack + 1, lf - REDUNDANT + 1); from = Math.max(1, from, lf - MAX_BATCH + 1);
      let d = ''; const a = this.inp[this.me];
      for (let k = from; k <= lf; k++) d += enc3(a[k] < 0 ? 0 : a[k]);
      // 相手の最新の t を、受け取ってから何ms たったかといっしょに返す（往復の時間をはかるため）
      let e = -1, w = 0, bestAt = -1;
      for (let p = 0; p < this.n; p++) if (p !== this.me && this.echo[p] >= 0 && this.echoAt[p] > bestAt) { bestAt = this.echoAt[p]; e = this.echo[p]; w = Math.min(59999, Math.max(0, Math.round(now - this.echoAt[p]))); }
      const acks = []; for (let p = 0; p < this.n; p++) acks.push(p === this.me ? lf : this.cf[p]);
      this.stats.msgsOut++;
      return { g: this.g | 0, f: this.st.f, s: lf, b: from, d, a: acks.join(','), t: Math.round(now) & T30, e, w };
    }
    // 取り出し待ちの指紋（1つずつ）
    takeHash() { return this.ckOut.length ? this.ckOut.shift() : null; }

    // ---------------------------------------------------------------- 進める
    // 自分の「いまの時刻」から、相手より先に行きすぎていないか（フレーム）。正＝わたしの方が進んでいる
    advantage(now) {
      let best = 0, any = false;
      for (let p = 0; p < this.n; p++) {
        if (p === this.me || this.forfeited[p] || !this.peerAt[p]) continue;
        const peerNow = this.peerF[p] + ((now - this.peerAt[p]) + this.rtt / 2) / FRAME_MS;
        const adv = this.st.f - peerNow; if (!any || adv > best) { best = adv; any = true; }
      }
      return any ? best : 0;
    }
    // 1/60秒ぶんの進行。getBits() は、このフレームを進めるときだけ呼ぶ（キーボードやタッチの状態を読む係。1フレームに1回）
    // 戻り値: { advanced, resim（撃ち直したフレーム数）, waiting（相手待ち）, skipped（先に行きすぎたので1フレーム休んだ） }
    tick(getBits, now) {
      const S = this.stats; S.ticks++;
      const out = { advanced: false, resim: 0, waiting: false, skipped: false };
      if (!this.started) this.started = now;
      if (this.done && this.done !== 'over') return out;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      if (this.rbFrom) { out.resim = this._rollback(this.rbFrom); this.rbFrom = 0; }
      const E = this.E;
      if (!this.st.over) {
        const j = this.st.f + 1, pred = j - this.minRemoteCf();
        if (pred > S.maxPredNow) S.maxPredNow = pred;
        if (pred > this.maxPred) { out.waiting = true; S.stalls++; }
        else if (this.advantage(now) >= 3 && ++this.skipCtr % 3 !== 0) { out.skipped = true; S.skips++; }   // 相手より先に行きすぎ：3回に2回、休む
        else {
          const want = j + this.delay;
          if (this.lf < want) {
            const bits = getBits() & 0xffff;
            while (this.lf < want) { this.inp[this.me][++this.lf] = bits; }
            this.cf[this.me] = this.lf;
          }
          this._stepFrame(this.st, j);
          out.advanced = true; S.steps++;
        }
      }
      this.waiting = out.waiting;
      if (out.resim) { S.rollbacks++; S.resim += out.resim; S.lastRb = out.resim; if (out.resim > S.maxRb) S.maxRb = out.resim; this.rbRecent = Math.max(this.rbRecent, out.resim); }
      else if (this.rbRecent > 0) this.rbRecent = Math.max(0, this.rbRecent - 0.05);
      if (t0) { this.stepMs = performance.now() - t0; if (out.resim && this.stepMs > S.maxResimMs) S.maxResimMs = this.stepMs; }
      this._checkpoints();
      if (this.st.over && !this.done && this.st.f <= this.minCf()) {
        this.done = 'over'; const st = this.st;
        this.result = { why: st.why || 'ko', win: st.win, f: st.f, res: st.res };
        const h = E.hash(st); this.mine.set(st.f, h); this.ckOut.push({ f: st.f, a: h[0], b: h[1], fin: 1 });
        for (let p = 0; p < this.n; p++) if (p !== this.me) this._compare(p, st.f);
      }
      return out;
    }
    // 1フレームぶん進める（はじめてのときも、撃ち直しのときも）。出来事は、そのフレームではじめて起きたものだけ外へ出す
    _stepFrame(st, j) {
      const ins = [];
      for (let p = 0; p < this.n; p++) { const v = this.input(p, j); ins.push(v); this.used[p][j] = v; }
      const evs = this.E.step(st, ins);
      if (st.f !== j) return;                      // 試合が終わっているので進まなかった
      this.snap[j % RING] = { f: j, st: this.E.clone(st) };
      if (this.onEvents && evs.length) {
        const seen = this.evSeen[j % RING] && this.evSeen[j % RING].f === j ? this.evSeen[j % RING] : (this.evSeen[j % RING] = { f: j, s: new Set() });
        const fresh = [];
        for (const e of evs) { const key = e.t + '|' + e.i + '|' + (e.d != null ? e.d : '') + '|' + (e.k || e.how || ''); if (!seen.s.has(key)) { seen.s.add(key); fresh.push(e); } }
        if (fresh.length) { try { this.onEvents(fresh, j, st); } catch (err) { /* 画面側のエラーで試合を止めない */ } }
      }
      if (j > this.emitMax) this.emitMax = j;
    }
    _rollback(k) {
      const sn = this.snap[(k - 1) % RING];
      if (!sn || sn.f !== k - 1) { this.done = 'desync'; this.result = { why: 'desync', f: k, win: -1, lost: true }; return 0; }   // ありえない（MAX_PRED より前には戻らない）
      const cur = this.st.f, st = this.E.clone(sn.st);
      for (let f = k; f <= cur && !st.over; f++) this._stepFrame(st, f);
      this.st = st;
      return cur - k + 1;
    }
    // 全員の入力がそろったフレームの指紋を作る
    _checkpoints() {
      const mc = this.minCf();
      while (this.nextCk <= mc && this.nextCk <= this.st.f) {
        const f = this.nextCk; this.nextCk += CK_EVERY;
        const sn = this.snap[f % RING]; if (!sn || sn.f !== f) continue;
        const h = this.E.hash(sn.st); this.mine.set(f, h); if (this.mine.size > 24) this.mine.delete(this.mine.keys().next().value);
        this.ckOut.push({ f, a: h[0], b: h[1] });
        for (let p = 0; p < this.n; p++) if (p !== this.me) this._compare(p, f);
      }
    }
    // 画面に出す値
    info(now) {
      const adv = this.advantage(now || 0);
      return { f: this.st.f, rtt: Math.round(this.rtt), delay: this.delay, rb: this.rbRecent, waiting: this.waiting, adv: Math.round(adv * 10) / 10, pred: this.st.f + 1 - this.minRemoteCf() };
    }
  }

  // 試合のまえの、往復の時間はかり（ロビーで入力ディレイを決めるため）。msg の t / e / w だけを使う
  class Pinger {
    constructor() { this.rtt = 0; this.n = 0; this.echo = -1; this.echoAt = 0; }
    poll(now) { return { t: Math.round(now) & T30, e: this.echo, w: this.echo >= 0 ? Math.min(59999, Math.max(0, Math.round(now - this.echoAt))) : 0 }; }
    receive(msg, now) {
      if (!msg || typeof msg !== 'object') return;
      if (typeof msg.t === 'number') { this.echo = msg.t | 0; this.echoAt = now; }
      if (typeof msg.e === 'number' && msg.e >= 0 && typeof msg.w === 'number' && msg.w >= 0 && msg.w < 5000) {
        const rtt = ((((now | 0) - (msg.e | 0)) & T30) - msg.w);
        if (rtt >= 0 && rtt < 5000) { this.rtt = this.n++ ? this.rtt * 0.7 + rtt * 0.3 : rtt; }
      }
    }
  }

  const api = { Session, Pinger, MAX_PRED, RING, START_FRAMES, SEND_MS, CK_EVERY, SILENT_MS, MIN_DELAY, MAX_DELAY, FRAME_MS, enc3, dec3, AL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BrawlNet = api;
})(typeof window !== 'undefined' ? window : globalThis);
