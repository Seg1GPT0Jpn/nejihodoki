// からくり工房からの脱出の「計算」の中身（node でも動く）。部屋の絵とクリックの処理は room1.js〜room6.js、画面・保存・ヒントは escape/index.html。
// ・点数とランク：scoreOf（200 ＋ ヒント分 最大400 ＋ 時間分 最大400 ＝ 1部屋 最高1,000点。ランキングの値の計算。意味は変えていない）、rankOf
// ・保存 kusoge.escape.save の読み込み（readSave）と合計（recount）。合計＝おまけでない部屋のベストの合計（ランキングの値）。おまけの部屋（r6）の点数は合計に入れない
// ・部屋6「親方の蔵」のなぞの計算：荷運びの床（箱を押して印に乗せる。解けるかどうかをボットが確かめる sokoSolve）と、びんを数える3けたの錠（codeOf）
// 読み込み：ブラウザでは <script src="engine.js"></script>（window.EscapeEngine）、node では require('./escape/engine.js')。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EscapeEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- score ----------
  function scoreOf(par, ms, hints) {
    const hp = Math.max(0, 400 - 40 * hints);
    const tp = Math.round(400 * clamp((3 * par - ms) / (2 * par), 0, 1));
    return 200 + hp + tp;
  }
  const rankOf = s => (s >= 900 ? 4 : s >= 750 ? 3 : s >= 550 ? 2 : 1); // 4 = S

  // ---------- the save ----------
  // ids = every room id in order; bonus = the ids that do not count toward the ranking total
  function defSave() { return { v: 1, rooms: {}, total: 0, stats: { clears: 0, nh: 0, sRank: 0, fast: 0, hints: 0, done: 0 }, tut: 0 }; }
  function recount(s, ids, bonus) {
    let t = 0;
    for (const id of ids) { if (bonus && bonus.includes(id)) continue; const b = s.rooms[id]; if (b && b.s > 0) t += Math.min(1000, Math.floor(b.s)); }
    return t;
  }
  function readSave(raw, ids, bonus) {
    let s = null; try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { s = null; }
    const d = defSave();
    if (!s || typeof s !== 'object' || Array.isArray(s)) return d;
    const out = Object.assign(d, s);
    out.rooms = s.rooms && typeof s.rooms === 'object' && !Array.isArray(s.rooms) ? s.rooms : {};
    out.stats = Object.assign(defSave().stats, s.stats && typeof s.stats === 'object' ? s.stats : {});
    out.total = recount(out, ids, bonus);
    return out;
  }

  // ---------- room 6: the cart floor (a small box-pushing puzzle) ----------
  // # wall  . mark  $ crate  @ you   (all rows the same width). Boxes can only be pushed, never pulled.
  const YARD_ROWS = [
    '#########',
    '#   #   #',
    '# $ # . #',
    '#@ $ $. #',
    '#   #   #',
    '#  .  # #',
    '#########',
  ];
  const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  function parseLevel(rows) {
    const walls = [], goals = [], crates = []; let p = null;
    rows.forEach((r, y) => { walls.push([...r].map(ch => ch === '#')); [...r].forEach((ch, x) => { if (ch === '.' || ch === '*' || ch === '+') goals.push([x, y]); if (ch === '$' || ch === '*') crates.push([x, y]); if (ch === '@' || ch === '+') p = [x, y]; }); });
    return { w: rows[0].length, h: rows.length, walls, goals, start: { p, c: crates } };
  }
  const YARD = parseLevel(YARD_ROWS);
  const isWall = (L, x, y) => x < 0 || y < 0 || x >= L.w || y >= L.h || L.walls[y][x];
  const crateAt = (st, x, y) => st.c.findIndex(q => q[0] === x && q[1] === y);
  // one step: returns the new state ({p, c, pushed}) or null when blocked
  function sokoMove(L, st, d) {
    const v = DIRS[d]; if (!v) return null;
    const nx = st.p[0] + v[0], ny = st.p[1] + v[1];
    if (isWall(L, nx, ny)) return null;
    const ci = crateAt(st, nx, ny);
    if (ci < 0) return { p: [nx, ny], c: st.c.map(q => q.slice()), pushed: false };
    const bx = nx + v[0], by = ny + v[1];
    if (isWall(L, bx, by) || crateAt(st, bx, by) >= 0) return null;
    const c = st.c.map(q => q.slice()); c[ci] = [bx, by];
    return { p: [nx, ny], c, pushed: true };
  }
  const sokoSolved = (L, st) => st.c.every(q => L.goals.some(g => g[0] === q[0] && g[1] === q[1]));
  const sokoKey = st => st.p.join(',') + '|' + st.c.map(q => q.join(',')).sort().join(';');
  // breadth-first search: the shortest list of moves ('UDLR' string) that solves it from st, or null when it cannot be solved
  function sokoSolve(L, st, limit) {
    st = st || L.start; limit = limit || 400000;
    if (sokoSolved(L, st)) return '';
    const prev = new Map([[sokoKey(st), null]]);
    let front = [st], n = 0;
    while (front.length) {
      const next = [];
      for (const s of front) {
        const k0 = sokoKey(s);
        for (const d of 'UDLR') {
          const t = sokoMove(L, s, d); if (!t) continue;
          const k = sokoKey(t); if (prev.has(k)) continue;
          prev.set(k, { from: k0, d });
          if (++n > limit) return null;
          if (sokoSolved(L, t)) { let out = '', cur = k; while (prev.get(cur)) { out = prev.get(cur).d + out; cur = prev.get(cur).from; } return out; }
          next.push(t);
        }
      }
      front = next;
    }
    return null;
  }

  // ---------- room 6: the jars and the ledger (a 3-digit lock) ----------
  // each shelf row: a picture and how many jars carry it. The ledger lists three of the pictures in order; the code is their counts.
  const JARS = [['gear', 3], ['sun', 4], ['star', 5], ['cloud', 1], ['moon', 2]];
  const LEDGER = ['moon', 'gear', 'star'];
  const countOf = k => { const r = JARS.find(j => j[0] === k); return r ? r[1] : 0; };
  const codeOf = () => LEDGER.map(countOf);

  return { scoreOf, rankOf, defSave, recount, readSave, YARD_ROWS, YARD, DIRS, parseLevel, sokoMove, sokoSolved, sokoSolve, JARS, LEDGER, countOf, codeOf };
});
