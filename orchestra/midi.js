// orchestra/midi.js — a small Standard MIDI File (SMF) reader written for this game (no third-party code).
// UMD: window.OrchMidi in the browser, module.exports in Node (used by tools/build-orchestra-scores.js and the unit tests).
//   OrchMidi.parse(bytes: Uint8Array|Buffer) -> { format, division, tracks: [{ name, program, channel, events }], tempos: [{tick, uspq}],
//       timeSigs: [{tick, num, den}], endTick }
//   events: { tick, type: 'on'|'off'|'prog'|'cc', note, vel, ch, ... }; running status, meta events, SysEx and note-on with velocity 0 are handled.
//   OrchMidi.notes(track) -> [{ tick, dur, note, vel }] pairs on/off per (channel, note), FIFO; unterminated notes end at track end.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrchMidi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function Reader(b) { this.b = b; this.p = 0; }
  Reader.prototype.u8 = function () { if (this.p >= this.b.length) throw new Error('midi: unexpected end'); return this.b[this.p++]; };
  Reader.prototype.u16 = function () { return (this.u8() << 8) | this.u8(); };
  Reader.prototype.u32 = function () { return ((this.u8() * 16777216) + (this.u8() << 16) + (this.u8() << 8) + this.u8()); };
  Reader.prototype.vlq = function () {
    var v = 0, c, n = 0;
    do { c = this.u8(); v = (v * 128) + (c & 0x7f); if (++n > 5) throw new Error('midi: bad variable-length value'); } while (c & 0x80);
    return v;
  };
  Reader.prototype.str = function (n) { var s = ''; for (var i = 0; i < n; i++) s += String.fromCharCode(this.u8()); return s; };

  function latin1(s) {
    // MIDI text is nominally Latin-1/ASCII; keep it printable.
    return s.replace(/[\u0000-\u001f]/g, '').trim();
  }

  function parse(bytes) {
    var r = new Reader(bytes);
    if (r.str(4) !== 'MThd') throw new Error('midi: not a MIDI file');
    var hl = r.u32(); var format = r.u16(), ntrk = r.u16(), division = r.u16();
    if (division & 0x8000) throw new Error('midi: SMPTE time division is not supported');
    if (!division) throw new Error('midi: zero division');
    r.p = 8 + hl;
    var out = { format: format, division: division, tracks: [], tempos: [], timeSigs: [], endTick: 0 };
    for (var t = 0; t < ntrk; t++) {
      if (r.p >= bytes.length) break;
      var id = r.str(4), len = r.u32(), end = Math.min(bytes.length, r.p + len);
      if (id !== 'MTrk') { r.p = end; continue; }
      var tr = { name: '', program: -1, channel: -1, events: [], endTick: 0 };
      var tick = 0, status = 0;
      while (r.p < end) {
        tick += r.vlq();
        var b = r.u8();
        if (b === 0xff) {
          var mt = r.u8(), ml = r.vlq(), mp = r.p; r.p += ml;
          var d = bytes.subarray(mp, mp + ml);
          if (mt === 0x03 && !tr.name) { var s = ''; for (var i = 0; i < d.length; i++) s += String.fromCharCode(d[i]); tr.name = latin1(s); }
          else if (mt === 0x51 && ml === 3) out.tempos.push({ tick: tick, uspq: (d[0] << 16) | (d[1] << 8) | d[2] });
          else if (mt === 0x58 && ml >= 2) out.timeSigs.push({ tick: tick, num: d[0], den: Math.pow(2, d[1]) });
          else if (mt === 0x2f) { tr.endTick = tick; break; }
          continue;
        }
        if (b === 0xf0 || b === 0xf7) { var sl = r.vlq(); r.p += sl; continue; }
        var data1;
        if (b & 0x80) { status = b; data1 = r.u8(); } else { data1 = b; if (!status) throw new Error('midi: running status without status'); }
        var kind = status >> 4, ch = status & 15;
        if (kind === 0x9 || kind === 0x8) {
          var vel = r.u8();
          var on = kind === 0x9 && vel > 0;
          tr.events.push({ tick: tick, type: on ? 'on' : 'off', note: data1, vel: vel, ch: ch });
          if (tr.channel < 0) tr.channel = ch;
        } else if (kind === 0xc) { tr.events.push({ tick: tick, type: 'prog', program: data1, ch: ch }); if (tr.program < 0) tr.program = data1; }
        else if (kind === 0xd) { /* channel pressure: one data byte, ignored */ }
        else if (kind === 0xb) { tr.events.push({ tick: tick, type: 'cc', cc: data1, val: r.u8(), ch: ch }); }
        else { r.u8(); } // 0xA poly pressure, 0xE pitch bend: two data bytes, ignored
      }
      if (!tr.endTick) tr.endTick = tick;
      if (tr.endTick > out.endTick) out.endTick = tr.endTick;
      r.p = end;
      out.tracks.push(tr);
    }
    out.tempos.sort(function (a, b) { return a.tick - b.tick; });
    if (!out.tempos.length || out.tempos[0].tick > 0) out.tempos.unshift({ tick: 0, uspq: 500000 });
    return out;
  }

  function notes(track) {
    var open = {}, res = [];
    track.events.forEach(function (e) {
      if (e.type !== 'on' && e.type !== 'off') return;
      var k = e.ch * 128 + e.note;
      if (e.type === 'on') { (open[k] = open[k] || []).push(e); }
      else if (open[k] && open[k].length) { var o = open[k].shift(); res.push({ tick: o.tick, dur: Math.max(1, e.tick - o.tick), note: o.note, vel: o.vel }); }
    });
    Object.keys(open).forEach(function (k) { open[k].forEach(function (o) { res.push({ tick: o.tick, dur: Math.max(1, track.endTick - o.tick), note: o.note, vel: o.vel }); }); });
    res.sort(function (a, b) { return a.tick - b.tick || a.note - b.note; });
    return res;
  }

  return { parse: parse, notes: notes };
});
