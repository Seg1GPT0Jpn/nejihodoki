// ナンバー工房 (Number Workshop / number-place) — pure logic. Runs in the page, in a Web Worker (new Worker('engine.js')) and in node
// (tools/tests/unit/sudoku-engine.test.js). Nothing here touches the DOM, Math.random or Date: the same (size, variant, level, seed)
// always gives the same puzzle.
//   - Geometry: 4x4 (2x2 boxes), 6x6 (2x3 boxes), 9x9 (3x3 boxes), optional X (both diagonals are extra units, 9x9 only).
//   - A bitmask backtracking solver (counts solutions, used to guarantee a UNIQUE solution).
//   - A technique solver (the "grader"): singles, subsets, locked candidates, fish, wings, trial. Each step is plain data
//     ({ tech, tier, cells, digit(s), place | elims, ... }) so the page can teach it (the hint explains WHY).
//   - A seeded generator that digs a solution down to a unique puzzle whose grade is exactly the asked level.
//   - Game: the play session (values, pencil marks, unlimited undo / redo, hints, mistakes, snapshot / restore).
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- seeded random (same functions as fit/engine.js)
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return {
      next, int: n => Math.floor(next() * n),
      shuffle(arr) { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = a2[i]; a2[i] = a2[j]; a2[j] = t; } return a2; },
    };
  }

  // ---------------------------------------------------------------- bits
  const POP = new Uint8Array(512); for (let i = 1; i < 512; i++) POP[i] = POP[i >> 1] + (i & 1);
  const bit = d => 1 << (d - 1);
  const DIG = new Uint8Array(512); for (let d = 1; d <= 9; d++) DIG[1 << (d - 1)] = d;
  const digitsOf = m => { const o = []; for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) o.push(d); return o; };
  const maskOf = ds => ds.reduce((m, d) => m | bit(d), 0);

  // ---------------------------------------------------------------- geometry
  const BOX = { 4: [2, 2], 6: [2, 3], 9: [3, 3] }; // [rows, cols] of a box
  const geoCache = {};
  function geometry(size, variant) {
    size = size | 0; if (!BOX[size]) throw new Error('bad size ' + size);
    variant = variant === 'x' && size === 9 ? 'x' : 'n';
    const key = size + variant; if (geoCache[key]) return geoCache[key];
    const N = size, NN = N * N, [bh, bw] = BOX[N];
    const units = [];
    const add = (type, index, cells) => units.push({ type, index, cells });
    for (let r = 0; r < N; r++) add('row', r, Array.from({ length: N }, (_, c) => r * N + c));
    for (let c = 0; c < N; c++) add('col', c, Array.from({ length: N }, (_, r) => r * N + c));
    const bAcross = N / bw, bDown = N / bh;
    for (let b = 0; b < bAcross * bDown; b++) {
      const br = Math.floor(b / bAcross), bc = b % bAcross, cells = [];
      for (let r = 0; r < bh; r++) for (let c = 0; c < bw; c++) cells.push((br * bh + r) * N + bc * bw + c);
      add('box', b, cells);
    }
    if (variant === 'x') {
      add('diag', 0, Array.from({ length: N }, (_, i) => i * N + i));
      add('diag', 1, Array.from({ length: N }, (_, i) => i * N + (N - 1 - i)));
    }
    const unitsOf = Array.from({ length: NN }, () => []);
    units.forEach((u, i) => u.cells.forEach(c => unitsOf[c].push(i)));
    const peers = unitsOf.map((us, c) => { const s = new Set(); us.forEach(u => units[u].cells.forEach(x => { if (x !== c) s.add(x); })); return Array.from(s).sort((a, b) => a - b); });
    const isPeer = Array.from({ length: NN }, (_, c) => { const a = new Uint8Array(NN); peers[c].forEach(x => { a[x] = 1; }); return a; });
    const boxOf = c => Math.floor(Math.floor(c / N) / bh) * bAcross + Math.floor((c % N) / bw);
    return (geoCache[key] = { N, NN, size: N, variant, bh, bw, units, unitsOf, peers, isPeer, boxOf, full: (1 << N) - 1, nBox: bAcross * bDown, nRowUnits: N });
  }

  // ---------------------------------------------------------------- board (values + candidate masks)
  function candidatesOf(geo, vals) {
    const cand = new Int16Array(geo.NN);
    for (let c = 0; c < geo.NN; c++) {
      if (vals[c]) continue;
      let m = geo.full;
      for (const p of geo.peers[c]) if (vals[p]) m &= ~bit(vals[p]);
      cand[c] = m;
    }
    return cand;
  }
  function makeBoard(geo, vals, elim) {
    const v = Int8Array.from(vals), cand = candidatesOf(geo, v);
    if (elim) for (let c = 0; c < geo.NN; c++) if (!v[c]) cand[c] &= ~elim[c];
    return { geo, vals: v, cand };
  }
  function cloneBoard(B) { return { geo: B.geo, vals: Int8Array.from(B.vals), cand: Int16Array.from(B.cand) }; }
  function setValue(B, c, d) {
    B.vals[c] = d; B.cand[c] = 0;
    const m = ~bit(d);
    for (const p of B.geo.peers[c]) if (!B.vals[p]) B.cand[p] &= m;
  }
  // does any digit repeat inside a unit?
  function conflictCells(geo, vals) {
    const bad = new Set();
    for (const u of geo.units) {
      const seen = {};
      for (const c of u.cells) { const d = vals[c]; if (!d) continue; (seen[d] = seen[d] || []).push(c); }
      for (const d in seen) if (seen[d].length > 1) seen[d].forEach(c => bad.add(c));
    }
    return Array.from(bad).sort((a, b) => a - b);
  }

  // ---------------------------------------------------------------- the backtracking solver (counts solutions)
  // Propagates naked and hidden singles, then branches on the cell with the fewest candidates.
  function propagate(geo, vals, cand) {
    const { units, unitsOf, peers } = geo, N = geo.N;
    let changed = true;
    while (changed) {
      changed = false;
      for (let c = 0; c < geo.NN; c++) {
        if (vals[c]) continue;
        const m = cand[c];
        if (m === 0) return false;
        if ((m & (m - 1)) === 0) {
          const d = DIG[m]; vals[c] = d; cand[c] = 0; const nm = ~m;
          for (const p of peers[c]) if (!vals[p]) { cand[p] &= nm; if (cand[p] === 0) return false; } else if (vals[p] === d) return false;
          changed = true;
        }
      }
      for (let u = 0; u < units.length; u++) {
        const cells = units[u].cells;
        let once = 0, twice = 0;
        for (let i = 0; i < N; i++) { const m = cand[cells[i]]; twice |= once & m; once |= m; }
        let placed = 0; for (let i = 0; i < N; i++) { const v = vals[cells[i]]; if (v) placed |= bit(v); }
        if ((once | placed) !== geo.full) return false;
        let only = once & ~twice;
        while (only) {
          const b = only & -only; only ^= b;
          for (let i = 0; i < N; i++) {
            const c = cells[i];
            if (!vals[c] && (cand[c] & b)) {
              vals[c] = DIG[b]; cand[c] = 0; const nm = ~b;
              for (const p of peers[c]) if (!vals[p]) { cand[p] &= nm; if (cand[p] === 0) return false; } else if (vals[p] === DIG[b]) return false;
              changed = true; break;
            }
          }
        }
      }
    }
    return true;
  }
  function search(geo, vals, cand, st) {
    if (!propagate(geo, vals, cand)) return;
    let best = -1, bp = 99;
    for (let c = 0; c < geo.NN; c++) if (!vals[c]) { const p = POP[cand[c]]; if (p < bp) { bp = p; best = c; if (p === 2) break; } }
    if (best < 0) { st.count++; if (!st.sol) st.sol = Int8Array.from(vals); return; }
    let ds = digitsOf(cand[best]);
    if (st.rnd) ds = st.rnd.shuffle(ds);
    for (const d of ds) {
      const v2 = Int8Array.from(vals), c2 = Int16Array.from(cand);
      v2[best] = d; c2[best] = 0; const nm = ~bit(d);
      for (const p of geo.peers[best]) if (!v2[p]) c2[p] &= nm;
      search(geo, v2, c2, st);
      if (st.count >= st.limit) return;
    }
  }
  // number of solutions of the given values (stops at `limit`). A grid with a repeated digit has none.
  function countSolutions(geo, vals, limit, rnd) {
    if (conflictCells(geo, vals).length) return 0;
    const v = Int8Array.from(vals), cand = candidatesOf(geo, v), st = { count: 0, limit: limit || 2, sol: null, rnd: rnd || null };
    for (let c = 0; c < geo.NN; c++) if (!v[c] && cand[c] === 0) return 0;
    search(geo, v, cand, st);
    return st.count;
  }
  // with the cell c emptied: is there a solution that does not put d back (so the puzzle would stop being unique)?
  function hasAlternative(geo, vals, c, d) {
    const v = Int8Array.from(vals), cand = candidatesOf(geo, v);
    cand[c] &= ~bit(d);
    if (cand[c] === 0) return false;
    const st = { count: 0, limit: 1, sol: null, rnd: null };
    search(geo, v, cand, st);
    return st.count > 0;
  }
  function solveOne(geo, vals, rnd) {
    if (conflictCells(geo, vals).length) return null;
    const v = Int8Array.from(vals), cand = candidatesOf(geo, v), st = { count: 0, limit: 1, sol: null, rnd: rnd || null };
    search(geo, v, cand, st);
    return st.sol;
  }

  // ---------------------------------------------------------------- techniques
  // tier: 1 入門 2 初級 3 中級 4 上級 5 難問 6 達人 (a puzzle's grade is the highest tier its easiest-first solution needs)
  const TECHS = {
    lastCell:   { tier: 1, order: 1 },
    nakedSingle: { tier: 1, order: 2 },
    hiddenSingleBox: { tier: 1, order: 3 },
    hiddenSingle: { tier: 2, order: 4 },
    nakedPair: { tier: 3, order: 5 },
    pointing: { tier: 3, order: 6 },
    claiming: { tier: 3, order: 7 },
    locked: { tier: 3, order: 8 },
    nakedTriple: { tier: 4, order: 9 },
    hiddenPair: { tier: 4, order: 10 },
    hiddenTriple: { tier: 4, order: 11 },
    xwing: { tier: 5, order: 12 },
    xywing: { tier: 5, order: 13 },
    swordfish: { tier: 6, order: 14 },
    xyzwing: { tier: 6, order: 15 },
    trial: { tier: 6, order: 16 },
  };
  const TIER_NAMES = { ja: ['', '入門', '初級', '中級', '上級', '難問', '達人'], en: ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert', 'Master'] };

  const mk = (tech, o) => Object.assign({ tech, tier: TECHS[tech].tier }, o);

  function findLastCell(B) {
    const { geo, vals, cand } = B;
    for (let u = 0; u < geo.units.length; u++) {
      let empty = -1, n = 0;
      for (const c of geo.units[u].cells) if (!vals[c]) { n++; empty = c; }
      if (n === 1 && POP[cand[empty]] === 1) return mk('lastCell', { unit: u, cells: [empty], digit: DIG[cand[empty]], place: [empty, DIG[cand[empty]]] });
    }
    return null;
  }
  function findNakedSingle(B) {
    const { geo, vals, cand } = B;
    for (let c = 0; c < geo.NN; c++) if (!vals[c] && POP[cand[c]] === 1) return mk('nakedSingle', { cells: [c], digit: DIG[cand[c]], place: [c, DIG[cand[c]]] });
    return null;
  }
  function findHiddenSingle(B, boxOnly) {
    const { geo, vals, cand } = B, N = geo.N;
    for (let u = 0; u < geo.units.length; u++) {
      const isBox = geo.units[u].type === 'box';
      if (boxOnly !== isBox) continue;
      const cells = geo.units[u].cells;
      for (let d = 1; d <= N; d++) {
        const b = bit(d); let n = 0, at = -1;
        for (const c of cells) if (!vals[c] && (cand[c] & b)) { n++; at = c; if (n > 1) break; }
        if (n === 1 && POP[cand[at]] > 1) return mk(isBox ? 'hiddenSingleBox' : 'hiddenSingle', { unit: u, cells: [at], digit: d, place: [at, d] });
      }
    }
    return null;
  }
  function combos(arr, k, f) {
    const idx = [];
    const rec = (start) => {
      if (idx.length === k) return f(idx.map(i => arr[i]));
      for (let i = start; i < arr.length; i++) { idx.push(i); const r = rec(i + 1); idx.pop(); if (r) return r; }
      return null;
    };
    return rec(0);
  }
  function findNakedSubset(B, k) {
    const { geo, vals, cand } = B;
    for (let u = 0; u < geo.units.length; u++) {
      const cells = geo.units[u].cells, empties = cells.filter(c => !vals[c]);
      if (empties.length <= k) continue;
      const pool = empties.filter(c => POP[cand[c]] >= 2 && POP[cand[c]] <= k);
      if (pool.length < k) continue;
      const hit = combos(pool, k, group => {
        let m = 0; for (const c of group) m |= cand[c];
        if (POP[m] !== k) return null;
        const elims = [];
        for (const c of empties) if (group.indexOf(c) < 0 && (cand[c] & m)) elims.push([c, cand[c] & m]);
        return elims.length ? { group, m, elims } : null;
      });
      if (hit) return mk(k === 2 ? 'nakedPair' : 'nakedTriple', { unit: u, cells: hit.group, digits: digitsOf(hit.m), elims: hit.elims });
    }
    return null;
  }
  function findHiddenSubset(B, k) {
    const { geo, vals, cand } = B, N = geo.N;
    for (let u = 0; u < geo.units.length; u++) {
      const cells = geo.units[u].cells, empties = cells.filter(c => !vals[c]);
      if (empties.length <= k) continue;
      const pos = {}; // digit -> cells
      for (let d = 1; d <= N; d++) { const b = bit(d), a = empties.filter(c => cand[c] & b); if (a.length >= 2 && a.length <= k) pos[d] = a; }
      const ds = Object.keys(pos).map(Number);
      if (ds.length < k) continue;
      const hit = combos(ds, k, group => {
        const set = new Set(); for (const d of group) pos[d].forEach(c => set.add(c));
        if (set.size !== k) return null;
        const m = maskOf(group), elims = [];
        for (const c of set) if (cand[c] & ~m) elims.push([c, cand[c] & ~m]);
        return elims.length ? { group, cells: Array.from(set).sort((a, b) => a - b), elims } : null;
      });
      if (hit) return mk(k === 2 ? 'hiddenPair' : 'hiddenTriple', { unit: u, cells: hit.cells, digits: hit.group, elims: hit.elims });
    }
    return null;
  }
  // pointing / claiming (and the diagonal version): every place of a digit in unit U sits inside another unit V
  function findLocked(B) {
    const { geo, vals, cand } = B, N = geo.N;
    for (let u = 0; u < geo.units.length; u++) {
      const cells = geo.units[u].cells;
      for (let d = 1; d <= N; d++) {
        const b = bit(d), P = cells.filter(c => !vals[c] && (cand[c] & b));
        if (P.length < 2) continue;
        for (const v of geo.unitsOf[P[0]]) {
          if (v === u) continue;
          const vc = geo.units[v].cells;
          if (!P.every(c => vc.indexOf(c) >= 0)) continue;
          const elims = [];
          for (const c of vc) if (!vals[c] && cells.indexOf(c) < 0 && (cand[c] & b)) elims.push([c, b]);
          if (!elims.length) continue;
          const tech = geo.units[u].type === 'box' ? 'pointing' : geo.units[v].type === 'box' ? 'claiming' : 'locked';
          return mk(tech, { unit: u, target: v, digit: d, cells: P, elims });
        }
      }
    }
    return null;
  }
  // fish on rows/columns: X-wing (k=2), Swordfish (k=3)
  function findFish(B, k) {
    const { geo, vals, cand } = B, N = geo.N;
    for (let d = 1; d <= N; d++) {
      const b = bit(d);
      for (const dir of ['row', 'col']) {
        const lines = []; // the lines whose digit has 2..k places, with the cross indexes
        for (let i = 0; i < N; i++) {
          const ps = []; for (let j = 0; j < N; j++) { const c = dir === 'row' ? i * N + j : j * N + i; if (!vals[c] && (cand[c] & b)) ps.push(j); }
          if (ps.length >= 2 && ps.length <= k) lines.push({ i, ps });
        }
        if (lines.length < k) continue;
        const hit = combos(lines, k, grp => {
          const cover = new Set(); grp.forEach(l => l.ps.forEach(j => cover.add(j)));
          if (cover.size !== k) return null;
          const base = new Set(grp.map(l => l.i)), elims = [];
          for (const j of cover) for (let i = 0; i < N; i++) { if (base.has(i)) continue; const c = dir === 'row' ? i * N + j : j * N + i; if (!vals[c] && (cand[c] & b)) elims.push([c, b]); }
          if (!elims.length) return null;
          const pattern = []; grp.forEach(l => l.ps.forEach(j => pattern.push(dir === 'row' ? l.i * N + j : j * N + l.i)));
          return { base: Array.from(base), cover: Array.from(cover).sort((a, c2) => a - c2), elims, pattern };
        });
        if (hit) return mk(k === 2 ? 'xwing' : 'swordfish', { digit: d, dir, base: hit.base, cover: hit.cover, cells: hit.pattern, elims: hit.elims });
      }
    }
    return null;
  }
  function findWing(B, xyz) {
    const { geo, vals, cand } = B;
    for (let p = 0; p < geo.NN; p++) {
      if (vals[p]) continue;
      const mp = cand[p];
      if (POP[mp] !== (xyz ? 3 : 2)) continue;
      const wings = geo.peers[p].filter(c => !vals[c] && POP[cand[c]] === 2);
      for (let i = 0; i < wings.length; i++) for (let j = i + 1; j < wings.length; j++) {
        const a = wings[i], bb = wings[j], ma = cand[a], mb = cand[bb];
        if (ma === mb) continue;
        const z = ma & mb; if (POP[z] !== 1) continue;
        if (xyz) { if ((ma & ~mp) || (mb & ~mp) || (ma | mb) !== mp) continue; }
        else { if ((mp & z) || POP[ma & mp] !== 1 || POP[mb & mp] !== 1 || (ma & mp) === (mb & mp)) continue; }
        const elims = [];
        for (let c = 0; c < geo.NN; c++) {
          if (vals[c] || c === p || c === a || c === bb || !(cand[c] & z)) continue;
          if (!geo.isPeer[a][c] || !geo.isPeer[bb][c]) continue;
          if (xyz && !geo.isPeer[p][c]) continue;
          elims.push([c, z]);
        }
        if (elims.length) return mk(xyz ? 'xyzwing' : 'xywing', { pivot: p, wings: [a, bb], cells: [p, a, bb], digit: DIG[z], digits: digitsOf(mp | z), elims });
      }
    }
    return null;
  }
  // trial: assume a candidate; when the rest cannot be completed, the candidate is out. Always finds something on a valid puzzle.
  function findTrial(B) {
    const { geo, vals, cand } = B;
    const order = [];
    for (let c = 0; c < geo.NN; c++) if (!vals[c]) order.push(c);
    order.sort((a, b) => POP[cand[a]] - POP[cand[b]] || a - b);
    // first by simple propagation (an explainable chain), then with a full search
    for (const deep of [false, true]) {
      for (const c of order) {
        for (const d of digitsOf(cand[c])) {
          const v = Int8Array.from(vals), cd = Int16Array.from(cand); v[c] = d; cd[c] = 0;
          for (const p of geo.peers[c]) if (!v[p]) cd[p] &= ~bit(d);
          let bad = false;
          if (!deep) {
            const r = chain(geo, v, cd);
            bad = r.bad;
            if (bad) return mk('trial', { cells: [c], digit: d, elims: [[c, bit(d)]], trial: { cell: c, digit: d, steps: r.steps, fail: r.fail, deep: false } });
          } else {
            if (POP[cand[c]] > 2 && !bad) { /* still try, it is the last resort */ }
            if (countSolutions(geo, v, 1) === 0) return mk('trial', { cells: [c], digit: d, elims: [[c, bit(d)]], trial: { cell: c, digit: d, steps: [], fail: null, deep: true } });
          }
        }
      }
    }
    return null;
  }
  // singles-only propagation that records what it placed, and where it fails (for the explanation)
  function chain(geo, v, cd) {
    const steps = []; let guard = 0;
    for (;;) {
      if (++guard > 200) return { bad: false, steps };
      let moved = false;
      for (let c = 0; c < geo.NN; c++) if (!v[c] && cd[c] === 0) return { bad: true, steps, fail: { cell: c, kind: 'empty' } };
      for (let c = 0; c < geo.NN && !moved; c++) {
        if (!v[c] && POP[cd[c]] === 1) { const d = DIG[cd[c]]; v[c] = d; cd[c] = 0; steps.push([c, d]); for (const p of geo.peers[c]) if (!v[p]) cd[p] &= ~bit(d); moved = true; }
      }
      if (moved) continue;
      for (let u = 0; u < geo.units.length && !moved; u++) {
        const cells = geo.units[u].cells;
        for (let d = 1; d <= geo.N; d++) {
          const b = bit(d); let n = 0, at = -1, has = false;
          for (const c of cells) { if (v[c] === d) has = true; else if (!v[c] && (cd[c] & b)) { n++; at = c; } }
          if (has) continue;
          if (n === 0) return { bad: true, steps, fail: { unit: u, digit: d, kind: 'nowhere' } };
          if (n === 1) { v[at] = d; cd[at] = 0; steps.push([at, d]); for (const p of geo.peers[at]) if (!v[p]) cd[p] &= ~b; moved = true; break; }
        }
      }
      if (!moved) return { bad: false, steps };
    }
  }

  // the finders in teaching order
  const FINDERS = [
    B => findLastCell(B), B => findNakedSingle(B), B => findHiddenSingle(B, true), B => findHiddenSingle(B, false),
    B => findNakedSubset(B, 2), B => findLocked(B), B => findNakedSubset(B, 3), B => findHiddenSubset(B, 2), B => findHiddenSubset(B, 3),
    B => findFish(B, 2), B => findWing(B, false), B => findFish(B, 3), B => findWing(B, true), B => findTrial(B),
  ];
  // the easiest step on the board (or null when nothing of tier <= maxTier applies)
  function findStep(B, maxTier) {
    maxTier = maxTier || 6;
    for (const f of FINDERS) { const s = f(B); if (s && s.tier <= maxTier) return s; }
    return null;
  }
  function applyStep(B, s) {
    if (s.place) setValue(B, s.place[0], s.place[1]);
    if (s.elims) for (const [c, m] of s.elims) if (!B.vals[c]) B.cand[c] &= ~m;
  }
  // the grade of a puzzle: { tier, solved, steps, counts }. With cap < 6 it stops as soon as a step above the cap is needed (tier = cap + 1).
  function grade(geo, givens, cap) {
    cap = cap || 6;
    const B = makeBoard(geo, givens), counts = {}; let tier = 1, steps = 0, left = 0;
    for (let c = 0; c < geo.NN; c++) if (!B.vals[c]) left++;
    while (left > 0) {
      let s = null;
      for (const f of FINDERS) { s = f(B); if (s) break; }
      if (!s) return { tier: Math.min(6, cap + 1), solved: false, steps, counts, stuck: true };
      if (s.tier > cap) return { tier: s.tier, solved: false, steps, counts, stuck: true };
      steps++; counts[s.tech] = (counts[s.tech] || 0) + 1; if (s.tier > tier) tier = s.tier;
      applyStep(B, s);
      if (s.place) left--;
      // an elimination may leave a cell without candidates only on an invalid board
    }
    return { tier, solved: true, steps, counts, stuck: false };
  }
  // all the singles on the board, applied in sweeps (naked singles and hidden singles in boxes; with lineHidden also in rows / columns / diagonals)
  function sweep(B, lineHidden) {
    const { geo, vals, cand } = B, N = geo.N; let n = 0, again = true;
    while (again) {
      again = false;
      for (let c = 0; c < geo.NN; c++) if (!vals[c] && (cand[c] & (cand[c] - 1)) === 0 && cand[c]) { setValue(B, c, DIG[cand[c]]); n++; again = true; }
      for (let u = 0; u < geo.units.length; u++) {
        if (!lineHidden && geo.units[u].type !== 'box') continue;
        const cells = geo.units[u].cells;
        for (let d = 1; d <= N; d++) {
          const b = bit(d); let k = 0, at = -1;
          for (const c of cells) if (!vals[c] && (cand[c] & b)) { k++; at = c; if (k > 1) break; }
          if (k === 1) { setValue(B, at, d); n++; again = true; }
        }
      }
    }
    return n;
  }
  // same tier as grade() but fast, and it never runs a finder above the cap (used while digging). { tier, solved }
  function gradeCapped(geo, givens, cap) {
    const B = makeBoard(geo, givens), top = FINDER_TIER_END[cap] || FINDERS.length; let left = 0, tier = 1;
    for (let c = 0; c < geo.NN; c++) if (!B.vals[c]) left++;
    while (left > 0) {
      left -= sweep(B, false);
      if (left <= 0) break;
      if (cap >= 2) { const n = sweep(B, true); if (n) { if (tier < 2) tier = 2; left -= n; continue; } }
      let s = null;
      for (let i = 4; i < top; i++) { s = FINDERS[i](B); if (s) break; }
      if (!s) return { tier: cap + 1, solved: false };
      if (s.tier > tier) tier = s.tier;
      applyStep(B, s);
      if (s.place) left--;
    }
    return { tier, solved: true };
  }
  // number of FINDERS that belong to tiers <= t
  const FINDER_TIER_END = { 1: 3, 2: 4, 3: 6, 4: 9, 5: 11, 6: 14 };

  // ---------------------------------------------------------------- explanations: which cells make a step true
  // blockers: for a placement, the cells that rule the other possibilities out; used by the page to highlight them.
  function explainData(B, s) {
    const { geo, vals } = B, out = {};
    if (s.tech === 'nakedSingle') {
      const c = s.cells[0], seen = [];
      for (let d = 1; d <= geo.N; d++) if (d !== s.digit) { const p = geo.peers[c].find(x => vals[x] === d); if (p != null) seen.push([d, p]); }
      out.blockers = seen;
    } else if (s.tech === 'hiddenSingle' || s.tech === 'hiddenSingleBox') {
      const seen = [];
      for (const c of geo.units[s.unit].cells) if (c !== s.cells[0] && !vals[c]) { const p = geo.peers[c].find(x => vals[x] === s.digit); if (p != null) seen.push([c, p]); }
      out.blockers = seen;
    }
    return out;
  }

  // ---------------------------------------------------------------- generator
  // levels (9x9): the grade must be exactly the level. minClues keeps the easy ones friendly; kids grids use the caps only.
  const LEVELS = [
    null,
    { id: 1, cap: 1, minClues: 36 },
    { id: 2, cap: 2, minClues: 32 },
    { id: 3, cap: 3, minClues: 28 },
    { id: 4, cap: 4, minClues: 26 },
    { id: 5, cap: 5, minClues: 0 },
    { id: 6, cap: 6, minClues: 0 },
  ];
  const KIDS_CLUES = { 4: [null, 10, 8, 6], 6: [null, 24, 20, 16] };
  const maxLevel = size => (size === 9 ? 6 : 3);
  const MAX_ATTEMPTS = 300;

  function randomSolution(geo, rnd) {
    const v = new Int8Array(geo.NN);
    const sol = solveOne(geo, v, rnd);
    return sol;
  }
  function dig(geo, sol, rnd, cap, minClues) {
    const vals = Int8Array.from(sol), order = rnd.shuffle(Array.from({ length: geo.NN }, (_, i) => i));
    let clues = geo.NN;
    for (const c of order) {
      if (clues <= minClues) break;
      const d = vals[c]; vals[c] = 0;
      let keep = hasAlternative(geo, vals, c, d); // another solution that differs at c?
      if (!keep && cap < 6) { const g = gradeCapped(geo, vals, cap); if (!g.solved) keep = true; }
      if (keep) vals[c] = d; else clues--;
    }
    return vals;
  }
  // generate({ size, variant, level, seed }) -> puzzle { size, variant, level, seed, givens[], solution[], clues, grade, attempts, code }
  function generate(spec) {
    const size = BOX[spec.size] ? spec.size | 0 : 9, variant = spec.variant === 'x' && size === 9 ? 'x' : 'n';
    const level = Math.max(1, Math.min(maxLevel(size), spec.level | 0 || 1)), seed = spec.seed >>> 0;
    const geo = geometry(size, variant);
    let best = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const rnd = rng(hash32('sudoku:' + size + variant + ':' + level + ':' + seed + ':' + attempt));
      const sol = randomSolution(geo, rnd);
      let givens, g;
      if (size === 9) {
        const L = LEVELS[level];
        givens = dig(geo, sol, rnd, L.cap, L.minClues);
        g = gradeCapped(geo, givens, level === 6 ? 5 : L.cap);
        const tier = g.solved ? g.tier : 6;
        const cand = { givens, sol, tier, attempt, clues: givens.reduce((n, v) => n + (v ? 1 : 0), 0) };
        if (tier === level) { best = cand; break; }
        if (!best || Math.abs(tier - level) < Math.abs(best.tier - level)) best = cand;
      } else {
        givens = dig(geo, sol, rnd, level, KIDS_CLUES[size][level]);
        best = { givens, sol, tier: level, attempt, clues: givens.reduce((n, v) => n + (v ? 1 : 0), 0) };
        break;
      }
    }
    const full = size === 9 && level === 6 ? { tier: 6, steps: 0, counts: {} } : grade(geo, best.givens, 6);
    return {
      size, variant, level, seed, givens: Array.from(best.givens), solution: Array.from(best.sol), clues: best.clues,
      grade: { tier: full.tier, steps: full.steps, counts: full.counts }, attempts: best.attempt + 1, exact: size === 9 ? best.tier === level : true,
      code: encodeCode({ size, variant, level, seed }),
    };
  }

  // ---------------------------------------------------------------- codes and the daily puzzle
  const b36 = n => (n >>> 0).toString(36).toUpperCase().padStart(7, '0');
  function encodeCode(s) { return 'SD' + s.size + (s.variant === 'x' ? 'X' : 'N') + s.level + '-' + b36(s.seed); }
  function decodeCode(str) {
    const m = /^SD([469])([NX])([1-6])-?([0-9A-Z]{1,7})$/.exec(String(str == null ? '' : str).toUpperCase().replace(/[\s　_]/g, ''));
    if (!m) return null;
    const size = +m[1], variant = m[2] === 'X' ? 'x' : 'n', level = +m[3], seed = parseInt(m[4], 36);
    if (!(seed >= 0 && seed <= 4294967295)) return null;
    if (variant === 'x' && size !== 9) return null;
    if (level > maxLevel(size)) return null;
    return { size, variant, level, seed };
  }
  // the daily puzzle: one 9x9 for everybody (the level follows the weekday: Sun 3, Mon 1, Tue 2, Wed 3, Thu 4, Fri 5, Sat 6)
  const DAILY_LEVELS = [3, 1, 2, 3, 4, 5, 6];
  function weekday(dk) { const y = Math.floor(dk / 10000), m = Math.floor(dk / 100) % 100, d = dk % 100; return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function dailySpec(dk) { return { size: 9, variant: 'n', level: DAILY_LEVELS[weekday(dk)], seed: hash32('kobo:sudoku:' + dk) }; }
  function addDays(dk, n) { const y = Math.floor(dk / 10000), m = Math.floor(dk / 100) % 100, d = dk % 100; const t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(); }

  // ---------------------------------------------------------------- the play session
  class Game {
    constructor(puz, opts) {
      this.puz = puz; this.geo = geometry(puz.size, puz.variant); const NN = this.geo.NN;
      this.given = Int8Array.from(puz.givens); this.sol = Int8Array.from(puz.solution);
      this.vals = Int8Array.from(puz.givens); this.notes = new Int16Array(NN); this.elim = new Int16Array(NN);
      this.undoStack = []; this.redoStack = []; this.mistakes = 0; this.hints = 0; this.auto = !!(opts && opts.auto); this.usedNotes = 0; this.moves = 0;
      this.bad = new Set(); // cells that were ever wrong (for the stats)
    }
    isGiven(c) { return this.given[c] !== 0; }
    // one undoable action = a list of [cell, oldVal, oldNotes, newVal, newNotes]
    _commit(diff, meta) {
      if (!diff.length) return false;
      this.undoStack.push({ d: diff, m: meta || null }); this.redoStack.length = 0; this.moves++; return true;
    }
    _rec(diff, c) { if (!diff.some(x => x[0] === c)) diff.push([c, this.vals[c], this.notes[c], this.vals[c], this.notes[c]]); return diff.find(x => x[0] === c); }
    _set(diff, c, val, notes) { const e = this._rec(diff, c); this.vals[c] = val; this.notes[c] = notes; e[3] = val; e[4] = notes; }
    // put a digit (0 erases). Returns false when nothing changed.
    put(c, d) {
      if (c < 0 || c >= this.geo.NN || this.given[c]) return false;
      d = d | 0; if (d < 0 || d > this.geo.N) return false;
      if (this.vals[c] === d && (d !== 0 || this.notes[c] === 0)) return false;
      const old = this.vals[c], diff = [];
      this._rec(diff, c);
      if (d === 0) {
        this._set(diff, c, 0, this.auto ? this._candidate(c, old) : 0);
        if (this.auto && old) for (const p of this.geo.peers[c]) if (!this.vals[p] && !this.given[p]) { const ok = this._candidate(p, 0) & bit(old); if (ok) this._set(diff, p, 0, this.notes[p] | bit(old)); }
      } else {
        this._set(diff, c, d, 0);
        if (this.auto) {
          const m = ~bit(d);
          for (const p of this.geo.peers[c]) if (!this.vals[p] && (this.notes[p] & bit(d))) this._set(diff, p, 0, this.notes[p] & m);
          if (old) for (const p of this.geo.peers[c]) if (!this.vals[p] && this._candidate(p, 0) & bit(old)) this._set(diff, p, 0, this.notes[p] | bit(old));
        }
        if (this.sol[c] !== d) { this.mistakes++; this.bad.add(c); }
      }
      return this._commit(diff, { wrong: d !== 0 && this.sol[c] !== d });
    }
    _candidate(c, ignoreDigit) { // constraint candidates of an empty cell (minus what the hints took out)
      let m = this.geo.full & ~this.elim[c];
      for (const p of this.geo.peers[c]) if (this.vals[p] && this.vals[p] !== ignoreDigit) m &= ~bit(this.vals[p]);
      return m;
    }
    toggleNote(c, d) {
      if (this.given[c] || this.vals[c] || d < 1 || d > this.geo.N) return false;
      const diff = []; this._rec(diff, c); this._set(diff, c, 0, this.notes[c] ^ bit(d)); this.usedNotes++;
      return this._commit(diff);
    }
    clearNotes(c) {
      if (this.given[c] || this.vals[c] || !this.notes[c]) return false;
      const diff = []; this._rec(diff, c); this._set(diff, c, 0, 0); return this._commit(diff);
    }
    // fill every empty cell's marks with all the candidates (one undo step)
    fillNotes() {
      const diff = [];
      for (let c = 0; c < this.geo.NN; c++) if (!this.vals[c]) { const m = this._candidate(c, 0); if (m !== this.notes[c]) { this._rec(diff, c); this._set(diff, c, 0, m); } }
      return this._commit(diff);
    }
    clearAllNotes() {
      const diff = [];
      for (let c = 0; c < this.geo.NN; c++) if (!this.vals[c] && this.notes[c]) { this._rec(diff, c); this._set(diff, c, 0, 0); }
      return this._commit(diff);
    }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undo() {
      const a = this.undoStack.pop(); if (!a) return null;
      for (const [c, ov, on] of a.d) { this.vals[c] = ov; this.notes[c] = on; }
      this.redoStack.push(a); return a.d.map(x => x[0]);
    }
    redo() {
      const a = this.redoStack.pop(); if (!a) return null;
      for (const [c, , , nv, nn] of a.d) { this.vals[c] = nv; this.notes[c] = nn; }
      this.undoStack.push(a); return a.d.map(x => x[0]);
    }
    solved() { for (let c = 0; c < this.geo.NN; c++) if (this.vals[c] !== this.sol[c]) return false; return true; }
    filled() { for (let c = 0; c < this.geo.NN; c++) if (!this.vals[c]) return false; return true; }
    left() { let n = 0; for (let c = 0; c < this.geo.NN; c++) if (!this.vals[c]) n++; return n; }
    wrongCells() { const o = []; for (let c = 0; c < this.geo.NN; c++) if (this.vals[c] && this.vals[c] !== this.sol[c]) o.push(c); return o; }
    conflicts() { return conflictCells(this.geo, this.vals); }
    count(d) { let n = 0; for (let c = 0; c < this.geo.NN; c++) if (this.vals[c] === d) n++; return n; }
    // the next teachable step. A wrong digit comes first. Never changes the game.
    hint() {
      const bad = this.wrongCells();
      if (bad.length) return { tech: 'mistake', tier: 0, cells: bad, place: null };
      const B = makeBoard(this.geo, this.vals, this.elim);
      const s = findStep(B, 6);
      if (!s) return null;
      return Object.assign(s, explainData(B, s));
    }
    // carry a hint out: a placement is filled in, eliminations are remembered (and taken out of the marks)
    applyHint(s) {
      if (!s || s.tech === 'mistake') return false;
      this.hints++;
      const diff = [];
      if (s.elims) for (const [c, m] of s.elims) {
        this.elim[c] |= m;
        if (this.vals[c]) continue;
        // the marks show what is left: a cell without marks gets its remaining candidates written in
        const next = this.notes[c] ? this.notes[c] & ~m : this._candidate(c, 0);
        if (next !== this.notes[c]) { this._rec(diff, c); this._set(diff, c, 0, next); }
      }
      if (diff.length) this._commit(diff, { hint: true });
      if (s.place) { const ok = this.put(s.place[0], s.place[1]); return ok; }
      return true;
    }
    snapshot() {
      const hist = this.undoStack.slice(-1500).map(a => a.d);
      return {
        v: 1, vals: Array.from(this.vals).join(''), notes: Array.from(this.notes).join(','), elim: Array.from(this.elim).join(','),
        mistakes: this.mistakes, hints: this.hints, auto: this.auto ? 1 : 0, usedNotes: this.usedNotes, moves: this.moves, bad: Array.from(this.bad),
        undo: hist, redo: this.redoStack.map(a => a.d),
      };
    }
    restore(s) {
      if (!s || s.v !== 1 || typeof s.vals !== 'string' || s.vals.length !== this.geo.NN) return false;
      const NN = this.geo.NN, N = this.geo.N, full = this.geo.full;
      const vals = Array.from(s.vals, ch => +ch), notes = String(s.notes || '').split(',').map(Number), elim = String(s.elim || '').split(',').map(Number);
      for (let c = 0; c < NN; c++) {
        if (!(vals[c] >= 0 && vals[c] <= N)) return false;
        if (this.given[c] && vals[c] !== this.given[c]) return false;
      }
      this.vals = Int8Array.from(vals);
      this.notes = new Int16Array(NN); this.elim = new Int16Array(NN);
      for (let c = 0; c < NN; c++) { this.notes[c] = this.vals[c] ? 0 : ((notes[c] | 0) & full); this.elim[c] = (elim[c] | 0) & full; }
      this.mistakes = s.mistakes | 0; this.hints = s.hints | 0; this.auto = !!s.auto; this.usedNotes = s.usedNotes | 0; this.moves = s.moves | 0;
      this.bad = new Set(Array.isArray(s.bad) ? s.bad.filter(x => x >= 0 && x < NN) : []);
      const cleanDiff = d => Array.isArray(d) && d.every(e => Array.isArray(e) && e.length === 5 && e[0] >= 0 && e[0] < NN);
      this.undoStack = (Array.isArray(s.undo) ? s.undo : []).filter(cleanDiff).map(d => ({ d, m: null }));
      this.redoStack = (Array.isArray(s.redo) ? s.redo : []).filter(cleanDiff).map(d => ({ d, m: null }));
      return true;
    }
  }

  const Sudoku = {
    LEVELS, TECHS, TIER_NAMES, DAILY_LEVELS, MAX_ATTEMPTS,
    hash32, rng, bit, digitsOf, maskOf, POP, geometry, candidatesOf, makeBoard, cloneBoard, setValue, conflictCells,
    countSolutions, solveOne, findStep, applyStep, grade, gradeCapped, explainData, generate, maxLevel,
    encodeCode, decodeCode, dailySpec, weekday, addDays, Game,
    dailySeed: dk => hash32('kobo:sudoku:' + dk),
    // generate on the main thread, in small slices of work between timers (the page's fallback when there is no Worker)
  };

  // ---------------------------------------------------------------- Worker: { id, spec } -> { id, puzzle }
  const isWorker = typeof root.importScripts === 'function' && typeof root.document === 'undefined' && typeof module === 'undefined';
  if (isWorker) {
    root.onmessage = e => {
      const m = e.data || {};
      try { root.postMessage({ id: m.id, puzzle: Sudoku.generate(m.spec) }); } catch (err) { root.postMessage({ id: m.id, error: String(err && err.message || err) }); }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = Sudoku; else root.SudokuEngine = Sudoku;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
