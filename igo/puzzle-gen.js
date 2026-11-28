#!/usr/bin/env node
// 囲碁工房：詰碁の問題集（puzzles.js）をつくる道具。自作の読み（tsumego.js）で、正解の手と、ほかの手が「まちがい」であることを示せたものだけを入れる。
//   node igo/puzzle-gen.js [個数=120] [種=1] [--write]       --write のとき igo/puzzles.js に書く（なければ画面に数だけ出す）
// 読みきれなかった（コウになる・深すぎる）ものは「未確認（v:0）」として数え、問題集には入れない。
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');
const T = require('./tsumego.js');
const N = 9;
const want = +(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 120);
const seed = +(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 1);
const write = process.argv.includes('--write');
const outArg = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
const rnd = E.rng(seed * 7919 + 13);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const NB = E.geo(N).nb;

function grow(window, size, seedCell) {
  const set = new Set([seedCell]); const list = [seedCell]; let guard = 0;
  while (set.size < size && guard++ < 400) {
    const c = list[ri(0, list.length - 1)], cand = NB[c].filter(q => window.has(q) && !set.has(q));
    if (!cand.length) continue; const q = cand[ri(0, cand.length - 1)]; set.add(q); list.push(q);
  }
  return set;
}
function gen() {
  const kind = rnd() < 0.8 ? 'corner' : 'edge';
  const h = ri(3, 5), w = ri(4, 7), off = kind === 'edge' ? ri(1, 8 - w) : 0;
  const win = new Set(); for (let r = 0; r < h; r++) for (let c = off; c < off + w && c < N; c++) win.add(r * N + c);
  const corner = kind === 'corner' ? 0 : ri(off, off + w - 1);
  const P = grow(win, ri(9, 17), corner);
  if (P.size < 8) return null;
  const wall = new Set(); const DG = E.geo(N).dg; for (const c of P) { for (const q of NB[c]) if (!P.has(q)) wall.add(q); for (const q of DG[c]) if (!P.has(q)) wall.add(q); }
  // 守りの石
  const Dn = ri(3, Math.min(8, P.size - 4)); const pl = [...P];
  const D = grow(P, Dn, pl[ri(0, pl.length - 1)]);
  if (D.size < 3) return null;
  const rest = pl.filter(c => !D.has(c));
  const inner = new Set(); const ni = rnd() < 0.45 ? ri(1, 2) : 0;
  for (let k = 0; k < ni; k++) { const c = rest[ri(0, rest.length - 1)]; inner.add(c); }
  const b = new Array(81).fill('.'); const rg = new Array(81).fill('0');
  for (const c of P) rg[c] = '1';
  for (const c of wall) b[c] = 'x';
  for (const c of inner) b[c] = 'x';
  for (const c of D) b[c] = 'o';
  // 反則（呼吸点のない石）をさける
  const bs = b.join('');
  const st = E.create({ n: N }); for (let i = 0; i < 81; i++) st.b[i] = bs[i] === 'x' ? 1 : bs[i] === 'o' ? 2 : 0;
  for (const c of inner) { let l = 0; for (const q of NB[c]) if (P.has(q) && !st.b[q]) l++; if (!l) return null; }
  { const ch = E.chain(st.b, N, [...D][0]); let l = 0; for (const q of ch.cells) for (const r of NB[q]) if (P.has(r) && !st.b[r]) l++; if (!l) return null; }
  const eyes = P.size - D.size - inner.size; if (eyes < 3) return null;
  return { b: bs, rg: rg.join(''), t: [...D][0], D, P, kind };
}

const quota = { easy: Math.round(want * 0.3), mid: Math.round(want * 0.5), hard: want - Math.round(want * 0.3) - Math.round(want * 0.5) }, have = { easy: 0, mid: 0, hard: 0 };
const bucket = d => (d <= 2 ? 'easy' : d <= 4 ? 'mid' : 'hard');
const mergeDir = (process.argv.find(a => a.startsWith('--merge=')) || '').slice(8);
const bank = [], seen = new Set(); let tries = 0, unver = 0, trivial = 0; const t0 = Date.now(); const unverified = [];
if (mergeDir) {   // 複数の種で別々に作った部分（--json=）を、重複を除いてひとつにまとめる
  for (const f of fs.readdirSync(mergeDir).filter(x => /^part.*\.json$/.test(x)).sort()) {
    const part = JSON.parse(fs.readFileSync(path.join(mergeDir, f), 'utf8')); unver += part.unver || 0; for (const u of part.unverified || []) if (unverified.length < 50) unverified.push(u);
    for (const p of part.bank) {
      let canon = null; for (let k = 0; k < 8; k++) { for (const sw of [0, 1]) { let b = T.transform(p.b, k); if (sw) b = T.swapColors(b); const s2 = b + T.transform(p.rg, k) + p.ty + (sw ? 3 - p.hero : p.hero); if (canon === null || s2 < canon) canon = s2; } }
      if (seen.has(canon)) continue; seen.add(canon); bank.push(p);
    }
  }
  tries = -1;
}
while (!mergeDir && bank.length < want && tries < 600000) {
  tries++;
  const g = gen(); if (!g) continue;
  const ty = tries % 2 === 0 ? 'kill' : 'live';
  const pz = { b: g.b, rg: g.rg, t: g.t, ty, hero: ty === 'kill' ? 1 : 2 };
  // 守りは白（o）、攻めは黒（x）。live のときは、手番（hero）は守りの白
  const r0 = T.solve(pz, { maxD: 4, cap: 60000 });
  if (!r0.ans.length || r0.pass === ty) { trivial++; continue; }              // 最初から正解がない・パスでも正解 → つまらない
  if (r0.ans.length > 3) continue;
  const r = T.solve(pz, { maxD: 11, cap: 800000 });
  if (!r.ans.length || r.pass === ty || r.ans.length > 3) { continue; }
  if (r.ok && have[bucket(r.depth)] >= quota[bucket(r.depth)]) continue;
  if (!r.ok) { unver++; if (unverified.length < 50) unverified.push({ b: g.b, rg: g.rg, t: g.t, ty, v: 0, unk: r.unknown.length }); continue; }
  // 正規形で重複を除く
  let canon = null; for (let k = 0; k < 8; k++) { const s = T.transform(g.b, k) + T.transform(g.rg, k) + ty; if (canon === null || s < canon) canon = s; }
  if (seen.has(canon)) continue; seen.add(canon); have[bucket(r.depth)]++;
  // ランダムな向き・色
  const k = ri(0, 7), sw = rnd() < 0.5;
  let b2 = T.transform(g.b, k), rg2 = T.transform(g.rg, k); let t2 = T.transformCell(g.t, k), ans2 = r.ans.map(c => T.transformCell(c, k)).sort((a, b) => a - b);
  let hero = pz.hero; if (sw) { b2 = T.swapColors(b2); hero = 3 - hero; }
  bank.push({ id: 'g' + String(bank.length + 1).padStart(3, '0'), b: b2, rg: rg2, t: t2, ty, hero, a: ans2, dp: r.depth, v: 1, kind: g.kind });
  if (outArg) fs.writeFileSync(outArg, JSON.stringify({ bank, unverified, unver }));
  if (bank.length % 10 === 0) console.error('..', bank.length, 'tries', tries, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
// むずかしさ（正解を示すのに必要だった手数）の順
bank.sort((a, b) => a.dp - b.dp || a.a.length - b.a.length || (a.b < b.b ? -1 : 1));
bank.forEach((p, i) => { p.id = 'g' + String(i + 1).padStart(3, '0'); });
console.error(`bank ${bank.length} verified, ${unver} unverified, ${trivial} trivial, tries ${tries}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const dist = {}; for (const p of bank) dist[p.dp] = (dist[p.dp] || 0) + 1; console.error('depth distribution', JSON.stringify(dist), 'kill', bank.filter(p => p.ty === 'kill').length, 'live', bank.filter(p => p.ty === 'live').length);
if (outArg) fs.writeFileSync(outArg, JSON.stringify({ bank, unverified, unver }));
if (write) {
  const row = p => '  ' + JSON.stringify({ id: p.id, b: p.b, rg: p.rg, t: p.t, ty: p.ty, hero: p.hero, a: p.a, dp: p.dp, v: 1 });
  const hold = unverified.map(p => '  ' + JSON.stringify(p));
  const src = `// 囲碁工房：詰碁の問題集。igo/puzzle-gen.js が、自作の読み（igo/tsumego.js）で「正解の手が読み切れて、ほかの手（パスも）がまちがいと示せた」ものだけを書き出したもの。
// 読みきれなかった問題（コウ・深すぎる）は held に置き、使わない（v:0）。b＝盤（81文字 . x o）、rg＝打てる点（1）、t＝取る／助ける石、ty＝kill|live、hero＝手番の色、a＝正解のマス、dp＝示すのに必要な手数。
(function (root) {
  'use strict';
  const bank = [
${bank.map(row).join(',\n')}
  ];
  const held = [
${hold.join(',\n')}
  ];
  const API = { bank, held, meta: { seed: ${seed}, verified: ${bank.length}, unverified: ${unver}, generated: '${new Date().toISOString().slice(0, 10)}' } };
  root.IgoPuzzles = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
  fs.writeFileSync(path.join(__dirname, 'puzzles.js'), src);
  console.error('wrote igo/puzzles.js');
}
