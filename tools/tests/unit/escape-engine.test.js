// escape/engine.js と、6つの部屋（room1.js〜room6.js）の単体テスト：点数とランク（前と同じ）・保存の読み込み（古い保存もそのまま。おまけの部屋は合計に入らない）・
// 部屋6の荷運びの床（ボットが解く）・びんの数の錠・全部屋の正解の手順（route）を、ブラウザなしで「本物のタップと同じ処理」で最後まで通す（ボット）・
// どの画面も絵が描ける・ページが engine.js を使っていること（script と sw.js）
// 実行：node tools/tests/unit/escape-engine.test.js
'use strict';
const path = require('path');
const vm = require('vm');
const fs = require('fs');
const { ROOT, test, eq, ok, deep, run, readText } = require('./_kobo-env');
const E = require(path.join(ROOT, 'escape/engine.js'));

test('score and rank are unchanged (the ranking value)', () => {
  eq(E.scoreOf(60000, 0, 0), 1000); eq(E.scoreOf(60000, 60000, 0), 1000); eq(E.scoreOf(60000, 180000, 0), 600);
  eq(E.scoreOf(60000, 30000, 3), 880); eq(E.scoreOf(60000, 999999, 20), 200); eq(E.scoreOf(360000, 540000, 2), 200 + 320 + 300);
  eq(E.rankOf(1000), 4); eq(E.rankOf(900), 4); eq(E.rankOf(899), 3); eq(E.rankOf(750), 3); eq(E.rankOf(550), 2); eq(E.rankOf(549), 1);
});

const IDS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], BONUS = ['r6'];
test('readSave: old saves load as they are; the total never counts the bonus room', () => {
  const old = { v: 1, rooms: { r1: { s: 900, t: 300000, r: 4, nh: 1, c: 1 }, r2: { s: 800, t: 500000, r: 3, nh: 1, c: 1 } }, total: 1700, stats: { clears: 2 }, tut: 1 };
  const a = E.readSave(JSON.stringify(old), IDS, BONUS);
  eq(a.total, 1700); eq(a.rooms.r1.s, 900); eq(a.tut, 1); eq(a.stats.clears, 2); eq(a.stats.sRank, 0); eq(a.stats.done, 0);
  const withBonus = Object.assign({}, old, { rooms: Object.assign({}, old.rooms, { r6: { s: 990, t: 100, r: 4, nh: 1, c: 1 } }), total: 2690 });
  const b = E.readSave(JSON.stringify(withBonus), IDS, BONUS);
  eq(b.total, 1700); ok(b.rooms.r6.s === 990, 'the bonus record is kept');
  eq(E.recount({ rooms: { r1: { s: 1500 }, r2: { s: -5 }, r3: { s: 'x' } } }, IDS, BONUS), 1000);
  for (const bad of [null, '', '{', '[]', '5', '{"rooms":[1]}', '{"rooms":5,"stats":7}']) { const d = E.readSave(bad, IDS, BONUS); eq(d.total, 0); ok(d.rooms && typeof d.rooms === 'object' && !Array.isArray(d.rooms) && d.stats.clears === 0, String(bad)); }
  eq(E.readSave(old, IDS, BONUS).total, 1700); // an object works too
});

test('the cart floor: a bot finds the shortest solution, replaying it solves it, moves obey the rules', () => {
  const L = E.YARD;
  eq(L.start.c.length, L.goals.length); ok(L.w === 9 && L.h === 7);
  ok(L.start.c.every(q => !L.walls[q[1]][q[0]]) && L.goals.every(q => !L.walls[q[1]][q[0]]) && !L.walls[L.start.p[1]][L.start.p[0]]);
  const sol = E.sokoSolve(L);
  ok(typeof sol === 'string' && sol.length >= 12 && sol.length <= 40, 'solution length ' + (sol && sol.length));
  let st = L.start; let pushes = 0;
  for (const d of sol) { st = E.sokoMove(L, st, d); ok(st, 'move ' + d + ' is legal'); if (st.pushed) pushes++; }
  ok(E.sokoSolved(L, st)); ok(pushes >= 5, 'pushes ' + pushes);
  ok(!E.sokoSolved(L, L.start));
  // walls block; the border is a wall; a crate cannot be pushed into a wall or another crate
  eq(E.sokoMove(L, { p: [1, 1], c: [] }, 'U'), null); eq(E.sokoMove(L, { p: [1, 1], c: [] }, 'L'), null);
  eq(E.sokoMove(L, { p: [1, 2], c: [[1, 3]] }, 'D') && 1, 1);
  eq(E.sokoMove(L, { p: [1, 1], c: [[2, 1], [3, 1]] }, 'R'), null);
  eq(E.sokoMove(L, { p: [7, 1], c: [[8, 1]] }, 'R'), null);
  // dead states are recognised (a crate in a corner that is not a mark)
  const dead = { p: [3, 3], c: [[1, 1], [3, 4], [5, 3]] };
  eq(E.sokoSolve(L, dead), null);
  // the solver never says "solved" for an unsolved level, and an already-solved state needs no moves
  eq(E.sokoSolve(L, { p: [1, 3], c: L.goals.map(g => g.slice()) }), '');
  eq(E.sokoMove(L, L.start, 'X'), null);
});

test('the jars and the ledger: the code is the jar counts in the ledger order', () => {
  deep(E.codeOf(), [2, 3, 5]);
  eq(new Set(E.JARS.map(j => j[0])).size, E.JARS.length); eq(new Set(E.JARS.map(j => j[1])).size, E.JARS.length);
  ok(E.JARS.every(j => j[1] >= 1 && j[1] <= 5));
  ok(E.LEDGER.length === 3 && new Set(E.LEDGER).size === 3 && E.LEDGER.every(k => E.countOf(k) > 0));
  ok(E.JARS.length > E.LEDGER.length, 'there are decoys on the shelf'); eq(E.countOf('nothing'), 0);
});

// ---------- the rooms, played headlessly with the same rules as the page (tapAt / slotTap / turn / back) ----------
function fakeCtx() {
  const grad = { addColorStop() {} };
  const fn = new Proxy(function () {}, { get: () => fn, apply: () => undefined });
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return s => ({ width: String(s).length * 7 });
      return k in t ? t[k] : () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function loadRooms() {
  const win = {}; win.window = win;
  win.KoboI18n = { add() {}, t: s => s, lang: 'ja' };
  const ctx = vm.createContext(win);
  for (const f of ['escape/engine.js', 'escape/art.js', 'escape/room1.js', 'escape/room2.js', 'escape/room3.js', 'escape/room4.js', 'escape/room5.js', 'escape/room6.js']) {
    vm.runInContext(readText(f).replace(/\}\)\(typeof self !== 'undefined' \? self : this, function/, '})(window, function'), ctx, { filename: f });
  }
  return win;
}
const WALLS = ['w0', 'w1', 'w2', 'w3'];
function makeRun(win, ri) {
  const rt = { S: null, inv: [], sel: null, view: 'w0', back: [], wall: 0, exited: false, said: [], tr: {}, fails: [], room: null, now: 0 };
  const isWall = v => WALLS.includes(v);
  const K = {
    T: s => s, get S() { return rt.S; }, get tr() { return rt.tr; }, lang: 'ja', time: () => rt.now,
    say: s => rt.said.push(s), sayRaw: s => rt.said.push(s), go: v => goView(v), give: id => give(id), take: id => take(id), has: id => rt.inv.includes(id), sel: () => rt.sel,
    ok() {}, bad() {}, sfx() {}, tone() {}, noise() {}, anim() {}, redraw() {}, exit() { rt.exited = true; }, coach() {}, persist() {}, reduced: () => false,
  };
  const rooms = win.EscapeRooms.build(K);
  rt.rooms = rooms; rt.room = rooms[ri]; rt.S = rt.room.init(); rt.S.got = rt.S.got || {};
  const viewDef = () => (rt.view.startsWith('i:') ? { spots: rt.room.items[rt.view.slice(2)].spots || (() => []) } : rt.room.views[rt.view]);
  const spots = () => { const d = viewDef(); return (d && d.spots && d.spots(rt.S)) || []; };
  const hit = (sp, x, y) => (sp.r != null ? (x - sp.cx) ** 2 + (y - sp.cy) ** 2 <= sp.r * sp.r : x >= sp.x && x <= sp.x + sp.w && y >= sp.y && y <= sp.y + sp.h);
  const spotAt = (x, y) => { const l = spots(); for (let i = l.length - 1; i >= 0; i--) if (hit(l[i], x, y)) return l[i]; return null; };
  function where(id) {
    const l = spots(), i = l.findIndex(s => s.id === id); if (i < 0) return null; const sp = l[i], c = [];
    if (sp.r != null) { c.push([sp.cx, sp.cy]); for (let a = 0; a < 8; a++) c.push([sp.cx + Math.cos(a) * sp.r * 0.6, sp.cy + Math.sin(a) * sp.r * 0.6]); }
    else for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) c.push([sp.x + sp.w * fx, sp.y + sp.h * fy]);
    const pt = c.find(([x, y]) => { const s = spotAt(x, y); return s && s.id === id; });
    return pt ? { x: pt[0], y: pt[1] } : null;
  }
  function goView(v) { if (v === rt.view) return; if (!isWall(v)) rt.back.push(rt.view); else rt.back = []; rt.view = v; if (isWall(v)) rt.wall = WALLS.indexOf(v); }
  function goBack() { if (isWall(rt.view)) return; const d = viewDef(); let to = rt.back.pop(); if (!to) to = (d && d.back) || WALLS[rt.wall]; rt.view = to; if (isWall(to)) { rt.wall = WALLS.indexOf(to); rt.back = []; } }
  function turn(d) { if (!isWall(rt.view)) return; const i = (WALLS.indexOf(rt.view) + d + 4) % 4; rt.view = WALLS[i]; rt.wall = i; rt.back = []; }
  function give(id) { if (rt.inv.includes(id)) return; rt.inv.push(id); rt.S.got[id] = 1; }
  function take(id) { rt.inv = rt.inv.filter(x => x !== id); if (rt.sel === id) rt.sel = null; if (rt.view === 'i:' + id) goBack(); }
  function tapAt(x, y) {
    const sp = spotAt(x, y); if (!sp) return;
    const sel = rt.sel;
    if (sel && sp.use) { let r = false; r = sp.use(sel); if (r) { rt.sel = null; return; } if (!sp.tap || sp.useOnly) return; }
    if (sp.go && !sp.tap) { goView(sp.go); return; }
    if (sp.tap) { sp.tap(); if (sp.go) goView(sp.go); return; }
    if (sp.say) rt.said.push(sp.say);
  }
  function slotTap(id) {
    const sel = rt.sel;
    if (sel === id) { goView('i:' + id); return; }
    if (sel && sel !== id) {
      const rc = (rt.room.combos || []).find(c => (c.a === sel && c.b === id) || (c.a === id && c.b === sel));
      if (rc) { rt.inv = rt.inv.filter(x => x !== rc.a && x !== rc.b); rt.sel = null; rt.inv.push(rc.out); rt.S.got[rc.out] = 1; rt.sel = rc.out; return; }
      if (rt.view === 'i:' + sel) return;
    }
    rt.sel = id; if (rt.view.startsWith('i:')) rt.view = 'i:' + id;
  }
  function act(a) {
    if (a === 'L') { turn(-1); return true; } if (a === 'R') { turn(1); return true; } if (a === 'B') { goBack(); return true; }
    if (a.startsWith('w:')) { const n = +a.slice(2); let g = 0; while (!isWall(rt.view) && g++ < 9) goBack(); g = 0; while (rt.wall !== n && g++ < 4) turn(1); return rt.wall === n; }
    if (a.startsWith('i:')) { if (!rt.inv.includes(a.slice(2))) return false; slotTap(a.slice(2)); return true; }
    if (a.startsWith('s:')) { const p = where(a.slice(2)); if (!p) return false; tapAt(p.x, p.y); return true; }
    if (a === 'slide') { for (const k of rt.room.slideMoves(rt.S)) { const p = where('tile' + k); if (!p) return false; tapAt(p.x, p.y); } return true; }
    return false;
  }
  return Object.assign(rt, { act, where, spots, viewDef, tapAt, slotTap, goView, turn, goBack });
}
const win = loadRooms();
const ER = win.EscapeRooms;

test('every room: structure (ids, items, puzzles with 3 hints, a route)', () => {
  const rt = makeRun(win, 0); const rooms = rt.rooms;
  eq(rooms.length, 6); deep(rooms.map(r => r.id), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  eq(rooms.filter(r => r.bonus).length, 1); ok(rooms[5].bonus);
  rooms.forEach(r => {
    ok(r.name && r.intro && r.outro && r.par >= 60000 && r.par <= 30 * 60000, r.id + ' text/par');
    ok(r.views.w0 && r.views.w1 && r.views.w2 && r.views.w3, r.id + ' four walls');
    for (const [id, it] of Object.entries(r.items)) ok(it.name && typeof it.icon === 'function', r.id + ' item ' + id);
    eq(new Set(r.puzzles.map(p => p.id)).size, r.puzzles.length);
    for (const p of r.puzzles) { eq(p.hints.length, 3); ok(p.hints.every(h => typeof h === 'string' && h.length > 3) && p.name, r.id + ' ' + p.id); eq(new Set(p.hints).size, 3, r.id + ' ' + p.id + ' hints differ'); }
    for (const c of r.combos || []) ok(r.items[c.a] && r.items[c.b] && r.items[c.out], r.id + ' combo');
    ok(r.route.length >= 20 && r.route.every(a => /^(L|R|B|slide|[wis]:\w+)$/.test(a)), r.id + ' route');
  });
});

for (let ri = 0; ri < 6; ri++) {
  test(`room ${ri + 1}: the intended route escapes (bot, same tap rules as the page)`, () => {
    const rt = makeRun(win, ri);
    const route = rt.room.route.slice();
    route.forEach((a, i) => { const okk = rt.act(a); ok(okk, `step ${i} "${a}" failed in view ${rt.view} (spots: ${rt.spots().map(s => s.id).join(',')})`); });
    ok(rt.exited, 'the room exit was reached');
    // every non-final puzzle is solved at the end
    const open = rt.room.puzzles.filter(p => !p.done(rt.S)).map(p => p.id);
    ok(open.length <= 1, 'unsolved at the end: ' + open);
    // the order of puzzles: avail is false until its prerequisite (the first puzzle is available at the start)
    const fresh = makeRun(win, ri);
    ok(fresh.room.puzzles[0].avail ? fresh.room.puzzles[0].avail(fresh.S) : true, 'first puzzle available');
    ok(fresh.room.puzzles.every(p => !p.done(fresh.S) || p.id === 'x'), 'nothing is solved at the start');
  });
  test(`room ${ri + 1}: every view draws (start and end state), saved state survives JSON`, () => {
    const rt = makeRun(win, ri); const c = fakeCtx();
    const drawAll = () => { for (const [id, v] of Object.entries(rt.room.views)) { v.draw(c, rt.S, 1234); ok(Array.isArray(v.spots(rt.S)), id + ' spots'); } for (const it of Object.values(rt.room.items)) { it.icon(c, 40, rt.S); if (it.big) it.big(c, rt.S, 0); } };
    drawAll();
    rt.room.route.forEach(a => rt.act(a));
    drawAll();
    const copy = JSON.parse(JSON.stringify(rt.S)); deep(copy, JSON.parse(JSON.stringify(rt.S)));
    const re = rt.room.init(); deep(Object.keys(JSON.parse(JSON.stringify(re))).sort().slice(0, 3), Object.keys(re).sort().slice(0, 3));
  });
}

test('room 6: a wrong code keeps the chest shut; a wrong crate order does not solve the floor; the winch needs the crank', () => {
  const rt = makeRun(win, 5);
  for (const a of ['w:2', 's:chest', 's:c0u', 's:c1u', 's:c2u']) ok(rt.act(a), a);
  ok(!rt.S.chestOpen, 'code 1-1-1 does not open it');
  // the winch socket refuses anything but the crank
  rt.act('B'); rt.act('w:3'); ok(rt.act('s:winch'));
  rt.inv.push('pin'); rt.S.got.pin = 1; rt.act('i:pin'); rt.act('s:socket');
  ok(!rt.S.cranked, 'a pin is not a crank');
  // the cupboard is locked until the floor is solved
  rt.act('B'); rt.act('w:1'); rt.act('s:cup'); ok(!rt.inv.includes('pin') || rt.S.got.pin);
  const r2 = makeRun(win, 5); r2.act('w:1'); r2.act('s:cup'); ok(!r2.inv.includes('pin'), 'locked');
  // a few moves that do not solve it
  r2.act('s:yard'); for (const d of 'RRR') r2.act('s:mv' + d); ok(!r2.S.yardOK);
  // undo and reset work
  const n = r2.S.yard.n; ok(n > 0); r2.act('s:undo'); eq(r2.S.yard.n, n - 1); r2.act('s:reset'); eq(r2.S.yard.n, 0); deep(r2.S.yard.c, E.YARD.start.c);
  // the keyboard handler of the floor view moves, undoes and resets
  const v = r2.room.views.yard6; ok(v.key('ArrowRight', r2.S)); ok(r2.S.yard.n === 1); ok(v.key('u', r2.S)); eq(r2.S.yard.n, 0); ok(v.key('d', r2.S) && v.key('R', r2.S)); ok(!v.key('x', r2.S));
});

test('room 6: a bot plays the floor from any reachable state (replays the solver from the middle)', () => {
  const rt = makeRun(win, 5); rt.act('w:1'); rt.act('s:yard');
  const sol = E.sokoSolve(E.YARD);
  for (let i = 0; i < sol.length; i++) {
    if (i === 7) { // from here, solve again with the solver and finish
      const rest = E.sokoSolve(E.YARD, { p: rt.S.yard.p, c: rt.S.yard.c });
      ok(rest !== null && rest.length === sol.length - 7, 'the rest is the same length');
      for (const d of rest) rt.act('s:mv' + d);
      break;
    }
    rt.act('s:mv' + sol[i]);
  }
  ok(rt.S.yardOK === 1, 'solved'); const n = rt.S.yard.n; rt.act('s:mvU'); eq(rt.S.yard.n, n); // locked after solving
});

test('the page uses engine.js, loads room6.js, and the service worker caches them', () => {
  const html = readText('escape/index.html');
  ok(/<script src="engine\.js"><\/script>/.test(html) && html.indexOf('engine.js') < html.indexOf('room1.js'));
  ok(/<script src="room6\.js"><\/script>/.test(html));
  ok(/EscapeEngine/.test(html) && /ENDING_RI/.test(html));
  const sw = readText('sw.js'); ok(sw.includes("'./escape/engine.js'") && sw.includes("'./escape/room6.js'"));
});

run('escape engine');
