// orchestra/sampler.js — the orchestra's sound: a Web Audio sampler for the VSCO 2 CE bank (orchestra/samples/, built by tools/build-orchestra-samples.js).
// UMD: window.OrchSampler in the browser; the pure helpers (pitch math, impulse response, dynamics curves) also load in Node for the unit tests.
//
//   Bank       fetches + decodes only the instrument/articulation files a piece needs (lazy, 6 at a time, progress callback), measures memory
//   Hall       the room: one bus per section (dynamics gain, brightness lowpass, seat pan, depth delay, reverb send), a shared convolution reverb, master compressor + limiter
//   Player     the sink the engine's Session writes to: noteOn/noteOff/maintain/setLevel/releaseAll. Looks after voices, looping and crossfades.
//
// Pitch: every sample carries its measured pitch `m`; a note takes the nearest sample and is shifted with playbackRate (|shift| is normally <= 2 semitones).
// Dynamics: two recorded layers (soft/loud) are crossfaded by the conductor's level, then the section gain and a lowpass follow it. No time-stretching anywhere.
// Sustained notes longer than the recording loop its steady part with an equal-power crossfade, so the sound never repeats a click.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrchSampler = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  // ---- pure helpers ---------------------------------------------------------------------------------------------------------------------------
  function rateFor(midi, root) { return Math.pow(2, (midi - root) / 12); }
  // the sample whose root is nearest to `midi` (ties go to the lower root, i.e. shifting up). Unpitched banks (no m) return the first entry.
  // A note more than `maxShift` semitones from every root (e.g. a clarinet high C, above the highest recording) is folded by octaves until it is close enough,
  // instead of being resampled into a chipmunk: the harmony stays, the register changes by an octave (`fold` = octaves moved).
  function pickNote(notes, midi, maxShift) {
    if (!notes.length) return null;
    if (notes[0].m == null) return { note: notes[0], rate: 1, shift: 0, fold: 0 };
    const lim = maxShift == null ? 8 : maxShift;
    const near = x => { let best = null, bd = 1e9; for (let i = 0; i < notes.length; i++) { const d = Math.abs(notes[i].m - x); if (d < bd - 1e-9) { bd = d; best = notes[i]; } } return [best, bd]; };
    let [best, bd] = near(midi), fold = 0, target = midi;
    if (bd > lim) for (let k = 1; k <= 3 && bd > lim; k++) for (const sgn of [1, -1]) { const [b2, d2] = near(midi + sgn * 12 * k); if (d2 <= lim) { best = b2; bd = d2; fold = sgn * k; target = midi + sgn * 12 * k; break; } }
    return { note: best, rate: rateFor(target, best.m), shift: target - best.m, fold };
  }
  // dynamics level 0..1 -> gain (dB range -28..0)
  function dynGain(level) { const l = clamp(level, 0, 1); return Math.pow(10, (-28 + 28 * Math.pow(l, 0.85)) / 20); }
  function cutoffHz(level, back) { return clamp((1000 + 15500 * Math.pow(clamp(level, 0, 1), 1.15)) * (1 - 0.22 * (back || 0)), 900, 19000); }
  // soft/loud crossfade weights for a level (equal-power); level <= 0.32 all soft, >= 0.62 all loud
  function layerMix(level) { const x = clamp((level - 0.32) / 0.30, 0, 1); return { soft: Math.cos(x * Math.PI / 2), loud: Math.sin(x * Math.PI / 2) }; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  // Procedural hall impulse response (stereo): early reflections, then a decorrelated noise tail that decays exponentially and darkens with time. Energy-normalised.
  function makeImpulse(sr, o) {
    o = o || {}; const secs = o.seconds || 2.7, rt60 = o.rt60 || 2.1, pre = o.pre != null ? o.pre : 0.014, n = Math.floor(sr * secs), rng = mulberry32(o.seed || 1789);
    const out = [new Float32Array(n), new Float32Array(n)];
    const taps = [7, 11.5, 17, 23, 31, 41, 52, 66];
    for (let c = 0; c < 2; c++) {
      const x = out[c]; let lp = 0;
      for (let i = Math.floor(pre * sr); i < n; i++) {
        const t = i / sr, env = Math.exp(-6.9078 * t / rt60) * Math.min(1, (t - pre) / 0.012);
        const a = 0.55 * Math.exp(-t / 0.7) + 0.05; // cutoff coefficient: bright at first, dark at the end of the tail
        lp += a * ((rng() * 2 - 1) - lp); x[i] = lp * env * 2.2;
      }
      taps.forEach((ms, k) => { const i = Math.floor((ms + (c ? 1.7 : 0)) / 1000 * sr + pre * sr * 0.4); if (i < n) x[i] += (rng() < 0.5 ? -1 : 1) * 0.5 * Math.pow(0.82, k); });
      // a soft fade at the very end
      const f = Math.floor(sr * 0.25); for (let i = 0; i < f; i++) x[n - 1 - i] *= i / f;
    }
    let e = 0; for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) e += out[c][i] * out[c][i];
    const g = 1 / Math.sqrt(e / 2); for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) out[c][i] *= g;
    return out;
  }
  // which files does a piece need? needs: { vln: ['l','s'], timp: ['l'] }, tier 'hi' | 'lo'
  function planLoad(bank, needs, artFor, tier) {
    const list = [];
    Object.keys(needs).forEach(inst => {
      const e = bank.instruments[inst]; if (!e) return;
      const arts = new Set(needs[inst].map(k => artFor(inst, k === 's')));
      arts.forEach(art => { const a = e.arts[art]; if (!a) return; a.notes.forEach(n => { const fs = tier === 'lo' ? [n.f[n.f.length - 1]] : n.f; fs.forEach(f => list.push({ inst, art, f })); }); });
    });
    return list;
  }

  // ---- decoding -------------------------------------------------------------------------------------------------------------------------------
  function decode(ctx, ab) {
    return new Promise((res, rej) => { try { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } });
  }
  // the first sample louder than 4 % of the peak of the first half second (mp3 decoders without gapless support start with ~25 ms of silence)
  function onsetOf(buf) {
    const d = buf.getChannelData(0), sr = buf.sampleRate, lim = Math.min(d.length, Math.floor(sr * 0.5));
    let pk = 0; for (let i = 0; i < lim; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
    const th = pk * 0.04; let i = 0; while (i < lim && Math.abs(d[i]) < th) i++;
    return Math.max(0, i / sr - 0.004);
  }

  function Bank(o) { this.ctx = o.ctx; this.base = o.base; this.json = null; this.rec = {}; this.bytes = 0; this.files = 0; this.tier = o.tier || 'hi'; this.fetch = o.fetch || (typeof fetch === 'function' ? fetch.bind(typeof self !== 'undefined' ? self : globalThis) : null); }
  Bank.prototype.loadIndex = async function () {
    if (this.json) return this.json;
    const r = await this.fetch(this.base + 'bank.json'); if (!r.ok) throw new Error('bank.json ' + r.status);
    this.json = await r.json(); return this.json;
  };
  // needs: { inst: ['l'|'s'] } ; onProgress(done, total)
  Bank.prototype.load = async function (needs, artFor, onProgress) {
    const J = await this.loadIndex(), plan = planLoad(J, needs, artFor, this.tier), total = plan.length; let done = 0, next = 0;
    const self = this;
    async function worker() {
      while (next < plan.length) {
        const it = plan[next++]; const key = it.f;
        if (!self.rec[key]) {
          try {
            const r = await self.fetch(self.base + it.f + (J.build ? '?b=' + J.build : '')); if (!r.ok) throw new Error(it.f + ' ' + r.status);
            const buf = await decode(self.ctx, await r.arrayBuffer());
            self.rec[key] = { buf, onset: onsetOf(buf) }; self.bytes += buf.length * buf.numberOfChannels * 4; self.files++;
          } catch (e) { self.rec[key] = null; if (self.onError) self.onError(e, it); }
        }
        done++; if (onProgress) onProgress(done, total);
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    return { files: this.files, bytes: this.bytes };
  };
  Bank.prototype.art = function (inst, art) { const e = this.json && this.json.instruments[inst]; return e && e.arts[art] ? { def: e.arts[art], gain: e.gain } : null; };

  // ---- the hall -------------------------------------------------------------------------------------------------------------------------------
  // sections: [{ id, inst, pan, back, mix }]
  function Hall(ctx, out, sections, o) {
    o = o || {}; this.ctx = ctx; this.buses = {};
    const mk = (n) => ctx['create' + n]();
    this.sum = mk('Gain'); this.comp = mk('DynamicsCompressor'); this.master = mk('Gain'); this.lim = mk('DynamicsCompressor');
    this.comp.threshold.value = -16; this.comp.knee.value = 14; this.comp.ratio.value = 2.6; this.comp.attack.value = 0.012; this.comp.release.value = 0.35;
    this.lim.threshold.value = -2; this.lim.knee.value = 0; this.lim.ratio.value = 20; this.lim.attack.value = 0.002; this.lim.release.value = 0.12;
    this.master.gain.value = o.master != null ? o.master : 1.15;
    this.sum.connect(this.comp); this.comp.connect(this.master); this.master.connect(this.lim); this.lim.connect(out);
    // reverb
    this.conv = ctx.createConvolver(); this.convIn = mk('Gain'); this.wet = mk('Gain'); this.wet.gain.value = o.wet != null ? o.wet : 0.55;
    const ir = makeImpulse(ctx.sampleRate, { seed: 1789 }), buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate); buf.getChannelData(0).set(ir[0]); buf.getChannelData(1).set(ir[1]);
    this.conv.buffer = buf; this.convIn.connect(this.conv); this.conv.connect(this.wet); this.wet.connect(this.sum);
    sections.forEach(s => {
      const inG = mk('Gain'), lp = mk('BiquadFilter'), send = mk('Gain'), pre = mk('Delay'), dry = mk('Gain');
      lp.type = 'lowpass'; lp.Q.value = 0.45; lp.frequency.value = cutoffHz(0.5, s.back);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) pan.pan.value = clamp(s.pan, -1, 1);
      inG.connect(lp); lp.connect(pan || dry); if (pan) pan.connect(dry); dry.gain.value = 1 - 0.35 * s.back; dry.connect(this.sum);
      send.gain.value = 0.28 + 0.5 * s.back; pre.delayTime.value = 0.004 + 0.022 * s.back; lp.connect(send); send.connect(pre); pre.connect(this.convIn);
      this.buses[s.id] = { in: inG, lp, pan, send, mix: s.mix == null ? 1 : s.mix, back: s.back, cue: 1 };
    });
  }
  Hall.prototype.setLevel = function (level, t) {
    const T = t == null ? this.ctx.currentTime : Math.max(t, this.ctx.currentTime), g = dynGain(level);
    for (const id in this.buses) {
      const b = this.buses[id];
      b.in.gain.setTargetAtTime(g * b.mix, T, 0.07);
      b.lp.frequency.setTargetAtTime(cutoffHz(level, b.back), T, 0.07);
    }
  };
  Hall.prototype.fadeOut = function (sec) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(0.0001, t, sec / 4); };
  Hall.prototype.dispose = function () { try { this.sum.disconnect(); this.lim.disconnect(); } catch (e) {} };

  // ---- voices ---------------------------------------------------------------------------------------------------------------------------------
  const CURVE = 24, CURVE_IN = new Float32Array(CURVE), CURVE_OUT = new Float32Array(CURVE);
  for (let i = 0; i < CURVE; i++) { const x = i / (CURVE - 1); CURVE_IN[i] = Math.sin(x * Math.PI / 2); CURVE_OUT[i] = Math.cos(x * Math.PI / 2); }
  const REL = { vln: 0.22, vla: 0.22, vc: 0.24, cb: 0.26, fl: 0.12, ob: 0.1, cl: 0.12, fg: 0.12, hn: 0.14, tp: 0.09, tb: 0.12, tu: 0.14, timp: 1.5, bd: 1.5, cym: 2.5, harp: 1.0 };
  const ATK = { vln: 0.075, vla: 0.08, vc: 0.085, cb: 0.09, fl: 0.05, ob: 0.035, cl: 0.04, fg: 0.045, hn: 0.05, tp: 0.025, tb: 0.04, tu: 0.05 };
  const JIT = { vln: 0.012, vla: 0.012, vc: 0.01, cb: 0.01, fl: 0.007, ob: 0.007, cl: 0.007, fg: 0.007, hn: 0.008, tp: 0.006, tb: 0.007, tu: 0.007, timp: 0, bd: 0, cym: 0 };

  // One note. layers: [{ buf, onset, w }] (1 or 2 recorded layers with their crossfade weights). def: the articulation entry (loop region, length).
  function Voice(ctx, bus, rec, rate, gain, short, atk, rel, t, rng, detune) {
    this.ctx = ctx; this.rec = rec; this.rate = rate; this.gain = gain; this.short = short; this.rel = rel; this.t = t; this.end = Infinity; this.dead = false;
    this.relG = ctx.createGain(); this.relG.connect(bus); this.segs = []; this.next = 0; this.detune = detune; this.rng = rng; this.atk = atk;
    this.loop = rec.def.loop; this.seg0 = t; this.firstDur = 0;
    this._seg(t, true);
  }
  // schedule one playback segment of each active layer starting at time `t`
  Voice.prototype._seg = function (t, first) {
    const ctx = this.ctx, r = this.rate, rec = this.rec, L = this.loop;
    const idx = this.segs.length; let realDur = 0;
    rec.layers.forEach(layer => {
      if (layer.w < 0.01) return;
      const buf = layer.buf, base = Math.max(0, layer.onset - 0.002), ls = L ? base + L[0] + (idx % 3) * 0.06 : 0, le = L ? Math.min(buf.duration, base + L[1] + 0.004) : buf.duration;
      const off = first ? base : ls, dur = (L ? le : buf.duration) - off; if (dur <= 0.01) return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = r; if (this.detune) src.detune.value = this.detune;
      const g = ctx.createGain(); src.connect(g); g.connect(this.relG);
      const peak = this.gain * layer.w;
      if (first) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + this.atk); }
      else { const xf = this.xf; g.gain.setValueAtTime(0, t); g.gain.setValueCurveAtTime(CURVE_IN.map(v => v * peak), t, xf); }
      realDur = dur / r;
      // fade out at the end of this segment when it will be followed by another one
      let willLoop = !!L;
      if (willLoop) { this.xf = Math.min(0.4, (le - ls) * 0.22) / r; const fo = t + realDur - this.xf; if (fo > t + (first ? this.atk : this.xf) + 0.01) g.gain.setValueCurveAtTime(CURVE_OUT.map(v => v * peak), fo, this.xf); }
      src.start(t, off, dur);
      const seg = { src, g, t, end: t + realDur };
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) {} };
      (this._cur || (this._cur = [])).push(seg);
    });
    const cur = this._cur || []; this._cur = null;
    if (cur.length) { this.segs.push(cur); this.next = t + realDur - (L ? this.xf : 0); this.lastEnd = t + realDur; }
    else this.dead = true;
  };
  // make sure the sound exists up to `until` (looping a sustained note). Returns true while the voice still needs attention.
  Voice.prototype.extend = function (until) {
    if (this.dead || !this.loop) return false;
    let guard = 0;
    while (this.next < until && this.next < this.end && guard++ < 6) this._seg(this.next, false);
    return this.next < this.end;
  };
  Voice.prototype.release = function (t, rel) {
    if (this.end !== Infinity) return;
    rel = rel == null ? this.rel : rel; t = Math.max(t, this.t + 0.03); this.end = t;
    const g = this.relG.gain; g.setValueAtTime(1, t); g.linearRampToValueAtTime(0.0001, t + rel);
    const stopAt = t + rel + 0.04;
    this.segs.forEach(layers => layers.forEach(s => { if (s.end > t) { try { s.src.stop(stopAt); } catch (e) {} } }));
    this.stopAt = stopAt;
  };
  Voice.prototype.finishedBy = function (now) { if (this.dead) return true; if (this.end !== Infinity) return this.stopAt < now; return this.loop ? false : (this.lastEnd || 0) < now - 0.05; };

  // ---- the player -----------------------------------------------------------------------------------------------------------------------------
  // o: { ctx, out, bank, sections: [{ id, inst, ... }], artFor, seed }
  function Player(o) {
    this.ctx = o.ctx; this.bank = o.bank; this.artFor = o.artFor; this.secs = o.sections; this.rng = mulberry32(o.seed || 7);
    this.hall = new Hall(o.ctx, o.out, o.sections.map(s => ({ id: s.id, pan: s.pan, back: s.back, mix: s.mix })), o.hall);
    this.voices = new Map(); this.level = 0.5; this.maxVoices = o.maxVoices || 72; this.lastLevelAt = -1; this.count = 0; this.stolen = 0;
  }
  Player.prototype.setLevel = function (level, t) {
    this.level = level;
    if (Math.abs(level - (this._sentLevel == null ? -9 : this._sentLevel)) > 0.004 || (t || 0) - this.lastLevelAt > 0.25) { this._sentLevel = level; this.lastLevelAt = t || 0; this.hall.setLevel(level, this.ctx.currentTime); }
  };
  Player.prototype.noteOn = function (t, si, pitch, short, gain, id, vel) {
    const sec = this.secs[si]; if (!sec) return null;
    let art = this.artFor(sec.inst, !!short), a = this.bank.art(sec.inst, art);
    if (!a && short) { art = this.artFor(sec.inst, false); a = this.bank.art(sec.inst, art); }
    if (!a) return null;
    const pk = pickNote(a.def.notes, pitch); if (!pk) return null;
    const mix = layerMix(this.level), n = pk.note, recs = n.f.map(f => this.bank.rec[f]).filter(Boolean);
    if (!recs.length) return null;
    // [soft, loud] when both exist
    let layers;
    if (recs.length === 2 && art !== 'hit') layers = [{ buf: recs[0].buf, onset: recs[0].onset, w: mix.soft }, { buf: recs[1].buf, onset: recs[1].onset, w: mix.loud }];
    else if (recs.length === 2) layers = this.level < 0.5 ? [{ buf: recs[0].buf, onset: recs[0].onset, w: 1 }] : [{ buf: recs[1].buf, onset: recs[1].onset, w: 1 }];
    else layers = [{ buf: recs[0].buf, onset: recs[0].onset, w: 1 }];
    const inst = sec.inst, rng = this.rng, jit = (JIT[inst] || 0.006) * (rng() * 2 - 1);
    const T = Math.max(this.ctx.currentTime, t + jit), pk2 = pk.rate;
    const g = gain * (a.gain || 1) * (0.93 + 0.14 * rng()) * (short && art !== 'hit' ? 1.15 : 1);
    const bus = this.hall.buses[sec.id].in;
    if (this.voices.size >= this.maxVoices) this._steal(T);
    const v = new Voice(this.ctx, bus, { layers, def: a.def }, pk2, g, !!short, ATK[inst] != null ? (short ? 0.004 : ATK[inst]) : 0.003, REL[inst] || 0.12, T, rng, (rng() * 2 - 1) * 3 + ((si * 7) % 5 - 2) * 1.6); // a few cents apart per section so unisons (violins I / II) do not phase
    if (v.dead) return null;
    v.sticky = art === 'hit' || art === 'pizz' || art === 'pluck'; // rings out by itself
    this.voices.set(id, v); this.count++;
    return v;
  };
  Player.prototype.noteOff = function (t, id) {
    const v = this.voices.get(id); if (!v) return;
    if (v.sticky) { v.end = Infinity; v.ringUntil = t + 3; return; }
    v.release(t, v.short ? Math.min(v.rel, 0.09) : v.rel);
  };
  Player.prototype._steal = function (T) {
    let oldest = null; this.voices.forEach((v, k) => { if (!oldest || v.t < oldest[1].t) oldest = [k, v]; });
    if (oldest) { oldest[1].end = Infinity; oldest[1].release(Math.max(T, oldest[1].t + 0.03), 0.03); this.stolen++; this.voices.delete(oldest[0]); }
  };
  Player.prototype.maintain = function (until) {
    const now = this.ctx.currentTime;
    this.voices.forEach((v, id) => {
      v.extend(until);
      if (v.sticky && v.ringUntil && v.ringUntil < now) this.voices.delete(id);
      else if (!v.sticky && v.finishedBy(now)) this.voices.delete(id);
      else if (v.sticky && !v.ringUntil && v.lastEnd && v.lastEnd < now - 0.1) this.voices.delete(id);
    });
  };
  Player.prototype.releaseAll = function (t, rel) { this.voices.forEach(v => { v.sticky = false; v.end = Infinity; v.release(Math.max(t, this.ctx.currentTime), rel || 0.2); }); this.voices.clear(); };
  Player.prototype.dispose = function () { this.releaseAll(this.ctx.currentTime, 0.05); this.hall.dispose(); };

  return { rateFor, pickNote, dynGain, cutoffHz, layerMix, mulberry32, makeImpulse, planLoad, onsetOf, Bank, Hall, Player, Voice, REL, ATK };
});
