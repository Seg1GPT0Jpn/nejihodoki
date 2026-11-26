// orchestra/sampler.js and the sample bank: pitch math, dynamics curves, the procedural hall impulse, the built bank.json against the files on disk and against
// the notes of every score (how far must a sample be bent?), and the voice / looping / release logic on a fake Web Audio context.
// 実行：node tools/tests/unit/orchestra-sampler.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const S = require(path.join(ROOT, 'orchestra/sampler.js'));
const E = require(path.join(ROOT, 'orchestra/engine.js'));
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' +-' + tol + ', got ' + a);
const dir = path.join(ROOT, 'orchestra/samples');
const bank = JSON.parse(fs.readFileSync(path.join(dir, 'bank.json'), 'utf8'));
const scoreIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores/index.json'), 'utf8')).pieces.map(p => p.id);

test('pitch math: octave = rate 2, semitone = 2^(1/12); the nearest root wins; ties go to the lower root', () => {
  near(S.rateFor(72, 60), 2, 1e-12); near(S.rateFor(61, 60), Math.pow(2, 1 / 12), 1e-12); near(S.rateFor(48, 60), 0.5, 1e-12);
  const n = [{ m: 55 }, { m: 57.05 }, { m: 62 }, { m: 66 }];
  eq(S.pickNote(n, 56).note.m, 55, 'tie 55/57.05: 1.0 vs 1.05'); eq(S.pickNote(n, 56.1).note.m, 57.05); eq(S.pickNote(n, 64).note.m, 62, 'tie goes to the lower root (shift up)');
  near(S.pickNote(n, 59).shift, 1.95, 1e-9); eq(S.pickNote([{ f: ['x'] }], 70).rate, 1, 'unpitched');
  const far = S.pickNote([{ m: 60 }, { m: 64 }, { m: 69 }], 103); eq(far.fold, -3); ok(Math.abs(far.shift) <= 8, 'a note far above every sample is folded down by octaves'); near(far.rate, S.rateFor(67, 69), 1e-12);
  const low = S.pickNote([{ m: 60 }, { m: 64 }], 40); eq(low.fold, 1); ok(Math.abs(low.shift) <= 8);
  eq(S.pickNote([{ m: 60 }, { m: 64 }], 66.5).fold, 0, 'within range: no fold');
});

test('dynamics curves: louder level, louder and brighter; the two recorded layers crossfade with equal power', () => {
  let g0 = 0, c0 = 0; for (let l = 0; l <= 1.0001; l += 0.05) { const g = S.dynGain(l), c = S.cutoffHz(l, 0.3); ok(g > g0 && c >= c0, 'monotone at ' + l); g0 = g; c0 = c; }
  near(20 * Math.log10(S.dynGain(1)), 0, 1e-9); near(20 * Math.log10(S.dynGain(0)), -28, 1e-9); ok(S.cutoffHz(1, 0) > 12000 && S.cutoffHz(0, 0) < 4000);
  ok(S.cutoffHz(0.5, 0.9) < S.cutoffHz(0.5, 0), 'sections at the back are duller');
  for (let l = 0; l <= 1.0001; l += 0.1) { const m = S.layerMix(l); near(m.soft * m.soft + m.loud * m.loud, 1, 1e-9, 'power ' + l); }
  eq(S.layerMix(0.2).loud, 0); eq(S.layerMix(0.9).soft < 1e-9, true);
});

test('hall impulse: stereo, deterministic, unit energy, decays like a hall (RT60 about 2 s), darker at the end, left and right decorrelated', () => {
  const sr = 22050, a = S.makeImpulse(sr, { seed: 5 }), b = S.makeImpulse(sr, { seed: 5 }), c = S.makeImpulse(sr, { seed: 6 });
  eq(a.length, 2); eq(a[0].length, Math.floor(sr * 2.7)); ok(a[0].every((v, i) => v === b[0][i]), 'same seed, same impulse'); ok(!a[0].every((v, i) => v === c[0][i]), 'other seed differs');
  let e = 0; for (let ch = 0; ch < 2; ch++) for (let i = 0; i < a[ch].length; i++) e += a[ch][i] * a[ch][i]; near(e / 2, 1, 1e-6, 'energy');
  const en = (x, t0, t1) => { let s = 0; for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) s += x[i] * x[i]; return s; };
  const e1 = en(a[0], 0, 0.5), e2 = en(a[0], 0.5, 1.0), e3 = en(a[0], 1.0, 1.5), e4 = en(a[0], 2.0, 2.5); ok(e1 > e2 && e2 > e3 && e3 > e4, 'monotone decay'); const db = 10 * Math.log10(e1 / e3); ok(db > 8 && db < 40, 'decay ' + db.toFixed(1) + ' dB per second');
  let dot = 0, na = 0, nb = 0; for (let i = 0; i < a[0].length; i++) { dot += a[0][i] * a[1][i]; na += a[0][i] ** 2; nb += a[1][i] ** 2; } ok(Math.abs(dot / Math.sqrt(na * nb)) < 0.25, 'decorrelated');
  const rough = (x, t0, t1) => { let s = 0, d = 0; for (let i = Math.floor(t0 * sr) + 1; i < Math.floor(t1 * sr); i++) { s += x[i] * x[i]; d += (x[i] - x[i - 1]) ** 2; } return d / s; };
  ok(rough(a[0], 0.05, 0.3) > rough(a[0], 1.8, 2.5), 'the tail is darker than the start');
});

test('the built bank: bank.json matches the files on disk; under 45 MB; mp3; every instrument and articulation the game needs exists', () => {
  eq(bank.version, 1); eq(bank.format, 'mp3'); ok(/CC0/.test(bank.source.licence)); const files = new Set(fs.readdirSync(dir).filter(f => /\.(mp3|m4a)$/.test(f))); let total = 0, n = 0; const used = new Set();
  for (const id in bank.instruments) { const ins = bank.instruments[id]; ok(ins.gain > 0.5 && ins.gain < 1.5, id + ' gain'); for (const art in ins.arts) { const a = ins.arts[art]; ok(a.notes.length >= 1 && a.len > 0.4, id + '/' + art);
    if (a.loop) { ok(a.loop[0] > 0.3 && a.loop[1] <= a.len && a.loop[1] - a.loop[0] > 1, id + '/' + art + ' loop'); }
    for (let i = 0; i < a.notes.length; i++) { const nt = a.notes[i]; ok(nt.f.length >= 1 && nt.f.length <= 2, 'layers'); if (nt.m != null && i) ok(nt.m >= a.notes[i - 1].m, id + '/' + art + ' sorted');
      nt.f.forEach(f => { ok(files.has(f), 'file exists ' + f); ok(!used.has(f), 'unique ' + f); used.add(f); const sz = fs.statSync(path.join(dir, f)).size; ok(sz > 2000 && sz < 120000, f + ' size ' + sz); total += sz; n++; const hd = fs.readFileSync(path.join(dir, f)).subarray(0, 3); ok((hd[0] === 0xff && (hd[1] & 0xe0) === 0xe0) || hd.toString() === 'ID3', f + ' is mp3'); }); } } }
  eq(used.size, files.size, 'no stray files in samples/'); ok(total < 45 * 1048576, 'bank ' + (total / 1048576).toFixed(1) + ' MB'); ok(n > 400, 'files ' + n);
  for (const need of ['vln', 'vla', 'vc', 'cb', 'fl', 'ob', 'cl', 'fg', 'hn', 'tp', 'tb', 'timp']) ok(bank.instruments[need] && bank.instruments[need].arts[E.artFor(need, false)], need + ' sustain/hit');
  for (const need of ['vln', 'vla', 'vc', 'cb']) ok(bank.instruments[need].arts.spic && bank.instruments[need].arts.pizz, need + ' short'); for (const need of ['fl', 'ob', 'cl', 'fg', 'hn', 'tp', 'tb']) ok(bank.instruments[need].arts.stac, need + ' stac');
  console.log('    bank: ' + n + ' files, ' + (total / 1048576).toFixed(1) + ' MB');
});

test('measured sample roots are close to their names (the build checked every note with YIN) and the sustain ranges cover the instruments', () => {
  const r = id => { const a = bank.instruments[id].arts.sus || bank.instruments[id].arts.hit; return [a.notes[0].m, a.notes[a.notes.length - 1].m]; };
  const lowHigh = { vln: [55, 86], vla: [48, 86], vc: [36, 77], cb: [30, 59], fl: [60, 96], ob: [58, 89], cl: [50, 89], fg: [34, 75], hn: [33, 77], tp: [53, 84], tb: [34, 65], timp: [41, 54] };
  for (const id in lowHigh) { const [lo, hi] = r(id); ok(lo <= lowHigh[id][0] + 0.6 && hi >= lowHigh[id][1] - 0.6, id + ' range ' + lo + '..' + hi); }
  for (const id in bank.instruments) for (const art in bank.instruments[id].arts) { const a = bank.instruments[id].arts[art]; for (let i = 1; i < a.notes.length; i++) if (a.notes[i].m != null) ok(a.notes[i].m - a.notes[i - 1].m < 16, id + '/' + art + ' gap ' + (a.notes[i].m - a.notes[i - 1].m)); }
});

test('every note of every score can be sounded within +-8 semitones of a recording (octave folding for the rare far notes); the typical bend is small', () => {
  const lines = [];
  for (const id of scoreIds) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores', id + '.json'), 'utf8')); let n = 0, folded = 0, big = 0, sum = 0, worst = 0; const need = j.needs;
    for (const s of j.sec) { ok(need[s.inst], id + ' needs ' + s.inst); let hasShort = false; for (let i = 0; i < s.n.length; i += 4) { const short = s.n[i + 2] < 0; if (short) hasShort = true;
      const a = bank.instruments[s.inst].arts[E.artFor(s.inst, short)] || bank.instruments[s.inst].arts[E.artFor(s.inst, false)]; const pk = S.pickNote(a.notes, s.n[i + 1]); ok(Math.abs(pk.shift) <= 8 + 1e-9, id + ' ' + s.id + ' shift ' + pk.shift);
      n++; sum += Math.abs(pk.shift); if (pk.fold) folded++; if (Math.abs(pk.shift) > 4) big++; worst = Math.max(worst, Math.abs(pk.shift)); }
      ok(need[s.inst].includes('l') || s.inst === 'timp' || s.inst === 'bd', id + ' needs long'); if (hasShort) ok(need[s.inst].includes('s'), id + ' needs short for ' + s.inst); }
    ok(folded / n < (/^(mahler5|finlandia)/.test(id) ? 0.1 : 0.02), id + ' folded ' + folded + '/' + n); // Mahler 5 is the widest-ranged music (piccolo to contrabassoon, timpani, harp): more octave folding is expected ok(sum / n < 2.6, id + ' mean bend ' + (sum / n).toFixed(2)); lines.push(id + ' mean ' + (sum / n).toFixed(2) + ' st, >4 st ' + (100 * big / n).toFixed(1) + '%, folded ' + folded);
  }
  console.log('    ' + lines.join('\n    '));
});

test('planLoad: only the files a piece needs, one layer in the light tier', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores/nachtmusik.json'), 'utf8'));
  const hi = S.planLoad(bank, j.needs, E.artFor, 'hi'), lo = S.planLoad(bank, j.needs, E.artFor, 'lo');
  ok(hi.length > 150 && hi.length < 260, 'hi ' + hi.length); ok(lo.length < hi.length * 0.62 && lo.length > hi.length * 0.4, 'lo ' + lo.length); ok(hi.every(x => ['vln', 'vla', 'vc', 'cb'].includes(x.inst)), 'strings only');
  ok(lo.every(x => /-l\.mp3$/.test(x.f)), 'light tier loads the loud layer'); const b5 = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores/beethoven5.json'), 'utf8')); ok(S.planLoad(bank, b5.needs, E.artFor, 'hi').length > hi.length);
});

// ---- a fake Web Audio context -----------------------------------------------------------------------------------------------------------------
function fakeCtx() {
  const ctx = { currentTime: 0, sampleRate: 44100, nodes: [], sources: [] };
  const param = (v) => ({ value: v, ev: [], setValueAtTime(x, t) { this.ev.push(['set', x, t]); }, linearRampToValueAtTime(x, t) { this.ev.push(['lin', x, t]); }, setTargetAtTime(x, t, k) { this.ev.push(['tgt', x, t, k]); }, setValueCurveAtTime(c, t, d) { this.ev.push(['curve', c.length, t, d]); }, cancelScheduledValues() {} });
  const node = (kind, extra) => { const n = Object.assign({ kind, out: [], connect(x) { this.out.push(x); return x; }, disconnect() {} }, extra); ctx.nodes.push(n); return n; };
  ctx.createGain = () => node('gain', { gain: param(1) });
  ctx.createBiquadFilter = () => node('biquad', { frequency: param(1000), Q: param(1), type: '' });
  ctx.createStereoPanner = () => node('pan', { pan: param(0) });
  ctx.createDelay = () => node('delay', { delayTime: param(0) });
  ctx.createDynamicsCompressor = () => node('comp', { threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) });
  ctx.createConvolver = () => node('conv', { buffer: null });
  ctx.createBuffer = (c, n, sr) => { const d = Array.from({ length: c }, () => new Float32Array(n)); return { length: n, sampleRate: sr, numberOfChannels: c, duration: n / sr, getChannelData: i => d[i] }; };
  ctx.createBufferSource = () => { const s = node('src', { playbackRate: param(1), detune: param(0), buffer: null, started: null, stopped: null, start(t, o, d) { this.started = [t, o, d]; }, stop(t) { this.stopped = t; } }); ctx.sources.push(s); return s; };
  return ctx;
}
function fakeBuf(sec, sr) { sr = sr || 44100; const n = Math.floor(sec * sr), d = new Float32Array(n); for (let i = Math.floor(0.03 * sr); i < n; i++) d[i] = 0.3 * Math.sin(i / 20); return { length: n, sampleRate: sr, numberOfChannels: 1, duration: sec, getChannelData: () => d }; }
function fakePlayer(ctx, instBank) {
  const rec = {}; Object.keys(instBank.files).forEach(f => { rec[f] = { buf: fakeBuf(instBank.files[f]), onset: 0.03 - 0.004 }; });
  const b = { rec, art: (inst, art) => (instBank.arts[inst] && instBank.arts[inst][art] ? { def: instBank.arts[inst][art], gain: 1 } : null) };
  return new S.Player({ ctx, out: ctx.createGain(), bank: b, sections: [{ id: 'vln1', inst: 'vln', pan: -0.7, back: 0.2, mix: 1 }, { id: 'timp', inst: 'timp', pan: 0.4, back: 0.9, mix: 1 }], artFor: E.artFor, seed: 3 });
}
const IB = { files: { 'a-s': 2.8, 'a-l': 2.8, 'p-l': 1.0, 't-l': 3.0 }, arts: { vln: { sus: { len: 2.8, loop: [0.9, 2.78], layers: 2, notes: [{ m: 60, f: ['a-s', 'a-l'] }] }, spic: { len: 1, loop: null, layers: 1, notes: [{ m: 60, f: ['p-l'] }] } }, timp: { hit: { len: 3, loop: null, layers: 1, notes: [{ m: 45, f: ['t-l'] }] } } } };

test('Player: a long note loops its steady part with equal-power crossfades, a short note plays once, the release fades and stops every source', () => {
  const ctx = fakeCtx(), pl = fakePlayer(ctx, IB);
  ctx.currentTime = 1; pl.setLevel(0.9, 1);
  const v = pl.noteOn(1.2, 0, 62, 0, 1, 1); ok(v, 'voice'); near(v.rate, S.rateFor(62, 60), 1e-9);
  const first = ctx.sources.filter(s => s.started && s.started[0] <= 1.3 + 0.02); ok(first.length >= 1 && first.length <= 2, 'one source per active layer'); near(first[0].playbackRate.value, S.rateFor(62, 60), 1e-9, 'pitch shift by playbackRate');
  ok(first[0].started[1] < 0.05 && first[0].started[2] > 1.5, 'first segment starts at the sample start and runs to the loop end: ' + first[0].started);
  pl.noteOff(1.2 + 6, 1); pl.maintain(1.2 + 3); const afterMid = ctx.sources.length; pl.maintain(1.2 + 7); ok(ctx.sources.length > afterMid, 'a 6 s note needs several segments');
  const segs = ctx.sources.filter(s => s.started); const starts = segs.map(s => s.started[0]).sort((a, b) => a - b); const loops = segs.filter(s => s.started[1] > 0.5); ok(loops.length >= 2, 'later segments start inside the sample (the loop)');
  const mid = loops[0]; ok(mid.out[0].gain.ev.some(e => e[0] === 'curve'), 'segments fade in with a curve'); ok(starts[loops.length] > 1.2 + 1.0, 'start times advance');
  ok(starts.every(t => t < 1.2 + 6 + 0.05), 'no segment starts after the note ended');
  const relG = v.relG.gain.ev; ok(relG.some(e => e[0] === 'lin' && e[1] < 0.001), 'release ramps to silence'); ok(v.stopAt > 1.2 + 6, 'sources are stopped after the release');
  const sp = pl.noteOn(2, 0, 60, 1, 1, 2); eq(ctx.sources.filter(s => s.started && s.started[0] >= 2 - 0.02 && s.started[1] < 0.05).length >= 1, true); pl.noteOff(2.1, 2); ok(sp.loop === null, 'short art: no loop');
});

test('Player: a timpani hit rings out (note-off does not cut it), voices are pruned, and the pool never exceeds its cap (phones)', () => {
  const ctx = fakeCtx(), pl = fakePlayer(ctx, IB); pl.setLevel(0.5, 0);
  const t = pl.noteOn(0.5, 1, 45, 0, 1, 10); ok(t.sticky); pl.noteOff(0.6, 10); eq(t.end, Infinity, 'not released'); ok(!t.relG.gain.ev.length, 'no release ramp');
  pl.maintain(0.5); ctx.currentTime = 10; pl.maintain(10.1); ok(!pl.voices.has(10), 'pruned after it rang out');
  for (let i = 0; i < 400; i++) { ctx.currentTime = i * 0.05; pl.noteOn(ctx.currentTime + 0.02, 0, 55 + (i % 12), 0, 1, 100 + i); if (i % 3 === 0) pl.noteOff(ctx.currentTime + 0.5, 100 + i); pl.maintain(ctx.currentTime + 0.15); ok(pl.voices.size <= pl.maxVoices, 'cap at ' + i); }
  ok(pl.voices.size <= pl.maxVoices); pl.releaseAll(30, 0.2); eq(pl.voices.size, 0);
});

test('Player: gaps in the bank are survivable (a missing articulation falls back to the long note, a missing instrument is silent, not an error)', () => {
  const ctx = fakeCtx(), pl = fakePlayer(ctx, { files: { 'a-l': 2.8 }, arts: { vln: { sus: { len: 2.8, loop: [0.9, 2.78], layers: 1, notes: [{ m: 60, f: ['a-l'] }] } } } });
  ok(pl.noteOn(1, 0, 60, 1, 1, 1), 'short note without spiccato falls back to sustain'); eq(pl.noteOn(1, 1, 45, 0, 1, 2), null, 'no timpani in this bank'); eq(pl.noteOn(1, 7, 45, 0, 1, 3), null, 'unknown section');
});

run('orchestra-sampler');
