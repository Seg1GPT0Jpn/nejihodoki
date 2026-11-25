// manabi/gen.js（自動でつくる問題・特別コース）の単体テスト：答えはコードで計算し直して確かめる。
// 実行：node tools/tests/unit/manabi-gen.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'manabi/engine.js')); globalThis.ManabiEngine = E;
const G = require(path.join(ROOT, 'manabi/gen.js'));
const C = path.join(ROOT, 'manabi/content/');
const content = { kobun: require(C + 'kobun.json'), science: require(C + 'science.json'), social: require(C + 'social.json'), mapJp: require(C + 'map-jp.json'), mapWorld: require(C + 'map-world.json') };
const solve = q => { // 正しい入力をつくる
  if (q.t === 'mp') return q.pairs; if (q.t === 'wb') return q.a; if (q.t === 'ft') { const o = {}; q.cells.forEach((c, i) => { if (c && c.ask) o[i] = c.v[0]; }); return o; }
  return q.a;
};
test('24 special units; every one makes 8 questions that accept their own answer and reject wrong ones', () => {
  eq(G.UNITS.length, 24);
  for (const u of G.UNITS) for (const seed of ['a', 'b', 'c', 'd']) {
    const qs = G.make(u.id, seed, content, 8); eq(qs.length, 8, u.id);
    for (const q of qs) {
      ok(q.q && q.i && q.t, u.id); eq(E.check(q, solve(q)).ok, true, u.id + ' ' + q.t + ' ' + q.q.slice(0, 30));
      if (q.t === 'mc') ok(!E.check(q, q.c.map(c => c[0]).find(l => l !== q.a)).ok);
      if (q.t === 'hs') ok(!E.check(q, Object.keys(q.rg).find(k => k !== q.a)).ok);
      if (q.t === 'mp') ok(new Set(q.pairs.map(p => p[0])).size === q.pairs.length, 'unique lefts');
    }
  }
});
test('generation is deterministic', () => { for (const u of G.UNITS) { eq(JSON.stringify(G.make(u.id, 'z', content, 8)), JSON.stringify(G.make(u.id, 'z', content, 8)), u.id); } });
test('歴史的仮名遣い: every authored answer equals the code-converted form', () => {
  for (const [old, modern, kind] of content.kobun.kana) eq(G.toModern(old, kind), modern, old);
  eq(G.toModern('けふ', 'l'), 'きょう'); eq(G.toModern('いふ', 'h'), 'いう'); eq(content.kobun.kana.length >= 40, true);
});
test('science drills: independent recomputation of every numeric answer', () => {
  for (let k = 0; k < 400; k++) {
    const r = E.rng(k + 1);
    for (const name of Object.keys(G.DRILLS)) {
      const q = G.DRILLS[name](r), nums = (q.q.match(/[0-9.]+/g) || []).map(Number);
      ok(Number.isFinite(Number(q.a)) && Number(q.a) > 0, name + ' ' + q.a); eq(E.check(q, q.a + q.un).ok, true, name);
      // 解説の式に出てくる最後の数が答えと一致
      const last = (q.e.match(/[＝=]\s*(-?[0-9.]+)\s*[^0-9.]*$/) || [])[1]; if (last) ok(Math.abs(Number(last) - Number(q.a)) < 1e-9, name + ' explain ' + q.e + ' vs ' + q.a);
    }
    const c = G.convQ(r); ok(Number.isFinite(Number(c.a)), c.q);
  }
});
test('density / speed / ohm / concentration / mol / kinematics: formula spot checks', () => {
  const T = (name, f) => { for (let k = 1; k <= 60; k++) { const q = G.DRILLS[name](E.rng(k)); f(q, q.q.match(/[0-9.]+/g).map(Number)); } };
  T('ohm', (q, n) => { const a = Number(q.a); if (/電圧は/.test(q.q)) ok(Math.abs(a - n[0] * n[1]) < 1e-9); else if (/抵抗は/.test(q.q)) ok(Math.abs(a - n[0] / n[1]) < 1e-9); else ok(Math.abs(a - n[1] / n[0]) < 1e-9); });
  T('conc', (q, n) => { const a = Number(q.a); if (/濃度は/.test(q.q)) ok(Math.abs(a - 100 * n[0] / (n[0] + n[1])) < 1e-9); else ok(Math.abs(a - n[1] * n[0] / 100) < 1e-9); });
  T('kin', (q, n) => { const [v0, a, t] = [n[0], n[1], n[2]]; /速さ/.test(q.q) ? ok(Number(q.a) === v0 + a * t) : ok(Math.abs(Number(q.a) - (v0 * t + a * t * t / 2)) < 1e-9); });
});
test('timeline ordering answers are sorted by year in the data (years unique)', () => {
  const ys = content.social.timeline.map(x => x[0]); eq(new Set(ys).size, ys.length);
  for (let k = 0; k < 40; k++) { const q = G.make('C1', 's' + k, content, 1)[0]; const evs = q.a.map(l => q.c.find(c => c[0] === l)[1]); const years = evs.map(e => content.social.timeline.find(t => t[1] === e)[0]); ok(years.every((y, i) => !i || years[i - 1] < y)); }
});
test('maps: 47 prefectures; every id/name matches the authored table; capitals and regions complete', () => {
  eq(content.mapJp.prefs.length, 47); const P = content.social.prefs; eq(Object.keys(P).length, 47);
  for (const p of content.mapJp.prefs) { ok(P[p.id], p.id); ok(p.d.length > 20 && /^M/.test(p.d), p.ja); ok(/(都|道|府|県)$/.test(p.ja), p.ja); }
  const regs = new Set(Object.values(P).map(x => x[1])); eq(regs.size, 8); for (const r of regs) ok(content.social.regions[r]);
  const expect = { kanto: 7, tohoku: 6, chubu: 9, kinki: 7, chugoku: 5, shikoku: 4, kyushu: 8, hokkaido: 1 }; for (const [r, n] of Object.entries(expect)) eq(Object.values(P).filter(x => x[1] === r).length, n, r);
  const names = ['北海道', '東京都', '大阪府', '京都府', '沖縄県', '愛知県']; for (const n of names) ok(content.mapJp.prefs.some(p => p.ja === n), n);
  eq(P['13'][0].startsWith('東京'), true); eq(P['14'][0], '横浜市'); eq(P['23'][0], '名古屋市'); eq(P['47'][0], '那覇市');
  const wn = content.social.worldNames; for (const id of Object.keys(wn)) ok(content.mapWorld.countries.some(c => c.id === id), 'world ' + id); eq(content.mapWorld.countries.find(c => c.id === 'USA').ja.includes('アメリカ'), true);
  for (const c of content.mapWorld.countries) ok(c.d.length > 10, c.id);
});
test('content is flagged AI-made / unreviewed and classics are public domain titles', () => {
  for (const k of ['kobun', 'science', 'social']) { eq(content[k].ai, 1); ok(/AI作成・未レビュー/.test(content[k].note)); }
  ok(content.kobun.passages.every(p => /徒然草|枕草子|平家物語|竹取物語/.test(p.title)));
  for (const w of content.kobun.waka) { ok(w.idx.every(i => i < w.tokens.length)); ok(['枕詞', '掛詞'].includes(w.kind)); }
  for (const k of content.kobun.kanbun) eq([...k.order].sort().join(), k.tiles.map((_, i) => i).join(), k.yomi);
  for (const p of content.kobun.pos) ok(p.tk.every(t => ['n', 'v', 'p', 'a', 'j', 'd'].includes(t[1])) && p.tk.map(t => t[0]).join('') .length > 3);
  for (const v of content.kobun.verbs) eq(v.forms.length, 6);
  for (const a of content.kobun.aux) eq(a.forms.length, 6);
  for (const k of content.kobun.kakari) ok(k.forms[3] !== k.forms[4], k.n);
});
test('auto-conversion of existing English short answers (word bank / listen / fill-in-blank)', () => {
  const pool = [{ i: 'a', t: 'sa', q: '英語に直しなさい。', a: 'I like playing tennis with my friends.', df: 2, e: 'x' }, { i: 'b', t: 'sa', q: 'q', a: 'She goes to school by bus every day.', df: 2 }, { i: 'c', t: 'sa', q: 'q', a: 'They are studying English in the library now.', df: 2 }, { i: 'd', t: 'sa', q: 'q', a: 'We will visit our grandmother next Sunday.', df: 2 }];
  const kinds = new Set();
  for (let k = 0; k < 40; k++) { const v = G.variantOf(pool[0], pool, 'd' + k); if (!v) continue; kinds.add(v.t + (v.sp ? '-ls' : v.q.includes('blank') ? '-fb' : ''));
    if (v.t === 'wb') { eq(E.check(v, v.a).ok, true); const sh = v.a.slice().reverse(); eq(E.check(v, sh).ok, false); }
    else { eq(E.check(v, v.a).ok, true); ok(v.c.length === 4 && v.c.filter(c => c[1] === pool[0].a || v.q.includes('blank')).length >= 1); } }
  ok(kinds.size >= 2, [...kinds].join());
  eq(G.variantOf({ i: 'z', t: 'sa', q: 'q', a: '$x+1$', df: 1 }, pool, 'x'), null); eq(G.variantOf({ i: 'z', t: 'sa', q: 'q', a: 'こんにちは', df: 1 }, pool, 'x'), null);
});
run('manabi-gen');
