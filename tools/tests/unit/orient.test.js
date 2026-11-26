// KoboOrient（common/orient.js）：座標のうつしかた・まわすかどうか・safe-area・保存
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const O = require(path.join(ROOT, 'common/orient.js'));
const deq = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);

test('mapPoint / unmapPoint: rotating 90 degrees both ways, and they are inverses', () => {
  const W = 390, H = 844;
  // cw: the content top is the phone right side. The phone top-right corner is the content top-left corner.
  deq(O.mapPoint(W, 0, { dir: 'cw', W, H }), { x: 0, y: 0 });
  deq(O.mapPoint(0, 0, { dir: 'cw', W, H }), { x: 0, y: W });          // phone top-left -> content bottom-left
  deq(O.mapPoint(W, H, { dir: 'cw', W, H }), { x: H, y: 0 });          // phone bottom-right -> content top-right
  deq(O.mapPoint(0, H, { dir: 'cw', W, H }), { x: H, y: W });
  // ccw: the content top is the phone left side
  deq(O.mapPoint(0, H, { dir: 'ccw', W, H }), { x: 0, y: 0 });
  deq(O.mapPoint(W, 0, { dir: 'ccw', W, H }), { x: H, y: W });
  for (const dir of ['cw', 'ccw']) for (const [X, Y] of [[10, 20], [200, 400], [389, 843]]) {
    const m = O.mapPoint(X, Y, { dir, W, H }), u = O.unmapPoint(m.x, m.y, { dir, W, H }); deq(u, { x: X, y: Y });
    ok(m.x >= 0 && m.x <= H && m.y >= 0 && m.y <= W, 'inside the rotated screen');
  }
});
test('needRotate: only when the device shape and the wanted orientation differ', () => {
  ok(O.needRotate('land', 390, 844)); ok(!O.needRotate('land', 844, 390)); ok(O.needRotate('port', 844, 390)); ok(!O.needRotate('port', 390, 844)); ok(!O.needRotate('auto', 390, 844)); ok(!O.needRotate('auto', 844, 390));
});
test('insetsFor: the notch moves to the matching side', () => {
  deq(O.insetsFor({ t: 47, r: 1, b: 34, l: 2 }, 'cw'), { t: 1, r: 34, b: 2, l: 47 });
  deq(O.insetsFor({ t: 47, r: 1, b: 34, l: 2 }, 'ccw'), { t: 2, r: 47, b: 1, l: 34 });
});
test('get / set: saved per device, unknown values are auto, switching between auto and rotated asks for a reload', () => {
  const store = {}; global.window = undefined; const reloads = [];
  const g = globalThis; const keep = { localStorage: g.localStorage, top: g.top, self: g.self };
  g.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  g.top = g; g.self = g; g.location = { reload: () => reloads.push(1) };
  try {
    O.boot({ key: 'k.ori' }); eq(O.get(), 'auto'); store['k.ori'] = 'zzz'; eq(O.get(), 'auto');
    ok(O.set('land')); eq(store['k.ori'], 'land'); eq(reloads.length, 1, 'auto -> land reloads');
    ok(O.set('port')); eq(reloads.length, 1, 'land -> port does not reload (the shell just re-lays out)');
    ok(O.set('auto')); eq(reloads.length, 2, 'back to auto reloads'); ok(!O.set('sideways'));
  } finally { g.localStorage = keep.localStorage; g.top = keep.top; g.self = keep.self; delete g.location; }
});
run('orient (画面のむき)');
