#!/usr/bin/env node
'use strict';
// tools/build-orchestra-samples.js — builds the compact orchestra sample bank for the 指揮者ゲーム (orchestra/).
//
//   node tools/build-orchestra-samples.js --src <path to a checkout of https://github.com/sgossner/VSCO-2-CE> [--out orchestra/samples] [--format mp3|m4a] [--only vln,flute] [--dry]
//
// Source: VSCO 2 Community Edition (Versilian Studios / Sam Gossner), licence CC0 1.0 (public domain dedication). Nothing from any other library is used.
// The checkout only needs these folders (a sparse checkout is enough, see orchestra/samples/LICENSES.txt for the exact commands):
//   Strings/*, Woodwinds/{Flute,Oboe,Clarinet,Bassoon}, Brass/{F Horn,Trumpet,Tenor Trombone,Tuba}, Percussion/Timpani, Percussion/BDrumNewhit*, VSCO 1 Percussion/varMetal/Cymbals/susp
//
// What it does, per instrument and articulation (a table below):
//   1. picks the source notes (VSCO already records about every minor third; we keep every note it offers) and, for each note, the softest and the loudest
//      velocity layer that exists (the engine crossfades between them by gain + lowpass, and pitch-shifts at most about +-2 semitones to fill the gaps);
//   2. decodes with ffmpeg, folds to mono (the engine places every section in the hall by itself), trims the leading silence, cuts to a length per articulation
//      (sustained 2.8 s with a loop region, short notes 0.5-1.6 s, drums 2.5-4 s), applies a short fade-out so a cut never clicks;
//   3. measures the real pitch of each sample (YIN) and stores it as `m` (fractional MIDI note). The file name octave is only used to pick the neighbourhood;
//      a sample more than 1.3 semitones away from its name aborts the build. That also tunes the engine perfectly to ensemble recordings that are a few cents off;
//   4. normalises loudness per note (the soft layer keeps its natural level relation to the loud layer), so the bank is even across the keyboard;
//   5. encodes with ffmpeg (libmp3lame VBR -q:a 4, mono 44.1 kHz, bit-exact flags -> same bytes on the same ffmpeg), and writes bank.json (the index the sampler reads).
// Deterministic: sorted traversal, no timestamps, fixed encoder settings. Re-running with the same sources gives identical files on the same ffmpeg build.
// Format: mp3 is the default because every browser we target decodes it (iOS Safari included) and Playwright's Chromium (no AAC) can verify it in the tests.
//   --format m4a switches to AAC-LC 64 kbps (smaller on iOS, but cannot be verified in Chromium builds without proprietary codecs).
//   Encoder delay (mp3 about 1105 samples = 25 ms) is handled at runtime by the sampler, which trims the leading silence after decodeAudioData.

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');

const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf('--' + name); if (i < 0) return def; const v = args[i + 1]; return v && !v.startsWith('--') ? v : true; }
const SRC = opt('src', process.env.VSCO_DIR || '');
const OUT = path.resolve(opt('out', path.join(__dirname, '..', 'orchestra', 'samples')));
const FORMAT = opt('format', 'mp3');
const ONLY = opt('only', '') ? String(opt('only', '')).split(',') : null;
const DRY = !!opt('dry', false);
if (!SRC || !fs.existsSync(SRC)) { console.error('usage: node tools/build-orchestra-samples.js --src <VSCO-2-CE checkout> [--out dir] [--format mp3|m4a] [--only id,id] [--dry]'); process.exit(2); }
if (FORMAT !== 'mp3' && FORMAT !== 'm4a') { console.error('--format must be mp3 or m4a'); process.exit(2); }

const SR = 44100;
const CLIP = [];

// ---- the table: which VSCO folder feeds which bank entry ----------------------------------------------------------------------------------
// gain: the instrument's level in the mix (the engine multiplies it in), rooms: how far back it sits (0 front .. 1 back) is decided by the seating plan in engine.js.
// kind 'pitched' (names like XXX_A#3_v1_rr1.wav, octave convention C3 = MIDI 60) or 'fixed' (a hand-picked list of unpitched files).
const NOTE_RE = /_([A-G]#?)(-?\d)_(?:v(\d+)|(mf|mp|f|p|ff))(?:_|\.)/i;
const INSTR = [
  { id: 'vln', name: 'Violin section', gain: 1.0, root: 'Strings/Violin Section', arts: { sus: ['susVib', 'sus'], spic: ['Spic', 'short'], pizz: ['Pizz', 'short'] } },
  { id: 'vla', name: 'Viola section', gain: 1.0, root: 'Strings/Viola Section', arts: { sus: ['susvib', 'sus'], spic: ['spic', 'short'], pizz: ['pizz', 'short'] } },
  { id: 'vc', name: 'Cello section', gain: 1.05, root: 'Strings/Cello Section', arts: { sus: ['susvib', 'sus'], spic: ['spic', 'short'], pizz: ['pizzT', 'short'] } },
  { id: 'cb', name: 'Double bass', gain: 1.1, root: 'Strings/Solo Contrabass', arts: { sus: ['SusVib', 'sus'], spic: ['Spic', 'short'], pizz: ['Pizz', 'short'] } },
  { id: 'fl', name: 'Flute', gain: 0.95, root: 'Woodwinds/Flute', arts: { sus: ['susvib', 'sus'], stac: ['stac', 'short'] } },
  { id: 'ob', name: 'Oboe', gain: 0.95, root: 'Woodwinds/Oboe', arts: { sus: ['Sus', 'sus'], stac: ['Stacc', 'short'] } },
  { id: 'cl', name: 'Clarinet', gain: 1.0, root: 'Woodwinds/Clarinet', arts: { sus: ['susLong', 'sus'], stac: ['stac', 'short'] } },
  { id: 'fg', name: 'Bassoon', gain: 1.0, root: 'Woodwinds/Bassoon', arts: { sus: ['sus', 'sus'], stac: ['stac', 'short'] } },
  { id: 'hn', name: 'Horn', gain: 1.0, root: 'Brass/F Horn', arts: { sus: ['sus', 'sus'], stac: ['stac', 'short'] } },
  { id: 'tp', name: 'Trumpet', gain: 0.9, root: 'Brass/Trumpet', arts: { sus: ['sus', 'sus'], stac: ['stac', 'short'] } },
  { id: 'tb', name: 'Trombone', gain: 0.95, root: 'Brass/Tenor Trombone', arts: { sus: ['sus', 'sus'], stac: ['stac', 'short'] } },
  { id: 'tu', name: 'Tuba', gain: 0.95, root: 'Brass/Tuba', arts: { sus: ['sus', 'sus'], stac: ['stac', 'short'] } },
  // drums: five timpani, soft = v1, loud = v4 (rr1). Pitch is measured from the recording.
  { id: 'timp', name: 'Timpani', gain: 1.0, kind: 'timp', root: 'Percussion/Timpani', arts: { hit: [null, 'drum'] } },
  { id: 'harp', name: 'Harp', gain: 0.9, kind: 'harp', oct: -12, trust: true, /* the harp files use the scientific octave naming (C4 = 60), unlike the rest of VSCO */ root: 'Strings/Harp', arts: { pluck: [null, 'harp'] } },
  { id: 'bd', name: 'Bass drum', gain: 1.0, kind: 'fixed', arts: { hit: [null, 'drum'] }, files: { hit: [['Percussion/BDrumNewhit_v2_rr1_Sum.wav', 'Percussion/BDrumNewhit_v5_rr1_Sum.wav']] } },
  { id: 'cym', name: 'Cymbal', gain: 0.8, kind: 'fixed', arts: { hit: [null, 'cym'] }, files: { hit: [['VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_softmall_mp.wav', 'VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_metal_2_f.wav']] } },
];
// Articulation kinds: seconds kept, loop region (null = none), fade-out seconds, loudness target (dBFS RMS of the loud layer's body).
const KIND = {
  sus:   { len: 2.8, loop: [0.9, 2.78], fade: 0.03, body: [0.30, 1.8], target: -23 },
  short: { len: 1.0, loop: null, fade: 0.12, body: [0.0, 0.5], target: -21 },
  drum:  { len: 3.2, loop: null, fade: 0.5, body: [0.0, 0.6], target: -19 },
  harp:  { len: 3.0, loop: null, fade: 0.6, body: [0.0, 0.8], target: -23 },
  cym:   { len: 4.0, loop: null, fade: 1.0, body: [0.0, 1.0], target: -23 },
};
const ARTLEN = { pizz: 1.6, spic: 0.7, stac: 0.8 }; // overrides for 'short'

const NN = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = (n, o) => 12 * (Number(o) + 2) + NN[n.toUpperCase()]; // VSCO: C3 = middle C = MIDI 60
const pad3 = n => String(n).padStart(3, '0');

// ---- DSP helpers --------------------------------------------------------------------------------------------------------------------------
function decodeMono(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 29 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
}
function trimLead(x) {
  let pk = 0; const lim = Math.min(x.length, SR * 2);
  for (let i = 0; i < lim; i++) pk = Math.max(pk, Math.abs(x[i]));
  const th = pk * 0.03; let i = 0; while (i < x.length && Math.abs(x[i]) < th) i++;
  return x.slice(Math.max(0, i - Math.round(0.006 * SR)));
}
function rms(x, a, b) { a = Math.max(0, Math.round(a * SR)); b = Math.min(x.length, Math.round(b * SR)); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
const db = v => 20 * Math.log10(Math.max(1e-9, v));
function cut(x, len, fade) {
  const n = Math.round(len * SR), y = new Float32Array(n); y.set(x.subarray(0, Math.min(n, x.length)));
  const f = Math.min(n, Math.round(fade * SR));
  for (let i = 0; i < f; i++) { const g = 0.5 + 0.5 * Math.cos(Math.PI * i / f); y[n - f + i] *= g; }
  return y;
}
// YIN pitch (Hz or 0) over a window of x; fmin..fmax Hz.
function yin(x, a, b, fmin, fmax) {
  const w = b - a, tauMax = Math.min(Math.floor(SR / fmin), Math.floor(w / 2) - 1), tauMin = Math.max(2, Math.floor(SR / fmax));
  const d = new Float64Array(tauMax + 1);
  for (let t = 1; t <= tauMax; t++) { let s = 0; for (let i = 0; i < w - tauMax; i++) { const v = x[a + i] - x[a + i + t]; s += v * v; } d[t] = s; }
  const c = new Float64Array(tauMax + 1); c[0] = 1; let run = 0;
  for (let t = 1; t <= tauMax; t++) { run += d[t]; c[t] = d[t] * t / (run || 1); }
  let t = tauMin;
  for (; t <= tauMax; t++) { if (c[t] < 0.12) { while (t + 1 <= tauMax && c[t + 1] < c[t]) t++; break; } }
  if (t > tauMax) { let best = tauMin; for (let k = tauMin; k <= tauMax; k++) if (c[k] < c[best]) best = k; if (c[best] > 0.4) return 0; t = best; }
  const a0 = c[t - 1] || c[t], a1 = c[t], a2 = c[t + 1] || c[t]; const den = a0 + a2 - 2 * a1; const off = den ? 0.5 * (a0 - a2) / den : 0;
  return SR / (t + off);
}
const hzToMidi = f => 69 + 12 * Math.log2(f / 440);
function measureMidi(x, hint) {
  // a few windows after the attack; take the median of the plausible ones
  const f0 = 440 * Math.pow(2, (hint - 69) / 12), lo = f0 / 1.6, hi = f0 * 1.6, res = [];
  for (const st of [0.12, 0.2, 0.3, 0.45]) {
    const a = Math.round(st * SR), w = Math.round(Math.max(0.12, 6 / Math.max(30, lo)) * SR);
    if (a + w + SR / lo > x.length) continue;
    const f = yin(x, a, a + w + Math.round(SR / lo), Math.max(25, lo), hi); if (f > 0) res.push(hzToMidi(f));
  }
  res.sort((p, q) => p - q);
  return res.length ? res[Math.floor(res.length / 2)] : NaN;
}


// Timpani have inharmonic modes (about 1 : 1.5 : 2 : 2.4), so automatic pitch tracking jumps between modes from one hit strength to the next. The note a player
// hears is the lowest strong mode that has partials at about 1.5x and 2x above it. These nominal frequencies were read once from the spectra of both layers
// of every drum (soft v1 and loud v3/v4; e.g. drum 3: 142 Hz with 211 Hz and 277 Hz above it) and are fixed here so the build stays deterministic.
const TIMP_HZ = { 1: 90, 2: 122, 3: 142, 4: 169, 5: 191 };

// ---- encoding -----------------------------------------------------------------------------------------------------------------------------
function encode(x, outFile) {
  const a = ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact'];
  if (FORMAT === 'mp3') a.push('-c:a', 'libmp3lame', '-q:a', '4', outFile);
  else a.push('-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', outFile);
  const r = spawnSync('ffmpeg', a, { input: Buffer.from(x.buffer, x.byteOffset, x.byteLength), maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('ffmpeg encode failed: ' + String(r.stderr));
}

// ---- source selection ---------------------------------------------------------------------------------------------------------------------
function listWav(dir) { return fs.readdirSync(dir).filter(f => /\.wav$/i.test(f)).sort(); }
function pitchedGroups(dir, oct) {
  const groups = new Map();
  for (const f of listWav(dir)) {
    const m = NOTE_RE.exec(f); if (!m) continue;
    const note = midiOf(m[1], m[2]) + (oct || 0);
    const layer = m[3] ? Number(m[3]) : ({ p: 1, mp: 2, mf: 3, f: 4, ff: 5 }[m[4].toLowerCase()] || 1);
    if (!groups.has(note)) groups.set(note, new Map());
    const g = groups.get(note); if (!g.has(layer)) g.set(layer, path.join(dir, f)); // first file (rr1) of each layer wins
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([note, g]) => {
    const ls = [...g.keys()].sort((a, b) => a - b);
    return { note, files: ls.length > 1 ? [g.get(ls[0]), g.get(ls[ls.length - 1])] : [g.get(ls[0])] };
  });
}
function timpGroups(dir) {
  const out = [];
  for (let d = 1; d <= 5; d++) {
    const soft = path.join(dir, `Timpani${d}_Hit_v1_rr1_Sum.wav`), loud = path.join(dir, `Timpani${d}_Hit_v4_rr1_Sum.wav`), mid = path.join(dir, `Timpani${d}_Hit_v3_rr1_Sum.wav`);
    const l = fs.existsSync(loud) ? loud : mid; if (fs.existsSync(soft) && fs.existsSync(l)) out.push({ note: null, drum: d, files: [soft, l] });
  }
  return out;
}

const bank = { version: 1, format: FORMAT, sampleRate: SR, source: { name: 'VSCO 2 Community Edition', by: 'Sam Gossner / Versilian Studios', url: 'https://github.com/sgossner/VSCO-2-CE', licence: 'CC0 1.0 Universal (public domain dedication)' }, instruments: {} };
let fileCount = 0, totalBytes = 0; const warnings = [];

function processInstrument(ins) {
  const entry = { name: ins.name, gain: ins.gain, arts: {} };
  for (const art of Object.keys(ins.arts)) {
    const [sub, kindName] = ins.arts[art];
    const K = Object.assign({}, KIND[kindName]); if (kindName === 'short' && ARTLEN[art]) K.len = ARTLEN[art];
    let groups;
    if (ins.kind === 'timp') groups = timpGroups(path.join(SRC, ins.root));
    else if (ins.kind === 'harp') groups = pitchedGroups(path.join(SRC, ins.root), ins.oct);
    else if (ins.kind === 'fixed') groups = ins.files[art].map(p => ({ note: null, files: p.map(f => path.join(SRC, f)) }));
    else groups = pitchedGroups(path.join(SRC, ins.root, sub));
    if (!groups.length) throw new Error(`no source files for ${ins.id}/${art}`);
    const notes = [];
    for (const g of groups) {
      const raw = g.files.map(f => trimLead(decodeMono(f)));
      let m = null;
      if (g.note != null) {
        const meas = measureMidi(raw[raw.length - 1], g.note);
        if (!isFinite(meas)) { warnings.push(`${ins.id}/${art} ${g.note}: pitch not measurable, using the file name`); m = g.note; }
        else if (Math.abs(meas - g.note) > 1.3 && (kindName === 'short' || ins.trust)) { warnings.push(`${ins.id}/${art} ${path.basename(g.files[0])}: measured ${meas.toFixed(2)}, name says ${g.note} (short sample, pitch unreliable): using the file name`); m = g.note; }
        else if (Math.abs(meas - g.note) > 1.3) throw new Error(`${ins.id}/${art}: ${path.basename(g.files[0])} measures ${meas.toFixed(2)} but its name says ${g.note} (check the octave convention)`);
        else m = Math.round(meas * 100) / 100;
      } else if (ins.kind === 'timp') {
        m = Math.round(hzToMidi(TIMP_HZ[g.drum]) * 100) / 100;
      }
      // loudness: loud layer -> target, soft layer gets the same gain (keeps the natural soft/loud relation), then a peak guard
      const loud = raw[raw.length - 1];
      const bodyDb = db(rms(loud, K.body[0], K.body[1]));
      let gain = Math.pow(10, (K.target - bodyDb) / 20);
      const cuts = raw.map(r => cut(r, K.len, K.fade));
      let pk = 0; for (const c of cuts) for (let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i] * gain));
      if (pk > 0.95) gain *= 0.95 / pk;
      const tag = g.note != null ? pad3(g.note) : (g.drum ? 'd' + g.drum : 'x');
      const files = cuts.map((c, li) => {
        for (let i = 0; i < c.length; i++) c[i] *= gain;
        const name = `${ins.id}-${art}-${tag}-${cuts.length > 1 ? (li === 0 ? 's' : 'l') : 'l'}.${FORMAT}`;
        if (!DRY) { encode(c, path.join(OUT, name)); const sz = fs.statSync(path.join(OUT, name)).size; totalBytes += sz; }
        fileCount++;
        return name;
      });
      notes.push(m == null ? { f: files } : { m, f: files });
    }
    const layers = Math.max(...notes.map(n => n.f.length));
    entry.arts[art] = { len: K.len, loop: K.loop, layers, notes };
    console.log(`  ${ins.id}/${art}: ${notes.length} notes x ${layers} layer(s)` + (notes[0].m != null ? ` [${notes.map(n => n.m == null ? '-' : n.m.toFixed(1)).join(' ')}]` : ''));
  }
  return entry;
}

if (!DRY) { fs.mkdirSync(OUT, { recursive: true }); for (const f of fs.readdirSync(OUT)) if (/\.(mp3|m4a)$/.test(f) && !ONLY) fs.unlinkSync(path.join(OUT, f)); }
const t0 = Date.now();
for (const ins of INSTR) {
  if (ONLY && !ONLY.includes(ins.id)) continue;
  console.log(ins.id);
  bank.instruments[ins.id] = processInstrument(ins);
}
if (warnings.length) console.log('warnings:\n  ' + warnings.join('\n  '));
if (!DRY && !ONLY) {
  // a build id over every encoded file: the page puts it in the file URLs (?b=...), so a service worker may cache the samples forever and a rebuild still reaches everyone
  const h = crypto.createHash('sha1'); fs.readdirSync(OUT).filter(f => /\.(mp3|m4a)$/.test(f)).sort().forEach(f => { h.update(f); h.update(fs.readFileSync(path.join(OUT, f))); });
  bank.build = h.digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(OUT, 'bank.json'), JSON.stringify(bank) + '\n');
  console.log('build id ' + bank.build);
}
console.log(`${fileCount} files, ${(totalBytes / 1048576).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s` + (DRY ? ' (dry run: nothing written)' : ''));
