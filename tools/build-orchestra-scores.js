#!/usr/bin/env node
'use strict';
// tools/build-orchestra-scores.js — converts Mutopia Project MIDI files (all Public Domain, licence checked on each piece page) into the compact
// score JSON the 指揮者ゲーム reads (orchestra/scores/<id>.json plus orchestra/scores/index.json).
//
//   node tools/build-orchestra-scores.js [--src tools/orchestra-midi] [--out orchestra/scores]
//
// Input : tools/orchestra-midi/*.mid (the exact files downloaded from mutopiaproject.org, see PIECES[].midi and orchestra/CREDITS.md)
// Output: per piece { id, sec:[{ id, inst, n:[dt,pitch,dur(-=short),vel,...] }], grid, bpm, dyn, cues, ... } (all times in ticks of PPQ=96 or in conductor beats)
// The MIDI is a mechanical rendering of the engraved score (LilyPond), so there is no performance data: the game's "dynamics guide" is derived here from
// the velocities when the file has real dynamics (Dvořák, Mozart, Mendelssohn, Egmont) and otherwise from the orchestral density (Beethoven 5/7, Rossini).
// Deterministic: same inputs -> same bytes. Uses only orchestra/midi.js (our own parser).

const fs = require('fs');
const path = require('path');
const M = require('../orchestra/midi.js');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt('src', path.join(__dirname, 'orchestra-midi')));
const OUT = path.resolve(opt('out', path.join(__dirname, '..', 'orchestra', 'scores')));
const PPQ = 96;
const BPM_MIN = 36, BPM_MAX = 132; // the range one conducted beat may have at the guide tempo

// section id -> sample-bank instrument
const SEC_INST = { fl: 'fl', ob: 'ob', cl: 'cl', fg: 'fg', hn: 'hn', tp: 'tp', tb: 'tb', tu: 'tu', timp: 'timp', perc: 'bd', vln1: 'vln', vln2: 'vln', vla: 'vla', vc: 'vc', cb: 'cb' };

const NAMES = { flauti: 'fl', oboi: 'ob', clarinetti: 'cl', fagotti: 'fg', corni: 'hn', trombe: 'tp', trombone: 'tb', trombonebasso: 'tb', timpani: 'timp', violino1: 'vln1', violinoi: 'vln1', violino2: 'vln2', violinoii: 'vln2', viola: 'vla', violoncello: 'vc', contrabasso: 'cb' };
// Each piece: midi files (concatenated in order), tracks: { fileIndex: { trackIndex: section } }, tempo overrides, excerpt (in quarter notes of the merged timeline).
// `derive`: extra sections made from another one (e.g. double basses doubling the cellos an octave lower in a piece whose MIDI has no bass part).
const PIECES = [
  { id: 'beethoven5', mutopia: 941, level: 3, mvt: { ja: '第1楽章', en: 'I. Allegro con brio' },
    title: { ja: '交響曲 第5番 ハ短調 作品67', en: 'Symphony No. 5 in C minor, Op. 67' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1808,
    midi: ['Symphony5_1.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'timp', 8: 'vln1', 9: 'vln2', 10: 'vla', 11: 'vc', 12: 'cb' }],
    excerpt: [0, 760], blurb: { ja: '「運命」の動機で始まる、あまりにも有名な楽章。出だしの一振りと、ホルンの呼び出しがヤマ場。', en: 'The famous four-note motto. Your first downbeat and the horn call are the big moments.' } },
  { id: 'beethoven7', mutopia: 595, level: 2, mvt: { ja: '第2楽章', en: 'II. Allegretto' },
    title: { ja: '交響曲 第7番 イ長調 作品92', en: 'Symphony No. 7 in A major, Op. 92' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1812,
    midi: ['Symphony7_2.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'timp', 8: 'vln1', 9: 'vln2', 10: 'vla', 11: 'vc', 12: 'cb' }],
    excerpt: [0, 300], blurb: { ja: '低弦から静かに積み上がり、少しずつ大きくなる行進曲。クレッシェンドの練習にぴったり。', en: 'A hushed march that grows from the low strings. Perfect for practising a long crescendo.' } },
  { id: 'nachtmusik', mutopia: 2230, level: 1, mvt: { ja: '第1楽章', en: 'I. Allegro' },
    title: { ja: 'アイネ・クライネ・ナハトムジーク K.525', en: 'Eine kleine Nachtmusik, K.525' }, composer: { ja: 'モーツァルト', en: 'Mozart' }, year: 1787,
    midi: ['MozartWA-KV525-mov-01.mid'], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], derive: [{ from: 'vc', to: 'cb', transpose: -12 }],
    excerpt: [0, 548], blurb: { ja: '弦楽だけのやさしい一曲。テンポを安定させる練習に。', en: 'Strings only and friendly: a good first piece for keeping the tempo steady.' } },
  { id: 'zauberflote', mutopia: 248, level: 2, mvt: { ja: 'アダージョ〜アレグロ', en: 'Adagio, Allegro' },
    title: { ja: '歌劇《魔笛》序曲 K.620', en: 'The Magic Flute, Overture, K.620' }, composer: { ja: 'モーツァルト', en: 'Mozart' }, year: 1791,
    midi: ['magicflute-00-overture-mids/adagioIscore.mid', 'magicflute-00-overture-mids/allegroIscore.mid'],
    tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'tb', 8: 'tb', 9: 'timp', 10: 'vln1', 11: 'vln2', 12: 'vla', 13: 'vc', 14: 'cb' }, { 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'tb', 8: 'tb', 9: 'timp', 10: 'vln1', 11: 'vln2', 12: 'vla', 13: 'vc', 14: 'cb' }],
    byName: true, excerpt: [0, 1000],
    blurb: { ja: '3つの和音ではじまるゆっくりした導入と、駆けぬける弦のアレグロ。入りのキューが多め。', en: 'Three solemn chords, then a racing string allegro. Lots of entrances to cue.' } },
  { id: 'dvorak7', mutopia: 1901, level: 3, mvt: { ja: '第3楽章 スケルツォ', en: 'III. Scherzo (Vivace)' },
    title: { ja: '交響曲 第7番 ニ短調 作品70', en: 'Symphony No. 7 in D minor, Op. 70' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1885,
    midi: ['DvorakSYMPH7-mids/DvorakSYMPH7_conductor-2.mid'], tracks: [{ 1: 'fl', 2: 'fl', 3: 'ob', 4: 'cl', 5: 'fg', 6: 'vln1', 7: 'vln2', 8: 'vla', 9: 'vc', 10: 'vc', 11: 'cb', 12: 'hn', 13: 'hn', 14: 'tp', 15: 'timp' }],
    excerpt: [0, 1002], blurb: { ja: '弾むリズムのスケルツォ。木管、金管が次々に入ってくるので、キューの腕の見せどころ。', en: 'A bouncing scherzo with winds and brass entering one after another: your cueing is the star.' } },
  { id: 'midsummer', mutopia: 80, level: 2, mvt: { ja: '間奏曲（No.5）', en: 'Intermezzo (No. 5)' },
    title: { ja: '劇音楽《真夏の夜の夢》 作品61', en: 'A Midsummer Night\'s Dream, Op. 61' }, composer: { ja: 'メンデルスゾーン', en: 'Mendelssohn' }, year: 1843,
    midi: ['Sommernachtstraum-mids/Sommernachtstraum.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'vln1', 7: 'vln2', 8: 'vla', 9: 'vc', 10: 'cb' }],
    excerpt: [0, 421], blurb: { ja: '妖精がかけまわるような6/8拍子。ふたつ振りで軽く。', en: 'A fairy-footed 6/8. Conduct it in two, light and quick.' } },
  { id: 'rossini', mutopia: 1634, level: 3, mvt: { ja: '序曲', en: 'Overture' },
    title: { ja: '歌劇《エドゥアルドとクリスティーナ》序曲', en: 'Eduardo e Cristina, Overture' }, composer: { ja: 'ロッシーニ', en: 'Rossini' }, year: 1819,
    midi: ['Eduardo_e_Cristina.mid'], tempoOverride: [[0, 66], [76.25, 120]],
    tracks: [{ 1: 'fl', 2: 'fl', 3: 'ob', 4: 'cl', 5: 'fg', 6: 'hn', 7: 'tp', 8: 'tb', 9: 'tb', 10: 'timp', 11: 'perc', 12: 'vln1', 13: 'vla', 14: 'vc' }],
    derive: [{ from: 'vc', to: 'cb', transpose: -12 }, { from: 'vln1', to: 'vln2', transpose: 0 }],
    excerpt: [0, 470], blurb: { ja: 'ゆっくりした導入のあと、一気に加速するロッシーニ・クレッシェンド。', en: 'A slow introduction, then the famous Rossini crescendo.' } },
  { id: 'egmont', mutopia: 547, level: 3, mvt: { ja: '序曲', en: 'Overture' },
    title: { ja: '《エグモント》序曲 作品84', en: 'Egmont Overture, Op. 84' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1810,
    midi: ['Egmont.mid'], tracks: [{ 1: 'fl', 2: 'fl', 3: 'ob', 4: 'cl', 5: 'fg', 6: 'hn', 7: 'hn', 8: 'tp', 9: 'timp', 10: 'vln1', 11: 'vln2', 12: 'vla', 13: 'vc', 14: 'cb' }],
    excerpt: [0, 640], blurb: { ja: '重々しい序奏から、嵐のような主部へ。拍子もテンポも変わる、腕だめしの一曲。', en: 'A heavy introduction that turns into a storm. Changing meters and tempos: a test of your baton.' } },
];

// ------------------------------------------------------------------------------------------------------------------------------------------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function load(file) { return M.parse(new Uint8Array(fs.readFileSync(path.join(SRC, file)))); }

function tempoAt(tempos, q) { let b = 120; for (const t of tempos) { if (t.q > q + 1e-9) break; b = t.bpm; } return b; }

function build(P) {
  const files = P.midi.map(load);
  let off = 0; const notes = []; const sigs = []; const tempos = [];
  files.forEach((mf, fi) => {
    const map = P.tracks[fi] || P.tracks[0], k = PPQ / mf.division;
    mf.tracks.forEach((tr, ti) => {
      const sec = P.byName ? NAMES[tr.name.toLowerCase().replace(/:.*$/, '').replace(/\s+/g, '')] : map[ti]; if (!sec) return;
      M.notes(tr).forEach(n => notes.push({ sec, tick: Math.round(n.tick * k) + off, dur: Math.max(1, Math.round(n.dur * k)), pitch: n.note, vel: n.vel }));
    });
    mf.timeSigs.forEach(s => sigs.push({ tick: Math.round(s.tick * k) + off, num: s.num, den: s.den }));
    let last = -1; mf.tempos.forEach(t => { const tk = Math.round(t.tick * k) + off; if (t.tick === 0 && last === 0) tempos.pop(); tempos.push({ q: tk / PPQ, bpm: 6e7 / t.uspq }); last = t.tick; });
    off += Math.round(mf.endTick * k);
  });
  if (P.tempoOverride) { tempos.length = 0; P.tempoOverride.forEach(([q, bpm]) => tempos.push({ q, bpm })); }
  tempos.sort((a, b) => a.q - b.q);
  sigs.sort((a, b) => a.tick - b.tick);
  // derived sections
  (P.derive || []).forEach(d => {
    const src = notes.filter(n => n.sec === d.from);
    if (!src.length) return;
    if (notes.some(n => n.sec === d.to)) return; // the file has that part already
    src.forEach(n => notes.push({ sec: d.to, tick: n.tick, dur: n.dur, pitch: Math.max(28, n.pitch + d.transpose), vel: n.vel }));
  });
  const from = Math.round(P.excerpt[0] * PPQ), to = Math.round(P.excerpt[1] * PPQ);

  // ---- bars -> conductor beats ---------------------------------------------------------------------------------------------------------
  const bars = []; // { tick, q, beats, unit(q), bpm }
  let sg = 0, cur = sigs[0] || { tick: 0, num: 4, den: 4 };
  for (let tick = 0; tick < Math.min(off, to + PPQ * 40);) {
    while (sg + 1 < sigs.length && sigs[sg + 1].tick <= tick) cur = sigs[++sg];
    const barQ = cur.num * 4 / cur.den, q = tick / PPQ, T = tempoAt(tempos, q);
    let unit = cur.den === 8 && cur.num % 3 === 0 && cur.num >= 6 ? 1.5 : cur.den === 4 && cur.num % 3 === 0 && cur.num >= 6 ? 3 : cur.den === 2 ? 2 : cur.den === 8 ? 0.5 : 1;
    let beats = Math.round(barQ / unit);
    for (let guard = 0; guard < 6; guard++) {
      const bpm = T / unit;
      if (beats > 4 && beats % 3 === 0) { unit *= beats / 3; beats = 3; continue; }
      if (beats > 4 && beats % 2 === 0) { unit *= 2; beats /= 2; continue; }
      if (bpm > BPM_MAX && beats % 2 === 0) { unit *= 2; beats /= 2; continue; }
      if (bpm > BPM_MAX && beats === 3) { unit *= 3; beats = 1; continue; }
      if (bpm < BPM_MIN && unit >= 1 && beats * 2 <= 4) { unit /= 2; beats *= 2; continue; }
      break;
    }
    bars.push({ tick, q, beats, unit, bpm: T / unit, barQ });
    tick += Math.round(barQ * PPQ);
  }
  // keep only the bars of the excerpt; beat 0 = first beat of the first kept bar
  const kept = bars.filter(b => b.tick >= from && b.tick < to);
  if (!kept.length) throw new Error(P.id + ': empty excerpt');
  const t0 = kept[0].tick, tEnd = kept[kept.length - 1].tick + Math.round(kept[kept.length - 1].barQ * PPQ);
  // beat positions (in ticks) of each conductor beat
  const beatTick = [], beatBpm = [], beatInBar = [];
  kept.forEach(b => { for (let i = 0; i < b.beats; i++) { beatTick.push(b.tick - t0 + Math.round(i * b.unit * PPQ)); beatBpm.push(b.bpm); beatInBar.push(i); } });
  const nBeats = beatTick.length;
  // run-length grid: [startTick, nBars, beatsPerBar, beatTicks]
  const grid = [];
  kept.forEach(b => { const bt = Math.round(b.unit * PPQ), last = grid[grid.length - 1]; if (last && last[2] === b.beats && last[3] === bt) last[1]++; else grid.push([b.tick - t0, 1, b.beats, bt]); });

  // ---- notes of the excerpt --------------------------------------------------------------------------------------------------------------
  const secOrder = ['fl', 'ob', 'cl', 'fg', 'hn', 'tp', 'tb', 'tu', 'timp', 'perc', 'vln1', 'vln2', 'vla', 'vc', 'cb'];
  const bySec = {};
  notes.forEach(n => {
    if (n.tick >= tEnd || n.tick + n.dur <= t0 || n.tick < t0 && n.tick + n.dur <= t0) return;
    const on = Math.max(n.tick, t0) - t0, off2 = Math.min(n.tick + n.dur, tEnd) - t0;
    if (n.tick < t0) return; // notes that started before the excerpt are dropped
    (bySec[n.sec] = bySec[n.sec] || []).push({ tick: on, dur: Math.max(1, off2 - on), pitch: n.pitch, vel: n.vel });
  });
  // quarter-note length in seconds at the guide tempo near a tick (for the short-note rule)
  const secPerTick = tick => 60 / tempoAt(tempos, (tick + t0) / PPQ) / PPQ;
  const sections = [], needs = {};
  secOrder.forEach(id => {
    const ns = bySec[id]; if (!ns || !ns.length) return;
    ns.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    let prev = 0; const flat = []; const arts = new Set();
    ns.forEach(n => {
      const short = n.dur * secPerTick(n.tick) < 0.30 && id !== 'timp' && id !== 'perc' ? 1 : 0;
      arts.add(short ? 's' : 'l');
      flat.push(n.tick - prev, n.pitch, short ? -n.dur : n.dur, n.vel); prev = n.tick;
    });
    sections.push({ id, inst: SEC_INST[id], n: flat, count: ns.length, arts: [...arts].sort().join('') });
    needs[SEC_INST[id]] = [...new Set([...(needs[SEC_INST[id]] || []), ...arts])];
  });

  // ---- dynamics guide (one digit 0..8 per conductor beat) ----------------------------------------------------------------------------------
  const allNotes = []; sections.forEach(s => { let t = 0; for (let i = 0; i < s.n.length; i += 4) { t += s.n[i]; allNotes.push({ sec: s.id, tick: t, dur: Math.abs(s.n[i + 2]), vel: s.n[i + 3], pitch: s.n[i + 1] }); } });
  const vels = new Set(allNotes.map(n => n.vel));
  const hasDyn = vels.size >= 6;
  const WEIGHT = { timp: 2.2, perc: 2.2, tp: 1.6, tb: 1.6, tu: 1.6, hn: 1.3 };
  const raw = new Array(nBeats).fill(0), cntV = new Array(nBeats).fill(0);
  const beatOfTick = tick => { let lo = 0, hi = nBeats - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (beatTick[m] <= tick) lo = m; else hi = m - 1; } return lo; };
  allNotes.forEach(n => {
    const b0 = beatOfTick(n.tick), b1 = beatOfTick(Math.max(n.tick, n.tick + n.dur - 1));
    const w = WEIGHT[n.sec] || 1;
    for (let b = b0; b <= Math.min(b1, b0 + 3); b++) { raw[b] += w; cntV[b] += (n.vel || 64) * w; }
  });
  let level;
  if (hasDyn) level = raw.map((r, b) => r ? clamp((cntV[b] / r - 42) / (104 - 42), 0, 1) : 0);
  else {
    const sorted = raw.filter(x => x > 0).sort((a, b) => a - b), rankOf = x => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; } return sorted.length ? lo / sorted.length : 0; };
    level = raw.map(r => r ? Math.pow(rankOf(r), 0.9) : 0);
  }
  // smooth over +-1 beat, map to 0.10..0.95, quantise to 9 grades
  const sm = level.map((_, b) => { let s = 0, w = 0; for (let k = -1; k <= 1; k++) { const j = clamp(b + k, 0, nBeats - 1); const ww = k === 0 ? 2 : 1; s += level[j] * ww; w += ww; } return s / w; });
  const lo = Math.min(...sm.filter((x, i) => raw[i] > 0)), hi = Math.max(...sm);
  const dyn = sm.map(x => Math.round(clamp(0.10 + 0.85 * (x - lo) / Math.max(1e-6, hi - lo), 0, 1) * 8)).join('');

  // ---- tempo guide (conducted beats per minute, run-length: [beat, bpm]) -------------------------------------------------------------------
  const bpm = []; beatBpm.forEach((v, b) => { const r = Math.round(v * 10) / 10; if (!bpm.length || bpm[bpm.length - 1][1] !== r) bpm.push([b, r]); });

  // ---- cues: entrances after a long rest, grouped ---------------------------------------------------------------------------------------
  const ev = [];
  sections.forEach(s => {
    let t = 0, endPrev = -1e9, first = true;
    for (let i = 0; i < s.n.length; i += 4) {
      t += s.n[i]; const dur = Math.abs(s.n[i + 2]), b = beatOfTick(t) + (t - beatTick[beatOfTick(t)]) / Math.max(1, (beatTick[beatOfTick(t) + 1] || tEnd - t0) - beatTick[beatOfTick(t)]);
      if ((t - endPrev) * secPerTick(t) >= 6 && (b >= 3.5 || !first)) ev.push({ b: Math.round(b * 4) / 4, sec: s.id });
      endPrev = Math.max(endPrev, t + dur); first = false;
    }
  });
  ev.sort((a, c) => a.b - c.b);
  const cues = [];
  ev.forEach(e => { const l = cues[cues.length - 1]; if (l && e.b - l.b <= 1.5) { if (!l.s.includes(e.sec)) l.s.push(e.sec); } else cues.push({ b: e.b, s: [e.sec] }); });
  const cueOut = cues.map(c => [c.b, c.s]);

  // ---- sanity numbers: how well each wind/brass section's pitch classes agree with the strings (a wrong transposition would show here) -------
  const pcs = {}; // per beat: set of pitch classes of strings
  allNotes.filter(n => /^(vl|vc|cb)/.test(n.sec)).forEach(n => { const b0 = beatOfTick(n.tick), b1 = beatOfTick(n.tick + Math.max(1, n.dur - 1)); for (let b = b0; b <= b1; b++) (pcs[b] = pcs[b] || new Set()).add(n.pitch % 12); });
  const agree = {};
  allNotes.filter(n => !/^(vl|vc|cb)/.test(n.sec)).forEach(n => { const b = beatOfTick(n.tick); const a = agree[n.sec] = agree[n.sec] || [0, 0]; a[1]++; if (pcs[b] && (pcs[b].has(n.pitch % 12) || pcs[b].has((n.pitch + 1) % 12) === false && false)) a[0]++; });

  const endBeat = nBeats;
  const out = {
    v: 1, id: P.id, ppq: PPQ,
    title: P.title, composer: P.composer, mvt: P.mvt, year: P.year, blurb: P.blurb, level: P.level,
    src: { mutopia: P.mutopia, midi: P.midi.map(f => f.split('/').pop()), licence: 'Public Domain' },
    nBeats, grid, bpm, dyn, cues: cueOut, needs,
    sec: sections.map(s => ({ id: s.id, inst: s.inst, n: s.n })),
  };
  const durSec = beatBpm.reduce((s, v) => s + 60 / v, 0);
  const summary = { id: P.id, beats: nBeats, bars: kept.length, minutes: +(durSec / 60).toFixed(2), sections: sections.map(s => s.id + ':' + s.count).join(' '), dynMode: hasDyn ? 'velocity' : 'density',
    dynHist: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(g => dyn.split('').filter(c => +c === g).length).join(','), cues: cueOut.length, patterns: [...new Set(grid.map(g => g[2]))].join('/'),
    bpmRange: Math.round(Math.min(...beatBpm)) + '-' + Math.round(Math.max(...beatBpm)), agree: Object.keys(agree).map(k => k + ' ' + Math.round(100 * agree[k][0] / agree[k][1]) + '%').join(' ') };
  return { out, summary };
}

fs.mkdirSync(OUT, { recursive: true });
const index = [];
let total = 0;
PIECES.forEach(P => {
  const { out, summary } = build(P);
  const json = JSON.stringify(out);
  fs.writeFileSync(path.join(OUT, P.id + '.json'), json + '\n');
  total += json.length;
  console.log(JSON.stringify(summary), (json.length / 1024).toFixed(0) + ' KB');
  const cnt = {}; out.grid.forEach(g => { cnt[g[2]] = (cnt[g[2]] || 0) + g[1]; });
  const pattern = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  index.push({ id: P.id, pattern, title: P.title, composer: P.composer, mvt: P.mvt, year: P.year, level: P.level, blurb: P.blurb, minutes: summary.minutes, nBeats: out.nBeats, needs: out.needs,
    src: out.src, sections: out.sec.map(s => s.id) });
});
const crypto = require('crypto'); const bh = crypto.createHash('sha1'); PIECES.forEach(P => bh.update(fs.readFileSync(path.join(OUT, P.id + '.json'))));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ v: 1, build: bh.digest('hex').slice(0, 10), pieces: index }) + '\n');
console.log('total', (total / 1024).toFixed(0) + ' KB');
