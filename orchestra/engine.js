// orchestra/engine.js — the 指揮者ゲーム's rules and timing, with no DOM and no Web Audio (so it runs headless in the unit tests).
// UMD: window.OrchEngine in the browser, module.exports in Node (tools/tests/unit/orchestra-*.test.js).
//
//   Score        a piece (orchestra/scores/<id>.json): conductor-beat grid, tempo guide, dynamics guide, cues, notes -> time-ordered note-on/off events.
//   BeatDetector baton positions (x, y, t) -> ictus events (the turning point that ends a down / sideways stroke) with stroke size and speed.
//   MotionDetector  optional phone DeviceMotion samples -> ictus events (vertical acceleration peak).
//   BeatClock    the musical clock: beats <-> seconds with a live tempo, so no time-stretching is ever needed; it can wait at a beat for the next ictus.
//   Session      Score + BeatClock + lookahead scheduler + scoring. The page feeds it ictus / level / cue and a time source, and gives it a sink (the sampler).
//   Scorer       tempo steadiness, dynamics match, cue accuracy -> 0..100 and stars.
//
// Time: every function takes seconds on one monotonic timeline (the page uses AudioContext.currentTime; the tests use a fake clock).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrchEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // Sections: the seating plan (x, y on a 0..1 stage with the podium at the bottom centre), the stereo position, and how far back they sit.
  // ------------------------------------------------------------------------------------------------------------------------------------------
  const SECTIONS = {
    vln1: { inst: 'vln', ja: '第1ヴァイオリン', en: '1st Violins', ab: { ja: 'Vn1', en: 'Vn1' }, x: 0.17, y: 0.66, pan: -0.72, back: 0.15, n: 8, hue: 8, mix: 1.0 },
    vln2: { inst: 'vln', ja: '第2ヴァイオリン', en: '2nd Violins', ab: { ja: 'Vn2', en: 'Vn2' }, x: 0.33, y: 0.58, pan: -0.38, back: 0.25, n: 7, hue: 22, mix: 0.92 },
    vla: { inst: 'vla', ja: 'ヴィオラ', en: 'Violas', ab: { ja: 'Va', en: 'Va' }, x: 0.67, y: 0.58, pan: 0.36, back: 0.25, n: 5, hue: 40, mix: 1.0 },
    vc: { inst: 'vc', ja: 'チェロ', en: 'Cellos', ab: { ja: 'Vc', en: 'Vc' }, x: 0.83, y: 0.66, pan: 0.68, back: 0.2, n: 4, hue: 28, mix: 1.0 },
    cb: { inst: 'cb', ja: 'コントラバス', en: 'Basses', ab: { ja: 'Cb', en: 'Cb' }, x: 0.91, y: 0.44, pan: 0.85, back: 0.5, n: 3, hue: 16, mix: 0.9 },
    fl: { inst: 'fl', ja: 'フルート', en: 'Flutes', ab: { ja: 'Fl', en: 'Fl' }, x: 0.36, y: 0.42, pan: -0.24, back: 0.5, n: 2, hue: 190, mix: 1.0 },
    ob: { inst: 'ob', ja: 'オーボエ', en: 'Oboes', ab: { ja: 'Ob', en: 'Ob' }, x: 0.46, y: 0.40, pan: -0.08, back: 0.52, n: 2, hue: 160, mix: 1.0 },
    cl: { inst: 'cl', ja: 'クラリネット', en: 'Clarinets', ab: { ja: 'Cl', en: 'Cl' }, x: 0.56, y: 0.40, pan: 0.1, back: 0.52, n: 2, hue: 210, mix: 1.0 },
    fg: { inst: 'fg', ja: 'ファゴット', en: 'Bassoons', ab: { ja: 'Fg', en: 'Fg' }, x: 0.66, y: 0.42, pan: 0.26, back: 0.5, n: 2, hue: 120, mix: 1.0 },
    hn: { inst: 'hn', ja: 'ホルン', en: 'Horns', ab: { ja: 'Hn', en: 'Hn' }, x: 0.30, y: 0.25, pan: -0.34, back: 0.78, n: 4, hue: 48, mix: 1.0 },
    tp: { inst: 'tp', ja: 'トランペット', en: 'Trumpets', ab: { ja: 'Tp', en: 'Tp' }, x: 0.46, y: 0.19, pan: -0.05, back: 0.9, n: 2, hue: 52, mix: 0.95 },
    tb: { inst: 'tb', ja: 'トロンボーン', en: 'Trombones', ab: { ja: 'Tb', en: 'Tb' }, x: 0.62, y: 0.19, pan: 0.2, back: 0.9, n: 3, hue: 36, mix: 0.95 },
    tu: { inst: 'tu', ja: 'チューバ', en: 'Tuba', ab: { ja: 'Tu', en: 'Tu' }, x: 0.74, y: 0.27, pan: 0.5, back: 0.9, n: 1, hue: 24, mix: 0.95 },
    timp: { inst: 'timp', ja: 'ティンパニ', en: 'Timpani', ab: { ja: 'Timp', en: 'Timp' }, x: 0.80, y: 0.24, pan: 0.44, back: 0.95, n: 1, hue: 0, mix: 1.0 },
    perc: { inst: 'bd', ja: '大太鼓', en: 'Bass drum', ab: { ja: 'BD', en: 'BD' }, x: 0.12, y: 0.36, pan: -0.55, back: 0.9, n: 1, hue: 0, mix: 0.9 },
  };
  const SECTION_ORDER = ['vln1', 'vln2', 'vla', 'vc', 'cb', 'fl', 'ob', 'cl', 'fg', 'hn', 'tp', 'tb', 'tu', 'timp', 'perc'];
  const DYN_MARKS = ['pp', 'pp', 'p', 'mp', 'mf', 'f', 'f', 'ff', 'ff']; // digit 0..8 of the score's dynamics guide
  const KEYS = '1234567890qwertyu'.split('');


  // ------------------------------------------------------------------------------------------------------------------------------------------
  // Dynamics: baton stroke -> level (0.04..1), one perceptual curve for every input device. Soft is easy (an ordinary small, slow stroke gives p..mp, a mouse
  // micro-movement pp, ppp with tiny strokes), mf needs a moderate stroke, f and ff need a really big, fast swing. Same scale as the score's dynamics guide.
  //   exertion x = 0.55 * amplitude/ampRef + 0.45 * speed/spdRef   (amp: fraction of min(stage width, height); speed: stage-fractions per second)
  //   level = piecewise-linear through ANCHORS (monotone), then *sensitivity* scales x (low 0.8, standard 1, high 1.25).
  // ------------------------------------------------------------------------------------------------------------------------------------------
  const DYN_ANCHORS = [[0, 0.04], [0.06, 0.09], [0.16, 0.19], [0.30, 0.30], [0.45, 0.40], [0.58, 0.50], [0.74, 0.65], [0.98, 0.85], [1.25, 1]];
  const DYN_DEVICE = { mouse: { amp: 0.72, spd: 3.6 }, touch: { amp: 0.62, spd: 3.2 }, motion: { amp: 0.5, spd: 1 }, key: { amp: 1, spd: 1 } };
  const DYN_SENS = { low: 0.8, mid: 1, high: 1.25 };
  const Dynamics = {
    ANCHORS: DYN_ANCHORS, SENS: DYN_SENS, DEVICES: DYN_DEVICE,
    curve(x) { const A = DYN_ANCHORS; if (x <= 0) return A[0][1]; for (let i = 1; i < A.length; i++) if (x <= A[i][0]) { const a = A[i - 1], b = A[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return 1; },
    exertion(amp, speed, device) { const d = DYN_DEVICE[device] || DYN_DEVICE.mouse; if (device === 'motion') return Math.max(0, amp - 0.04) / d.amp; return 0.55 * amp / d.amp + 0.45 * (speed || 0) / d.spd; },
    // amp, speed as reported by BeatDetector ({amp, speed}); device 'mouse' | 'touch' | 'motion'; sens 'low' | 'mid' | 'high'
    level(amp, speed, device, sens) { return Dynamics.curve(Dynamics.exertion(amp, speed, device) * (DYN_SENS[sens] || 1)); },
    // keyboard Up/Down: step 0..10 -> level (ppp .. ff), not affected by sensitivity
    keyLevel(step) { return Dynamics.curve(clamp(step, 0, 10) * 0.125); },
    // short smoothing between strokes: dt seconds since the previous ictus; a jump is followed 65-75 % of the way
    smooth(prev, lv, dt) { const a = 1 - Math.exp(-(dt > 0 ? dt : 0.5) / 0.28); return prev + (lv - prev) * clamp(a, 0.4, 0.85); },
    // 0..1 -> mark name (ppp..ff), the thresholds sit at the mid-points of the marks' target levels
    MARKS: [['ppp', 0.12], ['pp', 0.24], ['p', 0.34], ['mp', 0.45], ['mf', 0.57], ['f', 0.74], ['ff', 1.01]],
    mark(lv) { for (const m of Dynamics.MARKS) if (lv < m[1]) return m[0]; return 'ff'; },
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // Difficulty
  // ------------------------------------------------------------------------------------------------------------------------------------------
  const DIFFS = {
    enjoy: { id: 'enjoy', slack: 0.6, wait: true, autoCue: true, uncued: 1, tol: 1.7, steady: 1.8, assist: 0.35, stars: [1, 60, 78], cueWeight: 0 },
    normal: { id: 'normal', slack: 0.3, wait: true, autoCue: false, uncued: 0.42, tol: 1.0, steady: 1.0, assist: 0, stars: [50, 70, 85], cueWeight: 0.28 },
    maestro: { id: 'maestro', slack: 0.1, wait: true, autoCue: false, uncued: 0.15, tol: 0.72, steady: 0.7, assist: 0, stars: [55, 75, 88], cueWeight: 0.3 },
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // Score
  // ------------------------------------------------------------------------------------------------------------------------------------------
  function Score(j) {
    this.json = j; this.id = j.id; this.ppq = j.ppq || 96;
    const bt = [], bib = [], bar = [], pat = []; let nb = 0;
    j.grid.forEach(g => { const t0 = g[0], bars = g[1], bpb = g[2], tk = g[3]; for (let b = 0; b < bars; b++) { for (let i = 0; i < bpb; i++) { bt.push(t0 + (b * bpb + i) * tk); bib.push(i); bar.push(nb); pat.push(bpb); } nb++; } });
    this.nBeats = bt.length; this.nBars = nb;
    this.beatTick = Float64Array.from(bt); this.beatInBar = bib; this.barOfBeat = bar; this.patternOfBeat = pat;
    const last = j.grid[j.grid.length - 1]; this.lastBeatTicks = last[3];
    this.endTick = bt[bt.length - 1] + this.lastBeatTicks;
    this.bpmRuns = j.bpm; this.dyn = j.dyn;
    this.sections = j.sec.map((s, i) => ({ index: i, id: s.id, inst: s.inst, def: SECTIONS[s.id] }));
    this.secIndex = {}; this.sections.forEach(s => { this.secIndex[s.id] = s.index; });
    this.cues = (j.cues || []).map(c => ({ b: c[0], secs: c[1].slice(), tutti: c[1].length >= 5 }));
    // events: note-on / note-off in beats, offs before ons at the same beat
    const ev = []; let id = 0;
    j.sec.forEach((s, si) => {
      let t = 0;
      for (let i = 0; i < s.n.length; i += 4) {
        t += s.n[i]; const dur = s.n[i + 2], short = dur < 0 ? 1 : 0, d = Math.abs(dur);
        const on = this.tickToBeat(t), off = this.tickToBeat(t + d);
        ev.push({ b: on, k: 1, si, pitch: s.n[i + 1], vel: s.n[i + 3], short, id, dur: off - on }); ev.push({ b: Math.max(off, on + 0.01), k: 0, si, id });
        id++;
      }
    });
    ev.sort((a, c) => a.b - c.b || a.k - c.k || a.id - c.id);
    this.events = ev; this.noteCount = id;
  }
  Score.prototype.tickToBeat = function (tick) {
    const bt = this.beatTick, n = bt.length;
    if (tick >= bt[n - 1]) return n - 1 + (tick - bt[n - 1]) / this.lastBeatTicks;
    if (tick <= 0) return tick / (bt[1] - bt[0] || this.lastBeatTicks);
    let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bt[m] <= tick) lo = m; else hi = m - 1; }
    return lo + (tick - bt[lo]) / (bt[lo + 1] - bt[lo]);
  };
  Score.prototype.beatToTick = function (b) {
    const bt = this.beatTick, n = bt.length;
    if (b >= n - 1) return bt[n - 1] + (b - (n - 1)) * this.lastBeatTicks;
    if (b <= 0) return b * (bt[1] - bt[0]);
    const i = Math.floor(b); return bt[i] + (b - i) * (bt[i + 1] - bt[i]);
  };
  Score.prototype.bpmAt = function (b) { let v = this.bpmRuns[0][1]; for (let i = 0; i < this.bpmRuns.length; i++) { if (this.bpmRuns[i][0] > b) break; v = this.bpmRuns[i][1]; } return v; };
  // the dynamics guide, 0..1, linear between beat centres
  Score.prototype.dynAt = function (b) {
    const d = this.dyn, n = d.length; const x = clamp(b - 0.5, 0, n - 1), i = Math.floor(x), f = x - i;
    const g = k => (d.charCodeAt(clamp(k, 0, n - 1)) - 48 + 0.5) / 9;
    return lerp(g(i), g(i + 1), f);
  };
  Score.prototype.markAt = function (b) { const i = clamp(Math.floor(b), 0, this.nBeats - 1); return DYN_MARKS[this.dyn.charCodeAt(i) - 48] || 'mf'; };
  Score.prototype.barOf = function (b) { return this.barOfBeat[clamp(Math.floor(b), 0, this.nBeats - 1)] + 1; };
  Score.prototype.guideSeconds = function () { let s = 0; for (let b = 0; b < this.nBeats; b++) s += 60 / this.bpmAt(b); return s; };


  // sliceScore(json, from, to): a copy of a score JSON that holds only the conductor beats [from, to) (both bar lines). Used for the "part" choice of long movements.
  // Notes that start before `from` are dropped (like the build tool's excerpts), notes running past `to` are cut; cues, tempo and dynamics guide are shifted.
  function sliceScore(j, from, to) {
    const bt = [], bpbs = []; j.grid.forEach(g => { for (let b = 0; b < g[1]; b++) { for (let i = 0; i < g[2]; i++) bt.push(g[0] + (b * g[2] + i) * g[3]); bpbs.push([g[2], g[3]]); } });
    const n = bt.length; from = clamp(Math.round(from), 0, n - 1); to = clamp(Math.round(to), from + 1, n);
    const t0 = bt[from], lastTk = j.grid[j.grid.length - 1][3], t1 = to < n ? bt[to] : bt[n - 1] + lastTk;
    // grid: walk bars, start a bar at beat index `from`
    const grid = []; let bi = 0, beat = 0;
    j.grid.forEach(g => { for (let b = 0; b < g[1]; b++) { const bs = beat, be = beat + g[2]; beat = be; if (bs < from || bs >= to) continue;
      const last = grid[grid.length - 1]; if (last && last[2] === g[2] && last[3] === g[3]) last[1]++; else grid.push([bt[bs] - t0, 1, g[2], g[3]]); } });
    const bpm = []; let cur = j.bpm[0][1]; j.bpm.forEach(r => { if (r[0] <= from) cur = r[1]; });
    bpm.push([0, cur]); j.bpm.forEach(r => { if (r[0] > from && r[0] < to) bpm.push([r[0] - from, r[1]]); });
    const sec = j.sec.map(sc => { const out = []; let t = 0, prev = 0;
      for (let i = 0; i < sc.n.length; i += 4) { t += sc.n[i]; if (t < t0 || t >= t1) continue; const d = sc.n[i + 2], ad = Math.min(Math.abs(d), t1 - t); out.push(t - t0 - prev, sc.n[i + 1], d < 0 ? -ad : ad, sc.n[i + 3]); prev = t - t0; }
      return { id: sc.id, inst: sc.inst, n: out }; }).filter(sc => sc.n.length);
    const o = Object.assign({}, j, { id: j.id, grid, bpm, dyn: j.dyn.slice(from, to), cues: (j.cues || []).filter(c => c[0] >= from && c[0] < to).map(c => [c[0] - from, c[1]]), nBeats: to - from, sec });
    return o;
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // BeatDetector: baton -> ictus.  A stroke runs from one turning point to the next. The turning point that ends a stroke which went down or sideways is an ictus;
  // the turning point at the top of a rebound (a stroke that went up) is not. Units: positions are in pixels, scale = min(stage width, height).
  // ------------------------------------------------------------------------------------------------------------------------------------------
  function BeatDetector(o) {
    o = o || {};
    this.scale = o.scale || 400; this.minStroke = o.minStroke || 0.07; this.minGap = o.minGap || 0.2; this.retreat = o.retreat || 0.3; this.minRev = o.minRev || 0.018;
    this.reset();
  }
  BeatDetector.prototype.reset = function () { this.s = null; this.last = -1e9; this.px = this.py = null; };
  BeatDetector.prototype.setScale = function (s) { this.scale = Math.max(50, s); };
  // the current beat period (s): no second beat closer than 0.6 x period (and 180 ms)
  BeatDetector.prototype.setPeriod = function (p) { this.period = p; };
  BeatDetector.prototype.push = function (x, y, t) {
    const out = [], S = this.scale;
    if (!this.s) { this.s = { x0: x, y0: y, t0: t, fx: x, fy: y, ft: t, fd: 0, pk: 0 }; this.px = x; this.py = y; return out; }
    const s = this.s;
    // smooth a little (mouse jitter) but keep the time of the raw sample
    const sx = this.px * 0.4 + x * 0.6, sy = this.py * 0.4 + y * 0.6; this.px = sx; this.py = sy;
    const d = Math.hypot(sx - s.x0, sy - s.y0) / S;
    const stepSpeed = t > s.pt ? Math.hypot(sx - (s.lx == null ? sx : s.lx), sy - (s.ly == null ? sy : s.ly)) / S / (t - s.pt) : 0;
    if (stepSpeed > s.pk) s.pk = stepSpeed;
    s.lx = sx; s.ly = sy; s.pt = t;
    if (d >= s.fd) { s.fd = d; s.fx = sx; s.fy = sy; s.ft = t; return out; }
    const back = Math.hypot(sx - s.fx, sy - s.fy) / S;
    const rev = Math.max(this.minRev, this.retreat * s.fd);
    if (back >= rev) {
      const dx = s.fx - s.x0, dy = s.fy - s.y0, len = Math.hypot(dx, dy) / S;
      const up = dy < -0.55 * Math.hypot(dx, dy);
      if (len >= this.minStroke && !up && s.ft - this.last >= Math.max(this.minGap, 0.18, 0.6 * (this.period || 0))) {
        out.push({ type: 'ictus', t: s.ft, amp: len, speed: s.pk, x: s.fx, y: s.fy, dir: Math.atan2(dy, dx) });
        this.last = s.ft;
      }
      // the next stroke starts at the turning point
      this.s = { x0: s.fx, y0: s.fy, t0: s.ft, fx: sx, fy: sy, ft: t, fd: Math.hypot(sx - s.fx, sy - s.fy) / S, pk: 0, lx: sx, ly: sy, pt: t };
    }
    return out;
  };
  // a quick straight swipe toward a seat -> a cue. Feed the same points; returns { dir, len } or null on a release.
  function FlickDetector(o) { o = o || {}; this.scale = o.scale || 400; this.minLen = o.minLen || 0.22; this.maxMs = o.maxMs || 650; this.straight = o.straight || 0.82; this.pts = []; }
  FlickDetector.prototype.setScale = function (s) { this.scale = Math.max(50, s); };
  FlickDetector.prototype.reset = function () { this.pts = []; };
  FlickDetector.prototype.push = function (x, y, t) { this.pts.push([x, y, t]); while (this.pts.length > 2 && t - this.pts[0][2] > this.maxMs / 1000) this.pts.shift(); };
  FlickDetector.prototype.check = function () {
    const p = this.pts; if (p.length < 3) return null;
    const a = p[0], b = p[p.length - 1]; let path = 0; for (let i = 1; i < p.length; i++) path += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len / this.scale < this.minLen || path <= 0 || len / path < this.straight) return null;
    this.pts = []; return { x0: a[0], y0: a[1], x1: b[0], y1: b[1], len: len / this.scale };
  };
  // which seat does a swipe point at? seats: [{ id, x, y }] in the same pixel space as the swipe; the angle test is from the swipe start.
  // Seats in a row behind each other can lie on the same line: among the seats within the angle limit, one that is about to enter (`prefer`: a set of ids) wins.
  function aimedSeat(seats, fl, maxDeg, prefer) {
    const ang = Math.atan2(fl.y1 - fl.y0, fl.x1 - fl.x0), lim = (maxDeg || 16) * Math.PI / 180; let best = null, bk = 1e9;
    seats.forEach(s => {
      const a = Math.atan2(s.y - fl.y0, s.x - fl.x0); let d = Math.abs(a - ang); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d >= lim) return; const k = (prefer && prefer.has(s.id) ? 0 : 10) + d; if (k < bk) { bk = k; best = s; }
    });
    return best;
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // MotionDetector: accelerationIncludingGravity samples (m/s^2) -> ictus at the upward acceleration peak (the stop at the bottom of a down stroke).
  // The vertical direction comes from a slow low-pass of the reading itself, so the phone may be held any way round.
  // ------------------------------------------------------------------------------------------------------------------------------------------
  function MotionDetector(o) { o = o || {}; this.th = o.threshold || 2.2; this.minGap = o.minGap || 0.24; this.alpha = o.alpha || 0.04; this.reset(); }
  MotionDetector.prototype.reset = function () { this.g = null; this.pk = null; this.last = -1e9; this.prev = 0; this.prev2 = 0; this.pt = 0; this.armed = false; };
  MotionDetector.prototype.push = function (ax, ay, az, t) {
    const out = [];
    if (!this.g) { this.g = [ax, ay, az]; return out; }
    const a = this.alpha; this.g[0] += a * (ax - this.g[0]); this.g[1] += a * (ay - this.g[1]); this.g[2] += a * (az - this.g[2]);
    const gm = Math.hypot(this.g[0], this.g[1], this.g[2]) || 1, ux = this.g[0] / gm, uy = this.g[1] / gm, uz = this.g[2] / gm;
    const v = (ax - this.g[0]) * ux + (ay - this.g[1]) * uy + (az - this.g[2]) * uz; // + = accelerating upward
    // peak detection: v rose above the threshold and has now turned over
    if (v > this.th) { if (!this.pk || v > this.pk.v) this.pk = { v, t }; }
    else if (this.pk) {
      if (this.pk.t - this.last >= this.minGap) { out.push({ type: 'ictus', t: this.pk.t, amp: clamp(this.pk.v / 14, 0, 1) * 0.5 + 0.04, speed: 0 }); this.last = this.pk.t; }
      this.pk = null;
    }
    return out;
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // BeatClock: position (in conductor beats) as a function of time, in straight segments. The scheduler `commit`s a horizon, and a new segment (new tempo) can only
  // begin after it, so events already handed to the audio never move. `ceil` is the beat the orchestra waits at until the next ictus.
  // ------------------------------------------------------------------------------------------------------------------------------------------
  function BeatClock(o) { o = o || {}; this.lag = o.lag != null ? o.lag : 0.12; this.reset(); }
  BeatClock.prototype.reset = function () { this.t0 = 0; this.b0 = 0; this.r = 0; this.ceil = Infinity; this.horizon = -Infinity; this.running = false; };
  BeatClock.prototype.start = function (t0, b0, bpm, ceil) { this.t0 = t0; this.b0 = b0; this.r = bpm / 60; this.ceil = ceil == null ? Infinity : ceil; this.running = true; };
  BeatClock.prototype.bpm = function () { return this.r * 60; };
  BeatClock.prototype.posAt = function (t) { if (!this.running) return this.b0; return Math.min(this.ceil, this.b0 + this.r * Math.max(0, t - this.t0)); };
  BeatClock.prototype.timeOf = function (b) {
    if (b > this.ceil + 1e-9) return Infinity;
    if (this.r <= 1e-9) return b <= this.b0 + 1e-9 ? this.t0 : Infinity;
    return this.t0 + (b - this.b0) / this.r;
  };
  BeatClock.prototype.commit = function (t) { if (t > this.horizon) this.horizon = t; };
  BeatClock.prototype.retune = function (now, bpm, ceil) {
    const T = Math.max(now, this.horizon, this.t0), B = this.posAt(T);
    this.t0 = T; this.b0 = B; this.r = bpm / 60; if (ceil !== undefined) this.ceil = ceil;
  };
  BeatClock.prototype.waiting = function (t) { return this.running && this.ceil < Infinity && this.posAt(t) >= this.ceil - 1e-9; };

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // Scorer
  // ------------------------------------------------------------------------------------------------------------------------------------------
  function Scorer(score, diff) {
    this.score = score; this.diff = diff;
    this.ratios = []; this.devs = []; this.beatsSeen = 0; this.ictusCount = 0; this.heldSec = 0; this.playSec = 0;
    this.dynN = 0; this.dynSum = 0; this.dynErrSum = 0;
    this.cues = score.cues.map(c => ({ b: c.b, secs: c.secs, q: null, sec: null, rel: null, wrong: 0 }));
    this.stats = { cues: 0, perfect: 0, late: 0, missed: 0, wrong: 0, ictus: 0 };
  }
  Scorer.prototype.ictus = function (k, bpm, held) {
    this.ictusCount++; this.stats.ictus++;
    if (held) return; // a beat that came after the orchestra waited says nothing about the tempo
    const g = this.score.bpmAt(Math.max(0, k)), ratio = bpm / g;
    if (this.ratios.length) { const p = this.ratios[this.ratios.length - 1]; this.devs.push(Math.abs(Math.log(ratio / p))); }
    this.ratios.push(ratio);
  };
  Scorer.prototype.beat = function (b, level) {
    const target = this.score.dynAt(b + 0.5), d = Math.abs(level - target), tol = this.diff.tol;
    const t1 = 0.13 * tol, t2 = 0.46 * tol;
    const s = d <= t1 ? 1 : d >= t2 ? 0 : 1 - (d - t1) / (t2 - t1);
    this.dynN++; this.dynSum += s; this.dynErrSum += level - target;
  };
  Scorer.prototype.time = function (dt, held) { this.playSec += dt; if (held) this.heldSec += dt; };
  // a cue was given to `sec` while the clock was `rel` beats before the entrance (negative = after it)
  Scorer.prototype.cue = function (secId, relBeats, pos) {
    let best = null;
    for (const c of this.cues) {
      if (c.q != null || !c.secs.includes(secId)) continue;
      const rel = c.b - pos; if (rel < -0.6 || rel > 3.4) continue;
      if (!best || Math.abs(c.b - pos) < Math.abs(best.b - pos)) best = c;
    }
    if (!best) { this.stats.wrong++; return null; }
    const rel = best.b - pos; let q;
    if (rel >= 0.7 && rel <= 2.6) q = 1; else if (rel > 2.6) q = 0.6; else if (rel >= 0.15) q = 0.85; else q = 0.45;
    best.q = q; best.sec = secId; best.rel = rel; this.stats.cues++; if (q >= 0.85) this.stats.perfect++; if (rel < 0.15) this.stats.late++;
    return { cue: best, q, rel };
  };
  Scorer.prototype.result = function () {
    const D = this.diff, nB = Math.max(1, this.score.nBeats);
    // tempo
    let steady = 100, tempo = 0, cover = this.ictusCount / nB, avgRatio = 1;
    if (this.ratios.length >= 2) {
      const md = this.devs.reduce((a, b) => a + b, 0) / this.devs.length;
      steady = clamp(100 - 260 * md / D.steady, 0, 100);
      avgRatio = Math.exp(this.ratios.reduce((a, b) => a + Math.log(b), 0) / this.ratios.length);
      const p = Math.abs(Math.log(avgRatio)), allowed = Math.log(1.6), range = p <= allowed ? 1 : Math.max(0.35, 1 - (p - allowed) * 1.2);
      const hold = this.playSec > 0 ? this.heldSec / this.playSec : 0;
      tempo = steady * (0.55 + 0.45 * clamp(cover, 0, 1)) * range * (1 - 0.8 * hold);
    }
    const dynamics = this.dynN ? 100 * this.dynSum / this.dynN : 0;
    const cueCount = this.cues.length; let cues = 100;
    if (cueCount) cues = 100 * this.cues.reduce((a, c) => a + (c.q || 0), 0) / cueCount;
    const missed = this.cues.filter(c => c.q == null).length; this.stats.missed = missed;
    const wCue = cueCount && D.cueWeight ? D.cueWeight : 0, wT = (1 - wCue) * 0.52, wD = (1 - wCue) * 0.48;
    const total = Math.round(wT * tempo + wD * dynamics + wCue * cues);
    const st = D.stars; const stars = total >= st[2] ? 3 : total >= st[1] ? 2 : 1;
    return { total, stars, tempo: Math.round(tempo), steady: Math.round(steady), dynamics: Math.round(dynamics), cues: Math.round(cues), cueCount, avgRatio: +avgRatio.toFixed(3),
      coverage: +cover.toFixed(2), bias: this.dynN ? +(this.dynErrSum / this.dynN).toFixed(3) : 0, stats: Object.assign({}, this.stats), weights: { tempo: wT, dynamics: wD, cues: wCue } };
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // Session: the playing piece.
  // sink: { noteOn(t, secIndex, pitch, short, gain, id, velRel), noteOff(t, id), maintain(until), setLevel(level, t), cueFlash?(…) } - all optional but noteOn/noteOff
  // ------------------------------------------------------------------------------------------------------------------------------------------
  function Session(o) {
    this.score = o.score; this.diff = typeof o.diff === 'string' ? DIFFS[o.diff] : (o.diff || DIFFS.normal);
    this.sink = o.sink || {}; this.lookahead = o.lookahead != null ? o.lookahead : 0.15; this.lag = o.lag != null ? o.lag : 0.12;
    this.clock = new BeatClock({ lag: this.lag }); this.scorer = new Scorer(this.score, this.diff);
    this.state = 'idle'; // idle -> armed -> playing -> ended
    this.t1 = 0; this.estI = 0; this.lastIct = null; this.lastK = -1; this.kAcc = -1; this.cursor = 0; this.level = o.level != null ? o.level : 0.45; this.sound = this.level;
    this.lastTick = null; this.beatDone = -1; this.endAt = null; this.log = []; this.heldNow = false; this.paused = false;
    this.minBpm = o.minBpm || 24; this.maxBpm = o.maxBpm || 190; this.cueFlash = [];
    this.openNotes = new Map(); this.firstBpm = null; this.ivs = []; this.estR = 1; this.tempoRange = (this.score.json && this.score.json.tempoRange) || [0.6, 1.4];
  }
  Session.prototype.guideBpm = function (b) { return this.score.bpmAt(b); };
  // the tempo the conductor may reach at conducted beat b: 0.6x .. 1.4x of the marked tempo (per piece: `tempoRange` in the score json)
  Session.prototype.bpmLimits = function (b) { const g = this.score.bpmAt(Math.max(0, b || 0)); return [Math.max(this.minBpm, g * this.tempoRange[0]), Math.min(this.maxBpm, g * this.tempoRange[1])]; };
  // how far the current tempo is from the marked one: 'ok' | 'fast' | 'slow' (for the on-screen hint)
  Session.prototype.tempoState = function (b) { if (!this.clock.running) return 'ok'; const r = this.clock.bpm() / this.score.bpmAt(Math.max(0, b != null ? b : this.clock.posAt(this.lastTick || 0))); return r > 1.18 ? 'fast' : r < 0.84 ? 'slow' : 'ok'; };
  // The conductor's tempo is kept as a RATIO to the marked tempo (estR), so a marked tempo change (Adagio -> Allegro) is not mistaken for a wild stroke.
  Session.prototype.periodAt = function (k) { return 60 / (this.estR * this.score.bpmAt(Math.max(0, k))); }; // expected seconds from beat k to k+1
  Session.prototype.refractory = function () { return Math.max(0.18, 0.6 * this.periodAt(this.kAcc)); };
  // tempo ratio from the recent beat intervals: median of the last 3-4, smoothed, at most +-12 % per beat, clamped to the piece's range
  Session.prototype.nextRatio = function (I, k) {
    const iv = this.ivs; iv.push(this.score.bpmAt(Math.max(0, k - 1)) * 0 + (60 / I) / this.score.bpmAt(Math.max(0, k - 1))); if (iv.length > 4) iv.shift();
    const a = iv.slice().sort((x, y) => x - y), med = a.length % 2 ? a[(a.length - 1) >> 1] : 0.5 * (a[a.length / 2 - 1] + a[a.length / 2]);
    const R = clamp(this.estR * 0.5 + med * 0.5, this.estR * 0.88, this.estR * 1.12); return clamp(R, this.tempoRange[0], this.tempoRange[1]);
  };
  Session.prototype.pos = function (t) { return this.clock.posAt(t); };
  Session.prototype.bpm = function () { return this.clock.running ? this.clock.bpm() : 0; };
  // an ictus at time t: returns what it did
  Session.prototype.ictus = function (t, info) {
    info = info || {};
    if (this.state === 'ended' || this.paused) return { kind: 'ignored' };
    if (info.level != null) this.setLevel(info.level, t);
    if (this.state === 'idle') { this.state = 'armed'; this.t1 = t; this.lastIct = t; return { kind: 'prep' }; }
    if (this.state === 'armed') {
      const I = t - this.t1;
      if (I < 0.25) return { kind: 'stray' };
      if (I > 2.6) { this.t1 = t; this.lastIct = t; return { kind: 'prep' }; }
      // count-in: the starting tempo leans on the marked tempo, not only on the (noisy) first interval; the first interval is not trusted outside 0.6x..1.4x
      const g0 = this.score.bpmAt(0), lim = this.bpmLimits(0), bpm = clamp(Math.sqrt(clamp(60 / I, lim[0], lim[1]) * g0), lim[0], lim[1]);
      this.estR = bpm / g0; this.estI = 60 / bpm; this.state = 'playing'; this.ivs = [this.estR];
      this.clock.start(t + this.lag, 0, bpm, this.diff.slack + 1);
      this.kAcc = 0; this.lastIct = t; this.lastTick = t; this.firstBpm = bpm; this.scorer.ictus(0, bpm, false);
      this.log.push({ t, k: 0, bpm, kind: 'start' });
      return { kind: 'start', bpm };
    }
    // playing. The beat the ictus belongs to is counted from the player's own rhythm (not from where the clock happens to be), so a clock that is a little ahead
    // or behind can never lock the conductor out; the clock then speeds up or slows down a little to meet the player.
    const gap = t - this.lastIct;
    const held = this.clock.waiting(t + this.lag);
    if (gap < this.refractory()) return { kind: 'stray' }; // a second trigger of the same stroke, or jitter
    const n = held ? 1 : Math.max(1, Math.round(gap / this.periodAt(this.kAcc))), k = this.kAcc + n;
    const rawI = gap / n; let I = rawI; const exp = this.periodAt(this.kAcc), outlier = held || I < 0.5 * exp || I > 2 * exp; // after a wait, or a wild jump: not a tempo measurement
    if (!outlier) this.estR = this.nextRatio(I, k);
    this.estI = this.periodAt(k);
    const posHere = this.clock.posAt(t + this.lag), e = posHere - k; // e > 0: the clock is ahead of the player (the player is late)
    const bpm = this.estR * this.score.bpmAt(Math.max(0, k)), lim = this.bpmLimits(k), rate = clamp(bpm * clamp(1 - 0.5 * e, 0.7, 1.15), lim[0], lim[1]); // the catch-up never leaves the piece's tempo range
    this.kAcc = k; this.lastIct = t;
    // the last beat of the piece is the last one the orchestra waits for: after it the final bar plays out by itself
    const slack = k >= this.score.nBeats - 1 ? Infinity : k + 1 + this.diff.slack; // never plays on by itself: it holds at the next beat until the next stroke
    this.clock.retune(t, rate, slack);
    this.scorer.ictus(k, 60 / rawI, held);
    this.log.push({ t, k, bpm, e, kind: held ? 'resume' : 'beat' });
    return { kind: held ? 'resume' : 'beat', k, bpm, e };
  };
  Session.prototype.setLevel = function (v, t) { this.level = clamp(v, 0.04, 1); };
  Session.prototype.cue = function (secId, t) {
    if (this.state !== 'playing' && this.state !== 'armed') return null;
    const pos = this.clock.posAt(t + this.lag * 0); const r = this.scorer.cue(secId, 0, pos);
    if (r) this.cueFlash.push({ b: r.cue.b, secs: r.cue.secs, q: r.q });
    return r;
  };
  // gain of a note-on for the cue state of its section (called when the note is scheduled)
  Session.prototype.entranceGain = function (si, beat) {
    if (this.diff.autoCue) return 1;
    const id = this.score.sections[si].id;
    for (const c of this.scorer.cues) {
      if (!c.secs.includes(id)) continue;
      if (beat >= c.b - 0.3 && beat < c.b + 3.0) return c.q != null && c.q >= 0.45 ? 1 : this.diff.uncued;
    }
    return 1;
  };
  Session.prototype.soundLevel = function () { const t = this.score.dynAt(this.clock.posAt(this.lastTick == null ? 0 : this.lastTick)); return clamp(lerp(this.level, t, this.diff.assist), 0.04, 1); };
  Session.prototype.tick = function (now) {
    if (this.paused) return;
    const S = this.score, ck = this.clock;
    if (this.state === 'playing') {
      const dt = this.lastTick == null ? 0 : now - this.lastTick; this.lastTick = now;
      // no ictus for a long time: the audible level relaxes (an orchestra left alone drifts quieter) and, in the strict modes, the orchestra waits at the beat (ceil)
      if (this.lastIct != null && now - this.lastIct > 2.2 * this.estI + 0.4) this.level = Math.max(0.12, this.level - 0.25 * dt);
      const held = ck.waiting(now);
      this.heldNow = held; this.scorer.time(Math.max(0, dt), held);
      // beats passed (dynamics sampling)
      const pos = ck.posAt(now);
      if (this.diff.autoCue) this.scorer.cues.forEach(c => { if (c.q == null && c.b - pos < 1.4) { c.q = 1; this.cueFlash.push({ b: c.b, secs: c.secs, q: 1, auto: true }); } });
      while (this.beatDone + 1 <= Math.floor(pos) && this.beatDone + 1 < S.nBeats) { this.beatDone++; this.scorer.beat(this.beatDone, this.diff.assist ? this.soundLevel() : this.level); }
      const hor = now + this.lookahead; const B = ck.posAt(hor);
      if (this.sink.setLevel) this.sink.setLevel(this.soundLevel(), now);
      const ev = S.events;
      while (this.cursor < ev.length && ev[this.cursor].b <= B + 1e-9) {
        const e = ev[this.cursor++], t = Math.max(now, ck.timeOf(e.b));
        if (e.k) {
          const g = this.entranceGain(e.si, e.b);
          this.openNotes.set(e.id, e.si);
          if (this.sink.noteOn) this.sink.noteOn(t, e.si, e.pitch, e.short, g, e.id, e.vel, e);
        } else { this.openNotes.delete(e.id); if (this.sink.noteOff) this.sink.noteOff(t, e.id); }
      }
      ck.commit(hor);
      if (this.sink.maintain) this.sink.maintain(hor);
      if (pos >= S.nBeats - 1e-6 && this.cursor >= ev.length && this.endAt == null) { this.endAt = now; }
      if (this.endAt != null && now - this.endAt > 1.2) { this.state = 'ended'; }
    }
  };
  Session.prototype.finished = function () { return this.state === 'ended'; };
  // Pause: stop the clock where it is; resume re-enters at the current position (notes that were sounding are struck again, softly)
  Session.prototype.pause = function (now) { if (this.paused) return; this.paused = true; this.pausedPos = this.clock.running ? this.clock.posAt(now) : 0; this.heldNow = false; if (this.sink.releaseAll) this.sink.releaseAll(now, 0.25); this.openNotes.clear(); };
  Session.prototype.resume = function (now) {
    if (!this.paused) return; this.paused = false;
    if (this.clock.running) {
      const bpm = this.clock.bpm(); this.clock.horizon = -Infinity;
      this.clock.start(now + 0.25, this.pausedPos, bpm, this.pausedPos + 1 + this.diff.slack);
      this.lastTick = now; this.lastIct = now + 0.25 + this.estI; this.kAcc = Math.max(this.kAcc, Math.floor(this.pausedPos) - 1);
      // re-strike what should be sounding
      const ev = this.score.events, B = this.pausedPos, on = new Map();
      for (let i = 0; i < ev.length && ev[i].b <= B; i++) { if (ev[i].k) on.set(ev[i].id, ev[i]); else on.delete(ev[i].id); }
      let cur = 0; while (cur < ev.length && ev[cur].b <= B) cur++; this.cursor = cur;
      on.forEach(e => { if (this.sink.noteOn) { this.openNotes.set(e.id, e.si); this.sink.noteOn(now + 0.28, e.si, e.pitch, 0, this.diff.autoCue ? 0.8 : 0.8, e.id, e.vel, e); } });
    }
  };
  Session.prototype.result = function () { return this.scorer.result(); };
  Session.prototype.snapshot = function (now) {
    const S = this.score, pos = this.paused ? this.pausedPos : this.clock.running ? this.clock.posAt(now) : 0, b = Math.min(S.nBeats - 1e-6, Math.max(0, pos));
    return { state: this.state, pos, beat: Math.floor(b), bar: S.barOf(b), beatInBar: S.beatInBar[Math.floor(b)], pattern: S.patternOfBeat[Math.floor(b)], bpm: this.bpm(), guideBpm: S.bpmAt(b),
      level: this.level, target: S.dynAt(b), mark: S.markAt(b), held: this.heldNow, progress: clamp(pos / S.nBeats, 0, 1), waiting: this.clock.waiting(now) };
  };
  // Which cues are coming (for the glow): entrances within the next `ahead` beats that have not been cued yet
  Session.prototype.upcoming = function (now, ahead) {
    const pos = this.clock.running ? this.clock.posAt(now) : 0, out = [];
    this.scorer.cues.forEach((c, i) => { if (c.b - pos > -0.8 && c.b - pos <= ahead) out.push({ i, b: c.b, secs: c.secs, rel: c.b - pos, done: c.q != null, q: c.q }); });
    return out;
  };

  // helper used by the page and by tests: which sample articulation does a note use?
  function artFor(inst, short) {
    if (inst === 'timp' || inst === 'bd' || inst === 'cym') return 'hit';
    if (inst === 'harp') return 'pluck';
    if (!short) return 'sus';
    return (inst === 'vln' || inst === 'vla' || inst === 'vc' || inst === 'cb') ? 'spic' : 'stac';
  }

  return { PPQ: 96, SECTIONS, SECTION_ORDER, DYN_MARKS, Dynamics, sliceScore, KEYS, DIFFS, Score, BeatDetector, FlickDetector, aimedSeat, MotionDetector, BeatClock, Scorer, Session, artFor, clamp };
});
