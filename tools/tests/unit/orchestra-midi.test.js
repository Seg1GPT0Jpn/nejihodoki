// orchestra/midi.js: our own Standard MIDI File reader (no third-party code). Hand-built files for the edge cases, the real Mutopia files for the real thing.
// 実行：node tools/tests/unit/orchestra-midi.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, throws, run } = require('./_kobo-env');
const M = require(path.join(ROOT, 'orchestra/midi.js'));

const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255], u16 = n => [n >> 8 & 255, n & 255];
const vlq = n => { const o = [n & 127]; while ((n >>= 7)) o.unshift((n & 127) | 128); return o; };
const str = s => [...s].map(c => c.charCodeAt(0));
const chunk = (id, body) => [...str(id), ...u32(body.length), ...body];
const smf = (fmt, div, tracks) => Uint8Array.from([...chunk('MThd', [...u16(fmt), ...u16(tracks.length), ...u16(div)]), ...tracks.flatMap(t => chunk('MTrk', t))]);

test('reads tempo, time signature, track name, program and notes (running status, velocity-0 note-off, SysEx and unknown meta skipped)', () => {
  const t0 = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, /* 500000 us */ 0, 0xff, 0x58, 4, 3, 2, 24, 8, /* 3/4 */ 0, 0xff, 0x2f, 0];
  const t1 = [0, 0xff, 0x03, 5, ...str('Flute'), 0, 0xc2, 73, 0, 0x92, 60, 100, 96, 60, 0 /* running status, vel 0 = off */, 0, 0xf0, 3, 1, 2, 0xf7, 0, 0xff, 0x7f, 2, 9, 9,
    0, 0x92, 64, 90, 0x81, 0x40, 0x82, 64, 0, 0, 0xff, 0x2f, 0];
  const p = M.parse(smf(1, 96, [t0, t1]));
  eq(p.format, 1); eq(p.division, 96); eq(p.tracks.length, 2);
  eq(p.tempos[0].uspq, 500000); eq(p.timeSigs[0].num, 3); eq(p.timeSigs[0].den, 4);
  eq(p.tracks[1].name, 'Flute'); eq(p.tracks[1].program, 73); eq(p.tracks[1].channel, 2);
  const n = M.notes(p.tracks[1]);
  eq(n.length, 2); eq(n[0].note, 60); eq(n[0].tick, 0); eq(n[0].dur, 96); eq(n[0].vel, 100); eq(n[1].note, 64); eq(n[1].tick, 96); eq(n[1].dur, 192);
});

test('a missing tempo means 120 bpm; unterminated notes end with the track; the same note twice is paired first-in-first-out', () => {
  const t = [0, 0x90, 60, 80, 10, 0x90, 60, 80, 10, 0x80, 60, 0, 10, 0x80, 60, 0, 30, 0x90, 62, 80, 50, 0xff, 0x2f, 0];
  const p = M.parse(smf(0, 480, [t]));
  eq(p.tempos[0].uspq, 500000);
  const n = M.notes(p.tracks[0]);
  eq(n.length, 3); eq(n[0].tick, 0); eq(n[0].dur, 20); eq(n[1].tick, 10); eq(n[1].dur, 20); eq(n[2].note, 62); eq(n[2].dur, 50);
});

test('bad input is refused with a clear error, not a hang', () => {
  throws(() => M.parse(Uint8Array.from(str('RIFFxxxxxxxxxxxx'))), 'not midi');
  throws(() => M.parse(smf(1, 0x8000 | 25, [[0, 0xff, 0x2f, 0]])), 'smpte');
  throws(() => M.parse(smf(1, 0, [[0, 0xff, 0x2f, 0]])), 'zero division');
  const good = smf(0, 96, [[0, 0x90, 60, 80, 96, 0x80, 60, 0, 0, 0xff, 0x2f, 0]]);
  throws(() => M.parse(good.subarray(0, good.length - 9)), 'truncated');
  throws(() => M.parse(smf(0, 96, [[0, 0x90, 60]])), 'truncated event');
  throws(() => M.parse(smf(0, 96, [[0, 0xff, 0x01, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]])), 'overlong vlq');
});

test('pitch bend, pressure and controllers are skipped with the right number of data bytes', () => {
  const t = [0, 0xe0, 1, 2, 0, 0xa0, 60, 5, 0, 0xd0, 7, 0, 0xb0, 7, 100, 0, 0x90, 61, 70, 48, 0x80, 61, 0, 0, 0xff, 0x2f, 0];
  const p = M.parse(smf(0, 96, [t])); const n = M.notes(p.tracks[0]);
  eq(n.length, 1); eq(n[0].note, 61); eq(n[0].dur, 48);
  eq(p.tracks[0].events.filter(e => e.type === 'cc').length, 1);
});

test('the real Mutopia files parse: Beethoven 5 (13 tracks, 192 bpm, 2/4) and Egmont (3 tempos, 3 meters)', () => {
  const dir = path.join(ROOT, 'tools/orchestra-midi');
  const b5 = M.parse(new Uint8Array(fs.readFileSync(path.join(dir, 'Symphony5_1.mid'))));
  eq(b5.division, 384); eq(b5.tracks.length, 13); eq(Math.round(6e7 / b5.tempos[0].uspq), 192); eq(b5.timeSigs[0].num, 2);
  const counts = b5.tracks.map(t => M.notes(t).length); ok(counts.slice(1).every(c => c > 200), JSON.stringify(counts));
  const eg = M.parse(new Uint8Array(fs.readFileSync(path.join(dir, 'Egmont.mid'))));
  eq(eg.tempos.length, 3); eq(eg.timeSigs.map(s => s.num + '/' + s.den).join(','), '3/2,3/4,4/4');
  for (const f of fs.readdirSync(dir, { recursive: true })) if (/\.mid$/.test(f)) { const p = M.parse(new Uint8Array(fs.readFileSync(path.join(dir, f)))); ok(p.tracks.length >= 4 && p.endTick > 0, f); }
});

run('orchestra-midi');
