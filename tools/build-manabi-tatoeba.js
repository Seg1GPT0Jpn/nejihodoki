#!/usr/bin/env node
// Tatoeba の CC0 英語文（https://tatoeba.org/ の「sentences_CC0」系ダウンロード eng_CC0.tsv）から、聞き取り書き取り用の短い文を選ぶ。
// ライセンス：この eng_CC0 は CC0 1.0（権利放棄）。表示義務はないが、出典として明示する（アプリ内「出典とライセンス」）。
// 使い方: node tools/build-manabi-tatoeba.js --in eng_CC0.tsv [--out manabi/content/tatoeba-en.json] [--n 500]
'use strict';
const fs = require('fs'), path = require('path');
const BAD = /\b(sex\w*|fuck\w*|shit\w*|damn\w*|bitch\w*|ass|asshole|rape\w*|kill\w*|murder\w*|suicid\w*|die[ds]?|dead|death|drunk|drug\w*|porn\w*|nazi\w*|racis\w*|gun\w*|shoot\w*|bomb\w*|terror\w*|war|hell|stupid|idiot\w*|hate[ds]?|naked|nude|breast\w*|penis|vagina|cancer|blood|cigarette\w*|alcohol|beer|wine|whisk\w*|gay|jew\w*|muslim\w*|islam\w*|christ\w*|god|jesus|trump|obama)\b/i;
function pick(tsv, n) {
  const rows = tsv.split('\n').map(l => l.split('\t')).filter(r => r.length >= 3 && r[1] === 'eng').map(r => ({ id: Number(r[0]), s: r[2].trim() }));
  const ok = r => /^[A-Z][A-Za-z' ,.!?-]*[.!?]$/.test(r.s) && !BAD.test(r.s) && r.s.split(/\s+/).length >= 5 && r.s.split(/\s+/).length <= 9;
  const cand = rows.filter(ok), freq = new Map();
  for (const r of rows) for (const w of r.s.toLowerCase().match(/[a-z']+/g) || []) freq.set(w, (freq.get(w) || 0) + 1);
  const rank = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(e => e[0]), rk = new Map(rank.map((w, i) => [w, i]));
  const scored = cand.map(r => { const ws = r.s.toLowerCase().match(/[a-z']+/g), mx = Math.max(...ws.map(w => rk.get(w))); const names = r.s.slice(1).match(/\b[A-Z][a-z]+/g) || []; return { id: r.id, s: r.s, mx, names: names.length }; }).filter(r => r.names === 0 && r.mx < 1500);
  scored.sort((a, b) => a.mx - b.mx || a.id - b.id);
  const seen = new Set(), out = [];
  for (const r of scored) { const k = r.s.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(r); if (out.length >= n) break; }
  out.sort((a, b) => a.id - b.id);
  return out.map(r => [r.id, r.s, r.mx < 400 ? 1 : r.mx < 900 ? 2 : 3]);
}
function main(argv) {
  const a = argv.slice(2), g = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const inp = g('--in'); if (!inp) { console.error('--in eng_CC0.tsv が必要'); process.exit(2); }
  const out = g('--out') || path.join(__dirname, '..', 'manabi', 'content', 'tatoeba-en.json'), n = Number(g('--n') || 500);
  const sents = pick(fs.readFileSync(inp, 'utf8'), n);
  const doc = { v: 1, license: 'CC0 1.0', note: 'Tatoeba（https://tatoeba.org/）の CC0 英語文のうち、短くやさしい文だけを自動で選んだもの。日本語訳は付けていない。', source: 'https://tatoeba.org/en/downloads', terms: 'https://tatoeba.org/en/terms_of_use', ai: 0, sentences: sents };
  fs.writeFileSync(out, JSON.stringify(doc)); console.log('sentences', sents.length, 'bytes', fs.statSync(out).size);
}
if (require.main === module) main(process.argv); else module.exports = { pick };
