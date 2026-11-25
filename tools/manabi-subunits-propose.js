#!/usr/bin/env node
// まなびの工房：単元を細かい「小単元」に分ける案を作る（一度だけ実行。結果は tools/manabi-subunits.json に入れて、ビルドは毎回それを読む＝いつも同じ結果）
//   node tools/manabi-subunits-propose.js --src <問題データ> --ask <cl.sh のパス> [--only UNIT_ID] [--jobs 6]
// 手順：問題の variant_group（同じ型の問題の名前）をまとめて、AI に「3〜5 個の小単元」に分ける案を出してもらい（日本語の名前・めあて・順番つき）、
//        コードで検査して直す（すべての variant_group がちょうど1か所に入る・小単元は 12 問以上・ちょうど 2〜6 個）。
//        AI の案がこわれていたら、コードだけで分ける（variant_group の名前順に、およそ 16 問ずつ）。
// 鍵はこのスクリプトにもリポジトリにも入っていない（cl.sh が自分の場所の鍵を読む）。
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const av = process.argv.slice(2), at = k => { const i = av.indexOf(k); return i >= 0 ? av[i + 1] : null; };
const SRC = at('--src'), ASK = at('--ask'), ONLY = at('--only'), JOBS = Number(at('--jobs') || 6);
const OUT = path.join(__dirname, 'manabi-subunits.json');
const MIN = 8; // 小単元は 8 問以上（1レッスンぶん）。めやすは 10〜16 問

function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.json') ? [path.join(d, e.name)] : [])); }
function collect() {
  const cmap = JSON.parse(fs.readFileSync(path.join(SRC, 'schemas/curriculum_map.json'), 'utf8')), meta = {};
  (function w(o) { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === 'object') { if (o.unit_id && o.title) meta[o.unit_id] = o; Object.values(o).forEach(w); } })(cmap);
  const U = {};
  for (const f of walk(path.join(SRC, 'data'))) {
    if (/\/(mock_exam|common_test)\//.test(f) || /pilot\/kanagawa_mock/.test(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const q of d.questions) {
      const u = U[q.unit_id] || (U[q.unit_id] = { id: q.unit_id, title: (meta[q.unit_id] || {}).title || q.unit_id, topics: (meta[q.unit_id] || {}).topics || [], groups: {}, ids: {} });
      const g = q.variant_group || '(なし)';
      const o = u.groups[g] || (u.groups[g] = { g, n: 0, df: 0, stems: [] });
      if (u.ids[q.id]) continue; u.ids[q.id] = 1;
      o.n++; o.df += (q.difficulty && q.difficulty.score) || 3; if (o.stems.length < 2) o.stems.push(String(q.stem).replace(/\s+/g, ' ').slice(0, 70));
    }
  }
  return U;
}
function codeSplit(u) { // AI なしの分け方
  const gs = Object.values(u.groups).filter(x => x.g !== '(なし)').sort((a, b) => (a.g < b.g ? -1 : 1)), total = gs.reduce((a, b) => a + b.n, 0);
  const k = Math.max(2, Math.min(8, Math.round(total / 12))), subs = [];
  let acc = 0, cur = [];
  gs.forEach(g => { cur.push(g.g); acc += g.n; if (acc >= total / k && subs.length < k - 1) { subs.push(cur); cur = []; acc = 0; } });
  if (cur.length) subs.push(cur);
  return subs.map((groups, i) => ({ ti: u.title + '（' + (i + 1) + '）', goal: u.title + 'の問題に取り組む', groups }));
}
function validate(u, raw) {
  const names = new Set(Object.keys(u.groups).filter(g => g !== '(なし)'));
  let subs = (raw && Array.isArray(raw.subunits) ? raw.subunits : []).map(s => ({ ti: String(s.label || s.ti || '').trim(), goal: String(s.goal || '').trim(), groups: [...new Set((s.groups || []).map(String))].filter(g => names.has(g)) })).filter(s => s.ti && s.goal && s.groups.length);
  const seen = new Set(); subs.forEach(s => { s.groups = s.groups.filter(g => (seen.has(g) ? false : (seen.add(g), true))); });
  const missing = [...names].filter(g => !seen.has(g)).sort();
  if (!subs.length) return null;
  missing.forEach(g => { subs[subs.length - 1].groups.push(g); });          // 抜けたものは最後の小単元へ
  const size = s => s.groups.reduce((a, g) => a + u.groups[g].n, 0);
  for (let guard = 0; guard < 20; guard++) {                                // 小さすぎるものは、となりにくっつける
    const i = subs.findIndex(s => size(s) < MIN);
    if (i < 0 || subs.length <= 2) break;
    const j = i > 0 ? i - 1 : 1; subs[j].groups.push(...subs[i].groups); if (j === i - 1) subs[j].groups = subs[j].groups; subs.splice(i, 1);
  }
  if (subs.length < 2 || subs.length > 9 || subs.some(s => size(s) < MIN)) return null;
  return subs;
}
function ask(prompt) {
  return new Promise(res => execFile(ASK, [prompt, 'claude-haiku-5-5'], { maxBuffer: 1 << 24, timeout: 240000 }, (e, out) => res(e ? '' : out)));
}
function parseJson(t) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b < a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }
function prompt(u) {
  const total = Object.values(u.groups).reduce((a, g) => a + g.n, 0), kk = Math.max(3, Math.min(8, Math.round(total / 12)));
  const gs = Object.values(u.groups).sort((a, b) => (a.g < b.g ? -1 : 1)).filter(x => x.g !== '(なし)').map(x => `- ${x.g}（${x.n}問・やさしさ平均${(x.df / x.n).toFixed(1)}）例：${x.stems.join(' ／ ')}`).join('\n');
  return `あなたは日本の中学・高校の教材づくりの専門家です。次の「単元」の問題グループ（variant_group）を、学習する順（やさしい・基本から、むずかしい・応用へ）に${kk}個前後（±1）の「小単元」に分けてください。
単元：${u.title}\n扱う内容：${u.topics.join('、')}\n\n問題グループ（名前・問題数・例）：\n${gs}\n
条件：
- すべての問題グループを、ちょうど1つの小単元に入れる（名前はそのまま書く）。
- 小単元の問題数は、それぞれ8問以上（めやすは10〜16問）にする。細かい学習項目ごとに分ける（例：場合の数なら、樹形図・和の法則と積の法則・順列・組合せ・重複や円順列、など）。
- label：小単元の名前（日本語、12文字以内、具体的な内容）。goal：「〜できる」の形のめあて（30文字以内）。
- 小単元は学ぶ順に並べる。
出力は次のJSONだけ（前後に文章を付けない）：
{"subunits":[{"label":"…","goal":"…","groups":["グループ名","…"]}]}`;
}
async function main() {
  if (!SRC || !ASK) { console.error('usage: --src <qd> --ask <cl.sh>'); process.exit(2); }
  const U = collect(), prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const ids = Object.keys(U).sort().filter(id => !ONLY || id === ONLY), res = Object.assign({}, prev);
  let next = 0, ok = 0, fb = 0;
  const worker = async () => {
    for (;;) {
      const id = ids[next++]; if (!id) return;
      if (prev[id] && !ONLY) continue;
      const u = U[id]; let subs = null;
      for (let t = 0; t < 2 && !subs; t++) subs = validate(u, parseJson(await ask(prompt(u))));
      if (subs) ok++; else { subs = codeSplit(u); fb++; }
      res[id] = subs.map((s, i) => ({ id: String.fromCharCode(97 + i), ti: s.ti, goal: s.goal, groups: s.groups.slice().sort(), ai: subs === null ? 0 : 1 }));
      process.stderr.write(id + ' ' + subs.length + '\n');
    }
  };
  await Promise.all(Array.from({ length: JOBS }, worker));
  const sorted = {}; Object.keys(res).sort().forEach(k => { sorted[k] = res[k]; });
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
  console.log('units', Object.keys(sorted).length, 'ai ok', ok, 'code fallback', fb);
}
if (require.main === module) main();
module.exports = { codeSplit, validate, collect };
