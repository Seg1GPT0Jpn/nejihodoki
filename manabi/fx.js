// まなびの工房：見た目まわりの小さな部品（原作のキャラクター「ねじまる」・効果音・ふるえ・紙ふぶき・読み上げ・設定）
// 音は WebAudio で作る短い自作の電子音（外部の音源・他社の効果音は使わない）。動きは prefers-reduced-motion と「アニメーション」設定に従う。
(function (root) {
  'use strict';
  const PK = 'kusoge.manabi.prefs';
  const get = () => { try { return JSON.parse(localStorage.getItem(PK) || '{}') || {}; } catch (e) { return {}; } };
  const prefs = Object.assign({ snd: 1, hap: 1, anim: 1, say: 1 }, get());
  const setPref = (k, v) => { prefs[k] = v ? 1 : 0; try { localStorage.setItem(PK, JSON.stringify(prefs)); } catch (e) {} };
  const mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const motion = () => !!prefs.anim && !mq.matches;

  // ---------------------------------------------------------------- 音
  let ctx = null;
  function ac() {
    if (!ctx) { const C = root.AudioContext || root.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const muted = () => !prefs.snd || !!(root.KoboAudio && root.KoboAudio.muted);
  function tone(f, t0, d, type, g) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), a = c.createGain(), t = c.currentTime + t0;
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g || 0.12, t + 0.015); a.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(a); a.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  }
  const seq = (notes, type, g) => { if (muted()) return; notes.forEach(n => tone(n[0], n[1], n[2], type, g)); };
  const sfx = {
    tap() { seq([[520, 0, 0.05]], 'triangle', 0.06); },
    ok() { seq([[660, 0, 0.1], [880, 0.09, 0.16]], 'triangle', 0.12); },
    ng() { seq([[220, 0, 0.14], [165, 0.12, 0.2]], 'sawtooth', 0.06); },
    pair() { seq([[740, 0, 0.08]], 'sine', 0.1); },
    done() { seq([[523, 0, 0.12], [659, 0.11, 0.12], [784, 0.22, 0.12], [1047, 0.33, 0.28]], 'triangle', 0.12); },
    streak() { seq([[392, 0, 0.1], [523, 0.1, 0.1], [659, 0.2, 0.1], [784, 0.3, 0.1], [1047, 0.4, 0.3]], 'square', 0.05); },
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
  const api = { prefs, setPref, sfx, buzz, speak, canSpeak, mascot, confetti, motion, SKINS, shade };
  root.ManabiFx = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
