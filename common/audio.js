// ひまつぶし工房：全ゲーム共通の音（KoboAudio）
// 読み込み：<head> で <script src="../common/audio.js"></script>（i18n.js のあと）。ほかのモジュールがなくても動く。
//
// 設定：localStorage 'kobo.audio' = { v:1, master:0.8, se:1.0, bgm:0.6, mute:false }（全ゲーム共通。bgm は予約で UI に出さない）
//   移行：'kobo.audio' がなければ、'kusoge.sound' === '0' または 'nejihodoki3d.sound' === false から mute を作る（古いキーは消さない）。
//   移行期間中は 'kusoge.sound' にも '0' / '1' を書き続ける（まだ対応していないページのため）。
//
// 使い方（ゲーム）：
//   KoboAudio.tone(660, 0.08, { type: 'triangle', vol: 0.1 })   // 1音。ミュート・非表示・未解除のときは何もしない
//   KoboAudio.sfx('tap') / 'ok' / 'coin' / 'clear' / 'combo'(n) / 'fail' / 'over' / 'win' …（下の PALETTE）
//   自前の音を作るときは、KoboAudio.ctx() の AudioContext で作り、KoboAudio.se（GainNode）につなぐ
//   KoboAudio.onChange(s => …)  設定が変わったとき（ほかのタブで変えたときも）。戻り値を呼ぶと解除
//   KoboAudio.bgm               予約（オーナーの決定 7）。今は何もしない
(function (root) {
  'use strict';
  const KEY = 'kobo.audio', LEGACY = 'kusoge.sound', NEJI = 'nejihodoki3d.sound';
  const DEFAULTS = { v: 1, master: 0.8, se: 1.0, bgm: 0.6, mute: false };

  const clamp01 = (x, d) => { x = Number(x); return isFinite(x) ? Math.min(1, Math.max(0, x)) : d; };
  function normalize(o) {
    o = o && typeof o === 'object' ? o : {};
    return { v: 1, master: clamp01(o.master, DEFAULTS.master), se: clamp01(o.se, DEFAULTS.se), bgm: clamp01(o.bgm, DEFAULTS.bgm), mute: o.mute === true };
  }
  function rd(ls, k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function wr(ls, k, v) { try { if (ls) ls.setItem(k, v); } catch (e) {} }

  // 保存を読む（なければ古いキーから作る）。何度呼んでも同じ結果になる。純粋な関数として外からも使える（テスト・platform.js の MIGRATIONS）。
  function migrate(ls) {
    const raw = rd(ls, KEY);
    let s = null;
    if (raw != null) { try { s = JSON.parse(raw); } catch (e) { s = null; } }
    if (s && typeof s === 'object') {
      s = normalize(s);
      // 古いページ（まだ kobo.audio を知らない）が kusoge.sound を切り替えていたら、それに合わせる。
      // 新しいページは常に両方を同じ向きに書くので、食い違いは古いページが変えたしるし。
      const ks = rd(ls, LEGACY);
      if (ks === '0' && !s.mute) s.mute = true;
      else if (ks === '1' && s.mute) s.mute = false;
    } else {
      s = normalize(null);
      let neji = null;
      const nr = rd(ls, NEJI);
      if (nr != null) { try { neji = JSON.parse(nr); } catch (e) { neji = nr; } }
      if (rd(ls, LEGACY) === '0' || neji === false || neji === 'false') s.mute = true;
    }
    const out = JSON.stringify(s);
    if (out !== raw) wr(ls, KEY, out);
    const ks = s.mute ? '0' : '1';
    if (rd(ls, LEGACY) !== ks) wr(ls, LEGACY, ks);
    return s;
  }

  const hasDOM = typeof document !== 'undefined' && !!root.addEventListener;
  const ls = (() => { try { return root.localStorage || null; } catch (e) { return null; } })();
  let state = migrate(ls);
  const subs = new Set();
  function emit() { const c = get(); subs.forEach(f => { try { f(c); } catch (e) {} }); }
  function get() { return Object.assign({}, state); }

  // ---------- AudioContext とバス ----------
  let ac = null, masterG = null, seG = null, bgmG = null, wantRunning = false;
  const AC = root.AudioContext || root.webkitAudioContext || null;
  function build() {
    if (ac || !AC) return ac;
    try {
      ac = new AC();
      masterG = ac.createGain(); seG = ac.createGain(); bgmG = ac.createGain();
      seG.connect(masterG); bgmG.connect(masterG); masterG.connect(ac.destination);
      bgmG.gain.value = 0; // 予約：BGM を入れるまで鳴らさない
      applyGains(true);
      if (ac.addEventListener) ac.addEventListener('statechange', () => { if (ac.state === 'running') removeUnlock(); });
    } catch (e) { ac = null; }
    return ac;
  }
  function applyGains(now) {
    if (!ac) return;
    const t = ac.currentTime, m = state.mute ? 0 : state.master;
    try {
      if (now) { masterG.gain.value = m; seG.gain.value = state.se; }
      else { masterG.gain.setTargetAtTime(m, t, 0.015); seG.gain.setTargetAtTime(state.se, t, 0.015); }
    } catch (e) { try { masterG.gain.value = m; seG.gain.value = state.se; } catch (e2) {} }
  }
  function hidden() { return hasDOM && document.visibilityState === 'hidden'; }
  function resume() {
    if (!build()) return;
    wantRunning = true;
    if (ac.state !== 'running' && !hidden()) { try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }
  // iOS：最初の操作のときに作って解除する（無音を1つ鳴らす）
  const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'keydown', 'mousedown'];
  function unlock() {
    resume();
    if (!ac) return;
    try { const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch (e) {}
    if (ac.state === 'running') removeUnlock();
  }
  function removeUnlock() { if (hasDOM) UNLOCK_EVENTS.forEach(ev => root.removeEventListener(ev, unlock, true)); }
  if (hasDOM && AC) {
    UNLOCK_EVENTS.forEach(ev => root.addEventListener(ev, unlock, { capture: true, passive: true }));
    // タブを隠したら止め、戻ったら（解除済みなら）再開する
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      try {
        if (hidden()) { const p = ac.suspend(); if (p && p.catch) p.catch(() => {}); }
        else if (wantRunning) { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }
      } catch (e) {}
    });
    // ほかのタブで設定が変わったとき
    root.addEventListener('storage', e => {
      if (e.key !== KEY && e.key !== LEGACY) return;
      const before = JSON.stringify(state);
      state = migrate(ls);
      if (JSON.stringify(state) !== before) { applyGains(false); emit(); }
    });
  }

  function set(patch) {
    const before = JSON.stringify(state);
    state = normalize(Object.assign({}, state, patch || {}));
    const out = JSON.stringify(state);
    if (out === before) return get();
    wr(ls, KEY, out);
    wr(ls, LEGACY, state.mute ? '0' : '1');
    applyGains(false);
    if (!state.mute) resume(); // ミュートを外すのは操作のときなので、ここで作ってよい
    emit();
    return get();
  }
  function onChange(f) { if (typeof f !== 'function') return () => {}; subs.add(f); return () => subs.delete(f); }
  // 鳴らせるか。最初の操作の直後は resume() の完了前（suspended）でも鳴らす（再開した時点で鳴る）。
  function canPlay() {
    if (state.mute || !ac || ac.state === 'closed' || hidden() || !(state.master > 0) || !(state.se > 0)) return false;
    if (ac.state !== 'running') { if (!wantRunning) return false; resume(); }
    return true;
  }

  // ---------- 効果音の補助 ----------
  // tone(freq, dur, { type, vol, delay, slide, attack })
  function tone(freq, dur, o) {
    if (!canPlay()) return false;
    o = o || {};
    try {
      const t = ac.currentTime + (o.delay || 0), d = Math.max(0.01, dur || 0.1), v = Math.max(0.0002, o.vol == null ? 0.1 : o.vol);
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slide), t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g); g.connect(seG);
      osc.start(t); osc.stop(t + d + 0.03);
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
      return true;
    } catch (e) { return false; }
  }
  // noise(dur, { vol, delay, freq }) ：短いザッという音（当たり・崩れ）
  function noise(dur, o) {
    if (!canPlay()) return false;
    o = o || {};
    try {
      const d = Math.max(0.01, dur || 0.08), n = Math.ceil(ac.sampleRate * d), b = ac.createBuffer(1, n, ac.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime + (o.delay || 0);
      s.buffer = b; f.type = 'lowpass'; f.frequency.value = o.freq || 1800; g.gain.value = o.vol == null ? 0.12 : o.vol;
      s.connect(f); f.connect(g); g.connect(seG); s.start(t);
      s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
      return true;
    } catch (e) { return false; }
  }
  // 共通の効果音。音の大きさをゲームごとにそろえるため、まずはここから選ぶ。
  const seq = (notes, type, vol, step, dur) => notes.forEach((f, i) => tone(f, dur, { type, vol, delay: i * step }));
  const PALETTE = {
    tap() { tone(520, 0.05, { type: 'triangle', vol: 0.06 }); },
    move() { tone(330, 0.035, { type: 'square', vol: 0.025 }); },
    select() { tone(660, 0.07, { type: 'triangle', vol: 0.08, slide: 880 }); },
    pop() { tone(380, 0.09, { type: 'sine', vol: 0.12, slide: 760 }); },
    drop() { tone(260, 0.12, { type: 'sine', vol: 0.14, slide: 80 }); },
    hit() { noise(0.07, { vol: 0.14, freq: 1400 }); tone(150, 0.08, { type: 'sine', vol: 0.1, slide: 90 }); },
    ok() { seq([660, 990], 'triangle', 0.09, 0.07, 0.1); },
    coin() { seq([988, 1319], 'square', 0.04, 0.06, 0.12); },
    combo(n) { const k = Math.max(0, Math.min(8, (n | 0) - 1)); tone(523 * Math.pow(2, k / 12 * 2), 0.12, { type: 'triangle', vol: 0.1 }); },
    clear() { seq([523, 659, 784, 1047], 'triangle', 0.1, 0.06, 0.14); },
    win() { seq([784, 988, 1175, 1568], 'sine', 0.12, 0.08, 0.22); tone(392, 0.5, { type: 'triangle', vol: 0.07, delay: 0.05 }); },
    fail() { tone(220, 0.22, { type: 'sawtooth', vol: 0.05, slide: 110 }); },
    over() { seq([392, 330, 262, 196], 'triangle', 0.1, 0.14, 0.25); },
    error() { seq([180, 160], 'square', 0.04, 0.09, 0.08); },
  };
  function sfx(name) { const f = PALETTE[name]; if (!f || !canPlay()) return false; try { f.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) {} return true; }
  // ミュートのときは振動もしない（今の neji の buzz と同じ）
  function vibrate(p) { if (state.mute) return false; try { return !!(root.navigator && root.navigator.vibrate && root.navigator.vibrate(p)); } catch (e) { return false; } }

  // ---------- BGM（予約：オーナーの決定 7。今は何もしない。UI にも出さない） ----------
  const bgm = Object.freeze({
    available: false,
    get node() { return null; },
    play() { return false; },
    stop() {},
    get volume() { return state.bgm; },
  });

  root.KoboAudio = {
    KEY, DEFAULTS: Object.assign({}, DEFAULTS),
    get: get, set: set, onChange: onChange, migrate: migrate,
    get muted() { return state.mute; },
    setMuted(m) { return set({ mute: !!m }); },
    toggleMute() { return set({ mute: !state.mute }); },
    ctx() { resume(); return ac; },              // 操作のときに呼ぶ。対応していない端末では null
    get unlocked() { return !!ac && ac.state === 'running'; },
    get se() { return seG; },                    // 効果音のバス。ctx() のあとで使える
    get master() { return masterG; },
    bgm: bgm,
    canPlay: canPlay, tone: tone, noise: noise, sfx: sfx, palette: Object.keys(PALETTE), vibrate: vibrate,
    resume: resume,
  };
})(typeof window !== 'undefined' ? window : globalThis);
