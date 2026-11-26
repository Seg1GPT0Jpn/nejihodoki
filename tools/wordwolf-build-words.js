#!/usr/bin/env node
// ワードウルフのことば（wordwolf/words.js）を、tools/wordwolf-src/part*.js から作る。
//   node tools/wordwolf-build-words.js          … wordwolf/words.js を書く（検査のメッセージを出す）
//   node tools/wordwolf-build-words.js --check  … 書かずに検査だけ
// 元データ：part00 = ジャンル（cats）とジャンルごとの「ざっくりヒント」（gen）／part01〜 = ヒントの部品（vocab: key|日本語|English）と、ことばのペア。
// ペア1行 = 日本語A|English A|key key key || 日本語B|English B|key key key
// key は vocab のどれか。そのことばの「ほんとうに当てはまるヒント」だけを書く。ヒント文の中にペアの片方のことばが入ってしまう key は、自動で外す。
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'wordwolf-src');
const parts = fs.readdirSync(dir).filter(f => /^part\d+.*\.js$/.test(f)).sort().map(f => require(path.join(dir, f)));
const check = process.argv.includes('--check');
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const errors = [], notes = [];

const catsSrc = parts.find(p => p.cats).cats;
const cats = catsSrc.map(c => ({ id: c[0], ja: c[1], en: c[2], g: c[3] }));
const tags = [], tagIx = {}, vocab = {};
const addVocab = (src, isGen) => lines(src).forEach(l => {
  const [k, ja, en] = l.split('|');
  if (!k || !ja || !en) { errors.push('bad vocab line: ' + l); return; }
  if (vocab[k]) { errors.push('duplicate vocab key: ' + k); return; }
  vocab[k] = { ja, en, gen: isGen };
});
parts.forEach(p => { if (p.gen) addVocab(p.gen, true); if (p.vocab) addVocab(p.vocab, false); });
const useTag = k => { if (tagIx[k] == null) { tagIx[k] = tags.length; tags.push([k, vocab[k].ja, vocab[k].en]); } return tagIx[k]; };

const gen = {};
Object.keys(vocab).filter(k => vocab[k].gen).forEach(k => { const g = k.split('.')[1]; (gen[g] = gen[g] || []).push(useTag(k)); });
cats.forEach(c => { if (!gen[c.g]) errors.push('no gen group ' + c.g + ' for ' + c.id); });

const pairs = [];
parts.forEach(p => Object.keys(p.pairs || {}).forEach(ci => lines(p.pairs[ci]).forEach(l => {
  const sides = l.split(' || ');
  if (sides.length !== 2) { errors.push('bad pair line: ' + l); return; }
  const w = sides.map(s => { const f = s.split('|'); return { ja: f[0].trim(), en: (f[1] || '').trim(), keys: String(f[2] || '').trim().split(/\s+/).filter(Boolean) }; });
  const ids = w.map(x => x.ja);
  w.forEach(x => {
    const out = [];
    x.keys.forEach(k => {
      if (!vocab[k]) { errors.push('unknown key ' + k + ' in ' + x.ja); return; }
      if (vocab[k].gen) { errors.push('gen key used as specific ' + k); return; }
      const ens = w.map(y => y.en.toLowerCase()).filter(e => e.length >= 3), hl = vocab[k].en.toLowerCase();
      if (ids.some(j => vocab[k].ja.indexOf(j) >= 0) || ens.some(e => new RegExp('\\b' + e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?\\b').test(hl))) { notes.push('dropped (leaks) ' + k + ' from ' + x.ja + '/' + ids.join('・')); return; }
      if (out.indexOf(k) < 0) out.push(k);
    });
    x.keys = out;
  });
  pairs.push([+ci, w[0].ja, w[0].en, w[1].ja, w[1].en, w[0].keys.map(useTag).join(' '), w[1].keys.map(useTag).join(' ')]);
})));
// 使われなかった vocab は出力に入らない。数だけ知らせる
const unused = Object.keys(vocab).filter(k => tagIx[k] == null);
if (unused.length) notes.push('unused vocab: ' + unused.join(' '));

const prompts = lines((parts.find(p => p.prompts) || {}).prompts).map(l => l.split('|'));
const DATA = { v: 2, cats, gen, tags, pairs, prompts };
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (notes.length) console.log(notes.join('\n'));
console.log('pairs ' + pairs.length + ', tags ' + tags.length + ', cats ' + cats.length);
if (check) process.exit(0);
const head = [
  '// ワードウルフのことば（ことばのペア・ヒントの部品）。「ペアの二つのことばは似ているけれど、別のもの」。',
  '// tags[i] = [key, 日本語のヒント文, English hint]。gen[グループ] = そのジャンルぜんたいに当てはまる「ざっくりヒント」の tag 番号。',
  '// pairs[i] = [カテゴリ番号, 日本語A, EnglishA, 日本語B, EnglishB, Aだけの tag 番号（空白区切り）, Bだけの tag 番号]。ことばのヒント = その tag ＋ ジャンルの gen。',
  '// このファイルは tools/wordwolf-build-words.js が tools/wordwolf-src/ から作ります（直接は編集しない）。tools/tests/unit/wordwolf-words.test.js が毎回検査します。',
].join('\n');
const out = head + '\n(function (root) {\n  \'use strict\';\n  var DATA = ' + JSON.stringify(DATA).replace(/\],\[/g, '],\n[') + ';\n  if (typeof module === \'object\' && module.exports) module.exports = DATA;\n  root.WordWolfWords = DATA;\n})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
fs.writeFileSync(path.join(__dirname, '..', 'wordwolf', 'words.js'), out);
console.log('wrote wordwolf/words.js (' + out.length + ' bytes)');
