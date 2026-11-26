// orchestra/art.js — draws the concert stage (original vector art; the players are plain shapes, no real people) in a pseudo-3D view FROM THE PODIUM:
// the conductor's stand in the foreground, the orchestra on rising risers receding into the hall, every player scaled by depth. The sections perform in time
// with the notes (strings bow, winds breathe and lift, brass raise, timpani strike, the harp plucks), lean with the dynamics, look up at the conductor on cues,
// turn their heads towards the baton and react to ragged vs good conducting. Entrance glows, the baton trail, the beat-pattern guide, the ghost baton, the level
// meter and the score-follow bar are drawn on top. UMD: window.OrchArt. Canvas 2D in CSS pixels (the context is scaled by the device pixel ratio); the static
// hall and the foreground are pre-rendered to offscreen canvases (rebuilt only on resize / theme change).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrchArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // The classic beat patterns as points the baton visits (x right, y down, 0..1 inside a small box)
  const PATTERNS = {
    1: [[0.5, 0.15], [0.5, 0.85]],
    2: [[0.5, 0.15], [0.5, 0.88], [0.78, 0.4]],
    3: [[0.5, 0.15], [0.5, 0.88], [0.86, 0.6], [0.78, 0.3]],
    4: [[0.5, 0.15], [0.5, 0.88], [0.14, 0.62], [0.86, 0.62], [0.6, 0.25]],
    5: [[0.5, 0.15], [0.5, 0.88], [0.18, 0.7], [0.4, 0.5], [0.8, 0.55], [0.62, 0.25]],
  };
  const BEATPOINT = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4] };

  function pal(dark) {
    return dark
      ? { bg0: '#1b1015', bg1: '#2a1820', wall0: '#150b10', wall1: '#33202a', floor0: '#6a4634', floor1: '#2e1b19', tierTop: '#5b3b2d', tierFace: '#22130f', pipe: '#9a8a74', pipeHi: '#d8c8aa',
          rim: 'rgba(255,214,150,.22)', ink: '#f6ecdf', dim: 'rgba(246,236,223,.7)', podium: '#5b2a2f', podiumTop: '#7a3a40',
          gold: '#ffcf6a', good: '#7be0a0', bad: '#ff8f80', panel: 'rgba(0,0,0,.34)', line: 'rgba(255,255,255,.2)', trail: '255,236,190', seat: 0.62, stand: 'rgba(255,255,255,.22)',
          body: l => 'hsl(' + l + ',24%,38%)', bodyD: l => 'hsl(' + l + ',24%,26%)', sheet: '#cfc3a4', wood: '#b0693a', woodD: '#6e3a1c', brass: '#f0bf55', brassD: '#a8741c', silver: '#dfe6ee', bow: '#e8d9b8', label: 'rgba(14,6,10,.66)', spot: '255,226,170' }
      : { bg0: '#f6ecdf', bg1: '#e9d8c3', wall0: '#eadbc3', wall1: '#cdb391', floor0: '#e0b27a', floor1: '#b88a58', tierTop: '#d6a971', tierFace: '#8c5c38', pipe: '#b49e80', pipeHi: '#efe1c4',
          rim: 'rgba(90,40,30,.28)', ink: '#2c1a14', dim: 'rgba(44,26,20,.72)', podium: '#8a3b3f', podiumTop: '#a8494e',
          gold: '#b8780a', good: '#2c8a52', bad: '#c2412a', panel: 'rgba(255,255,255,.55)', line: 'rgba(60,30,20,.25)', trail: '120,60,30', seat: 0.5, stand: 'rgba(60,30,20,.3)',
          body: l => 'hsl(' + l + ',22%,24%)', bodyD: l => 'hsl(' + l + ',22%,15%)', sheet: '#f6efdc', wood: '#9a5326', woodD: '#5e2e12', brass: '#d9a02e', brassD: '#8e5d0c', silver: '#9aa6b4', bow: '#3a2216', label: 'rgba(255,248,236,.82)', spot: '255,238,200' };
  }
  const hsl = (h, s, l, a) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + (a == null ? 1 : a) + ')';
  const SKIN = ['#f0c9a4', '#e3b088', '#c68e66', '#9a6a49', '#f6d7bb'];
  const HAIR = ['#2a1b14', '#4a3020', '#16110f', '#6b4a2c', '#8d8d92', '#1d1d26'];
  const STRINGS = { vln: 1, vla: 1, vc: 1, cb: 1 };
  const WINDS = { fl: 1, ob: 1, cl: 1, fg: 1, hn: 1, tp: 1, tb: 1, tu: 1 };
  const NOSTAND = { vc: 1, cb: 1, timp: 1, bd: 1, cym: 1, harp: 1 };
  // riser tiers: [front edge y, back edge y] in the engine's seating coordinates, tier index = height in steps
  const TIERS = [[1.0, 0.5], [0.5, 0.36], [0.36, 0.24], [0.24, 0.0]];
  const tierOf = y => (y > 0.5 ? 0 : y > 0.36 ? 1 : y > 0.24 ? 2 : 3);

  function create(canvas, o) {
    const ctx = canvas.getContext('2d');
    const A = { W: 0, H: 0, dpr: 1, cfg: Object.assign({ dark: true, en: false, reduced: false, T: s => s }, o || {}), seats: {}, barRect: null, stageH: 0, state: {}, mood: { rag: 0, good: 0 }, prevNow: null, hall: null, fore: null, gaze: { x: 0, y: 0, on: false } };
    A.setCfg = c => Object.assign(A.cfg, c);
    A.resize = function (w, h, dpr) {
      A.dpr = dpr || (typeof devicePixelRatio === 'number' ? Math.min(2.5, devicePixelRatio) : 1);
      A.W = Math.max(160, Math.round(w)); A.H = Math.max(160, Math.round(h));
      canvas.width = Math.round(A.W * A.dpr); canvas.height = Math.round(A.H * A.dpr); canvas.style.width = A.W + 'px'; canvas.style.height = A.H + 'px';
      A.barH = clamp(Math.round(A.H * 0.15), 50, 84); A.stageH = A.H - A.barH; A.scale = Math.min(A.W, A.stageH);
      A.hall = A.fore = null; A.geom();
    };

    // ---- the camera: the conductor's eye looking at the stage. s = 1 at the podium, smaller further back --------------------------------------------------
    A.geom = function () {
      const H = A.stageH, W = A.W;
      A.hy = H * (W > H * 1.3 ? 0.2 : 0.19); A.yf = H * 0.9; A.rh = Math.max(5, H * 0.03); A.K = 0.95;
      A.pr0 = Math.min(W * 0.044, H * 0.056);
    };
    const sOf = y => 0.45 + 0.55 * clamp(y, 0, 1);                       // perspective scale at seating depth y
    const gY = y => A.hy + (A.yf - A.hy) * (0.08 + 0.92 * clamp(y, -0.1, 1));                   // ground line on screen
    const gX = (x, y) => A.W / 2 + (x - 0.5) * A.W * 0.93 * (0.75 + 0.25 * sOf(y)); // the stage fans out towards us
    A.geom();

    // seat positions in CSS pixels for the given sections definitions: the centre of the cluster of players
    A.layout = function (secs) {
      A.seats = {}; A.state = {}; A.geom();
      secs.forEach(s => {
        const d = s.def; if (!d) return;
        const n = d.n, y = d.y, sc = sOf(y), e = tierOf(y), pr = A.pr0 * sc;
        const cols = n <= 3 ? n : n === 4 ? 2 : n <= 9 ? 3 : 4, rows = Math.ceil(n / cols), sp = pr * (d.inst === 'harp' ? 2.6 : /^(timp|bd|cym)$/.test(d.inst) ? 3.4 : d.inst === 'cb' ? 2.5 : d.inst === 'vc' ? 2.4 : d.inst === 'tu' ? 2.8 : 2.05), rowStep = pr * 1.55;
        const cx = gX(d.x, y), foot = gY(y) - e * A.rh, ax = foot - pr * 1.95; // neck of the front row
        const slots = [];
        for (let i = 0; i < n; i++) {
          const j = Math.floor(i / cols), inRow = Math.min(cols, n - j * cols), k = i % cols, off = (k - (inRow - 1) / 2) * sp + (j % 2 && inRow === cols ? sp * 0.3 : 0);
          slots.push({ i, j, x: cx + off + (d.inst === 'harp' ? -pr * 0.9 : 0), y: ax - j * rowStep, ps: pr * (1 - 0.05 * j), ph: hash(i * 3.1 + d.hue) * TAU, r: hash(i * 7.7 + d.hue * 0.37 + 1) });
        }
        slots.sort((p, q) => q.j - p.j || p.i - q.i); // back rows first
        const halfW = (cols * sp) / 2 + pr * (d.inst === 'harp' ? 1.2 : 0.4), top = ax - (rows - 1) * rowStep - pr * 1.9 - (/^(harp|cb|tu|fg)$/.test(d.inst) ? pr * 0.9 : 0), bot = foot + pr * 0.2;
        A.seats[s.id] = { id: s.id, x: cx + (d.inst === 'harp' ? pr * 0.2 : 0), y: (top + bot) / 2, hue: d.hue, n, inst: d.inst, def: d, r: Math.max(10, (bot - top) / 2), halfW, halfH: (bot - top) / 2, cx, foot, top, bot, pr, e, slots, rows, cols, ty: ax, labelW: 0, labelKey: '' };
      });
      A.podium = { x: A.W * 0.5, y: A.stageH * 0.94 };
    };
    A.hit = function (x, y) {
      let best = null, bd = 1e9; const lim = Math.max(30, A.scale * 0.11);
      for (const id in A.seats) { const s = A.seats[id]; if (Math.abs(x - s.cx) <= s.halfW + 3 && Math.abs(y - s.y) <= s.halfH + 3) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = id; } } }
      if (best) return best; bd = 1e9;
      for (const id in A.seats) { const s = A.seats[id], d = Math.hypot(s.x - x, s.y - y); if (d < lim && d < bd) { bd = d; best = id; } }
      return best;
    };
    A.seatList = () => Object.keys(A.seats).map(k => A.seats[k]);

    function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function offscreen() { const k = Math.min(A.dpr, 2), cv = document.createElement('canvas'); cv.width = Math.round(A.W * k); cv.height = Math.round(A.stageH * k); const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); return { cv, c }; }

    // ---- the static hall (pre-rendered): back wall, organ, risers, wooden floor ---------------------------------------------------------------------------
    function buildHall(dark) {
      const o = offscreen(), c = o.c, P = pal(dark), W = A.W, H = A.stageH, hy = A.hy, rh = A.rh, vx = W / 2;
      const wallBot = gY(0.0) - 3 * rh;
      let g = c.createLinearGradient(0, 0, 0, wallBot); g.addColorStop(0, P.wall0); g.addColorStop(1, P.wall1); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // wooden slats on the back wall
      for (let x = 0, i = 0; x < W; x += W / 28, i++) { c.fillStyle = i % 2 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.04)'; c.fillRect(x, 0, W / 28, wallBot); }
      // organ pipes in the middle
      const n = 17, pw = W * 0.4 / n, px0 = W * 0.3, top0 = hy * 0.15, pbot = wallBot;
      for (let i = 0; i < n; i++) {
        const t = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2), h = (pbot - top0) * (0.95 - 0.48 * t * t - (i % 2 ? 0.06 : 0)), x = px0 + i * pw, y = pbot - h;
        g = c.createLinearGradient(x, 0, x + pw, 0); g.addColorStop(0, P.pipe); g.addColorStop(0.35, P.pipeHi); g.addColorStop(1, P.pipe);
        c.fillStyle = g; roundRect(c, x + 1, y, pw - 2, h, pw * 0.4); c.fill();
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x + pw / 2, y + h * 0.86, pw * 0.3, pw * 0.2, 0, 0, TAU); c.fill();
      }
      // side walls in perspective and ceiling reflectors
      c.fillStyle = dark ? 'rgba(0,0,0,.35)' : 'rgba(80,40,20,.14)';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(W * 0.1, hy * 0.5); c.lineTo(W * 0.1, wallBot); c.lineTo(0, gY(0.6)); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(W, 0); c.lineTo(W * 0.9, hy * 0.5); c.lineTo(W * 0.9, wallBot); c.lineTo(W, gY(0.6)); c.closePath(); c.fill();
      for (let i = 0; i < 3; i++) { const x = W * (0.2 + i * 0.3); c.fillStyle = dark ? 'rgba(255,225,170,.07)' : 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(x - W * 0.11, 0); c.lineTo(x + W * 0.11, 0); c.lineTo(x + W * 0.07, hy * 0.42); c.lineTo(x - W * 0.07, hy * 0.42); c.closePath(); c.fill(); }
      // stage lamps
      for (let i = 0; i < 5; i++) { const x = W * (0.1 + i * 0.2), y = hy * 0.3, r = Math.max(6, W * 0.06); g = c.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, 'rgba(' + P.spot + ',' + (dark ? 0.9 : 0.8) + ')'); g.addColorStop(1, 'rgba(' + P.spot + ',0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      // floor and risers, back to front
      for (let e = 3; e >= 0; e--) {
        const f = TIERS[e][0], b = TIERS[e][1], yTop = gY(b) - e * rh - (e === 3 ? 0 : 0), yBot = gY(f) - e * rh;
        g = c.createLinearGradient(0, yTop, 0, yBot); g.addColorStop(0, P.floor1); g.addColorStop(1, e === 0 ? P.floor0 : P.tierTop); c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop + 1);
        // planks converge on the vanishing point
        c.save(); c.beginPath(); c.rect(0, yTop, W, yBot - yTop); c.clip(); c.strokeStyle = dark ? 'rgba(0,0,0,.28)' : 'rgba(90,45,20,.18)'; c.lineWidth = 1;
        for (let i = -9; i <= 9; i++) { c.beginPath(); c.moveTo(vx + i * W * 0.034 * (0.5 + (yTop - hy) / (H - hy)), yTop); c.lineTo(vx + i * W * 0.17, H); c.stroke(); }
        c.restore();
        if (e > 0) { // the front face of this riser
          const y0 = yBot, y1 = yBot + rh; g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, P.tierFace); g.addColorStop(1, dark ? '#120a08' : '#6e4426'); c.fillStyle = g; c.fillRect(0, y0, W, y1 - y0 + 1);
          c.fillStyle = dark ? 'rgba(255,214,150,.25)' : 'rgba(255,255,255,.5)'; c.fillRect(0, y0 - 1, W, 1.5);
        }
      }
      // light falling on the stage from above
      g = c.createRadialGradient(vx, hy, 4, vx, hy + (H - hy) * 0.45, W * 0.75); g.addColorStop(0, 'rgba(' + P.spot + ',' + (dark ? 0.2 : 0.22) + ')'); g.addColorStop(1, 'rgba(' + P.spot + ',0)'); c.fillStyle = g; c.fillRect(0, hy, W, H - hy);
      A.hall = { cv: o.cv, dark };
    }
    // ---- the static foreground (pre-rendered): vignette, podium, rail and the conductor's stand -------------------------------------------------------------
    function buildFore(dark) {
      const o = offscreen(), c = o.c, P = pal(dark), W = A.W, H = A.stageH, cx = W / 2;
      let g = c.createRadialGradient(cx, H * 0.55, Math.min(W, H) * 0.35, cx, H * 0.55, Math.max(W, H) * 0.85); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, dark ? 'rgba(0,0,0,.5)' : 'rgba(60,25,10,.28)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      g = c.createLinearGradient(0, H * 0.78, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, dark ? 'rgba(0,0,0,.45)' : 'rgba(60,25,10,.3)'); c.fillStyle = g; c.fillRect(0, H * 0.78, W, H * 0.22);
      // the podium (we stand on it) and its brass rail
      const pw = Math.min(W * 0.62, 360), py = H * 0.905;
      g = c.createLinearGradient(0, py, 0, H); g.addColorStop(0, P.podiumTop); g.addColorStop(1, P.podium); c.fillStyle = g; roundRect(c, cx - pw / 2, py, pw, H - py + 14, 14); c.fill();
      c.strokeStyle = P.brass; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx - pw / 2 + 10, py + 6); c.quadraticCurveTo(cx, py - 10, cx + pw / 2 - 10, py + 6); c.stroke();
      // the stand: a lit score on a desk, seen from behind
      const sw = Math.min(46, W * 0.12), y0 = H * 0.832, y1 = H * 0.9;
      g = c.createRadialGradient(cx, y0, 2, cx, y0, sw * 2.2); g.addColorStop(0, 'rgba(' + P.spot + ',.45)'); g.addColorStop(1, 'rgba(' + P.spot + ',0)'); c.fillStyle = g; c.fillRect(cx - sw * 2.4, y0 - sw * 2, sw * 4.8, sw * 4);
      c.fillStyle = dark ? '#0d0709' : '#3a2018'; c.beginPath(); c.moveTo(cx - sw * 0.9, y0 - 2); c.lineTo(cx + sw * 0.9, y0 - 2); c.lineTo(cx + sw * 1.1, y1); c.lineTo(cx - sw * 1.1, y1); c.closePath(); c.fill();
      c.fillStyle = P.sheet; c.beginPath(); c.moveTo(cx - sw * 0.78, y0 + 1); c.lineTo(cx + sw * 0.78, y0 + 1); c.lineTo(cx + sw * 0.94, y1 - 3); c.lineTo(cx - sw * 0.94, y1 - 3); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(40,25,15,.4)'; c.lineWidth = 1; for (let i = 1; i < 6; i++) { const y = lerp(y0, y1 - 3, i / 6), k = i / 6; c.beginPath(); c.moveTo(cx - lerp(sw * 0.74, sw * 0.9, k), y); c.lineTo(cx + lerp(sw * 0.74, sw * 0.9, k), y); c.stroke(); }
      c.strokeStyle = 'rgba(40,25,15,.5)'; c.beginPath(); c.moveTo(cx, y0 + 1); c.lineTo(cx, y1 - 3); c.stroke();
      A.fore = { cv: o.cv, dark };
    }

    // ---- state: note-ons, bows, breathing, looking, moods ------------------------------------------------------------------------------------------------------
    function secState(s) {
      let S = A.state[s.id]; if (S) return S;
      S = A.state[s.id] = { prev: 0, on: -9, nOn: 0, raise: STRINGS[s.inst] ? 0.45 : 0, look: 0.5, breath: 0, pl: [], ph: hash(s.hue * 1.3) * TAU, strike: -9, side: 0, hitAmt: 0 };
      for (let i = 0; i < s.n; i++) S.pl.push({ dir: i % 2 ? -1 : 1, bow: 0, flipAt: 0, hitT: -9, slide: 0.5, slideT: 0.5 });
      return S;
    }
    function update(st, dt) {
      const now = st.now, M = A.mood, playing = st.pos > 0.05, tol = Math.max(0.5, st.tol || 1);
      // moods: ragged when the level strays from the target or beats are early/late, good when it follows
      let rt = 0, gt = 0;
      if (playing) { const mis = Math.abs(clamp(st.level, 0, 1) - clamp(st.target, 0, 1)) / (0.2 * tol); rt = clamp(mis - 0.7, 0, 1) * 0.8; gt = mis < 0.45 ? 0.6 : 0; }
      const kk = 1 - Math.exp(-dt * 1.4); M.rag += (rt - M.rag) * kk; M.good += (gt - M.good) * kk;
      for (const id in st.glow) { const g = st.glow[id]; if (g.kind === 'bad') M.rag = Math.max(M.rag, 0.8 * g.k); else if (g.kind === 'good') M.good = Math.max(M.good, 0.85 * g.k); }
      if (st.bflash && st.bflash.k > 0) { const f = st.bflash.state; if (f === 'fast' || f === 'slow') M.rag = Math.max(M.rag, 0.6 * st.bflash.k); else if (f === 'ok') M.good = Math.max(M.good, 0.6 * st.bflash.k); }
      M.rag = clamp(M.rag, 0, 1); M.good = clamp(M.good, 0, 1);
      const rag = M.rag;
      A.seatList().forEach(s => {
        const S = secState(s), act = st.act[s.id] || 0, gl = st.glow[s.id];
        if (act > S.prev + 0.12) { // a note-on
          S.on = now; S.nOn++; S.hitAmt = 1;
          S.pl.forEach((p, i) => { const sl = s.slots.find(q => q.i === i), r = sl ? sl.r : 0.5; p.flipAt = now + r * 0.3 * rag; p.hitT = now + r * 0.2 * rag; p.slideT = (p.slideT + 0.35 + 0.4 * hash(S.nOn * 3.7 + i)) % 1; });
          S.side ^= 1;
        }
        S.prev = act; S.hitAmt = Math.max(0, S.hitAmt - dt * 4);
        S.pl.forEach(p => {
          if (p.flipAt && now >= p.flipAt) { p.dir = -p.dir; p.flipAt = 0; }
          p.bow += (p.dir - p.bow) * (1 - Math.exp(-dt * (2.2 + 16 * act))); p.slide += (p.slideT - p.slide) * (1 - Math.exp(-dt * 9));
        });
        const cue = gl && gl.kind === 'cue';
        const rt2 = act > 0.1 ? 1 : cue && gl.rel < 1.5 ? 0.75 : STRINGS[s.inst] ? 0.45 : 0;
        S.raise += (rt2 - S.raise) * (1 - Math.exp(-dt * 8));
        const lt = cue ? 1 : !playing ? 0.85 : act > 0.1 ? 0.5 + 0.28 * Math.sin(now * 0.9 + S.ph) - 0.3 * rag : 0.35;
        S.look += (lt - S.look) * (1 - Math.exp(-dt * 5));
        const bt = act > 0.1 && WINDS[s.inst] ? 1 : 0; S.breath += (bt - S.breath) * (1 - Math.exp(-dt * 6));
      });
    }

    // ---- one player (local coordinates: unit = pr, origin = the base of the neck, x right, y down) ------------------------------------------------------
    function ln(c, x1, y1, x2, y2, w, col) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
    function disc(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    function drawPlayer(c, sec, S, sl, st, time, P) {
      const pr = sl.ps, inst = sec.inst, hue = sec.hue, i = sl.i, q = S.pl[i], red = A.cfg.reduced, M = A.mood, rag = M.rag, good = M.good;
      const act = st.act[sec.id] || 0, lv = clamp(st.level, 0, 1), playing = st.pos > 0.05 ? 1 : 0.35, k = S.raise, look = clamp(S.look, 0, 1);
      const ph = sl.ph, strg = STRINGS[inst] ? 1 : 0.55, sec3 = S.ph + ph * rag * 2.4;
      const swayAmt = red ? 0 : (0.1 + 0.6 * lv) * playing * strg, lean = Math.sin(time * (1.6 + 0.5 * lv) + sec3) * swayAmt * 0.2;
      const bob = red ? 0 : Math.sin(time * 2.1 + ph) * 0.035 - 0.05 * act * (STRINGS[inst] ? Math.abs(q.bow) : 1);
      const scl = 1 + (red ? 0 : 0.05 * lv * (act > 0.1 ? 1 : 0));
      const hx = sl.x, hyy = sl.y, lw = Math.max(0.1, 1 / pr);
      const bodyC = P.body(hue), bodyD = P.bodyD(hue), skin = SKIN[Math.floor(sl.r * 5 + i) % 5], hair = HAIR[Math.floor(sl.r * 6 + hue) % 6];
      // where the baton is, seen from this player
      const gx = clamp((A.gaze.x - hx) / (A.W * 0.4), -1, 1), gy = clamp((A.gaze.y - hyy) / (A.stageH * 0.5), -0.3, 1);
      c.save(); c.translate(hx, hyy + bob * pr); c.scale(pr * scl, pr * scl); c.transform(1, 0, -lean, 1, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round';
      // things behind the player: the harp
      if (inst === 'harp') {
        c.strokeStyle = P.brass; c.lineWidth = 0.22; c.beginPath(); c.moveTo(2.4, -2.7); c.lineTo(2.4, 2.1); c.moveTo(2.4, -2.7); c.quadraticCurveTo(1.2, -2.7, 0.75, -1.4); c.lineTo(1.35, 2.3); c.lineTo(2.4, 2.1); c.stroke();
        c.lineWidth = Math.max(0.04, lw * 0.9); c.strokeStyle = P.silver;
        for (let b = 0; b < 9; b++) { const t = b / 8, tx = lerp(2.25, 0.85, t), ty = lerp(-2.4, -1.4, t) + (t * t) * 0.15, bx = lerp(2.3, 1.45, t), by = lerp(2.05, 2.25, t), vib = red ? 0 : Math.sin(time * 38 + b * 1.9) * act * 0.07; c.beginPath(); c.moveTo(tx, ty); c.lineTo((tx + bx) / 2 + vib, (ty + by) / 2); c.lineTo(bx, by); c.stroke(); }
      }
      if (inst === 'cb') { c.fillStyle = P.wood; c.beginPath(); c.ellipse(-0.35, 1.3, 0.95, 1.5, 0.08, 0, TAU); c.fill(); c.strokeStyle = P.woodD; c.lineWidth = 0.1; c.stroke(); ln(c, 0.45, 0.4, 0.95, -1.95, 0.2, P.woodD); disc(c, 0.97, -2.05, 0.17, P.woodD); }
      // torso, shirt, neck
      c.fillStyle = bodyC; c.beginPath(); c.moveTo(-1.05, 0.4); c.quadraticCurveTo(-1.05, -0.08, -0.55, -0.12); c.lineTo(0.55, -0.12); c.quadraticCurveTo(1.05, -0.08, 1.05, 0.4); c.lineTo(0.9, 2.4); c.lineTo(-0.9, 2.4); c.closePath(); c.fill();
      c.fillStyle = bodyD; c.fillRect(0.55, 0.3, 0.5, 2.2); // side shade
      c.fillStyle = P.sheet; c.beginPath(); c.moveTo(-0.3, -0.12); c.lineTo(0.3, -0.12); c.lineTo(0, 0.75); c.closePath(); c.fill();
      disc(c, 0, 0.0, 0.1, hsl(hue, 75, 52, 1));
      c.fillStyle = skin; c.fillRect(-0.2, -0.5, 0.4, 0.42);
      // head turning to the baton, down at the music when not looking
      const pitch = (1 - look) * 0.17, hxo = gx * 0.1 * look + (red ? 0 : Math.sin(time * 0.7 + ph) * 0.02), hyo = -0.88 + pitch - (S.breath > 0.3 ? 0.04 * Math.sin(time * 5 + ph) : 0) - act * 0.05;
      if (WINDS[inst] && S.breath > 0.2) { const bz = 0.12 * S.breath; c.fillStyle = skin; c.beginPath(); c.ellipse(hxo, hyo + 0.1, 0.64 + bz, 0.64 + bz * 0.6, 0, 0, TAU); c.fill(); } else disc(c, hxo, hyo, 0.64, skin);
      c.fillStyle = hair; c.beginPath(); c.arc(hxo, hyo, 0.67, Math.PI, TAU); c.quadraticCurveTo(hxo, hyo + 0.02 + pitch * 2.2, hxo - 0.67, hyo); c.fill();
      if (pr > 3.2) { // face
        const ey = hyo + 0.1 + (1 - look) * 0.1 + gy * 0.05, ex = 0.25, blink = !red && ((time * 0.33 + ph) % 1) > 0.97;
        if (blink) { ln(c, hxo - ex - 0.09 + gx * 0.08 * look, ey, hxo - ex + 0.09 + gx * 0.08 * look, ey, 0.05, '#1a1210'); ln(c, hxo + ex - 0.09 + gx * 0.08 * look, ey, hxo + ex + 0.09 + gx * 0.08 * look, ey, 0.05, '#1a1210'); }
        else { disc(c, hxo - ex + gx * 0.1 * look, ey, 0.085, '#1a1210'); disc(c, hxo + ex + gx * 0.1 * look, ey, 0.085, '#1a1210'); }
        if (rag > 0.45) { c.lineWidth = 0.06; c.strokeStyle = '#1a1210'; c.beginPath(); c.moveTo(hxo - 0.42, ey - 0.22); c.lineTo(hxo - 0.1, ey - 0.1); c.moveTo(hxo + 0.42, ey - 0.22); c.lineTo(hxo + 0.1, ey - 0.1); c.stroke(); }
        else if (cueLook(st, sec)) { c.lineWidth = 0.05; c.strokeStyle = '#1a1210'; c.beginPath(); c.moveTo(hxo - 0.38, ey - 0.2); c.lineTo(hxo - 0.12, ey - 0.24); c.moveTo(hxo + 0.38, ey - 0.2); c.lineTo(hxo + 0.12, ey - 0.24); c.stroke(); }
        if (!(WINDS[inst] && S.breath > 0.2) && inst !== 'tp') { c.lineWidth = 0.06; c.strokeStyle = '#7a3a30'; c.beginPath(); if (good > 0.45) c.arc(hxo, hyo + 0.28, 0.17, 0.2, Math.PI - 0.2); else c.arc(hxo, hyo + 0.52 + (rag > 0.45 ? 0 : -0.08), 0.13, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
      }
      // music: the sheet on the stand in front of the chest
      if (!NOSTAND[inst]) { c.fillStyle = P.sheet; c.globalAlpha = 0.95; c.fillRect(-0.95, 1.3, 1.9, 0.85); c.globalAlpha = 1; ln(c, -0.7, 1.55, 0.7, 1.55, 0.05, 'rgba(40,25,15,.45)'); ln(c, -0.7, 1.85, 0.7, 1.85, 0.05, 'rgba(40,25,15,.45)'); }
      // the instrument and the arms
      const sk = skin, sl_ = P.body(hue), armW = 0.46;
      const arm = (x1, y1, x2, y2) => { ln(c, x1, y1, x2, y2, armW, sl_); disc(c, x2, y2, 0.2, sk); };
      const L = [-0.95, 0.3], R = [0.95, 0.3];
      if (inst === 'vln' || inst === 'vla') {
        const big = inst === 'vla' ? 1.12 : 1, vbx = 0.62, vby = lerp(0.7, -0.2, k), a = lerp(-0.05, -0.38, k), nx = Math.cos(a), ny = Math.sin(a);
        c.save(); c.translate(vbx, vby); c.rotate(a); c.fillStyle = P.wood; c.beginPath(); c.ellipse(0, 0, 0.62 * big, 0.36 * big, 0, 0, TAU); c.fill(); c.strokeStyle = P.woodD; c.lineWidth = 0.08; c.stroke(); c.restore();
        ln(c, vbx + nx * 0.4, vby + ny * 0.4, vbx + nx * 1.5 * big, vby + ny * 1.5 * big, 0.12, '#25140c'); disc(c, vbx + nx * 1.55 * big, vby + ny * 1.55 * big, 0.12, P.woodD);
        arm(R[0], R[1], vbx + nx * 1.0, vby + ny * 1.0 + 0.1);
        const bw = red ? 0 : q.bow, hbx = -1.2 + 0.7 * (0.5 + 0.5 * bw), hby = lerp(0.95, 0.2, k) + 0.07 * bw;
        ln(c, hbx, hby, hbx + 2.15, hby - 0.2 - 0.1 * k, 0.07, P.bow); ln(c, hbx + 0.1, hby + 0.06, hbx + 2.1, hby - 0.14 - 0.1 * k, 0.04, 'rgba(255,255,255,.7)'); arm(L[0], L[1], hbx, hby);
      } else if (inst === 'vc' || inst === 'cb') {
        const bw = red ? 0 : q.bow, cb = inst === 'cb';
        if (!cb) { c.fillStyle = P.wood; c.beginPath(); c.ellipse(0.05, 1.15, 0.8, 1.1, 0, 0, TAU); c.fill(); c.strokeStyle = P.woodD; c.lineWidth = 0.1; c.stroke(); ln(c, 0.32, 0.1, 0.45, -1.1, 0.2, '#25140c'); disc(c, 0.46, -1.17, 0.19, P.woodD); ln(c, 0, 1.4, 0, 2.3, 0.08, P.silver); }
        const hbx = -1.4 + 0.9 * (0.5 + 0.5 * bw), hby = (cb ? 1.45 : 1.15) + lerp(0.4, 0, k) + 0.05 * bw;
        ln(c, hbx, hby, hbx + 2.2, hby - 0.05, 0.08, P.bow); ln(c, hbx + 0.1, hby + 0.07, hbx + 2.1, hby + 0.02, 0.04, 'rgba(255,255,255,.7)'); arm(L[0], L[1], hbx, hby);
        arm(R[0], R[1], cb ? 0.92 : 0.5, cb ? -0.6 : -0.3);
      } else if (inst === 'fl') {
        const ex = lerp(-1.4, -2.5, k), ey = lerp(1.25, -0.2 + (red ? 0 : Math.sin(time * 6) * act * 0.12), k);
        ln(c, hxo, hyo + 0.55, ex, ey, 0.17, P.silver); ln(c, hxo, hyo + 0.55, ex, ey, 0.05, 'rgba(255,255,255,.7)');
        arm(L[0], L[1], lerp(hxo, ex, 0.7), lerp(hyo + 0.55, ey, 0.7)); arm(R[0], R[1], lerp(hxo, ex, 0.3), lerp(hyo + 0.55, ey, 0.3) + 0.05);
      } else if (inst === 'ob' || inst === 'cl') {
        const len = inst === 'cl' ? 1.95 : 1.55, ex = lerp(0.12, 0.3, k), ey = lerp(len - 0.1, len - 0.8, k), col = dark2(P);
        ln(c, hxo, hyo + 0.5, ex, ey, 0.17, col); disc(c, ex, ey + 0.05, inst === 'cl' ? 0.24 : 0.17, col); for (let b = 1; b < 4; b++) disc(c, lerp(hxo, ex, b / 4.5), lerp(hyo + 0.5, ey, b / 4.5), 0.05, P.silver);
        arm(R[0], R[1], lerp(hxo, ex, 0.55), lerp(hyo + 0.5, ey, 0.55)); arm(L[0], L[1], lerp(hxo, ex, 0.8), lerp(hyo + 0.5, ey, 0.8));
      } else if (inst === 'fg') {
        const x0 = lerp(1.3, 1.5, k), col = '#7a3b1e';
        c.strokeStyle = col; c.lineWidth = 0.24; c.beginPath(); c.moveTo(hxo + 0.05, hyo + 0.45); c.quadraticCurveTo(0.8, -1.5, x0 - 0.2, -1.0); c.lineTo(x0, 2.1); c.stroke(); disc(c, x0, 2.12, 0.28, col);
        arm(R[0], R[1], x0 - 0.15, 0.1); arm(L[0], L[1], x0 - 0.05, 0.9);
      } else if (inst === 'hn') {
        const ry = lerp(1.1, 0.35, k), br = S.breath;
        c.strokeStyle = P.brass; c.lineWidth = 0.2; c.beginPath(); c.arc(0.85, ry, 0.82, 0, TAU); c.stroke(); c.lineWidth = 0.14; c.beginPath(); c.arc(0.85, ry, 0.5, 0, TAU); c.stroke();
        c.fillStyle = P.brass; c.beginPath(); c.ellipse(1.75, ry + 0.1, 0.52, 0.66, -0.2, 0, TAU); c.fill(); c.fillStyle = P.brassD; c.beginPath(); c.ellipse(1.82, ry + 0.1, 0.3, 0.42, -0.2, 0, TAU); c.fill();
        ln(c, hxo + 0.1, hyo + 0.55, 0.85, ry - 0.8, 0.09, P.brassD); arm(R[0], R[1], 0.5, ry + 0.1); arm(L[0], L[1], 1.55, ry + 0.3);
        if (br > 0.3 && !red) { c.globalAlpha = 0.25 * br * act; disc(c, 1.8, ry + 0.1, 0.9, P.brass); c.globalAlpha = 1; }
      } else if (inst === 'tp') {
        const by = lerp(1.05, -0.02, k), br = lerp(0.28, 0.5, k), mx = hxo;
        c.strokeStyle = P.brass; c.lineWidth = 0.13; c.beginPath(); c.moveTo(mx - 0.08, hyo + 0.55); c.lineTo(mx - 0.32, by); c.moveTo(mx + 0.08, hyo + 0.55); c.lineTo(mx + 0.32, by); c.stroke();
        disc(c, mx, by + 0.02, br + 0.06, P.brassD); disc(c, mx, by, br, P.brass); disc(c, mx, by + 0.02, br * 0.58, P.brassD); if (act > 0.15) disc(c, mx - br * 0.35, by - br * 0.35, br * 0.16, 'rgba(255,255,255,' + (0.5 * act) + ')');
        c.fillStyle = P.brassD; c.fillRect(mx - 0.2, by + 0.2 - (1 - k) * 0.2, 0.4, 0.22);
        arm(L[0], L[1], mx - 0.32, by + 0.25); arm(R[0], R[1], mx + 0.34, by + 0.25);
      } else if (inst === 'tb') {
        const ext = lerp(0.75, 0.75 + 0.9 * q.slide, k), top = hyo + 0.5;
        c.strokeStyle = P.brass; c.lineWidth = 0.13; c.beginPath(); c.moveTo(-0.18, top); c.lineTo(-0.2, 0.3 + ext); c.moveTo(0.18, top); c.lineTo(0.2, 0.3 + ext); c.stroke(); ln(c, -0.2, 0.3 + ext, 0.2, 0.3 + ext, 0.12, P.brassD);
        c.beginPath(); c.moveTo(0.32, 0.25); c.quadraticCurveTo(1.2, 0.4, 1.35, -0.55); c.stroke(); c.fillStyle = P.brass; c.beginPath(); c.ellipse(1.35, -0.8, 0.52, 0.42, 0.2, 0, TAU); c.fill(); c.fillStyle = P.brassD; c.beginPath(); c.ellipse(1.35, -0.8, 0.3, 0.24, 0.2, 0, TAU); c.fill();
        arm(L[0], L[1], 0, 0.3 + ext); arm(R[0], R[1], 0.3, 0.25);
      } else if (inst === 'tu') {
        c.strokeStyle = P.brass; c.lineWidth = 0.3; c.beginPath(); c.arc(0.15, lerp(1.1, 0.8, k), 1.0, 0, TAU); c.stroke(); ln(c, hxo + 0.1, hyo + 0.55, 0.15, lerp(1.1, 0.8, k) - 0.9, 0.1, P.brassD);
        c.fillStyle = P.brass; c.beginPath(); c.ellipse(1.0, -0.9, 0.9, 0.5, -0.3, 0, TAU); c.fill(); c.fillStyle = P.brassD; c.beginPath(); c.ellipse(1.05, -0.95, 0.55, 0.28, -0.3, 0, TAU); c.fill(); ln(c, 1.0, 0.6, 1.0, -0.7, 0.28, P.brass);
        arm(L[0], L[1], -0.4, 0.9); arm(R[0], R[1], 1.0, 0.5);
      } else if (inst === 'harp') {
        const t = time * 3 + i, ay = 0.2 + (red ? 0 : Math.sin(t) * 0.5 * act), ay2 = 0.5 + (red ? 0 : Math.cos(t * 1.3) * 0.5 * act);
        arm(L[0] + 0.1, L[1], 1.15, ay); arm(R[0], R[1], 1.5, ay2);
      } else if (inst === 'timp') {
        const dr = (x, y, r) => { c.fillStyle = P.brassD; c.beginPath(); c.ellipse(x, y + 0.7, r, r * 1.1, 0, 0, Math.PI); c.fill(); c.fillStyle = P.brass; c.beginPath(); c.ellipse(x, y, r, r * 0.42, 0, 0, TAU); c.fill(); c.fillStyle = dark2(P) === '#2a2018' ? '#f2ead6' : '#e4dcc4'; c.beginPath(); c.ellipse(x, y, r * 0.88, r * 0.34, 0, 0, TAU); c.fill(); };
        const u = clamp(time - S.on, 0, 2), left = S.side === 1;
        dr(-1.2, 1.35, 1.0); dr(0.95, 1.2, 0.85); dr(2.0, 1.1, 0.7);
        const mal = (x0, y0, strike) => { const h = red ? 0.35 : strike ? 0.35 * (1 - Math.exp(-u * 7)) : 0.35, my = y0 + 0.6 - h * 1.1; ln(c, x0, y0 + 0.35, x0 + 0.12, my, 0.07, P.sheet); disc(c, x0 + 0.12, my, 0.14, P.sheet); arm(x0 < 0 ? L[0] : R[0], 0.3, x0, y0 + 0.35); };
        mal(-0.8, 0.4, left); mal(0.7, 0.4, !left);
      } else if (inst === 'bd') {
        const pulse = 1 + (red ? 0 : S.hitAmt * 0.04);
        c.fillStyle = '#7b2d26'; c.beginPath(); c.arc(0, 2.5, 1.95 * pulse, 0, TAU); c.fill(); c.fillStyle = '#efe6d2'; c.beginPath(); c.arc(0, 2.5, 1.65 * pulse, 0, TAU); c.fill();
        const u = clamp(time - S.on, 0, 1), h = red ? 0.3 : 1 - Math.exp(-u * 9); ln(c, 1.05, 0.2, 0.7, 1.9 - 1.0 * h, 0.07, P.sheet); disc(c, 0.7, 1.9 - 1.0 * h, 0.2, P.sheet); arm(R[0], R[1], 1.05, 0.2); arm(L[0], L[1], -0.7, 1.0);
      } else if (inst === 'cym') {
        const u = clamp(time - S.on, 0, 1), cl = red ? 0 : Math.exp(-u * 5), dx = 0.15 + 1.0 * (1 - cl);
        const cym = (x, y, s) => { c.fillStyle = P.brass; c.beginPath(); c.ellipse(x, y, 0.85, 0.85, 0, 0, TAU); c.fill(); c.strokeStyle = P.brassD; c.lineWidth = 0.1; c.stroke(); disc(c, x - 0.2 * s, y - 0.2, 0.28, 'rgba(255,255,255,.35)'); disc(c, x, y, 0.1, P.brassD); };
        cym(-dx - 0.6, 0.9 - 0.5 * (1 - cl), 1); cym(dx + 0.6, 0.9 - 0.5 * (1 - cl), -1); arm(L[0], L[1], -dx - 0.6, 0.9 - 0.5 * (1 - cl)); arm(R[0], R[1], dx + 0.6, 0.9 - 0.5 * (1 - cl));
      }
      c.restore();
    }
    const dark2 = P => (P.sheet === '#cfc3a4' ? '#6b5a4a' : '#2a2018');
    const cueLook = (st, sec) => { const g = st.glow[sec.id]; return g && g.kind === 'cue'; };

    // ---- one section: floor light, players, cue marks -----------------------------------------------------------------------------------------------------------
    function drawSection(s, st, time, P) {
      const S = secState(s), act = st.act[s.id] || 0, glow = st.glow[s.id] || null, pr = s.pr, c = ctx;
      const poolY = s.foot - (s.rows - 1) * pr * 0.78 - pr * 0.15, rx = s.halfW + pr * 0.9, ry = Math.max(rx * 0.2, (s.rows - 1) * pr * 0.78 + pr * 0.8);
      // pool of light on the stage floor, brighter while the section plays
      c.save();
      if (act > 0.04) { c.fillStyle = hsl(s.hue, 80, st.dark ? 62 : 55, clamp(act * 0.38, 0, 0.4)); c.beginPath(); c.ellipse(s.cx, poolY, rx, ry, 0, 0, TAU); c.fill(); }
      c.restore();
      for (let n = 0; n < s.slots.length; n++) drawPlayer(c, s, S, s.slots[n], st, time, P);
      // cue glow / result flash on the floor + marks above the players
      if (glow) {
        c.save();
        if (glow.kind === 'cue') {
          const pulse = 0.5 + 0.5 * Math.sin(time * 9), k = glow.k;
          c.strokeStyle = P.gold; c.lineWidth = 3 + pulse * 2; c.globalAlpha = 0.6 + 0.4 * pulse; c.beginPath(); c.ellipse(s.cx, poolY, rx + 4, ry + 3, 0, 0, TAU); c.stroke();
          c.globalAlpha = 0.16 + 0.12 * pulse; c.fillStyle = P.gold; c.beginPath(); c.ellipse(s.cx, poolY, rx, ry, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
          const ay = s.top - Math.max(9, pr * 1.2);
          c.beginPath(); c.strokeStyle = P.ink; c.lineWidth = 3; c.arc(s.cx, ay - pr * 0.6, Math.max(7, pr * 0.9), -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1)); c.stroke();
          c.fillStyle = P.gold; c.beginPath(); c.moveTo(s.cx - 6, ay + 4 - pr * 0.1); c.lineTo(s.cx + 6, ay + 4 - pr * 0.1); c.lineTo(s.cx, ay + 12 - pr * 0.1); c.closePath(); c.fill();
        } else {
          const col = glow.kind === 'good' ? P.good : P.bad;
          c.globalAlpha = clamp(glow.k, 0, 1) * 0.3; c.fillStyle = col; c.beginPath(); c.ellipse(s.cx, poolY, rx, ry, 0, 0, TAU); c.fill();
          c.globalAlpha = clamp(glow.k, 0, 1); c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.ellipse(s.cx, poolY, rx + 3, ry + 2, 0, 0, TAU); c.stroke();
        }
        c.restore();
      }
    }
    // the labels (always readable): a small pill under each cluster, drawn after every player
    function drawLabels(st, P) {
      const c = ctx, fs = Math.max(10, Math.round(A.scale * 0.03)), font = '800 ' + fs + 'px system-ui, sans-serif'; c.save(); c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
      A.seatList().forEach(s => {
        const ab = A.cfg.en ? s.def.ab.en : s.def.ab.ja, txt = st.keys[s.id] ? st.keys[s.id] + ' ' + ab : ab, key = txt + font;
        if (s.labelKey !== key) { s.labelKey = key; s.labelW = c.measureText(txt).width; }
        const w = s.labelW + 8, h = fs + 4, y = s.foot + pr0(s) * 0.15 + h / 2 + 1, x = clamp(s.cx, w / 2 + 2, A.W - w / 2 - 2);
        c.fillStyle = P.label; roundRect(c, x - w / 2, y - h / 2, w, h, h / 2); c.fill(); c.fillStyle = P.ink; c.fillText(txt, x, y + 0.5);
      });
      c.restore();
    }
    const pr0 = s => s.pr;

    // ---- the beat pattern guide ---------------------------------------------------------------------------------------------------------------
    function drawPattern(st, c) {
      const w = Math.min(64, A.scale * 0.2), h = Math.min(78, A.scale * 0.24), pat = PATTERNS[st.pattern] || PATTERNS[2], bx = Math.max(6, A.podium.x - 50 - 8 - w), by = A.stageH - h - 6;
      ctx.save(); ctx.fillStyle = st.pal.panel; roundRect(ctx, bx, by, w, h, 10); ctx.fill();
      const P = pat.map(p => [bx + 8 + p[0] * (w - 16), by + 6 + p[1] * (h - 22)]);
      ctx.strokeStyle = st.pal.line; ctx.lineWidth = 1.5; ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      const nb = st.pattern;
      for (let i = 0; i < nb; i++) {
        const q = P[Math.min(P.length - 1, i + 1)], on = i === st.beatInBar;
        ctx.fillStyle = on ? st.pal.gold : st.pal.dim; ctx.beginPath(); ctx.arc(q[0], q[1], on ? 5.5 : 3.4, 0, TAU); ctx.fill();
      }
      ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = st.pal.ink; ctx.textBaseline = 'bottom';
      ctx.fillText(st.pattern + ' · ' + (st.beatInBar + 1), bx + w / 2, by + h - 2);
      ctx.restore();
    }

    // ---- level meter --------------------------------------------------------------------------------------------------------------------------------
    const METER_MARKS = [['ppp', 0.07], ['pp', 0.19], ['p', 0.30], ['mp', 0.40], ['mf', 0.50], ['f', 0.65], ['ff', 0.88]]; // the levels the strokes map to (engine.js Dynamics)
    function drawMeter(st) {
      const w = 12, x = A.W - w - 8, h = Math.min(A.stageH * 0.34, 170), y = A.stageH * 0.56;
      ctx.save(); ctx.fillStyle = st.pal.panel; roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 8); ctx.fill();
      const lv = clamp(st.level, 0, 1), tg = clamp(st.target, 0, 1);
      const near = Math.abs(lv - tg) < 0.14 * st.tol;
      ctx.fillStyle = near ? st.pal.good : st.pal.gold; const fh = h * lv; roundRect(ctx, x, y + h - fh, w, Math.max(2, fh), 4); ctx.fill();
      // the scale ppp..ff (so players can learn the range), the current mark in bold
      ctx.font = '700 9px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      METER_MARKS.forEach(m => { const my = y + h - h * m[1], cur = st.curMark === m[0]; ctx.fillStyle = st.pal.ink; ctx.globalAlpha = cur ? 1 : 0.5; ctx.fillRect(x + w - 3, my - 0.5, 3, 1); if (cur) { ctx.font = '900 10px system-ui, sans-serif'; } ctx.fillText(m[0], x, my); ctx.font = '700 9px system-ui, sans-serif'; });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = st.pal.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 6, y + h - h * tg); ctx.lineTo(x + w + 6, y + h - h * tg); ctx.stroke();
      ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = st.pal.ink; ctx.fillText(st.mark, x - 9, y + h - h * tg);
      if (st.curMark) { ctx.font = '900 12px system-ui, sans-serif'; ctx.fillStyle = near ? st.pal.good : st.pal.gold; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(st.curMark, x + w / 2, y + h + 6); }
      ctx.restore();
    }

    // ---- score-follow bar ---------------------------------------------------------------------------------------------------------------------------
    function drawBar(st) {
      const y0 = A.stageH, h = A.barH, pad = 8, w = A.W - pad * 2, x0 = pad;
      ctx.save(); ctx.fillStyle = st.pal.panel; ctx.fillRect(0, y0, A.W, h);
      const d = st.dyn || '', nB = Math.max(1, d.length), bw = Math.max(1.5, w / nB), top = y0 + 16, bh = h - 28, pos = clamp(st.pos / nB, 0, 1);
      const step = Math.max(1, Math.floor(nB / (w / 2.4)));
      for (let b = 0; b < nB; b += step) {
        let g = 0; for (let k = 0; k < step && b + k < nB; k++) g = Math.max(g, d.charCodeAt(b + k) - 48);
        const x = x0 + (b / nB) * w, hh = (g + 1) / 9 * bh, played = (b + step) / nB <= pos;
        ctx.fillStyle = played ? 'rgba(255,200,100,.28)' : 'rgba(255,200,100,.55)'; if (!st.dark) ctx.fillStyle = played ? 'rgba(150,80,30,.25)' : 'rgba(150,80,30,.5)';
        ctx.fillRect(x, top + bh - hh, Math.max(1, (w / nB) * step - 0.6), hh);
      }
      // what the player did
      if (st.hist && st.hist.length) {
        ctx.strokeStyle = st.pal.ink; ctx.lineWidth = 1.6; ctx.beginPath(); let started = false;
        st.hist.forEach((v, b) => { if (v == null) return; const x = x0 + ((b + 0.5) / nB) * w, y = top + bh - clamp(v, 0, 1) * bh; if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); });
        ctx.stroke();
      }
      // cue marks (a little flag in the section's colour)
      (st.cues || []).forEach(c => {
        const x = x0 + (c.b / nB) * w, h0 = st.secHue[c.secs[0]] != null ? st.secHue[c.secs[0]] : 40;
        ctx.fillStyle = c.q != null ? (c.q >= 0.45 ? st.pal.good : st.pal.bad) : hsl(h0, 70, st.dark ? 62 : 42, 1);
        ctx.beginPath(); ctx.moveTo(x, y0 + 3); ctx.lineTo(x + 5, y0 + 9); ctx.lineTo(x - 5, y0 + 9); ctx.closePath(); ctx.fill();
      });
      // playhead
      const px = x0 + pos * w; ctx.fillStyle = st.pal.ink; ctx.fillRect(px - 1, y0 + 4, 2, h - 8);
      ctx.font = '800 11px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.fillStyle = st.pal.dim; ctx.textAlign = 'left'; ctx.fillText(st.barText, x0, y0 + h - 2);
      ctx.textAlign = 'right'; ctx.fillText(st.timeText, A.W - pad, y0 + h - 2);
      ctx.restore();
    }

    // ---- the conductor's own hands and baton (foreground, in front of everything) --------------------------------------------------------------------------
    function hand(c, x, y, r, st, ang) {
      c.save(); c.translate(x, y); c.rotate(ang || 0); c.fillStyle = '#f1ece2'; c.fillRect(-r * 0.75, r * 0.2, r * 1.5, r * 0.55); // cuff
      c.fillStyle = '#e7bf9a'; c.beginPath(); c.ellipse(0, 0, r, r * 0.85, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(90,50,30,.45)'; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.moveTo(-r * 0.6, -r * 0.1); c.lineTo(r * 0.6, -r * 0.1); c.moveTo(-r * 0.55, r * 0.2); c.lineTo(r * 0.55, r * 0.2); c.stroke(); c.restore();
    }
    function sleeve(c, x, y, ex, ey, w, st) { c.strokeStyle = st.dark ? 'rgba(14,8,10,.94)' : 'rgba(40,24,22,.92)'; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke(); }
    function drawBaton(st) {
      const tr = st.trail, c = ctx, now = st.now, active = !!(tr && tr.length >= 2 && now - tr[tr.length - 1].t < 1.2);
      c.save(); c.beginPath(); c.rect(0, 0, A.W, A.stageH); c.clip(); c.lineCap = 'round'; c.lineJoin = 'round';
      if (tr && tr.length >= 2) {
        for (let i = 1; i < tr.length; i++) {
          const a = tr[i - 1], b = tr[i], age = (now - b.t); const al = clamp(1 - age / 0.9, 0, 1); if (al <= 0) continue;
          c.strokeStyle = 'rgba(' + st.pal.trail + ',' + (al * 0.8) + ')'; c.lineWidth = 1 + 4 * al; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        }
      }
      const px = A.podium.x, py = A.podium.y, scl = A.scale, hr = Math.max(8, scl * 0.026);
      if (active) {
        const t = tr[tr.length - 1], bodyX = lerp(px, t.x, 0.35), bodyY = A.stageH * 1.08; let dx = bodyX - t.x, dy = bodyY - t.y; const Ld = Math.hypot(dx, dy) || 1; dx /= Ld; dy /= Ld;
        const len = Math.max(54, scl * 0.17), gx = t.x + dx * len, gy = t.y + dy * len;
        // right arm from the body, the baton, the hand
        sleeve(c, gx + dx * hr * 0.5, gy + dy * hr * 0.5, lerp(px, t.x, 0.2) + (t.x > px ? 24 : -24), A.stageH + 20, hr * 1.05, st);
        c.strokeStyle = st.dark ? '#fff7e6' : '#fffaf0'; c.lineWidth = 4; c.beginPath(); c.moveTo(gx, gy); c.lineTo(t.x, t.y); c.stroke(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.stroke();
        disc(c, t.x, t.y, 2.6, st.pal.gold); hand(c, gx, gy, hr, st, Math.atan2(dy, dx) + Math.PI / 2);
        // left hand mirrors the swing, rising with the dynamics
        const lx = A.W - t.x * 0.6 - A.W * 0.2 + A.W * 0.1, ly = A.stageH * (0.9 - 0.14 * clamp(st.level, 0, 1)); sleeve(c, lx, ly, lx - (lx - px) * 0.3, A.stageH + 20, hr * 1.0, st); hand(c, lx, ly, hr * 0.92, st, 0);
      } else { // at rest on the stand
        sleeve(c, px + 34, py - 6, px + 44, A.stageH + 24, hr * 1.05, st); sleeve(c, px - 34, py - 6, px - 44, A.stageH + 24, hr * 1.05, st);
        c.strokeStyle = st.dark ? '#fff7e6' : '#fffaf0'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(px + 30, py - 12); c.lineTo(px - 6, py - 50); c.stroke(); hand(c, px + 32, py - 8, hr, st, 0); hand(c, px - 32, py - 8, hr * 0.92, st, 0);
      }
      c.restore();
    }

    // ---- baton-path guide (toggle) and the flash on every registered beat ------------------------------------------------------------------------
    function drawGuide(st) {
      if (!st.guide) return;
      const pat = PATTERNS[st.pattern] || PATTERNS[2], w = A.scale * 0.46, h = A.scale * 0.5, bx = A.W / 2 - w / 2, by = A.stageH * 0.22;
      const P = pat.map(p => [bx + p[0] * w, by + p[1] * h]);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = st.pal.gold; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.setLineDash([]);
      const fs = Math.max(11, Math.round(A.scale * 0.045)); ctx.font = '900 ' + fs + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < st.pattern; i++) { const q = P[Math.min(P.length - 1, i + 1)], on = i === st.beatInBar, r = fs * (on ? 0.95 : 0.7);
        ctx.globalAlpha = on ? 0.95 : 0.55; ctx.fillStyle = i === 0 ? st.pal.gold : st.pal.panel; ctx.strokeStyle = st.pal.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = i === 0 ? '#2a1708' : st.pal.ink; ctx.fillText(String(i + 1), q[0], q[1] + 1); }
      if (st.guideTip) { ctx.globalAlpha = 0.9; ctx.font = '800 ' + Math.max(10, Math.round(A.scale * 0.034)) + 'px system-ui, sans-serif'; ctx.fillStyle = st.pal.ink; ctx.textBaseline = 'top'; ctx.fillText(st.guideTip, A.W / 2, P[1][1] + fs * 1.1); }
      ctx.restore();
    }
    // the model (お手本) baton: a translucent baton moving along the pattern in time with the music; its swing size follows the dynamics guide
    const E_ghostPoint = (n, bib, f) => (typeof window !== 'undefined' && window.OrchEngine && OrchEngine.ghostPoint ? OrchEngine.ghostPoint(n, bib, f) : [0.5, 0.5]);
    function drawGhost(st) {
      const g = st.ghost; if (!g || !g.alpha) return;
      const w = A.scale * 0.46, h = A.scale * 0.5, bx = A.W / 2 - w / 2, by = A.stageH * 0.22, pt = E_ghostPoint(g.pattern, g.bib, g.f), k = 0.45 + 0.75 * clamp(g.level, 0, 1);
      const cx = bx + 0.5 * w, cy = by + 0.55 * h, x = cx + (bx + pt[0] * w - cx) * k, y = cy + (by + pt[1] * h - cy) * k;
      ctx.save(); ctx.globalAlpha = g.alpha; ctx.lineCap = 'round';
      ctx.strokeStyle = st.dark ? '#bfe3ff' : '#2a5d9a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 30 * (0.6 + 0.6 * k), y - 34 * (0.6 + 0.6 * k)); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = st.dark ? '#e8f4ff' : '#1f4a7d'; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
      if (g.label) { ctx.globalAlpha = Math.min(1, g.alpha + 0.2); ctx.font = '900 ' + Math.max(11, Math.round(A.scale * 0.04)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = st.pal.ink; ctx.fillText(g.label, A.W / 2, by - 4); }
      ctx.restore();
    }

    function drawBeatFlash(st) {
      const f = st.bflash; if (!f || f.k <= 0) return;
      ctx.save(); const k = clamp(f.k, 0, 1), col = f.state === 'ok' ? st.pal.good : f.state === 'fast' || f.state === 'slow' ? st.pal.bad : st.pal.gold;
      ctx.globalAlpha = k * 0.85; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + (1 - k) * A.scale * 0.1, 0, TAU); ctx.stroke();
      if (f.text) { ctx.globalAlpha = Math.min(1, k * 1.6); ctx.font = '900 ' + Math.max(12, Math.round(A.scale * 0.05)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = col; ctx.fillText(f.text, clamp(f.x, 60, A.W - 60), Math.max(24, f.y - 18 - (1 - k) * 10)); }
      ctx.restore();
    }

    // ---- everything -----------------------------------------------------------------------------------------------------------------------------------
    // st: see index.html (act, glow, keys, level, target, mark, pattern, beatInBar, trail, dyn, hist, cues, pos, barText, timeText, hint, ...)
    A.draw = function (st) {
      const c = ctx, W = A.W, H = A.H, time = st.now; st.dark = !!st.dark; st.pal = pal(st.dark); const P = st.pal;
      c.setTransform(A.dpr, 0, 0, A.dpr, 0, 0);
      if (!A.hall || A.hall.dark !== st.dark) buildHall(st.dark);
      if (!A.fore || A.fore.dark !== st.dark) buildFore(st.dark);
      let dt = A.prevNow == null ? 0 : st.now - A.prevNow; if (!(dt >= 0) || dt > 0.25) dt = dt > 0.25 ? 0.05 : 0; A.prevNow = st.now;
      // where the players look: the baton tip while conducting, else the podium
      const tr = st.trail; if (tr && tr.length && st.now - tr[tr.length - 1].t < 1.2) { A.gaze.x = tr[tr.length - 1].x; A.gaze.y = tr[tr.length - 1].y; A.gaze.on = true; } else { A.gaze.x = A.W / 2; A.gaze.y = A.stageH * 0.9; A.gaze.on = false; }
      update(st, dt);
      c.drawImage(A.hall.cv, 0, 0, W, A.stageH);
      // the light of the hall warms with good conducting and reddens when it is ragged
      const M = A.mood; if (M.good > 0.02 || M.rag > 0.02) { c.fillStyle = M.rag > M.good ? 'rgba(220,70,50,' + (M.rag * 0.08) + ')' : 'rgba(255,214,130,' + (M.good * 0.07) + ')'; c.fillRect(0, 0, W, A.stageH); }
      // sections, back rows first
      const order = A.seatList().sort((p, q) => p.foot - q.foot); order.forEach(s => drawSection(s, st, time, P));
      drawLabels(st, P);
      c.drawImage(A.fore.cv, 0, 0, W, A.stageH);
      drawPattern(st, c); drawMeter(st); drawGuide(st); drawGhost(st); drawBaton(st); drawBeatFlash(st);
      // centre message
      if (st.msg) {
        c.save(); c.font = '800 ' + Math.max(14, Math.round(A.scale * 0.045)) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        const lines = String(st.msg).split('\n'), lh = Math.max(18, A.scale * 0.058), tw = Math.max(...lines.map(l => c.measureText(l).width)) + 28, th = lines.length * lh + 14, yy = A.stageH * 0.5;
        c.fillStyle = st.dark ? 'rgba(10,5,8,.72)' : 'rgba(255,250,240,.86)'; roundRect(c, W / 2 - tw / 2, yy - th / 2, tw, th, 14); c.fill();
        c.fillStyle = st.pal.ink; lines.forEach((l, i) => c.fillText(l, W / 2, yy - th / 2 + 7 + lh * (i + 0.5))); c.restore();
      }
      drawBar(st);
    };
    return A;
  }
  return { create, PATTERNS, BEATPOINT, hsl };
});
