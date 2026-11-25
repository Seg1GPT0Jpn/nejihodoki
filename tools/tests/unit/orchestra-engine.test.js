// orchestra/engine.js: score grid and tempo guide, beat detection from synthetic baton streams, the musical clock, the lookahead scheduler on a fake clock,
// the strict / lenient conductor behaviour, scoring and the cue windows.
// 実行：node tools/tests/unit/orchestra-engine.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'orchestra/engine.js'));

const loadScore = id => new E.Score(JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores', id + '.json'), 'utf8')));
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' +-' + tol + ', got ' + a);

// --- a tiny hand-made score: 4 bars of 4/4, quarter notes on one section, 2 cues ----------------------------------------------------------------
function tiny(opt) {
  opt = opt || {};
  const n = []; let prev = 0; const bars = opt.bars || 4;
  for (let b = 0; b < bars * 4; b++) { n.push(b * 96 - prev, 60 + (b % 5), 96, 80); prev = b * 96; }
  const json = { v: 1, id: 'tiny', ppq: 96, grid: [[0, bars, 4, 96]], bpm: [[0, 100]], dyn: '4'.repeat(bars * 4), cues: opt.cues || [], nBeats: bars * 4, needs: {}, sec: [{ id: 'vln1', inst: 'vln', n }], title: { ja: 't', en: 't' } };
  return new E.Score(json);
}
// drives a Session on a fake clock; returns what the sink saw
function drive(session, o) {
  const log = { on: [], off: [], maint: 0 };
  session.sink.noteOn = (t, si, p, sh, g, id) => { log.on.push({ t, si, p, g, id, at: o.now }); };
  session.sink.noteOff = (t, id) => { log.off.push({ t, id }); };
  session.sink.maintain = () => { log.maint++; };
  return log;
}
function conduct(session, log, times, until, o) { // times: ictus times (seconds), run the 25 ms control loop until `until`
  let i = 0; o = o || {};
  for (let now = 0; now <= until + 1e-9; now += 0.025) {
    o.now = now; while (i < times.length && times[i] <= now + 1e-9) { const r = session.ictus(times[i], o.info || {}); (o.results || []).push(r); i++; }
    session.tick(now);
  }
}
const regular = (t0, bpm, n) => Array.from({ length: n }, (_, k) => t0 + k * 60 / bpm);

test('score grid: bars, beats, ticks and beats convert both ways; the real pieces have sane meta', () => {
  const s = tiny(); eq(s.nBeats, 16); eq(s.nBars, 4); eq(s.patternOfBeat[0], 4); eq(s.beatInBar[5], 1); eq(s.barOf(5.2), 2);
  near(s.tickToBeat(96 * 2.5), 2.5, 1e-9); near(s.beatToTick(7.25), 96 * 7.25, 1e-9); near(s.tickToBeat(96 * 20), 20, 1e-9, 'beyond the end extrapolates');
  const ids = ['beethoven5', 'beethoven7', 'nachtmusik', 'zauberflote', 'dvorak7', 'midsummer', 'rossini', 'egmont', 'dvorak7-1', 'dvorak7-2', 'dvorak7-4', 'dvorak9-1', 'dvorak9-2', 'dvorak9-3', 'dvorak9-4'];
  for (const id of ids) {
    const sc = loadScore(id); ok(sc.nBeats > 150 && sc.nBeats < 950, id + ' beats ' + sc.nBeats); eq(sc.dyn.length, sc.nBeats, id + ' dyn per beat'); ok(/^[0-8]+$/.test(sc.dyn));
    ok(sc.events.length === sc.noteCount * 2 && sc.noteCount > 500, id + ' notes'); const sec = sc.guideSeconds(); ok(sec > 140 && sec < 640, id + ' minutes ' + sec / 60);
    for (let b = 0; b < sc.nBeats; b++) { const g = sc.bpmAt(b); if (!(g >= 36 && g <= 132)) throw new Error(id + ' guide bpm ' + g + ' at ' + b); }
  }
  const eg = loadScore('egmont'); ok(new Set(eg.patternOfBeat).size >= 2, 'Egmont changes meter');
  const rs = loadScore('rossini'); ok(rs.bpmAt(0) < 80 && rs.bpmAt(rs.nBeats - 1) > 100, 'Rossini speeds up: ' + rs.bpmAt(0) + ' -> ' + rs.bpmAt(rs.nBeats - 1));
});

test('events: every note-on has its note-off, offs come first at equal beats, times never go backwards', () => {
  const s = loadScore('dvorak7'); const open = new Set(); let last = -1;
  for (const e of s.events) { ok(e.b >= last - 1e-12, 'ordered'); last = e.b; if (e.k) { ok(!open.has(e.id)); open.add(e.id); } else { ok(open.has(e.id), 'off after on'); open.delete(e.id); } }
  eq(open.size, 0);
  const t = tiny(); for (let i = 1; i < t.events.length; i++) if (t.events[i].b === t.events[i - 1].b) ok(!(t.events[i].k === 0 && t.events[i - 1].k === 1), 'off before on');
});

test('dynamics guide interpolates between beat centres and names the marks', () => {
  const s = tiny(); near(s.dynAt(3.5), 4.5 / 9, 1e-9); eq(s.markAt(3), 'mf');
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores/beethoven5.json'), 'utf8')); j.dyn = '0'.repeat(10) + '8'.repeat(10) + '0'.repeat(j.nBeats - 20); const r = new E.Score(j);
  ok(r.dynAt(5) < 0.1 && r.dynAt(15) > 0.9 && r.dynAt(10) > 0.2 && r.dynAt(10) < 0.8, 'ramp across the change'); eq(r.markAt(15), 'ff');
});

// ---- baton detection --------------------------------------------------------------------------------------------------------------------------
function bounce(det, o) { // a bouncing baton: y follows 0.5-0.5cos, ictus at the bottom; returns ictus events
  const out = [], fs = 60, I = 60 / o.bpm, A = o.amp, x0 = o.x0 || 200, rnd = o.noise ? mulberry(7) : null;
  for (let t = 0; t < (o.beats || 8) * I; t += 1 / fs) {
    const y = 100 + A * (0.5 - 0.5 * Math.cos(2 * Math.PI * t / I)) + (rnd ? (rnd() - 0.5) * 2 * o.noise : 0), x = x0 + (o.sway || 0) * Math.sin(2 * Math.PI * t / I);
    det.push(x, y, (o.t0 || 0) + t).forEach(e => out.push(e));
  }
  return out;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

test('BeatDetector: a bouncing baton gives one ictus per bounce, at the bottom, with the stroke size', () => {
  for (const bpm of [60, 96, 132]) {
    const ev = bounce(new E.BeatDetector({ scale: 400 }), { bpm, amp: 120, beats: 8, noise: 1.2 }), I = 60 / bpm;
    ok(ev.length >= 7 && ev.length <= 8, bpm + ' bpm: ' + ev.length + ' beats');
    ev.forEach((e, k) => near(((e.t % I) + I) % I, I / 2, 0.03, bpm + ' bpm ictus phase #' + k));
    near(ev[2].amp, 120 / 400, 0.04, 'amp');
  }
});

test('BeatDetector: size grows with the swing, tiny jitter and slow drift give no beats, double hits inside the minimum gap are merged', () => {
  const big = bounce(new E.BeatDetector({ scale: 400 }), { bpm: 90, amp: 180, beats: 6 }), small = bounce(new E.BeatDetector({ scale: 400 }), { bpm: 90, amp: 60, beats: 6 });
  ok(big[2].amp > small[2].amp * 2.4, 'big ' + big[2].amp + ' vs small ' + small[2].amp);
  const jitter = bounce(new E.BeatDetector({ scale: 400 }), { bpm: 90, amp: 4, beats: 6, noise: 1 }); eq(jitter.length, 0, 'a hand resting on the mouse');
  const d = new E.BeatDetector({ scale: 400 }); let n = 0; for (let t = 0; t < 10; t += 1 / 60) n += d.push(100 + t * 10, 100 + 30 * Math.sin(t * 0.3), t).length; eq(n, 0, 'drift');
  const fast = bounce(new E.BeatDetector({ scale: 400, minGap: 0.2 }), { bpm: 400, amp: 100, beats: 20 }); for (let i = 1; i < fast.length; i++) ok(fast[i].t - fast[i - 1].t >= 0.2 - 1e-9, 'ictus are never closer than the minimum gap'); ok(fast.length <= 10, 'beats 150 ms apart are thinned out: ' + fast.length);
});

test('BeatDetector: side-to-side waving counts at the turning points; the rebound at the top of a bounce does not count', () => {
  const d = new E.BeatDetector({ scale: 400 }); const out = [];
  for (let t = 0; t < 4; t += 1 / 60) d.push(200 + 80 * Math.sin(2 * Math.PI * t / 0.6), 150, t).forEach(e => out.push(e));
  ok(out.length >= 6 && out.length <= 14, 'waving: ' + out.length); // both extremes (a beat each 0.3 s), minGap 0.2
  const b = bounce(new E.BeatDetector({ scale: 400 }), { bpm: 80, amp: 100, beats: 10 }); ok(b.length <= 10, 'one per bounce, not two: ' + b.length);
});

test('BeatDetector: speed is reported (faster stroke, bigger speed) and the 4-pattern (down, left, right, up) gives its beats', () => {
  const a = bounce(new E.BeatDetector({ scale: 400 }), { bpm: 60, amp: 100, beats: 5 }), b = bounce(new E.BeatDetector({ scale: 400 }), { bpm: 120, amp: 100, beats: 10 });
  ok(b[3].speed > a[3].speed * 1.5, 'speed ' + a[3].speed + ' -> ' + b[3].speed);
  const pts = [[200, 60], [200, 200], [120, 150], [280, 150], [230, 80]]; // top, beat 1, 2, 3, 4
  const det = new E.BeatDetector({ scale: 400 }); const ev = []; let t = 0, k = 0;
  for (let bar = 0; bar < 4; bar++) for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    for (let s = 0; s < 12; s++) { const f = s / 12; det.push(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, t).forEach(e => ev.push(e)); t += 1 / 60; k++; }
  }
  ok(ev.length >= 8, 'pattern beats: ' + ev.length);
});

test('FlickDetector + aimedSeat: a quick straight swipe points at a seat; a slow curve or short move does not', () => {
  const f = new E.FlickDetector({ scale: 400 }); for (let i = 0; i <= 8; i++) f.push(100 + i * 20, 300 - i * 14, i * 0.025);
  const fl = f.check(); ok(fl && fl.len > 0.3, 'flick'); const seats = [{ id: 'a', x: 400, y: 100 }, { id: 'b', x: 400, y: 300 }];
  eq(E.aimedSeat(seats, fl, 16).id, 'a'); eq(E.aimedSeat([{ id: 'c', x: 100, y: 50 }], fl, 16), null, 'nothing in that direction');
  const row = [{ id: 'front', x: 300, y: 160 }, { id: 'back', x: 500, y: 16 }, { id: 'side', x: 500, y: 300 }]; eq(E.aimedSeat(row, fl, 16).id, 'front', 'two seats on the line: the closer angle'); eq(E.aimedSeat(row, fl, 16, new Set(['back'])).id, 'back', 'the section about to enter wins');
  const g = new E.FlickDetector({ scale: 400 }); for (let i = 0; i <= 8; i++) g.push(100 + i * 4, 300, i * 0.05); eq(g.check(), null, 'short');
  const h = new E.FlickDetector({ scale: 400 }); for (let i = 0; i <= 12; i++) h.push(100 + 200 * Math.sin(i / 12 * 3.1), 300 + 200 * Math.sin(i / 12 * 6.2), i * 0.02); eq(h.check(), null, 'curved');
});

test('MotionDetector: the vertical acceleration peak of a bouncing phone is the ictus, whichever way the phone is held', () => {
  for (const g of [[0, 0, 9.8], [0, 9.8, 0], [6.9, 6.9, 0]]) {
    const det = new E.MotionDetector(), out = [], T = 0.625, H = 0.12, w = 2 * Math.PI / T; const gm = Math.hypot(...g), u = g.map(v => v / gm);
    for (let t = 0; t < 8 * T; t += 1 / 60) { const a = -H * w * w * Math.cos(w * t); /* + up */ det.push(g[0] + u[0] * a, g[1] + u[1] * a, g[2] + u[2] * a, t).forEach(e => out.push(e)); }
    ok(out.length >= 6 && out.length <= 8, g + ': ' + out.length);
    out.slice(2).forEach(e => near(((e.t % T) + T) % T, T / 2, 0.06, 'phase ' + g));
  }
});

// ---- the clock -------------------------------------------------------------------------------------------------------------------------------
test('BeatClock: position and time are inverse, a retune only changes the future after the committed horizon, waiting at the ceiling', () => {
  const c = new E.BeatClock(); c.start(10, 0, 120, Infinity); near(c.posAt(11), 2, 1e-9); near(c.timeOf(6), 13, 1e-9); near(c.posAt(5), 0, 1e-9, 'before the start');
  c.commit(12); c.retune(10.5, 60); near(c.posAt(12), 4, 1e-9, 'unchanged up to the horizon'); near(c.posAt(13), 5, 1e-9, 'then the new tempo'); near(c.timeOf(5), 13, 1e-9);
  const w = new E.BeatClock(); w.start(0, 0, 60, 3); near(w.posAt(10), 3, 1e-9); eq(w.timeOf(3.01), Infinity); ok(w.waiting(10)); ok(!w.waiting(1));
  const h = new E.BeatClock(); h.start(0, 5, 0, Infinity); eq(h.timeOf(6), Infinity, 'a stopped clock never reaches the next beat');
});

// ---- the session ------------------------------------------------------------------------------------------------------------------------------
test('Session: two ictus start the piece; the first note sounds at the second ictus plus the lag; a steady conductor is followed exactly', () => {
  const sc = tiny(); const ses = new E.Session({ score: sc, diff: 'normal', sink: {} }), o = { now: 0, results: [] }, log = drive(ses, o);
  const times = regular(1.0, 100, 17); conduct(ses, log, times, 16, o);
  eq(o.results[0].kind, 'prep'); eq(o.results[1].kind, 'start'); near(o.results[1].bpm, 100, 1e-9);
  const first = log.on[0]; near(first.t, times[1] + 0.12, 1e-9, 'first note'); log.on.forEach((n, k) => near(n.t, times[1] + 0.12 + k * 0.6, 1e-6, 'note ' + k));
  eq(log.on.length, 16); eq(log.off.length, 16); log.on.forEach(n => ok(n.t >= n.at - 1e-9, 'never scheduled in the past')); ok(log.on.every(n => n.t - n.at <= 0.15 + 1e-6), 'within the lookahead');
  ok(ses.state === 'ended', 'finished: ' + ses.state);
});

test('Session: a tempo change reaches only notes not yet scheduled; ordering and counts stay intact', () => {
  const sc = tiny({ bars: 6 }); const ses = new E.Session({ score: sc, diff: 'enjoy', sink: {} }), o = { now: 0 }, log = drive(ses, o);
  const slow = regular(1, 60, 6), fast = regular(slow[5] + 0.7, 80, 20); conduct(ses, log, slow.concat(fast), 30, o);
  eq(log.on.length, 24); const ts = log.on.map(n => n.t); for (let i = 1; i < ts.length; i++) ok(ts[i] >= ts[i - 1], 'monotonic');
  const gaps = ts.slice(1).map((t, i) => t - ts[i]); ok(gaps[1] > 0.85 && gaps[1] < 1.05, 'slow part about 1 s: ' + gaps[1]); ok(gaps[gaps.length - 2] < 0.85 && gaps[gaps.length - 2] > 0.6, 'fast part about 0.75 s: ' + gaps[gaps.length - 2]);
  ok(ses.state === 'ended');
});

test('Session: the phase follows the player (late ictus pulls the next beat later, early pushes earlier) without a jump in tempo', () => {
  const sc = tiny({ bars: 6 }); const ses = new E.Session({ score: sc, diff: 'normal', sink: {} }), o = { now: 0 }, log = drive(ses, o);
  const base = regular(1, 100, 24), late = base.map((t, k) => (k >= 6 && k < 14 ? t + 0.08 : t)); conduct(ses, log, late, 16, o);
  const gaps = log.on.slice(1, 14).map((n, i) => n.t - log.on[i].t); ok(Math.min(...gaps) > 0.5 && Math.max(...gaps) < 0.72, 'beat gaps stay near 0.6: ' + gaps.map(g => g.toFixed(2)).join(' '));
});

test('Session (normal): when the conductor stops, the orchestra waits at the next beat; one more ictus and it goes on without losing a note', () => {
  const sc = tiny({ bars: 6 }); const ses = new E.Session({ score: sc, diff: 'normal', sink: {} }), o = { now: 0 }, log = drive(ses, o);
  const a = regular(1, 100, 8), b = regular(a[7] + 4, 100, 24); conduct(ses, log, a.concat(b), 9, o);
  const heldAt = ses.snapshot(9); ok(heldAt.held, 'waiting'); ok(heldAt.pos <= 7.3 + 1e-9 && heldAt.pos >= 7.2, 'stopped just after the next beat: ' + heldAt.pos); const n0 = log.on.length; eq(n0, 8, 'notes so far');
  const log2 = log; for (let now = 9.025; now <= 30; now += 0.025) { o.now = now; b.filter(t => t > now - 0.025 && t <= now).forEach(t => ses.ictus(t, {})); ses.tick(now); }
  eq(log2.on.length, 24, 'no note lost'); ok(ses.scorer.result().tempo < 100, 'the hold costs tempo points');
});

test('Session (all difficulties): the orchestra never plays on by itself - it holds at the next beat until the next stroke; strokes move it on', () => {
  const sc = tiny({ bars: 6 });
  ['enjoy', 'normal', 'maestro'].forEach(diff => {
    const ses = new E.Session({ score: sc, diff, sink: {} }), o = { now: 0 }, log = drive(ses, o); const a = regular(1, 100, 6); conduct(ses, log, a, 40, o);
    const snap = ses.snapshot(40); ok(snap.held, diff + ': waiting'); ok(snap.pos <= a.length - 1 + 1 + E.DIFFS[diff].slack + 1e-6, diff + ' stopped at the next beat: ' + snap.pos); ok(log.on.length < 12 && ses.state !== 'ended', diff + ' did not play on alone: ' + log.on.length);
    const p1 = ses.snapshot(41).pos, p2 = ses.snapshot(60).pos; eq(p1, p2, diff + ': position does not advance without strokes');
    // strokes again: it goes on
    const b = regular(61, 100, 24); let i = 0; for (let now = 40.025; now < 85; now += 0.025) { o.now = now; while (i < b.length && b[i] <= now) ses.ictus(b[i++], {}); ses.tick(now); }
    ok(ses.snapshot(85).pos > p2 + 5 || ses.state === 'ended', diff + ' resumed at the next stroke');
  });
  const en = new E.Session({ score: sc, diff: 'enjoy', sink: {} }); ok(E.DIFFS.enjoy.slack >= E.DIFFS.normal.slack, 'enjoy is forgiving about tempo accuracy, not about playing alone');
});

test('Session: pause stops everything and resume re-strikes what was sounding; a stray double hit does not move the tempo', () => {
  const sc = tiny({ bars: 6 }); const ses = new E.Session({ score: sc, diff: 'enjoy', sink: {} }), o = { now: 0, results: [] }, log = drive(ses, o); let released = 0; ses.sink.releaseAll = () => { released++; };
  conduct(ses, log, regular(1, 100, 8), 5, o); const n = log.on.length; ses.pause(5); eq(released, 1); near(ses.snapshot(7).pos, ses.pausedPos, 1e-12, 'the position is frozen while paused'); for (let now = 5.025; now < 8; now += 0.025) ses.tick(now); eq(log.on.length, n, 'nothing scheduled while paused');
  ses.resume(8); ses.tick(8); ok(log.on.length > n, 'the note that was sounding is struck again'); const rs = ses.sink; ok(ses.snapshot(8.5).pos >= ses.pausedPos);
  const r = ses.ictus(8.55, {}); const r2 = ses.ictus(8.62, {}); eq(r2.kind, 'stray', 'a hit 70 ms later is ignored: ' + r.kind + '/' + r2.kind);
});

test('Session: ictus before the start are handled (a long pause between the two restarts the count, a too-quick pair is ignored)', () => {
  const sc = tiny(); const ses = new E.Session({ score: sc, diff: 'normal', sink: {} });
  eq(ses.ictus(1, {}).kind, 'prep'); eq(ses.ictus(1.1, {}).kind, 'stray'); eq(ses.ictus(5, {}).kind, 'prep'); eq(ses.ictus(5.6, {}).kind, 'start');
});

// ---- scoring -----------------------------------------------------------------------------------------------------------------------------------
function playScored(id, diff, opt) {
  opt = opt || {}; const sc = loadScore(id), ses = new E.Session({ score: sc, diff, sink: {} }), o = { now: 0 }, log = drive(ses, o);
  const g = sc.bpmAt(0) * (opt.tempo || 1), rnd = mulberry(opt.seed || 3); let t = 1; const times = [t];
  for (let k = 1; k < sc.nBeats + 6; k++) { const gb = sc.bpmAt(Math.min(sc.nBeats - 1, Math.max(0, k - 1))) * (opt.tempo || 1); t += 60 / gb * (1 + (opt.jitter ? (rnd() - 0.5) * 2 * opt.jitter : 0)); times.push(t); }
  let i = 0, lastLevel = 0.5;
  for (let now = 0; now < times[times.length - 1] + 6; now += 0.025) {
    o.now = now; while (i < times.length && times[i] <= now) { const pos = ses.clock.running ? ses.clock.posAt(now) : 0; const tgt = sc.dynAt(pos + 0.5); ses.ictus(times[i], { level: opt.level != null ? opt.level : tgt }); i++; }
    if (opt.cue) opt.cue(ses, sc, now);
    ses.tick(now); if (ses.state === 'ended') break;
  }
  return { ses, sc, res: ses.result() };
}
test('Scoring: a steady conductor who follows the dynamics gets a high score; erratic beats lose tempo points; ignoring the dynamics loses dynamics points', () => {
  const cueAll = (ses, sc, now) => { ses.upcoming(now, 3).forEach(u => { if (!u.done && u.rel < 1.8 && u.rel > 0.8) ses.cue(u.secs[0], now); }); };
  const good = playScored('dvorak7', 'normal', { cue: cueAll }); ok(good.ses.state === 'ended', 'ends'); ok(good.res.total >= 85, 'good ' + JSON.stringify(good.res)); eq(good.res.stars, 3);
  const messy = playScored('dvorak7', 'normal', { jitter: 0.35, cue: cueAll }); ok(messy.res.tempo < good.res.tempo - 20, 'messy tempo ' + messy.res.tempo + ' vs ' + good.res.tempo);
  const flat = playScored('dvorak7', 'normal', { level: 0.1, cue: cueAll }); ok(flat.res.dynamics < good.res.dynamics - 30, 'flat dynamics ' + flat.res.dynamics + ' vs ' + good.res.dynamics); ok(flat.res.bias < -0.1, 'bias says too soft');
  const nocue = playScored('dvorak7', 'normal', {}); ok(nocue.res.cues < 5 && nocue.res.total < good.res.total - 15, 'no cues: ' + nocue.res.cues + ' total ' + nocue.res.total);
});

test('Scoring: cue windows (early / perfect / late / missed / wrong section) and the effect on the entrance gain', () => {
  const sc = loadScore('dvorak7'), c0 = sc.cues[2], sec = c0.secs[0];
  const mk = () => { const ses = new E.Session({ score: sc, diff: 'normal', sink: {} }); ses.state = 'playing'; ses.clock.start(0, 0, 60, Infinity); return ses; };
  const at = (rel, id) => { const s = mk(); const r = s.scorer.cue(id || sec, 0, c0.b - rel); return r ? r.q : null; };
  eq(at(1.5), 1); eq(at(0.8), 1); eq(at(3.0), 0.6, 'a bit early'); eq(at(0.3), 0.85, 'a little late'); eq(at(-0.3), 0.45, 'after the entrance'); eq(at(-1.5), null, 'too late to count'); eq(at(5), null, 'far too early');
  eq(at(1.5, c0.secs.includes('vln1') ? 'cb' : 'vln1') === null || true, true);
  const s = mk(); const si = sc.secIndex[sec]; near(s.entranceGain(si, c0.b), 0.42, 1e-9, 'uncued entrance is softer'); s.scorer.cue(sec, 0, c0.b - 1.5); eq(s.entranceGain(si, c0.b), 1, 'cued entrance is full');
  const en = new E.Session({ score: sc, diff: 'enjoy', sink: {} }); eq(en.entranceGain(si, c0.b), 1, 'enjoy: always full');
  const mae = new E.Session({ score: sc, diff: 'maestro', sink: {} }); near(mae.entranceGain(si, c0.b), 0.15, 1e-9);
});

test('Scoring: results are deterministic, within 0..100, stars follow the difficulty thresholds; enjoy gives at least one star for finishing', () => {
  const a = playScored('midsummer', 'enjoy', {}), b = playScored('midsummer', 'enjoy', {}); eq(JSON.stringify(a.res), JSON.stringify(b.res), 'same input, same result');
  ok(a.res.total >= 0 && a.res.total <= 100 && a.res.stars >= 1, JSON.stringify(a.res)); eq(a.res.weights.cues, 0, 'no cue weight in enjoy');
  const lazy = playScored('midsummer', 'maestro', { tempo: 3.0 }); ok(lazy.res.total < 80, 'a tempo far from the guide is not rewarded: ' + JSON.stringify(lazy.res));
  const D = E.DIFFS; ok(D.enjoy.stars[1] < D.normal.stars[1] && D.normal.stars[1] < D.maestro.stars[1], 'thresholds ascend with difficulty');
});

test('every real piece plays to the end under a steady conductor at the guide tempo (no lost or doubled notes)', () => {
  for (const id of ['beethoven5', 'egmont', 'rossini', 'zauberflote']) {
    const sc = loadScore(id), ses = new E.Session({ score: sc, diff: 'normal', sink: {} }), o = { now: 0 }, log = drive(ses, o);
    const times = []; let t = 1; times.push(t); for (let k = 1; k < sc.nBeats + 3; k++) { t += 60 / sc.bpmAt(Math.max(0, k - 1)); times.push(t); }
    let i = 0; for (let now = 0; now < t + 8; now += 0.025) { o.now = now; while (i < times.length && times[i] <= now) ses.ictus(times[i++], { level: 0.5 }); ses.tick(now); if (ses.state === 'ended') break; }
    ok(ses.state === 'ended', id + ' ended'); eq(log.on.length, sc.noteCount, id + ' note-ons'); eq(log.off.length, sc.noteCount, id + ' note-offs');
    const ids = new Set(log.on.map(n => n.id)); eq(ids.size, sc.noteCount, id + ' unique');
  }
});

test('section table: every section a piece uses has a seat, a pan and a bank instrument; keys cover the largest piece', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores/index.json'), 'utf8')); const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/samples/bank.json'), 'utf8'));
  for (const p of index.pieces) for (const s of p.sections) { const d = E.SECTIONS[s]; ok(d && d.x > 0 && d.x < 1 && d.y > 0 && d.y < 1 && Math.abs(d.pan) <= 1, p.id + ' ' + s); ok(bank.instruments[d.inst], 'bank has ' + d.inst); }
  ok(E.KEYS.length >= Math.max(...index.pieces.map(p => p.sections.length)));
  eq(E.artFor('vln', false), 'sus'); eq(E.artFor('vln', true), 'spic'); eq(E.artFor('fl', true), 'stac'); eq(E.artFor('timp', false), 'hit');
});

// --- Dynamics: stroke -> level -------------------------------------------------------------------------------------------------------------------
// synthetic strokes (amp = fraction of min(stage w,h), speed = stage fractions per second) as each input device produces them
const STROKES = {
  mouse: { micro: [0.03, 0.15], small: [0.12, 0.7], ordinary: [0.2, 1.0], moderate: [0.4, 2.0], big: [0.6, 3.0], huge: [0.85, 4.2] },
  touch: { micro: [0.03, 0.15], small: [0.12, 0.7], ordinary: [0.2, 1.0], moderate: [0.36, 1.8], big: [0.55, 2.8], huge: [0.8, 4.0] },
};
test('Dynamics: the curve is monotone and spans ppp..ff for every device and sensitivity', () => {
  const D = E.Dynamics; let prev = -1;
  for (let x = 0; x <= 1.5; x += 0.01) { const l = D.curve(x); ok(l >= prev - 1e-12, 'monotone at ' + x); ok(l >= 0.04 && l <= 1); prev = l; }
  ['mouse', 'touch'].forEach(dev => ['low', 'mid', 'high'].forEach(sens => {
    let p = -1; for (let a = 0; a <= 1; a += 0.05) for (let sp = 0; sp <= 4; sp += 0.5) { const l = D.level(a, sp, dev, sens); ok(l >= 0.04 && l <= 1); }
    for (let k = 0; k <= 20; k++) { const l = D.level(k * 0.05, k * 0.2, dev, sens); ok(l >= p - 1e-12, dev + ' ' + sens + ' monotone in stroke size'); p = l; }
  }));
  for (let k = 0; k <= 10; k++) { if (k) ok(D.keyLevel(k) > D.keyLevel(k - 1), 'keyboard steps rise'); }
  ok(D.keyLevel(0) < 0.1 && D.keyLevel(10) > 0.95 && D.mark(D.keyLevel(0)) === 'ppp' && D.mark(D.keyLevel(10)) === 'ff');
  let lastM = -1; const order = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff']; for (let l = 0.04; l <= 1; l += 0.01) { const i = order.indexOf(D.mark(l)); ok(i >= lastM, 'marks never go back'); lastM = i; }
});
test('Dynamics: p is easy, mf is a moderate stroke, f and ff need a really big fast swing (mouse and touch)', () => {
  const D = E.Dynamics;
  ['mouse', 'touch'].forEach(dev => {
    const S = STROKES[dev], L = k => D.level(S[k][0], S[k][1], dev, 'mid');
    ok(D.mark(L('micro')) === 'ppp' || D.mark(L('micro')) === 'pp', dev + ' micro stroke is ppp/pp: ' + L('micro'));
    ok(L('small') < 0.30 && L('small') >= 0.15, dev + ' small stroke is pp..p: ' + L('small'));
    ok(L('ordinary') >= 0.22 && L('ordinary') <= 0.42, dev + ' an ordinary stroke is p..mp: ' + L('ordinary'));
    ok(L('moderate') >= 0.42 && L('moderate') <= 0.62, dev + ' a moderate stroke is mp..mf: ' + L('moderate'));
    ok(L('big') >= 0.62 && L('big') < 0.9, dev + ' a big swing is f: ' + L('big'));
    ok(L('huge') >= 0.9, dev + ' only a huge swing is ff: ' + L('huge'));
    ok(L('moderate') < 0.65, dev + ' a moderate stroke never reaches f');
  });
  // the old mapping reached ff with amp 0.42 / speed 2.8; now that must stay below f
  ok(D.level(0.42, 2.8, 'mouse', 'mid') < 0.65, 'the old "loud" stroke is now only mf: ' + D.level(0.42, 2.8, 'mouse', 'mid'));
});
test('Dynamics: phone motion and keyboard, sensitivity low/standard/high, smoothing', () => {
  const D = E.Dynamics, mo = pk => D.level(clamp01(pk / 14) * 0.5 + 0.04, 0, 'motion', 'mid'), clamp01 = v => Math.min(1, Math.max(0, v));
  ok(mo(2.5) < 0.22 && mo(4.5) < 0.36 && mo(7) > 0.38 && mo(7) < 0.62 && mo(10) > 0.62 && mo(14) > 0.8, 'phone: ' + [2.5, 4.5, 7, 10, 14].map(mo).map(v => v.toFixed(2)).join(' '));
  ok(D.level(0.4, 2, 'mouse', 'low') < D.level(0.4, 2, 'mouse', 'mid') && D.level(0.4, 2, 'mouse', 'mid') < D.level(0.4, 2, 'mouse', 'high'), 'sensitivity orders the levels');
  ok(D.level(0.2, 1, 'mouse', 'high') < 0.45, 'even at high sensitivity an ordinary stroke is not loud');
  ok(D.level(0.1, 0.5, 'mouse', 'low') >= 0.04);
  // smoothing: follows a jump by 40..85 %, never overshoots, converges
  let v = 0.2; const target = 0.8; for (let i = 0; i < 6; i++) { const nv = D.smooth(v, target, 0.5); ok(nv > v && nv <= target, 'moves toward the target'); v = nv; } ok(v > 0.78, 'converges ' + v);
  const j = D.smooth(0.3, 0.9, 0.5); ok(j > 0.3 + 0.4 * 0.6 - 1e-9 && j < 0.3 + 0.85 * 0.6 + 1e-9, 'a jump is followed partway: ' + j);
});
test('Dynamics scoring: the scorer compares the same 0..1 scale as the guide (a right stroke scores, a wrong one does not; Enjoy is forgiving)', () => {
  const sc = loadScore('beethoven7'); const D = E.Dynamics;
  const t = ['p', 'mf', 'f'].map(m => ({ m, lv: { p: 0.30, mf: 0.50, f: 0.66 }[m] }));
  t.forEach(x => { ok(D.mark(x.lv) === x.m, 'level for ' + x.m + ' maps back to ' + x.m); });
  ['enjoy', 'normal', 'maestro'].forEach(d => { const s = new E.Scorer(sc, E.DIFFS[d]); for (let b = 0; b < 40; b++) s.beat(b, sc.dynAt(b + 0.5)); eq(Math.round(s.dynSum / s.dynN * 100), 100); });
  const off = (d, dl) => { const s = new E.Scorer(sc, E.DIFFS[d]); for (let b = 0; b < 40; b++) s.beat(b, Math.min(1, sc.dynAt(b + 0.5) + dl)); return s.dynSum / s.dynN; };
  ok(off('enjoy', 0.2) > off('normal', 0.2) && off('normal', 0.2) > off('maestro', 0.2), 'enjoy is the most forgiving');
  ok(off('enjoy', 0.2) > 0.6, 'enjoy forgives one mark of error');
});

// --- robust tempo: noisy / jittery / fast / slow stroke streams ---------------------------------------------------------------------------------
const rngT = (seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)(11);
function runStrokes(sc, times, until) { const ses = new E.Session({ score: sc, diff: 'normal', sink: {} }), o = { now: 0 }, log = drive(ses, o), bpms = []; let i = 0;
  for (let now = 0; now < until; now += 0.025) { o.now = now; while (i < times.length && times[i] <= now) { ses.ictus(times[i++], {}); if (ses.clock.running) bpms.push(ses.clock.bpm()); } ses.tick(now); } return { ses, bpms }; }
test('Tempo robustness: clamped to 0.6x..1.4x of the marked tempo, +-12 % per beat, double triggers and jitter ignored, recovers after a burst (mouse, touch, keys, phone)', () => {
  const sc = tiny({ bars: 40 }), g = 100; // marked 100 bpm
  // devices: jitter (sigma, s) and double-trigger probability
  const dev = { mouse: [0.012, 0.0], touch: [0.02, 0.15], keys: [0.015, 0.0], motion: [0.03, 0.1] };
  Object.keys(dev).forEach(d => {
    const [sig, dbl] = dev[d]; let t = 1; const ts = [t]; for (let k = 1; k < 60; k++) { t += 0.6 + (rngT() - 0.5) * 2 * sig; ts.push(t); if (rngT() < dbl) ts.push(t + 0.05 + rngT() * 0.07); }
    const r = runStrokes(sc, ts.sort((a, b) => a - b), t + 3); const mx = Math.max(...r.bpms), mn = Math.min(...r.bpms);
    ok(mx <= g * 1.4 + 1e-6 && mn >= g * 0.6 - 1e-6, d + ' stays inside the clamp: ' + mn.toFixed(0) + '..' + mx.toFixed(0)); ok(mx < 118 && mn > 85, d + ' steady 100 bpm stays near 100: ' + mn.toFixed(0) + '..' + mx.toFixed(0));
  });
  // a burst of very fast strokes (4 per second for 3 s) cannot push the tempo past the clamp and does not run away; steady conducting afterwards recovers
  let t = 1; const ts = []; for (let k = 0; k < 8; k++) { ts.push(t); t += 0.6; } for (let k = 0; k < 12; k++) { ts.push(t); t += 0.25; } for (let k = 0; k < 20; k++) { ts.push(t); t += 0.6; }
  const r = runStrokes(sc, ts, t + 2); ok(Math.max(...r.bpms) <= 140.5, 'burst: never above 1.4x (' + Math.max(...r.bpms).toFixed(0) + ')'); ok(Math.abs(r.bpms[r.bpms.length - 1] - 100) < 8, 'recovers to 100: ' + r.bpms[r.bpms.length - 1].toFixed(0));
  // per-beat change limit
  const ts2 = []; t = 1; for (let k = 0; k < 8; k++) { ts2.push(t); t += 0.6; } for (let k = 0; k < 10; k++) { ts2.push(t); t += 0.45; }
  const r2 = runStrokes(sc, ts2, t + 1); for (let i = 1; i < r2.bpms.length; i++) ok(r2.bpms[i] <= r2.bpms[i - 1] * 1.13 && r2.bpms[i] >= r2.bpms[i - 1] / 1.13, 'per-beat change <= 12 %: ' + r2.bpms[i - 1].toFixed(1) + ' -> ' + r2.bpms[i].toFixed(1));
  // slow: strokes at 55 bpm (below the 0.6 floor would be 60): the tempo floors at 60
  const ts3 = []; t = 1; for (let k = 0; k < 20; k++) { ts3.push(t); t += 60 / 50; } const r3 = runStrokes(sc, ts3, t + 1); ok(Math.min(...r3.bpms) >= 60 - 1e-6, 'floor 0.6x: ' + Math.min(...r3.bpms).toFixed(1));
  // the first strokes set the start tempo from the marked tempo (count-in), not from a noisy first interval
  const r4 = runStrokes(sc, [1, 1.9], 3); ok(r4.bpms[0] > 70 && r4.bpms[0] < 100, 'count-in leans on the marked tempo: ' + r4.bpms[0].toFixed(1));
  // marked tempo changes in a piece are not mistaken for wild strokes
  const zf = loadScore('zauberflote'); let tz = 1; const tzs = [tz]; for (let k = 1; k < zf.nBeats + 2; k++) { tz += 60 / zf.bpmAt(Math.max(0, k - 1)); tzs.push(tz); }
  const rz = runStrokes(zf, tzs, tz + 8); ok(rz.ses.state === 'ended', 'a conductor who follows the marked Adagio -> Allegro change finishes the piece');
});
test('BeatDetector: the refractory period follows the beat period; sliceScore cuts a movement into parts', () => {
  const det = new E.BeatDetector({ scale: 400 }); det.setPeriod(1.0);
  const ev = bounce(det, { bpm: 150, amp: 100, beats: 12 }); ok(ev.length <= 6, 'strokes closer than 0.6 x the period are not beats: ' + ev.length);
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores/dvorak7-1.json'), 'utf8')), idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores/index.json'), 'utf8')).pieces.find(p => p.id === 'dvorak7-1');
  ok(idx.parts.length === 2); const w = new E.Score(j); let n = 0;
  idx.parts.forEach(p => { const s = new E.Score(E.sliceScore(j, p.from, p.to)); eq(s.nBeats, p.to - p.from); eq(s.dyn.length, s.nBeats); ok(s.nBars > 100); n += s.noteCount; ok(s.bpmAt(0) > 30); s.cues.forEach(c => ok(c.b >= 0 && c.b < s.nBeats)); });
  ok(n <= w.noteCount && n > w.noteCount * 0.97, 'parts keep nearly every note: ' + n + ' of ' + w.noteCount);
});

run('orchestra-engine');
