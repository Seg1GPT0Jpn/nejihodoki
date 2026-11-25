#!/usr/bin/env node
// まなびの工房：青空文庫の作品（著作権の保護期間が終わったもの）から、短い抜き出しを作って manabi/content/aozora.json に入れる
//   node tools/build-manabi-aozora.js --index list_person_all_extended_utf8.csv --dir <HTML を置いたフォルダ> [--print]
//   index：https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip（青空文庫の公式の一覧）。
//   HTML：一覧の「XHTML/HTMLファイルURL」の列にあるページ（ファイル名は URL の最後の部分）を、そのまま保存したもの（Shift_JIS）。
// 確かめること：一覧に作品名・著者・没年月日があり、作品著作権フラグ・人物著作権フラグが「なし」で、没後 70 年を過ぎていること（没年 ≤ 現在 − 71）。
// 文章は、HTML から注記とルビをとったものを、文（。で区切る）のまま、そっくり写す（書きかえない）。
'use strict';
const fs = require('fs');
const path = require('path');
const iconv = (() => { try { return new TextDecoder('shift_jis'); } catch (e) { return null; } })();
const av = process.argv.slice(2), at = k => { const i = av.indexOf(k); return i >= 0 ? av[i + 1] : null; };
const WORKS = [
  { id: 'ao-kumo', title: '蜘蛛の糸', author: '芥川竜之介', file: '92_14545.html', from: 1, n: 5, lang: 'ja', qs: [ { t: 'mc', q: '御釈迦様は、どこを歩いていましたか。', c: ['極楽の蓮池のふち', '地獄の底', '山の中'], a: '極楽の蓮池のふち', ev: '極楽の蓮池のふち' }, { t: 'mc', q: '蓮の花は、どんな色でしたか。', c: ['まっ白', '赤', '青'], a: 'まっ白', ev: 'まっ白' }, { t: 'mc', q: '極楽は、いつの時間でしたか。', c: ['朝', '夕方', '夜'], a: '朝', ev: '極楽は丁度朝' } ] },
  { id: 'ao-melos', title: '走れメロス', author: '太宰治', file: '1567_14913.html', from: 0, n: 8, lang: 'ja', qs: [ { t: 'mc', q: 'メロスは、どんな人ですか。', c: ['村の牧人', '王様', '石工'], a: '村の牧人', ev: '村の牧人' }, { t: 'mc', q: 'メロスが決意したことは何ですか。', c: ['邪智暴虐の王を除くこと', '村を出ること', '妹の結婚式に出ること'], a: '邪智暴虐の王を除くこと', ev: '王を除かなければならぬと決意した' }, { t: 'mc', q: 'メロスは、どこの市にやって来ましたか。', c: ['シラクスの市', '都の港', '山の村'], a: 'シラクスの市', ev: 'シラクスの市' } ] },
  { id: 'ao-yume', title: '夢十夜（第一夜）', author: '夏目漱石', file: '799_14972.html', from: 0, n: 6, lang: 'ja', workTitle: '夢十夜', qs: [ { t: 'mc', q: '女は、何と言いましたか。', c: ['もう死にます', '元気です', '出かけます'], a: 'もう死にます', ev: 'もう死にますと云う' }, { t: 'mc', q: '女の唇の色は、どうでしたか。', c: ['赤い', '白い', '青い'], a: '赤い', ev: '唇の色は無論赤い' }, { t: 'mc', q: '女の顔は、どんな形でしたか。', c: ['瓜実顔', '丸顔', '四角い顔'], a: '瓜実顔', ev: '瓜実顔' } ] },
];
function parseCsv(txt) { // 引用符つきの CSV
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) { const c = txt[i]; if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c; }
  return rows;
}
function mainText(html) {
  let t = html.replace(/<ruby><rb>([\s\S]*?)<\/rb>[\s\S]*?<\/ruby>/g, '$1').replace(/<rp>[\s\S]*?<\/rp>|<rt>[\s\S]*?<\/rt>/g, '');
  const m = /<div class="main_text">([\s\S]*?)<div class="bibliographical_information">/.exec(t); t = m ? m[1] : t;
  t = t.replace(/<br ?\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/［＃[^］]*］/g, '').replace(/&nbsp;/g, ' ');
  return t.split('\n').map(x => x.trim()).filter(Boolean);
}
function sentences(lines) { const out = []; for (const l of lines) for (const s of l.split(/(?<=。)/)) { const x = s.trim(); if (x) out.push(x); } return out; }
function main() {
  const rows = parseCsv(fs.readFileSync(at('--index'), 'utf8')), head = rows[0], col = n => head.indexOf(n);
  const out = { v: 1, ai: 1, note: '青空文庫（https://www.aozora.gr.jp/）の、著作権の保護期間が終わった作品の抜き出し。問題は AI 作成・未レビュー。', source: 'https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip', works: [] };
  const nowY = new Date().getFullYear();
  for (const w of WORKS) {
    const url = id => 'https://www.aozora.gr.jp/cards/';
    const r = rows.find(x => x[col('作品名')] === (w.workTitle || w.title) && (x[col('姓')] + x[col('名')]) === w.author.replace(/\s/g, '') && x[col('XHTML/HTMLファイルURL')].endsWith('/' + w.file));
    if (!r) throw new Error('not in the Aozora index: ' + w.title);
    const died = r[col('没年月日')], dy = Number(died.slice(0, 4));
    if (r[col('作品著作権フラグ')] !== 'なし' || r[col('人物著作権フラグ')] !== 'なし' || !(dy && nowY - dy > 70)) throw new Error('not public domain: ' + w.title + ' ' + died + ' ' + r[col('作品著作権フラグ')]);
    const html = new TextDecoder('shift_jis').decode(fs.readFileSync(path.join(at('--dir'), w.file)));
    const ss = sentences(mainText(html)).filter(s => !/^第.夜$/.test(s)), pick = ss.slice(w.from, w.from + w.n);
    out.works.push({ id: w.id, title: w.title, author: w.author, died, copyrightFlag: r[col('作品著作権フラグ')], orthography: r[col('文字遣い種別')], url: r[col('XHTML/HTMLファイルURL')], lang: 'ja', level: 2, lines: pick.map(s => [s, '']), qs: w.qs });
    if (av.includes('--print')) console.log(w.id, pick.map((s, i) => i + ': ' + s).join('\n'));
  }
  if (!av.includes('--print')) fs.writeFileSync(path.join(__dirname, '../manabi/content/aozora.json'), JSON.stringify(out) + '\n');
}
if (require.main === module) main();
