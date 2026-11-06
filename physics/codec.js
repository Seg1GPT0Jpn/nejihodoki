// ころころ工房 — levels made in the editor, and the share codes that carry them (no server: the code is the whole level).
// Runs in the page (window.PhysicsCodec) and in node (require('physics/codec.js')) for tools/tests/unit/physics-codec.test.js.
//
// A made level ("def") is { title, items: [{ k, x, y, w?, h?, a?, b?, s? }], parts: { plank: 2, ... }, par }.
//   items: 'ball' (1–3, b: 0 yarn / 1 bell), 'goal' (exactly 1), 'wall' / 'ice' / 'rubber' (w × h, angle a), 'glass' (w × h, no parts there),
//   'gear' (a collectible), 'spin' (a paddle wheel: length w, angle a, s: 1 = clockwise), 'crate' (size w, angle a),
//   'rope' (a crate hanging from the anchor x, y: rope length w, angle a), and the fixed gadgets 'spring' 'fan' 'belt' 'magnet' 'seesaw' (angle a), 'weight'.
//   compile(def) turns it into a level of levels.js's shape for engine.js.
//
// The code: base64url of [version 1][flags (bit 0: deflate-raw)][body][CRC-32 of everything before it, big-endian].
//   body: nick, title (u8 length + UTF-8), par, the tray (n × [part, count]), the items (n × [kind, x, y, …]) and the proof
//   (the creator's own parts that clear it: n × [part, x, y, angle]). Positions and sizes are in 1/100 of a unit (u16), angles in
//   whole degrees + 180 (u16). Every value the editor makes is a multiple of 1/100 or a whole degree, so a decoded level is the
//   same doubles as the creator's, and the proof replays to the same result on every device (engine.js is deterministic).
// Codes come from strangers: decode() checks the length, the alphabet, the checksum, the version, inflates with a size cap
// (its own inflate: no zip bombs, works without DecompressionStream), reads every field with bounds checks, rejects unknown kinds,
// wrong counts and trailing bytes, and clamps every number. Text is cleaned (no control / bidi / zero-width characters, no < >)
// and is only ever shown with textContent.
(function (root) {
  'use strict';
  var PE = root.PhysicsEngine || (typeof require === 'function' ? require('./engine.js') : null);

  var VERSION = 1;
  var MAX_CODE = 2048;      // characters of a code (a level is ~100–700 bytes before deflate)
  var MAX_RAW = 1024;       // bytes of a body after inflate
  var LIMITS = { items: 40, balls: 3, gears: 5, glass: 6, partEach: 5, partTotal: 12, nick: 12, title: 20 };
  var BW = 12, BH = 12;

  // kind → code byte and fields (after x, y). Sizes: [min, max]
  var KINDS = [
    { k: 'ball', f: ['b'] }, { k: 'goal', f: [] },
    { k: 'wall', f: ['w', 'h', 'a'], w: [0.1, 12], h: [0.1, 12] },
    { k: 'ice', f: ['w', 'h', 'a'], w: [0.1, 12], h: [0.1, 12] },
    { k: 'rubber', f: ['w', 'h', 'a'], w: [0.1, 12], h: [0.1, 12] },
    { k: 'glass', f: ['w', 'h'], w: [0.5, 12], h: [0.5, 12] },
    { k: 'gear', f: [] },
    { k: 'spin', f: ['w', 'a', 's'], w: [1, 6] },
    { k: 'crate', f: ['w', 'a'], w: [0.4, 2] },
    { k: 'rope', f: ['w', 'a'], w: [0.6, 8] },
    { k: 'spring', f: ['a'] }, { k: 'fan', f: ['a'] }, { k: 'belt', f: ['a'] }, { k: 'magnet', f: ['a'] }, { k: 'seesaw', f: ['a'] },
    { k: 'weight', f: [] },
  ];
  var KIND = {}; KINDS.forEach(function (d, i) { d.code = i; KIND[d.k] = d; });
  var PART_IDS = PE.PART_IDS;

  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  function clamp(v, lo, hi) { v = +v; if (!isFinite(v)) v = lo; return v < lo ? lo : v > hi ? hi : v; }
  function ang(a) { a = Math.round(+a || 0); a = ((a % 360) + 540) % 360 - 180; return a === -180 ? 180 : a; }

  // ------------------------------------------------------------------ text (the same rule as the platform's nicknames, plus invisible characters)
  function cleanText(s, max) {
    s = String(s == null ? '' : s);
    try { s = s.normalize('NFC'); } catch (e) {}
    s = s.replace(/[\u0000-\u001f\u007f-\u009f<>​-‏‪-‮⁠-⁩﻿￹-￻]/g, '').replace(/\s+/g, ' ').trim();
    var cps = Array.from(s);
    return cps.length > max ? cps.slice(0, max).join('').trim() : s;
  }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [], b = unescape(encodeURIComponent(s)); for (var i = 0; i < b.length; i++) out.push(b.charCodeAt(i)); return new Uint8Array(out);
  }
  function unutf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return decodeURIComponent(escape(s));
  }

  // ------------------------------------------------------------------ the def: normalise (clamp everything) and compile
  function normItem(it) {
    var d = it && KIND[it.k]; if (!d) return null;
    var o = { k: d.k, x: r2(clamp(it.x, 0, BW)), y: r2(clamp(it.y, 0, BH)) };
    d.f.forEach(function (f) {
      if (f === 'w') o.w = r2(clamp(it.w, d.w[0], d.w[1]));
      else if (f === 'h') o.h = r2(clamp(it.h, d.h[0], d.h[1]));
      else if (f === 'a') o.a = ang(it.a);
      else o[f] = it[f] ? 1 : 0;
    });
    return o;
  }
  // → a clean def, or throws err('data') when it cannot be a level (no goal, no ball, too many things)
  function normalize(def, strict) {
    if (!def || typeof def !== 'object') throw err('data', 'not a level');
    var items = [], n = { ball: 0, goal: 0, gear: 0, glass: 0 };
    var src = Array.isArray(def.items) ? def.items : [];
    if (strict && src.length > LIMITS.items) throw err('data', 'too many items');
    for (var i = 0; i < src.length && items.length < LIMITS.items; i++) {
      var o = normItem(src[i]);
      if (!o) { if (strict) throw err('data', 'unknown item'); continue; }
      if (n[o.k] != null) {
        var cap = o.k === 'ball' ? LIMITS.balls : o.k === 'goal' ? 1 : o.k === 'gear' ? LIMITS.gears : LIMITS.glass;
        if (n[o.k] >= cap) { if (strict) throw err('data', 'too many ' + o.k); continue; }
        n[o.k]++;
      }
      items.push(o);
    }
    if (!n.goal) throw err('data', 'no goal');
    if (!n.ball) throw err('data', 'no ball');
    var parts = {}, total = 0, sp = def.parts && typeof def.parts === 'object' ? def.parts : {};
    for (var p = 0; p < PART_IDS.length; p++) {
      var t = PART_IDS[p], c = Math.round(clamp(sp[t] || 0, 0, LIMITS.partEach));
      if (total + c > LIMITS.partTotal) c = LIMITS.partTotal - total;
      if (c > 0) { parts[t] = c; total += c; }
    }
    return { title: cleanText(def.title, LIMITS.title), items: items, parts: parts, par: Math.round(clamp(def.par, 1, Math.max(1, total))) };
  }
  function partTotal(def) { var s = 0; for (var k in def.parts) s += def.parts[k]; return s; }
  // what the proof is checked against: the level itself (not its title)
  function fingerprint(def) { return JSON.stringify([def.items, PART_IDS.map(function (t) { return def.parts[t] || 0; }), def.par]); }
  function normProof(ps) {
    var out = [];
    (Array.isArray(ps) ? ps : []).forEach(function (p) {
      if (out.length >= LIMITS.partTotal || !p || !PE.PARTS[p.t]) return;
      out.push({ t: p.t, x: r2(clamp(p.x, 0, BW)), y: r2(clamp(p.y, 0, BH)), a: ang(p.a) });
    });
    return out;
  }

  var ROPE_BOX = 0.8;
  // def → a level for engine.js (the same shape as levels.js)
  function compile(def, id) {
    var L = { id: id || 'my', n: [def.title || '', def.title || ''], balls: [], goal: null, parts: Object.assign({}, def.parts), par: def.par, gears: [], glass: [], objs: [], custom: true };
    def.items.forEach(function (it) {
      switch (it.k) {
        case 'ball': L.balls.push({ x: it.x, y: it.y, k: it.b ? 'bell' : 'yarn' }); break;
        case 'goal': L.goal = { x: it.x, y: it.y }; break;
        case 'wall': case 'ice': case 'rubber': L.objs.push([it.k, it.x, it.y, it.w, it.h, it.a]); break;
        case 'glass': L.glass.push([it.x - it.w / 2, it.y - it.h / 2, it.w, it.h]); break;
        case 'gear': L.gears.push([it.x, it.y]); break;
        case 'spin': L.objs.push(['spin', it.x, it.y, it.w, 0.3, it.s ? -1.8 : 1.8, it.a]); break;
        case 'crate': L.objs.push(['box', it.x, it.y, it.w, it.w, it.a, 1]); break;
        case 'rope': {
          var r = it.a * PE.DEG, bx = it.x + it.w * PE.dsin(r), by = it.y - it.w * PE.dcos(r);
          L.objs.push(['box', bx, by, ROPE_BOX, ROPE_BOX, it.a, 3]);
          L.objs.push(['rope', L.objs.length - 1, it.x, it.y, it.w]);
          break;
        }
        case 'weight': L.objs.push(['weight', it.x, it.y]); break;
        default: L.objs.push([it.k, it.x, it.y, it.a]);
      }
    });
    L.ball = L.balls[0];
    return L;
  }
  // replay the proof: { ok, why: '' | 'parts' | 'place' | 'miss' | 'free', result }
  function verify(def, proof) {
    var L = compile(def, 'verify');
    if (!proof || !proof.length) return { ok: false, why: 'parts' };
    var why = PE.validate(L, proof);
    if (why) return { ok: false, why: 'place', detail: why };
    var r = PE.run(L, proof);
    if (!r.win) return { ok: false, why: 'miss', result: r };
    return { ok: true, why: '', result: r };
  }

  // ------------------------------------------------------------------ bytes
  function Writer() { this.b = []; }
  Writer.prototype.u8 = function (v) { this.b.push(v & 255); };
  Writer.prototype.u16 = function (v) { v = Math.max(0, Math.min(65535, Math.round(v))); this.b.push(v >> 8, v & 255); };
  Writer.prototype.str = function (s, maxBytes) { var u = utf8(s); if (u.length > maxBytes) throw err('data', 'text too long'); this.u8(u.length); for (var i = 0; i < u.length; i++) this.b.push(u[i]); };
  function Reader(b) { this.b = b; this.i = 0; }
  Reader.prototype.need = function (n) { if (this.i + n > this.b.length) throw err('format', 'truncated'); };
  Reader.prototype.u8 = function () { this.need(1); return this.b[this.i++]; };
  Reader.prototype.u16 = function () { this.need(2); var v = (this.b[this.i] << 8) | this.b[this.i + 1]; this.i += 2; return v; };
  Reader.prototype.str = function (maxBytes) { var n = this.u8(); if (n > maxBytes) throw err('data', 'text too long'); this.need(n); var s = this.b.subarray(this.i, this.i + n); this.i += n; try { return unutf8(s); } catch (e) { throw err('data', 'bad text'); } };
  var NICK_BYTES = 48, TITLE_BYTES = 80;

  // { def, proof, nick } → body bytes
  function toBody(def, proof, nick) {
    var d = normalize(def), w = new Writer();
    w.str(cleanText(nick, LIMITS.nick), NICK_BYTES);
    w.str(d.title, TITLE_BYTES);
    w.u8(d.par);
    var tray = PART_IDS.filter(function (t) { return d.parts[t]; });
    w.u8(tray.length); tray.forEach(function (t) { w.u8(PART_IDS.indexOf(t)); w.u8(d.parts[t]); });
    w.u8(d.items.length);
    d.items.forEach(function (it) {
      var K = KIND[it.k]; w.u8(K.code); w.u16(it.x * 100); w.u16(it.y * 100);
      K.f.forEach(function (f) { if (f === 'a') w.u16(it.a + 180); else if (f === 'w' || f === 'h') w.u16(it[f] * 100); else w.u8(it[f]); });
    });
    var pr = normProof(proof);
    w.u8(pr.length); pr.forEach(function (p) { w.u8(PART_IDS.indexOf(p.t)); w.u16(p.x * 100); w.u16(p.y * 100); w.u16(p.a + 180); });
    return new Uint8Array(w.b);
  }
  function fromBody(bytes) {
    var r = new Reader(bytes);
    var nick = cleanText(r.str(NICK_BYTES), LIMITS.nick), title = r.str(TITLE_BYTES);
    var par = r.u8();
    var nt = r.u8(); if (nt > PART_IDS.length) throw err('data', 'tray');
    var parts = {}, seen = {};
    for (var i = 0; i < nt; i++) {
      var pi = r.u8(), c = r.u8();
      if (pi >= PART_IDS.length || seen[pi]) throw err('data', 'tray part');
      seen[pi] = 1; parts[PART_IDS[pi]] = c;
    }
    var ni = r.u8(); if (ni > LIMITS.items) throw err('data', 'too many items');
    var items = [];
    for (var j = 0; j < ni; j++) {
      var code = r.u8(), K = KINDS[code]; if (!K) throw err('data', 'unknown kind ' + code);
      var it = { k: K.k, x: r.u16() / 100, y: r.u16() / 100 };
      K.f.forEach(function (f) { if (f === 'a') it.a = r.u16() - 180; else if (f === 'w' || f === 'h') it[f] = r.u16() / 100; else it[f] = r.u8(); });
      items.push(it);
    }
    var np = r.u8(); if (np > LIMITS.partTotal) throw err('data', 'proof');
    var proof = [];
    for (var q = 0; q < np; q++) {
      var t = r.u8(); if (t >= PART_IDS.length) throw err('data', 'proof part');
      proof.push({ t: PART_IDS[t], x: r.u16() / 100, y: r.u16() / 100, a: r.u16() - 180 });
    }
    if (r.i !== bytes.length) throw err('format', 'trailing bytes');
    var def = normalize({ title: title, items: items, parts: parts, par: par }, true);
    return { def: def, proof: normProof(proof), nick: nick };
  }

  // ------------------------------------------------------------------ CRC-32, base64url
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b, n) { var c = 0xffffffff; for (var i = 0; i < n; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', B64I = {};
  for (var bi = 0; bi < 64; bi++) B64I[B64[bi]] = bi;
  function b64(bytes) {
    var s = '', i = 0;
    for (; i + 2 < bytes.length; i += 3) { var v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; s += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63]; }
    if (bytes.length - i === 1) { var a = bytes[i] << 16; s += B64[a >> 18] + B64[(a >> 12) & 63]; }
    else if (bytes.length - i === 2) { var c = (bytes[i] << 16) | (bytes[i + 1] << 8); s += B64[c >> 18] + B64[(c >> 12) & 63] + B64[(c >> 6) & 63]; }
    return s;
  }
  function unb64(s) {
    if (s.length % 4 === 1) throw err('format', 'length');
    var out = new Uint8Array(Math.floor(s.length * 3 / 4)), o = 0, acc = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64I[s[i]]; if (v == null) throw err('format', 'character');
      acc = ((acc << 6) | v) & 0xffff; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
    }
    if (acc & ((1 << bits) - 1)) throw err('format', 'padding bits'); // the unused low bits must be 0 (one code per level)
    return out.subarray(0, o);
  }

  // ------------------------------------------------------------------ inflate (RFC 1951, raw), with an output cap
  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function huff(lens, n) {
    var count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(n), i;
    for (i = 0; i < n; i++) count[lens[i]]++;
    count[0] = 0;
    var left = 1; for (i = 1; i < 16; i++) { left <<= 1; left -= count[i]; if (left < 0) throw err('format', 'bad code lengths'); }
    for (i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
    for (i = 0; i < n; i++) if (lens[i]) sym[offs[lens[i]]++] = i;
    return { count: count, sym: sym };
  }
  var FIXED = null;
  function fixedTables() {
    if (FIXED) return FIXED;
    var l = new Uint8Array(288), i;
    for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8;
    var d = new Uint8Array(30); for (i = 0; i < 30; i++) d[i] = 5;
    return (FIXED = { lit: huff(l, 288), dist: huff(d, 30) });
  }
  function inflateRaw(src, maxOut) {
    var pos = 0, bitBuf = 0, bitCnt = 0, out = new Uint8Array(Math.min(maxOut, 4096)), o = 0;
    function bits(n) {
      while (bitCnt < n) { if (pos >= src.length) throw err('format', 'deflate: out of data'); bitBuf |= src[pos++] << bitCnt; bitCnt += 8; }
      var v = bitBuf & ((1 << n) - 1); bitBuf >>>= n; bitCnt -= n; return v;
    }
    function put(v) {
      if (o >= maxOut) throw err('size', 'too big when inflated');
      if (o >= out.length) { var nb = new Uint8Array(Math.min(maxOut, out.length * 2)); nb.set(out); out = nb; }
      out[o++] = v;
    }
    function decodeSym(h) {
      var code = 0, first = 0, index = 0;
      for (var len = 1; len < 16; len++) {
        code |= bits(1);
        var c = h.count[len];
        if (code - c < first) return h.sym[index + (code - first)];
        index += c; first += c; first <<= 1; code <<= 1;
      }
      throw err('format', 'deflate: bad code');
    }
    var last;
    do {
      last = bits(1);
      var type = bits(2);
      if (type === 0) {
        bitBuf = 0; bitCnt = 0;
        if (pos + 4 > src.length) throw err('format', 'deflate: stored header');
        var len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8); pos += 4;
        if ((len ^ 0xffff) !== nlen) throw err('format', 'deflate: stored length');
        if (pos + len > src.length) throw err('format', 'deflate: stored data');
        for (var s = 0; s < len; s++) put(src[pos++]);
      } else if (type === 1 || type === 2) {
        var lit, dist;
        if (type === 1) { var F = fixedTables(); lit = F.lit; dist = F.dist; }
        else {
          var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
          if (hlit > 286 || hdist > 30) throw err('format', 'deflate: counts');
          var cl = new Uint8Array(19), k;
          for (k = 0; k < hclen; k++) cl[ORDER[k]] = bits(3);
          var ch = huff(cl, 19), lens = new Uint8Array(hlit + hdist), n = 0;
          while (n < hlit + hdist) {
            var sym = decodeSym(ch), rep = 0, val = 0;
            if (sym < 16) { lens[n++] = sym; continue; }
            if (sym === 16) { if (!n) throw err('format', 'deflate: repeat'); val = lens[n - 1]; rep = 3 + bits(2); }
            else if (sym === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (n + rep > hlit + hdist) throw err('format', 'deflate: lengths overflow');
            while (rep--) lens[n++] = val;
          }
          if (!lens[256]) throw err('format', 'deflate: no end code');
          lit = huff(lens.subarray(0, hlit), hlit); dist = huff(lens.subarray(hlit), hdist);
        }
        for (;;) {
          var sy = decodeSym(lit);
          if (sy < 256) put(sy);
          else if (sy === 256) break;
          else {
            sy -= 257; if (sy >= 29) throw err('format', 'deflate: length code');
            var L = LBASE[sy] + bits(LEXT[sy]);
            var ds = decodeSym(dist); if (ds >= 30) throw err('format', 'deflate: distance code');
            var D = DBASE[ds] + bits(DEXT[ds]);
            if (D > o) throw err('format', 'deflate: distance too far');
            for (var c2 = 0; c2 < L; c2++) put(out[o - D]);
          }
        }
      } else throw err('format', 'deflate: block type');
    } while (!last);
    return out.slice(0, o);
  }

  // ------------------------------------------------------------------ deflate (CompressionStream when there is one)
  function canDeflate() { return typeof CompressionStream !== 'undefined' && typeof Response !== 'undefined' && typeof Blob !== 'undefined'; }
  function deflateRaw(bytes) {
    try {
      var cs = new CompressionStream('deflate-raw');
      return new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer().then(function (ab) { return new Uint8Array(ab); }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function wrap(body, deflated) {
    var n = body.length + 2, b = new Uint8Array(n + 4);
    b[0] = VERSION; b[1] = deflated ? 1 : 0; b.set(body, 2);
    var c = crc32(b, n); b[n] = c >>> 24; b[n + 1] = (c >>> 16) & 255; b[n + 2] = (c >>> 8) & 255; b[n + 3] = c & 255;
    return b64(b);
  }
  // → the code (a string). opt.deflate: false to skip compression
  function encodeSync(def, proof, nick) { return wrap(toBody(def, proof, nick), false); }
  function encode(def, proof, nick, opt) {
    var body = toBody(def, proof, nick);
    if ((opt && opt.deflate === false) || !canDeflate()) return Promise.resolve(wrap(body, false));
    return deflateRaw(body).then(function (z) {
      // keep it only when it is smaller and inflates back to the same bytes
      if (z && z.length < body.length) { try { var back = inflateRaw(z, MAX_RAW); if (back.length === body.length && back.every(function (v, i) { return v === body[i]; })) return wrap(z, true); } catch (e) {} }
      return wrap(body, false);
    });
  }
  // a pasted code may be the whole URL, or have spaces / line breaks in it
  function extract(text) {
    var s = String(text == null ? '' : text).trim();
    var m = s.match(/[?&#]code=([^&#\s]*)/);
    if (m) s = m[1];
    try { s = decodeURIComponent(s); } catch (e) {}
    return s.replace(/\s+/g, '');
  }
  // → { def, proof, nick, raw (bytes before inflate), deflated } or throws err(code): empty | toolong | format | checksum | version | size | data
  function decode(text) {
    var s = extract(text);
    if (!s) throw err('empty');
    if (s.length > MAX_CODE) throw err('toolong');
    var b = unb64(s);
    if (b.length < 7) throw err('format', 'too short');
    var n = b.length - 4;
    var c = ((b[n] << 24) | (b[n + 1] << 16) | (b[n + 2] << 8) | b[n + 3]) >>> 0;
    if (crc32(b, n) !== c) throw err('checksum');
    if (b[0] !== VERSION) throw err('version');
    if (b[1] & ~1) throw err('format', 'flags');
    var body = b.subarray(2, n);
    if (b[1] & 1) body = inflateRaw(body, MAX_RAW);
    if (body.length > MAX_RAW) throw err('size');
    var out = fromBody(body);
    out.deflated = !!(b[1] & 1); out.bytes = b.length;
    return out;
  }

  var api = {
    VERSION: VERSION, MAX_CODE: MAX_CODE, MAX_RAW: MAX_RAW, LIMITS: LIMITS, KINDS: KINDS, KIND: KIND,
    cleanText: cleanText, normalize: normalize, normItem: normItem, normProof: normProof, fingerprint: fingerprint, partTotal: partTotal,
    compile: compile, verify: verify, encode: encode, encodeSync: encodeSync, decode: decode, extract: extract,
    toBody: toBody, fromBody: fromBody, crc32: crc32, b64: b64, unb64: unb64, inflateRaw: inflateRaw, canDeflate: canDeflate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PhysicsCodec = api;
})(typeof window !== 'undefined' ? window : globalThis);
