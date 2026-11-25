#!/usr/bin/env node
// まなびの工房：会話の場面の下書きを AI（cl.sh）につくってもらい、コードで検査して manabi/content/dialogues.json に入れる
//   node tools/manabi-dialogues-build.js --ask <cl.sh のパス> [--jobs 4]   … 下書きを作って検査（足りない場面だけ）
//   node tools/manabi-dialogues-build.js --check                           … いまの dialogues.json の検査だけ
// 検査（manabi/dialogue.js の validate）：どの選択肢もどこかに続く・どの道も終わる・ぐるぐる回らない・あなたの番に正しい選択肢がちょうど1つ・まちがいには理由。
// できた場面はすべて ai:1（AI作成・未レビュー）。鍵はここにも manabi/ にも入れない（cl.sh が自分の場所の鍵を読む）。
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
global.ManabiEngine = require('../manabi/engine.js');
const D = require('../manabi/dialogue.js');

const OUT = path.join(__dirname, '../manabi/content/dialogues.json');
const av = process.argv.slice(2), at = k => { const i = av.indexOf(k); return i >= 0 ? av[i + 1] : null; };
const SETTINGS = [
  ['resto', 'restaurant', 'レストランで注文する'], ['airport', 'airport', '空港でチェックインする'], ['school', 'school', '学校で友達や先生と話す'], ['shop', 'shopping', '店で買い物をする'],
  ['dir', 'asking directions', '道をたずねる'], ['phone', 'phone call', '電話で話す'], ['hotel', 'hotel check-in', 'ホテルにチェックインする'], ['doctor', 'doctor', '病院で体調を伝える'],
  ['train', 'train station', '駅で切符を買う'], ['library', 'library', '図書館で本を借りる'], ['party', 'birthday party', '誕生日パーティーで話す'], ['intro', 'meeting a new friend', '新しい友達と自己紹介する'],
];
const LEVELS = { 1: '入門（やさしい短い文。中学1年レベル、1文が3〜7語）', 2: '標準（中学2〜3年レベル、1文が6〜12語）', 3: '発展（高校レベル、理由や意見をのべる、1文が8〜16語）' };
const JA = [
  ['ja-shop', 'コンビニ・お店で（店員さんに丁寧に）'], ['ja-teacher', '先生に課題の提出が遅れることを伝える'], ['ja-senpai', '部活の先輩に頼みごとをする'], ['ja-phone', '会社に電話をかける（取り次ぎをお願いする）'],
  ['ja-guest', 'お客さまを案内する（受付）'], ['ja-interview', 'アルバイトの面接を受ける'], ['ja-hospital', '病院の受付で'], ['ja-neighbor', '近所の人にあいさつと相談をする'],
];
function specs() {
  const l = [];
  for (const lv of [1, 2, 3]) for (const [k, en, ja] of SETTINGS) l.push({ id: `en-${k}-${lv}`, lang: 'en', level: lv, en, ja, lvText: LEVELS[lv] });
  for (const [id, ja] of JA) l.push({ id, lang: 'ja', level: 2, ja, lvText: '高校生向け。敬語（尊敬語・謙譲語・丁寧語）の使い分けを問う' });
  return l;
}
function promptFor(batch) {
  const lines = batch.map(s => `- id:${s.id} / lang:${s.lang} / level:${s.level} / 場面：${s.ja}${s.en ? '（' + s.en + '）' : ''} / むずかしさ：${s.lvText}`).join('\n');
  return `あなたは中学・高校向けの会話教材の作者です。次の場面ごとに、ロールプレイの台本を JSON で作ってください。
${lines}

形（これだけを JSON の配列で出力。前後に説明を付けない）：
[{"id":"…","title":"日本語の場面名","lang":"en または ja","level":1〜3,"partner":{"name":"相手の名前（英語の場面は英語名、日本語の場面は日本語の呼び名）","who":"相手の役（日本語）"},"start":"n1","nodes":{
 "n1":{"say":"相手のせりふ","ja":"日本語訳（英語の場面だけ）","next":"n2"},
 "n2":{"say":"相手のせりふ","ja":"訳","choices":[{"text":"あなたの答えの選択肢","ja":"訳","ok":true,"next":"n3"},{"text":"まちがった選択肢","ja":"訳","fb":"なぜ不自然・まちがいかを、日本語で短く","next":"n3"},{"text":"もう1つのまちがい","ja":"訳","fb":"理由","next":"n3"}]},
 "...":{...},
 "nEnd":{"end":true,"say":"相手の最後のせりふ","ja":"訳"}}}]

決まり：
- あなたの番（choices がある番）は 3〜5 回。各番に選択肢は 3 つ：ok:true はちょうど 1 つ（自然で正しい答え）、あとの 2 つは「文法や敬語の誤り」または「場面に合わない答え」で、必ず fb（日本語の理由）を付ける。
- 選択肢は、どれも next が存在する節（node）を指す。まちがいを選んでも、正しい選択肢と同じ次の節に進む（会話は一本道で、最後は end:true の節で終わる）。ぐるぐる回らない。
- 英語の場面：台本は英語（text, say）。日本語訳は ja に。難しさに合わせた語彙・文の長さにする。場面らしい自然な会話にする（レストランなら注文・好み・会計など）。
- 日本語の場面（lang:ja）：say と text は日本語（敬語の使い分けがポイント）。ja は空でよい。
- 差別・暴力・個人情報・宗教・政治は扱わない。実在の会社名や人名は使わない。
- 文字は JSON として正しく（引用符のエスケープに注意）。`;
}
function ask(prompt) { return new Promise(res => execFile(at('--ask'), [prompt, 'claude-sonnet-5-5'], { maxBuffer: 1 << 25, timeout: 600000 }, (e, out) => res(e ? '' : out))); }
function parseArr(t) { const a = t.indexOf('['), b = t.lastIndexOf(']'); if (a < 0 || b < a) return []; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return []; } }
function clean(sc, spec) {
  const o = { id: spec.id, title: String(sc.title || spec.ja), lang: spec.lang, level: spec.level, partner: { name: String((sc.partner && sc.partner.name) || ''), who: String((sc.partner && sc.partner.who) || '') }, start: sc.start, nodes: {}, ai: 1 };
  for (const [id, n] of Object.entries(sc.nodes || {})) {
    const m = {}; if (n.say != null) m.say = String(n.say); if (n.ja) m.ja = String(n.ja);
    if (n.end) m.end = true; else if (n.choices) m.choices = n.choices.map(c => { const x = { text: String(c.text), next: c.next }; if (c.ja) x.ja = String(c.ja); if (c.ok) x.ok = true; else x.fb = String(c.fb || ''); return x; }); else m.next = n.next;
    o.nodes[id] = m;
  }
  return o;
}
async function main() {
  const have = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { v: 1, ai: 1, note: 'AI作成・未レビュー。会話の台本は AI が下書きし、形（分かれ道・終わり・正解が1つ）だけをコードで検査している。', scenes: [] };
  if (av.includes('--check')) { let bad = 0; for (const s of have.scenes) { const e = D.validate(s); if (e.length) { bad++; console.log(s.id, e.join('; ')); } } console.log(have.scenes.length, 'scenes', bad, 'invalid'); process.exit(bad ? 1 : 0); }
  const all = specs(), done = new Set(have.scenes.map(s => s.id)), todo = all.filter(s => !done.has(s.id));
  const batches = []; for (let i = 0; i < todo.length; i += 3) batches.push(todo.slice(i, i + 3));
  let next = 0, ok = 0, fail = [];
  const worker = async () => {
    for (;;) {
      const b = batches[next++]; if (!b) return;
      for (let t = 0; t < 2; t++) {
        const arr = parseArr(await ask(promptFor(b)));
        for (const spec of b) { if (done.has(spec.id)) continue; const raw = arr.find(x => x && x.id === spec.id); if (!raw) continue; const sc = clean(raw, spec), e = D.validate(sc); if (!e.length) { have.scenes.push(sc); done.add(spec.id); ok++; } else process.stderr.write(spec.id + ' invalid: ' + e.slice(0, 3).join('; ') + '\n'); }
        if (b.every(s => done.has(s.id))) break;
      }
      b.filter(s => !done.has(s.id)).forEach(s => fail.push(s.id));
    }
  };
  await Promise.all(Array.from({ length: Number(at('--jobs') || 4) }, worker));
  have.scenes.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.writeFileSync(OUT, JSON.stringify(have) + '\n');
  console.log('scenes', have.scenes.length, 'new', ok, 'failed', fail.length, fail.join(','));
}
if (require.main === module) main();
module.exports = { specs };
