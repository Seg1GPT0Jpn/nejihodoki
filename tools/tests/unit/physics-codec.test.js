// physics/codec.js の単体テスト：作ったレベルの共有コード（版つきのバイト列・deflate・base64url・CRC-32）
//   行って戻る（deflate あり／なし、node の zlib とも）・決まった結果（コードから戻したレベルで答えが同じハッシュ）・
//   でたらめなバイト列とコードの書きかえ（例外は err.code つきのものだけ・どれも通らない）・大きさの上限（コード・inflate 後・数）・
//   数値のはさみこみ・名前の掃除（HTML / 制御文字 / 見えない文字）
// 実行：node tools/tests/unit/physics-codec.test.js
'use strict';
const path = require('path');
const zlib = require('zlib');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const C = require(path.join(ROOT, 'physics/codec.js'));
const PE = require(path.join(ROOT, 'physics/engine.js'));
const { LEVELS } = require(path.join(ROOT, 'physics/levels.js'));

// a level of every kind of piece, and its answer
const RAMP = { title: 'Ramp test', items: [{ k: 'wall', x: 6, y: 0.2, w: 12, h: 0.4, a: 0 }, { k: 'ball', x: 1.5, y: 10.5, b: 0 }, { k: 'goal', x: 10.5, y: 0.4 },
  { k: 'wall', x: 6, y: 5, w: 3.25, h: 0.24, a: -30 }, { k: 'gear', x: 6.5, y: 5.25 }], parts: { plank: 1 }, par: 1 };
const ANSWER = [{ t: 'plank', x: 1.5, y: 8.75, a: -30 }];
const ALL = { title: 'ぜんぶ', items: [
  { k: 'wall', x: 6, y: 0.2, w: 12, h: 0.4, a: 0 }, { k: 'ball', x: 1.5, y: 10.5, b: 1 }, { k: 'ball', x: 3, y: 11, b: 0 }, { k: 'goal', x: 10.5, y: 0.4 },
  { k: 'ice', x: 3, y: 7, w: 3, h: 0.3, a: -15 }, { k: 'rubber', x: 8, y: 3, w: 2, h: 0.3, a: 20 }, { k: 'glass', x: 6, y: 9, w: 2, h: 1.5 }, { k: 'gear', x: 5, y: 5 },
  { k: 'spin', x: 9, y: 8, w: 3, a: 45, s: 1 }, { k: 'crate', x: 4, y: 2, w: 0.8, a: 0 }, { k: 'rope', x: 7, y: 11.5, w: 2.5, a: 30 },
  { k: 'spring', x: 2, y: 1, a: 0 }, { k: 'fan', x: 1, y: 4, a: 15 }, { k: 'belt', x: 6, y: 3, a: -5 }, { k: 'magnet', x: 11, y: 6, a: 90 }, { k: 'seesaw', x: 8, y: 6, a: 0 }, { k: 'weight', x: 8, y: 7.5 }],
  parts: { plank: 2, spring: 1, magnet: 1 }, par: 3 };
const rnd = (seed => () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; })(20261106);
function decodeErr(code) { try { C.decode(code); return null; } catch (e) { return e.code || 'NO CODE: ' + e.message; } }
const CODES = new Set(['empty', 'toolong', 'format', 'checksum', 'version', 'size', 'data']);

test('round trip: every kind of piece, with and without deflate (sync, async, node zlib)', async () => {
  const d = C.normalize(ALL);
  for (const deflate of [false, true]) {
    const code = await C.encode(d, ANSWER, 'ねこ', { deflate });
    ok(/^[A-Za-z0-9_-]+$/.test(code), 'base64url ' + code);
    const back = C.decode(code);
    eq(C.fingerprint(back.def), C.fingerprint(d), 'same level, deflate ' + deflate);
    eq(back.def.title, 'ぜんぶ'); eq(back.nick, 'ねこ'); deep(back.proof, ANSWER);
    deep(back.def, d, 'same def');
  }
  eq(C.decode(C.encodeSync(d, ANSWER, 'x')).def.items.length, d.items.length);
  // a body deflated by node's zlib (not by CompressionStream) is read by codec.js's own inflate
  const body = C.toBody(d, ANSWER, 'zz');
  for (const level of [0, 1, 6, 9]) {
    const z = zlib.deflateRawSync(Buffer.from(body), { level });
    deep(Array.from(C.inflateRaw(new Uint8Array(z), 4096)), Array.from(body), 'zlib level ' + level);
  }
  // a large random-ish payload through dynamic Huffman blocks and long matches
  const big = Buffer.alloc(30000); for (let i = 0; i < big.length; i++) big[i] = i % 7 === 0 ? (rnd() * 256) | 0 : 'abcabcabd'.charCodeAt(i % 9);
  deep(Buffer.from(C.inflateRaw(new Uint8Array(zlib.deflateRawSync(big)), 40000)).equals(big), true, 'big inflate');
});

test('compact: a small level is about 100 characters, the biggest allowed one fits under MAX_CODE', async () => {
  const small = await C.encode(C.normalize(RAMP), ANSWER, 'Kobo Cat');
  ok(small.length < 160, 'small ' + small.length);
  const items = [{ k: 'goal', x: 1, y: 1 }, { k: 'ball', x: 2, y: 2 }];
  while (items.length < C.LIMITS.items) items.push({ k: 'wall', x: rnd() * 12, y: rnd() * 12, w: 0.1 + rnd() * 11, h: 0.1 + rnd() * 11, a: rnd() * 360 });
  const proof = Array.from({ length: 12 }, () => ({ t: 'plank', x: rnd() * 12, y: rnd() * 12, a: rnd() * 360 }));
  const big = C.encodeSync({ title: '漢'.repeat(20), items, parts: { plank: 5, short: 5, spring: 2 }, par: 12 }, proof, '字'.repeat(12));
  ok(big.length <= C.MAX_CODE, 'biggest ' + big.length);
  eq(C.decode(big).def.items.length, C.LIMITS.items);
});

test('determinism: the proof replays to the same result as the creator\'s board, after the code', () => {
  const d = C.normalize(RAMP);
  const a = PE.run(C.compile(d), ANSWER);
  ok(a.win && a.n === 3, 'the answer wins with 3 stars ' + JSON.stringify(a));
  const back = C.decode(C.encodeSync(d, ANSWER, 'x'));
  const b = PE.run(C.compile(back.def), back.proof);
  eq(b.hash, a.hash, 'same final state'); eq(b.steps, a.steps);
  const v = C.verify(back.def, back.proof);
  ok(v.ok, 'verified'); eq(v.result.hash, a.hash);
  ok(!PE.run(C.compile(d), []).win, 'no parts: no win');
  eq(C.verify(back.def, []).why, 'parts');
  eq(C.verify(back.def, [{ t: 'plank', x: 10, y: 10, a: 0 }]).why, 'miss');
  eq(C.verify(back.def, [{ t: 'spring', x: 3, y: 3, a: 0 }]).why, 'place', 'a part not in the tray');
  eq(C.verify(back.def, ANSWER.concat(ANSWER)).why, 'place', 'too many planks');
});

test('the official levels can be rebuilt from codec pieces: 1-1 as a made level is solved by its tutorial answer', () => {
  const L = LEVELS[0];
  const seg = L.objs[2], cx = (seg[1] + seg[3]) / 2, cy = (seg[2] + seg[4]) / 2;
  const d = C.normalize({ title: '1-1', items: [{ k: 'wall', x: 6, y: 0.2, w: 12, h: 0.4, a: 0 }, { k: 'wall', x: 11.85, y: 6.2, w: 0.3, h: 11.6, a: 0 }, { k: 'ball', x: L.ball.x, y: L.ball.y }, { k: 'goal', x: L.goal.x, y: L.goal.y },
    { k: 'wall', x: cx, y: cy, w: 3.3, h: 0.24, a: -31 }].concat(L.gears.map(g => ({ k: 'gear', x: g[0], y: g[1] }))), parts: { plank: 1 }, par: 1 });
  ok(C.verify(d, L.tut).ok, '1-1 rebuilt');
});

test('tampering: every single-character change and every bit flip is refused (checksum), never an uncaught error', async () => {
  const code = await C.encode(C.normalize(ALL), ANSWER, 'ねこ', { deflate: true });
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let n = 0;
  for (let i = 0; i < code.length; i++) {
    const c = A[(A.indexOf(code[i]) + 1 + (i % 63)) % 64];
    const e = decodeErr(code.slice(0, i) + c + code.slice(i + 1));
    ok(e && CODES.has(e), 'char ' + i + ' → ' + e); n++;
  }
  const raw = C.unb64(code);
  for (let i = 0; i < raw.length; i++) for (let b = 0; b < 8; b++) {
    const t = raw.slice(); t[i] ^= 1 << b;
    const e = decodeErr(C.b64(t));
    ok(e && CODES.has(e), 'bit ' + i + '.' + b + ' → ' + e); n++;
  }
  ok(n > 500, 'tried ' + n);
  ok(decodeErr(code.slice(0, -1)), 'cut by one'); ok(decodeErr(code + 'A'), 'one more');
});

test('fuzz: random bytes and random codes only ever fail with a known error code', () => {
  let ok1 = 0, valid = 0;
  for (let k = 0; k < 4000; k++) {
    const n = 1 + Math.floor(rnd() * 200), b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = (rnd() * 256) | 0;
    // half of them get a correct header and checksum, so the parser (and the inflate) behind it is fuzzed too
    if (k % 2 === 0 && n > 6) {
      b[0] = 1; b[1] = k % 4 === 0 ? 1 : 0;
      const c = C.crc32(b, n - 4); b[n - 4] = c >>> 24; b[n - 3] = (c >>> 16) & 255; b[n - 2] = (c >>> 8) & 255; b[n - 1] = c & 255;
    }
    let e = null; try { C.decode(C.b64(b)); valid++; } catch (x) { e = x.code; }
    if (e) { ok(CODES.has(e), 'random → ' + e); ok1++; }
    // the body parser on its own
    try { C.fromBody(b); } catch (x) { ok(CODES.has(x.code), 'body → ' + x.code + ' ' + x.message); }
    try { C.inflateRaw(b, 2048); } catch (x) { ok(CODES.has(x.code), 'inflate → ' + x.code + ' ' + x.message); }
  }
  ok(ok1 > 3900, 'nearly all random inputs refused ' + ok1 + ' valid ' + valid);
  for (const s of ['', '   ', '!!!!', '<script>alert(1)</script>', 'A', 'AAAAA', '%E0%A4%A', 'code=', '?code=AQ', 'https://x/?code=']) ok(CODES.has(decodeErr(s)), JSON.stringify(s) + ' → ' + decodeErr(s));
});

test('size limits: long codes, zip bombs and too many things are refused', () => {
  eq(decodeErr('A'.repeat(C.MAX_CODE + 1)), 'toolong');
  // a deflate stream that inflates far beyond MAX_RAW (a valid header and checksum around it)
  const bomb = zlib.deflateRawSync(Buffer.alloc(200000, 1));
  const b = new Uint8Array(bomb.length + 6); b[0] = 1; b[1] = 1; b.set(bomb, 2);
  const c = C.crc32(b, b.length - 4); b[b.length - 4] = c >>> 24; b[b.length - 3] = (c >>> 16) & 255; b[b.length - 2] = (c >>> 8) & 255; b[b.length - 1] = c & 255;
  const code = C.b64(b);
  ok(code.length <= C.MAX_CODE, 'the bomb fits in a code ' + code.length);
  eq(decodeErr(code), 'size');
  // counts above the limits in a well-formed body
  const wrap = body => { const x = new Uint8Array(body.length + 6); x[0] = 1; x[1] = 0; x.set(body, 2); const k = C.crc32(x, x.length - 4); x[x.length - 4] = k >>> 24; x[x.length - 3] = (k >>> 16) & 255; x[x.length - 2] = (k >>> 8) & 255; x[x.length - 1] = k & 255; return C.b64(x); };
  const items = [{ k: 'goal', x: 1, y: 1 }, { k: 'ball', x: 2, y: 2 }]; for (let i = 0; i < 3; i++) items.push({ k: 'ball', x: 3, y: 3 });
  // the encoder never writes more than the limits (normalize drops the extras) …
  eq(C.decode(C.encodeSync({ items, parts: { plank: 1 }, par: 1 }, [], '')).def.items.filter(i => i.k === 'ball').length, 3);
  // … and a hand-made body with 4 balls, 2 goals or 41 items is refused
  const body = items => { const w = [0, 0, 1, 1, 0, 1, items.length]; for (const it of items) w.push(C.KIND[it.k].code, 0, 100, 0, 100, ...(it.k === 'ball' ? [0] : [])); w.push(0); return new Uint8Array(w); };
  eq(decodeErr(wrap(body(items))), 'data', '4 balls');
  eq(decodeErr(wrap(body([{ k: 'goal' }, { k: 'goal' }, { k: 'ball' }]))), 'data', '2 goals');
  eq(decodeErr(wrap(body([{ k: 'ball' }]))), 'data', 'no goal');
  eq(decodeErr(wrap(body([{ k: 'goal' }]))), 'data', 'no ball');
  eq(decodeErr(wrap(body(Array.from({ length: 41 }, (_, i) => ({ k: i ? 'gear' : 'goal' }))))), 'data', '41 items');
  const okBody = body([{ k: 'goal' }, { k: 'ball' }]);
  ok(C.decode(wrap(okBody)), 'the minimal level is fine');
  eq(decodeErr(wrap(new Uint8Array([...okBody, 0]))), 'format', 'trailing byte');
  const unknown = okBody.slice(); unknown[7] = 99; eq(decodeErr(wrap(unknown)), 'data', 'unknown kind');
  const v2 = C.unb64(wrap(okBody)); v2[0] = 2; const k2 = C.crc32(v2, v2.length - 4); v2[v2.length - 4] = k2 >>> 24; v2[v2.length - 3] = (k2 >>> 16) & 255; v2[v2.length - 2] = (k2 >>> 8) & 255; v2[v2.length - 1] = k2 & 255;
  eq(decodeErr(C.b64(v2)), 'version');
});

test('clamping: positions, sizes, angles, tray counts and the target are kept in range', () => {
  const d = C.normalize({ title: 'x', items: [{ k: 'goal', x: -5, y: 99 }, { k: 'ball', x: NaN, y: 'a' }, { k: 'wall', x: 6, y: 6, w: 99, h: -1, a: 725 }, { k: 'spin', x: 1, y: 1, w: 0, a: -900, s: 7 }, { k: 'rope', x: 1, y: 1, w: 50, a: 0 }, { k: 'nope', x: 1, y: 1 }],
    parts: { plank: 9, short: 9, spring: 9, bogus: 3 }, par: 99 });
  deep(d.items[0], { k: 'goal', x: 0, y: 12 }); deep(d.items[1], { k: 'ball', x: 0, y: 0, b: 0 });
  deep(d.items[2], { k: 'wall', x: 6, y: 6, w: 12, h: 0.1, a: 5 });
  deep(d.items[3], { k: 'spin', x: 1, y: 1, w: 1, a: 180, s: 1 });
  eq(d.items[4].w, 8); eq(d.items.length, 5, 'the unknown piece is dropped');
  deep(d.parts, { plank: 5, short: 5, spring: 2 }); eq(C.partTotal(d), 12); eq(d.par, 12);
  eq(C.normalize({ items: [{ k: 'goal' }, { k: 'ball' }], parts: {}, par: 0 }).par, 1);
  // u16 values far out of range in a code come back clamped
  const body = new Uint8Array([0, 0, 200, 1, 0, 5, 3, C.KIND.goal.code, 255, 255, 255, 255, C.KIND.ball.code, 0, 50, 0, 50, 1, C.KIND.wall.code, 0, 100, 0, 100, 255, 255, 0, 0, 255, 255, 0]);
  const x = new Uint8Array(body.length + 6); x[0] = 1; x.set(body, 2); const k = C.crc32(x, x.length - 4); x[x.length - 4] = k >>> 24; x[x.length - 3] = (k >>> 16) & 255; x[x.length - 2] = (k >>> 8) & 255; x[x.length - 1] = k & 255;
  const r = C.decode(C.b64(x)).def;
  deep(r.items[0], { k: 'goal', x: 12, y: 12 }); eq(r.items[2].w, 12); eq(r.items[2].h, 0.1); ok(r.items[2].a >= -180 && r.items[2].a <= 180, 'angle'); eq(r.parts.plank, 5); eq(r.par, 5);
});

test('text: names are cleaned (no HTML brackets, control, bidi or zero-width characters) and cut to 12 / 20 characters', () => {
  eq(C.cleanText('<b>ねこ</b>', 12), 'bねこ/b');
  eq(C.cleanText('a\u0000b‮c​d﻿e\n  f', 12), 'abcde f');
  eq(C.cleanText('あいうえおかきくけこさしすせそ', 12), 'あいうえおかきくけこさし');
  eq(C.cleanText('😀'.repeat(20), 12), '😀'.repeat(12), 'whole characters, not halves of surrogate pairs');
  eq(C.cleanText(null, 12), '');
  const back = C.decode(C.encodeSync(Object.assign({}, RAMP, { title: '<img src=x onerror=alert(1)>'.repeat(3) }), ANSWER, '<script>'));
  ok(!/[<>]/.test(back.def.title + back.nick), back.def.title); ok(Array.from(back.def.title).length <= 20); eq(back.nick, 'script');
  // a hand-made body with bad UTF-8 or a too-long name
  const wrap = body => { const x = new Uint8Array(body.length + 6); x[0] = 1; x.set(body, 2); const k = C.crc32(x, x.length - 4); x[x.length - 4] = k >>> 24; x[x.length - 3] = (k >>> 16) & 255; x[x.length - 2] = (k >>> 8) & 255; x[x.length - 1] = k & 255; return C.b64(x); };
  const tail = [0, 1, 1, 0, 1, 2, C.KIND.goal.code, 0, 100, 0, 100, C.KIND.ball.code, 0, 50, 0, 50, 0, 0];
  eq(decodeErr(wrap(new Uint8Array([2, 0xff, 0xfe, ...tail]))), 'data', 'bad UTF-8');
  eq(decodeErr(wrap(new Uint8Array([60, ...Array(60).fill(65), ...tail]))), 'data', 'name over 48 bytes');
  eq(C.decode(wrap(new Uint8Array([3, 65, 0x0a, 66, ...tail]))).nick, 'AB', 'a line break is a control character: removed, like the platform nicknames');
});

test('extract: a pasted URL, a code with spaces and line breaks', () => {
  const code = C.encodeSync(C.normalize(RAMP), ANSWER, 'x');
  eq(C.extract('https://neji-5913a.web.app/physics/?code=' + code + '&debug'), code);
  eq(C.extract('  ' + code.slice(0, 20) + '\n' + code.slice(20) + '  '), code);
  eq(C.extract('#code=' + code), code);
  ok(C.decode('https://example.com/physics/?code=' + code).def);
});

run('physics-codec');
