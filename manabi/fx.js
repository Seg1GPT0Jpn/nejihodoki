// まなびの工房：見た目まわりの小さな部品（原作のキャラクター「ねじまる」・効果音・ふるえ・紙ふぶき・読み上げ・設定）
// 音は WebAudio で作る短い自作の電子音（外部の音源・他社の効果音は使わない）。動きは prefers-reduced-motion と「アニメーション」設定に従う。
(function (root) {
  'use strict';
  const PK = 'kusoge.manabi.prefs';
  const get = () => { try { return JSON.parse(localStorage.getItem(PK) || '{}') || {}; } catch (e) { return {}; } };
  const prefs = Object.assign({ snd: 1, hap: 1, anim: 1, say: 1, vol: 0.8 }, get());
  const setPref = (k, v) => { prefs[k] = k === 'vol' ? Math.max(0, Math.min(1, Number(v))) : (v ? 1 : 0); try { localStorage.setItem(PK, JSON.stringify(prefs)); } catch (e) {} };
  const mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const motion = () => !!prefs.anim && !mq.matches;

  // ---------------------------------------------------------------- 音（WebAudio でつくる、すべて自作の音。他のアプリの音源は使わない）
  // ・鐘：いくつかの正弦波（1, 2.76, 5.4 倍の倍音）をそれぞれ減衰させる／マリンバ：基音＋4倍音がすぐ消える／ブラス：のこぎり波＋ローパスの開きかた
  // ・全体に、短い残響（ノイズから作ったインパルス）と、音量（prefs.vol）をかける。音のオン・オフは prefs.snd と KoboAudio.muted
  let ctx = null, master = null, verb = null, noiseBuf = null;
  function ac() {
    if (!ctx) {
      const C = root.AudioContext || root.webkitAudioContext; if (!C) return null;
      try {
        ctx = new C(); master = ctx.createGain(); master.connect(ctx.destination);
        verb = ctx.createConvolver(); const len = Math.floor(ctx.sampleRate * 0.45), buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
        verb.buffer = buf; const wet = ctx.createGain(); wet.gain.value = 0.22; verb.connect(wet); wet.connect(master);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    master.gain.value = Math.max(0, Math.min(1, prefs.vol == null ? 0.8 : prefs.vol));
    return ctx;
  }
  const muted = () => !prefs.snd || !!(root.KoboAudio && root.KoboAudio.muted);
  function out(node, c, t, send) { node.connect(master); if (send) { const g = c.createGain(); g.gain.value = send; node.connect(g); g.connect(verb); } }
  function env(c, t, a, d, peak) { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); return g; }
  function bell(f, t0, dur, vel) { // 鐘（倍音がずれていて、きらきらする）
    const c = ac(); if (!c) return; const t = c.currentTime + t0;
    [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.22, 0.35], [8.9, 0.1, 0.2]].forEach(p => { const o = c.createOscillator(), g = env(c, t, 0.005, dur * p[2], (vel || 0.16) * p[1]); o.type = 'sine'; o.frequency.value = f * p[0]; o.connect(g); out(g, c, t, 0.9); o.start(t); o.stop(t + dur * p[2] + 0.05); });
  }
  function marimba(f, t0, dur, vel) { // マリンバ（丸くて短い）
    const c = ac(); if (!c) return; const t = c.currentTime + t0;
    [[1, 1, 1], [4, 0.28, 0.25]].forEach(p => { const o = c.createOscillator(), g = env(c, t, 0.004, dur * p[2], (vel || 0.2) * p[1]); o.type = 'sine'; o.frequency.value = f * p[0]; o.connect(g); out(g, c, t, 0.5); o.start(t); o.stop(t + dur * p[2] + 0.05); });
  }
  function brass(f, t0, dur, vel) { // ファンファーレ用のブラス
    const c = ac(); if (!c) return; const t = c.currentTime + t0;
    const o = c.createOscillator(), fl = c.createBiquadFilter(), g = env(c, t, 0.03, dur, vel || 0.09); o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(500, t); fl.frequency.exponentialRampToValueAtTime(3200, t + 0.12); fl.frequency.exponentialRampToValueAtTime(900, t + dur);
    o.connect(fl); fl.connect(g); out(g, c, t, 0.6); o.start(t); o.stop(t + dur + 0.1);
  }
  function noise(t0, dur, f0, f1, vel, type) { // 風の音・クリック（ノイズをフィルターに通す）
    const c = ac(); if (!c) return; const t = c.currentTime + t0, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = env(c, t, 0.004, dur, vel);
    s.buffer = noiseBuf; fl.type = type || 'bandpass'; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = 1.2; s.connect(fl); fl.connect(g); out(g, c, t, 0.3); s.start(t); s.stop(t + dur + 0.05);
  }
  function thump(f0, f1, t0, dur, vel) { // 「ぽこっ」（ピッチが下がる丸い音。まちがいのやさしい音）
    const c = ac(); if (!c) return; const t = c.currentTime + t0, o = c.createOscillator(), g = env(c, t, 0.006, dur, vel); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); out(g, c, t, 0.15); o.start(t); o.stop(t + dur + 0.05);
  }
  const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568 };
  const semi = (f, n) => f * Math.pow(2, n / 12);
  const play = f => { if (muted()) return; try { f(); } catch (e) {} };
  const sfx = {
    tap() { play(() => noise(0, 0.025, 3200, 1800, 0.07)); },
    ok(combo) { play(() => { const k = Math.min(6, combo | 0); bell(semi(N.E5, k), 0, 0.5, 0.15); bell(semi(N.B5, k), 0.09, 0.7, 0.16); }); }, // 上がっていく明るい2音。れんぞくするほど高く
    ng() { play(() => { thump(230, 140, 0, 0.22, 0.2); noise(0, 0.12, 700, 300, 0.05, 'lowpass'); }); },
    pair() { play(() => marimba(N.G5, 0, 0.25, 0.22)); },
    combo(n) { play(() => { [N.C5, N.E5, N.G5, N.C6].slice(0, Math.min(4, 1 + (n | 0) % 4 + 1)).forEach((f, i) => bell(f, i * 0.07, 0.5, 0.12)); }); },
    done() { play(() => { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => bell(f, i * 0.11, 0.9, 0.16)); bell(N.E6, 0.5, 1.2, 0.14); marimba(N.C5 / 2, 0, 0.5, 0.2); }); },
    levelup() { play(() => { [[N.C5, N.E5, N.G5], [N.D5, N.G5, 1174.66 / 1], [N.E5, N.G5, N.C6]].forEach((ch, k) => ch.forEach(f => brass(f, k * 0.2, 0.55, 0.07))); [N.C6, N.E6, N.G6].forEach((f, i) => bell(f, 0.6 + i * 0.08, 1.1, 0.13)); }); },
    chest() { play(() => { noise(0, 0.35, 400, 5000, 0.08); const r = [N.E5, N.G5, N.B5, N.E6, N.G6, N.B5, N.E6, N.G6]; r.forEach((f, i) => bell(f * (i > 4 ? 1.5 : 1) / (i > 4 ? 1.5 : 1), 0.18 + i * 0.065, 0.6, 0.11)); }); },
    coin(k) { play(() => bell(semi(N.E6, (k | 0) * 2), 0, 0.18, 0.1)); },
    quest() { play(() => { [N.G5, N.C6, N.E6].forEach((f, i) => bell(f, i * 0.09, 0.7, 0.14)); brass(N.C5, 0, 0.4, 0.05); brass(N.G4 * 2, 0.2, 0.5, 0.05); }); },
    streak() { play(() => { noise(0, 0.45, 300, 2600, 0.06); [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6].forEach((f, i) => marimba(f, 0.05 + i * 0.07, 0.25, 0.16)); bell(N.E6, 0.55, 1, 0.14); }); },
    tick(k) { play(() => { noise(0, 0.03, k % 2 ? 2600 : 1900, k % 2 ? 2000 : 1500, 0.1); marimba(k % 2 ? 1568 : 1319, 0, 0.06, 0.07); }); }, // 時計のカチ・コチ
    wrongSoft() { sfx.ng(); },
  };
  const buzz = ms => { if (prefs.hap && root.navigator && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };

  // ---------------------------------------------------------------- 読み上げ（ブラウザの speechSynthesis。なければ何もしない）
  const canSpeak = () => !!(root.speechSynthesis && root.SpeechSynthesisUtterance) && !!prefs.say;
  function speak(text, lang, rate) {
    if (!canSpeak()) return false;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'en' ? 'en-US' : 'ja-JP'; u.rate = rate || 1;
      const vs = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [], v = vs.find(x => x.lang && x.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
      if (v) u.voice = v;
      speechSynthesis.speak(u); return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- キャラクター「ねじまる」（まるいネジ頭の子。表情：happy / cheer / sad / think / sleep）
  const SKINS = ['#ffc233', '#ff8fb1', '#7cd6ff', '#9be564', '#c3a0ff', '#ff9a62'];
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
  function mascot(expr, px, skin) {
    const col = SKINS[skin | 0] || SKINS[0], dk = shade(col, 0.72), ink = '#2b2118';
    const eyes = {
      happy: '<ellipse cx="38" cy="58" rx="6.5" ry="8" fill="#fff"/><ellipse cx="62" cy="58" rx="6.5" ry="8" fill="#fff"/><circle cx="39" cy="60" r="4" fill="' + ink + '"/><circle cx="63" cy="60" r="4" fill="' + ink + '"/><circle cx="40.5" cy="58" r="1.4" fill="#fff"/><circle cx="64.5" cy="58" r="1.4" fill="#fff"/>',
      cheer: '<path d="M31 60q7-10 14 0M55 60q7-10 14 0" stroke="' + ink + '" stroke-width="4" fill="none" stroke-linecap="round"/>',
      sad: '<ellipse cx="38" cy="60" rx="6.5" ry="8" fill="#fff"/><ellipse cx="62" cy="60" rx="6.5" ry="8" fill="#fff"/><circle cx="38" cy="63" r="4" fill="' + ink + '"/><circle cx="62" cy="63" r="4" fill="' + ink + '"/><path d="M30 50l14 4M70 50l-14 4" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>',
      think: '<ellipse cx="38" cy="58" rx="6.5" ry="8" fill="#fff"/><ellipse cx="62" cy="58" rx="6.5" ry="8" fill="#fff"/><circle cx="41" cy="55" r="4" fill="' + ink + '"/><circle cx="65" cy="55" r="4" fill="' + ink + '"/>',
      sleep: '<path d="M31 60q7 6 14 0M55 60q7 6 14 0" stroke="' + ink + '" stroke-width="4" fill="none" stroke-linecap="round"/>',
    };
    const mouth = {
      happy: '<path d="M40 76q10 10 20 0" stroke="' + ink + '" stroke-width="4" fill="none" stroke-linecap="round"/>',
      cheer: '<path d="M38 74h24q-2 16-12 16t-12-16z" fill="' + ink + '"/><path d="M43 83q7 5 14 0" stroke="#ff6b81" stroke-width="3" fill="none"/>',
      sad: '<path d="M41 82q9-9 18 0" stroke="' + ink + '" stroke-width="4" fill="none" stroke-linecap="round"/>',
      think: '<circle cx="54" cy="79" r="4" fill="' + ink + '"/>',
      sleep: '<path d="M44 78h12" stroke="' + ink + '" stroke-width="4" stroke-linecap="round"/>',
    };
    const arms = expr === 'cheer' ? '<path d="M18 62q-12-8-10-24M82 62q12-8 10-24" stroke="' + dk + '" stroke-width="7" fill="none" stroke-linecap="round"/>'
      : expr === 'think' ? '<path d="M82 66q8 6 2 16" stroke="' + dk + '" stroke-width="7" fill="none" stroke-linecap="round"/>' : '<path d="M17 70q-8 8-4 16M83 70q8 8 4 16" stroke="' + dk + '" stroke-width="7" fill="none" stroke-linecap="round"/>';
    const extra = expr === 'sad' ? '<path d="M72 64q3 7 0 10q-3-3 0-10z" fill="#7cc7ff"/>' : expr === 'cheer' ? '<path d="M10 18l3 6 6 3-6 3-3 6-3-6-6-3 6-3zM88 10l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#ffe14d"/>' : expr === 'sleep' ? '<text x="70" y="30" font-size="16" font-weight="800" fill="' + dk + '">z</text><text x="80" y="18" font-size="12" font-weight="800" fill="' + dk + '">z</text>' : '';
    return '<svg class="mascot ' + expr + '" viewBox="-6 0 112 108" width="' + px + '" height="' + (px * 108 / 112) + '" role="img" aria-label="' + (root.KoboI18n ? root.KoboI18n.t('ねじまる') : 'ねじまる') + '"><ellipse cx="50" cy="102" rx="26" ry="5" fill="rgba(0,0,0,.14)"/>'
      + '<ellipse cx="36" cy="97" rx="9" ry="5" fill="' + dk + '"/><ellipse cx="64" cy="97" rx="9" ry="5" fill="' + dk + '"/>' + arms
      + '<circle cx="50" cy="58" r="40" fill="' + col + '" stroke="' + dk + '" stroke-width="4"/><path d="M26 30L74 18" stroke="' + dk + '" stroke-width="7" stroke-linecap="round"/>'
      + '<path d="M28 33q22-9 44-5" stroke="rgba(255,255,255,.55)" stroke-width="3" fill="none" stroke-linecap="round"/>'
      + '<circle cx="28" cy="72" r="6" fill="#ff7a9a" opacity=".55"/><circle cx="72" cy="72" r="6" fill="#ff7a9a" opacity=".55"/>' + eyes[expr] + mouth[expr] + extra + '</svg>';
  }

  // ---------------------------------------------------------------- 紙ふぶき（DOM の小さな色紙。動きオフのときは出さない）
  const CONF = ['#ff5a7a', '#ffc233', '#3ddc84', '#39a7ff', '#a974ff', '#ff9a3c'];
  function confetti(host, n) {
    if (!motion() || !host) return;
    for (let i = 0; i < (n || 28); i++) {
      const p = document.createElement('i'); p.className = 'cf';
      p.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;background:' + CONF[i % CONF.length] + ';--dx:' + ((Math.random() - 0.5) * 160).toFixed(0) + 'px;--rot:' + (Math.random() * 720 - 360).toFixed(0) + 'deg;animation-delay:' + (Math.random() * 0.25).toFixed(2) + 's;animation-duration:' + (1.1 + Math.random() * 0.9).toFixed(2) + 's';
      host.appendChild(p); setTimeout(() => p.remove(), 2400);
    }
  }
  // XP の数字がふわっと上がる／ゆれる
  function floatText(host, text, cls) {
    if (!motion() || !host) return; const r = host.getBoundingClientRect(), e = document.createElement('div'); e.className = 'floatxp ' + (cls || '');
    e.textContent = text; e.style.cssText = 'left:' + (r.left + r.width / 2) + 'px;top:' + (r.top) + 'px'; document.body.appendChild(e); setTimeout(() => e.remove(), 1000);
  }
  function shake(el) { if (!motion() || !el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 450); }
  const api = { prefs, setPref, sfx, buzz, speak, canSpeak, mascot, confetti, motion, floatText, shake, SKINS, shade };
  root.ManabiFx = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
// ---- 声で答える（ブラウザの SpeechRecognition。なければ false を返して、呼び出し側が入力欄にきりかえる）
(function (root) {
  const SR = () => root.SpeechRecognition || root.webkitSpeechRecognition || null;
  root.ManabiFx.canListen = () => !!SR();
  // listen('en', text => …, err => …) → { stop }
  root.ManabiFx.listen = function (lang, onText, onErr) {
    const C = SR(); if (!C) { onErr && onErr('unsupported'); return null; }
    let done = false; const r = new C();
    r.lang = lang === 'en' ? 'en-US' : 'ja-JP'; r.interimResults = false; r.maxAlternatives = 3; r.continuous = false;
    r.onresult = e => { done = true; const alts = []; for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript); onText(alts); };
    r.onerror = e => { if (!done) { done = true; onErr && onErr(e.error || 'error'); } };
    r.onend = () => { if (!done) { done = true; onErr && onErr('nospeech'); } };
    try { r.start(); } catch (e) { done = true; onErr && onErr('start'); return null; }
    return { stop() { try { r.stop(); } catch (e) {} } };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
