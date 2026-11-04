// node tools/ui-demo/tests/audio-migrate.test.js
// common/audio.js の設定の移行（kusoge.sound / nejihodoki3d.sound → kobo.audio）を、偽の localStorage で確かめる。
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '../../../common/audio.js'), 'utf8');

function fakeStorage(init, opts) {
  const m = new Map(Object.entries(init || {}));
  const writes = [];
  return {
    writes, map: m,
    getItem(k) { if (opts && opts.throwRead) throw new Error('denied'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (opts && opts.throwWrite) throw new Error('quota'); writes.push(k); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}
// window も document も AudioContext もない環境で読み込む
const plain = o => JSON.parse(JSON.stringify(o));
function load(ls) {
  const sb = { localStorage: ls };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return sb.KoboAudio;
}
const J = ls => JSON.parse(ls.map.get('kobo.audio'));
let pass = 0, fail = 0;
function test(name, f) { try { f(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); } }

test('empty storage → defaults, unmuted, kusoge.sound=1 written', () => {
  const ls = fakeStorage(); const A = load(ls);
  assert.deepStrictEqual(plain(A.get()), { v: 1, master: 0.8, se: 1, bgm: 0.6, mute: false });
  assert.deepStrictEqual(J(ls), plain(A.get()));
  assert.strictEqual(ls.map.get('kusoge.sound'), '1');
});
test("kusoge.sound='0' → mute:true; old key kept", () => {
  const ls = fakeStorage({ 'kusoge.sound': '0' }); const A = load(ls);
  assert.strictEqual(A.get().mute, true); assert.strictEqual(J(ls).mute, true); assert.strictEqual(ls.map.get('kusoge.sound'), '0');
});
test("kusoge.sound='1' → mute:false", () => { const ls = fakeStorage({ 'kusoge.sound': '1' }); assert.strictEqual(load(ls).get().mute, false); });
test('nejihodoki3d.sound=false (JSON) → mute:true, neji key untouched, kusoge.sound mirrored to 0', () => {
  const ls = fakeStorage({ 'nejihodoki3d.sound': 'false', 'kusoge.sound': '1' }); const A = load(ls);
  assert.strictEqual(A.get().mute, true);
  assert.strictEqual(ls.map.get('nejihodoki3d.sound'), 'false');
  assert.strictEqual(ls.map.get('kusoge.sound'), '0');
  assert.ok(!ls.writes.includes('nejihodoki3d.sound'));
});
test('nejihodoki3d.sound=true → mute:false', () => { assert.strictEqual(load(fakeStorage({ 'nejihodoki3d.sound': 'true' })).get().mute, false); });
test('existing kobo.audio wins over neji key (migration runs once)', () => {
  const ls = fakeStorage({ 'kobo.audio': JSON.stringify({ v: 1, master: 0.5, se: 0.3, bgm: 0.6, mute: false }), 'nejihodoki3d.sound': 'false' });
  const A = load(ls);
  assert.deepStrictEqual(plain(A.get()), { v: 1, master: 0.5, se: 0.3, bgm: 0.6, mute: false });
});
test('idempotent: second load gives same state and writes nothing', () => {
  const ls = fakeStorage({ 'kusoge.sound': '0', 'nejihodoki3d.sound': 'true' });
  const a = load(ls).get(); const n = ls.writes.length;
  const b = load(ls).get();
  assert.deepStrictEqual(plain(a), plain(b)); assert.strictEqual(ls.writes.length, n);
  const c = load(ls).migrate(ls); assert.deepStrictEqual(plain(c), plain(a)); assert.strictEqual(ls.writes.length, n);
});
test('legacy page toggled kusoge.sound after migration → followed', () => {
  const ls = fakeStorage(); load(ls);
  ls.map.set('kusoge.sound', '0');      // an old game page muted
  assert.strictEqual(load(ls).get().mute, true);
  ls.map.set('kusoge.sound', '1');      // and unmuted again
  assert.strictEqual(load(ls).get().mute, false);
});
test('corrupt / out-of-range kobo.audio is normalized', () => {
  const ls = fakeStorage({ 'kobo.audio': JSON.stringify({ master: 7, se: -1, bgm: 'x', mute: 'yes' }) });
  assert.deepStrictEqual(plain(load(ls).get()), { v: 1, master: 1, se: 0, bgm: 0.6, mute: false });
  const ls2 = fakeStorage({ 'kobo.audio': '{not json', 'kusoge.sound': '0' });
  assert.strictEqual(load(ls2).get().mute, true);
});
test('set() writes kobo.audio and mirrors kusoge.sound; onChange fires; no-op set does not', () => {
  const ls = fakeStorage(); const A = load(ls); let calls = 0; const off = A.onChange(() => calls++);
  A.set({ mute: true }); assert.strictEqual(J(ls).mute, true); assert.strictEqual(ls.map.get('kusoge.sound'), '0'); assert.strictEqual(calls, 1);
  A.set({ mute: true }); assert.strictEqual(calls, 1);
  A.set({ se: 0.25 }); assert.strictEqual(J(ls).se, 0.25); assert.strictEqual(calls, 2);
  off(); A.toggleMute(); assert.strictEqual(calls, 2); assert.strictEqual(ls.map.get('kusoge.sound'), '1');
});
test('storage that throws (private mode) → defaults, no exception', () => {
  const A = load(fakeStorage({}, { throwRead: true, throwWrite: true }));
  assert.strictEqual(A.get().mute, false); A.set({ mute: true }); assert.strictEqual(A.get().mute, true);
});
test('no AudioContext: tone/sfx are safe no-ops, bgm reserved', () => {
  const A = load(fakeStorage());
  assert.strictEqual(A.ctx(), null); assert.strictEqual(A.tone(440, 0.1), false); assert.strictEqual(A.sfx('clear'), false);
  assert.strictEqual(A.bgm.available, false); assert.strictEqual(A.bgm.play(), false); assert.strictEqual(A.bgm.node, null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
