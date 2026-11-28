// 同梱の問題バンク（app/src/main/assets/questions/*.json）を作る。すべてこのリポジトリのための自作の問題。
//   node android-guard/tools/gen_questions.mjs
// まちがいの選択肢は、同じ種類の答えの中から、長さが近いものを（固定の乱数で）えらぶ。
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'questions');
mkdirSync(OUT, { recursive: true });

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const R = rng(20261128);
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
function pickDistractors(answer, pool, n = 3) {
  const cand = [...new Set(pool)].filter(p => p !== answer);
  const scored = cand.map(p => [Math.abs([...p].length - [...answer].length) + R() * 1.5, p]).sort((a, b) => a[0] - b[0]);
  return scored.slice(0, n).map(s => s[1]);
}
const out = {};
function add(cat, prefix, level, tags, q, a, d) {
  const list = out[cat] ??= [];
  list.push({ id: `${prefix}-${String(list.length + 1).padStart(3, '0')}`, level, tags, q, a, d });
}

// ---------- 算数 ----------
const seen = new Set();
function addMath(level, tags, q, a, near) {
  if (seen.has(q)) return false; seen.add(q);
  const ds = new Set();
  for (const x of near) { const s = String(x); if (s !== String(a) && !ds.has(s)) ds.add(s); }
  let k = 1;
  while (ds.size < 3) { const s = String(typeof a === 'number' && Number.isInteger(a) ? a + (k % 2 ? k : -k) * (ri(1, 3)) : a + k); if (s !== String(a)) ds.add(s); k++; }
  add('math', 'ma', level, tags, q, String(a), [...ds].slice(0, 3)); return true;
}
function gen(level, tags, count, f) { let n = 0, guard = 0; while (n < count && guard++ < 2000) { const r = f(); if (addMath(level, tags, r[0], r[1], r[2])) n++; } }
const near = (a, ...e) => [a + 1, a - 1, a + 10, a - 10, ...e];
gen(1, ['たし算'], 22, () => { const a = ri(1, 9), b = ri(1, 9); return [`${a} + ${b} = ?`, a + b, near(a + b)]; });
gen(1, ['ひき算'], 6, () => { const a = ri(5, 15), b = ri(1, 9); return [`${a} - ${b} = ?`, a - b, near(a - b)]; });
gen(2, ['たし算', 'ひき算'], 14, () => { const a = ri(20, 99), b = ri(11, 70); return R() < .5 ? [`${a} + ${b} = ?`, a + b, near(a + b)] : [`${a + b} - ${b} = ?`, a, near(a)]; });
gen(2, ['かけ算'], 8, () => { const a = ri(2, 5), b = ri(2, 9); return [`${a} × ${b} = ?`, a * b, [a * b + a, a * b - a, a * (b + 1), (a + 1) * b]]; });
gen(3, ['かけ算'], 14, () => { const a = ri(6, 9), b = ri(6, 9); return [`${a} × ${b} = ?`, a * b, [a * b + a, a * b - b, a * (b + 1), (a + 1) * b]]; });
gen(3, ['わり算'], 8, () => { const b = ri(2, 9), q = ri(2, 9); return [`${b * q} ÷ ${b} = ?`, q, [q + 1, q - 1, q + 2, b]]; });
gen(4, ['2けたのかけ算'], 12, () => { const a = ri(11, 49), b = ri(3, 9); return [`${a} × ${b} = ?`, a * b, [a * b + 10, a * b - 10, a * b + b, (a + 1) * b]]; });
gen(4, ['あまりのあるわり算'], 10, () => { const b = ri(3, 9), q = ri(4, 12), r = ri(1, b - 1); return [`${b * q + r} ÷ ${b} のあまりは？`, r, [r + 1, r === 1 ? b - 1 : r - 1, q % b, b - r].filter(x => x >= 0)]; });
gen(5, ['小数'], 12, () => { const a = ri(11, 99) / 10, b = ri(11, 99) / 10; const s = Math.round((a + b) * 10) / 10; return [`${a} + ${b} = ?`, s, [s + 0.1, s - 0.1, s + 1, s - 1].map(x => Math.round(x * 10) / 10)]; });
gen(5, ['分数'], 10, () => { const d = ri(3, 9), a = ri(1, d - 2), b = ri(1, d - a - 1); return [`${a}/${d} + ${b}/${d} = ?（分子だけ答える。分母は ${d}）`, a + b, near(a + b).filter(x => x > 0)]; });
gen(5, ['倍数'], 6, () => { const a = ri(2, 6), b = ri(3, 9); const g = (x, y) => y ? g(y, x % y) : x; const l = a * b / g(a, b); return [`${a} と ${b} の最小公倍数は？`, l, [a * b + a, l + a, l + b, a + b].filter(x => x !== l)]; });
gen(6, ['割合'], 12, () => { const p = [10, 20, 25, 30, 40, 50, 60, 75][ri(0, 7)], base = ri(2, 20) * 20; const a = base * p / 100; return [`${base} の ${p}% は？`, a, [a + 10, a - 10, base - a, a * 2].filter(x => x !== a)]; });
gen(6, ['速さ'], 10, () => { const v = ri(3, 12) * 10, t = ri(2, 5); return [`時速 ${v}km で ${t} 時間進むと、何 km？`, v * t, [v * t + v, v * t - v, v + t, v * t + 10]]; });
gen(7, ['正負の数'], 14, () => { const a = ri(-15, 15), b = ri(-15, 15); const r = a - b; return [`(${a}) - (${b}) = ?`, r, [a + b, -r, r + 2, r - 2]]; });
gen(7, ['文字式'], 8, () => { const a = ri(2, 9), x = ri(2, 9); return [`x = ${x} のとき、${a}x + 1 の値は？`, a * x + 1, [a * x, a * x + a, a + x + 1, (a + 1) * x + 1]]; });
gen(8, ['一次方程式'], 14, () => { const x = ri(-9, 12), a = ri(2, 9), b = ri(1, 20); return [`${a}x + ${b} = ${a * x + b} のとき、x = ?`, x, [x + 1, x - 1, -x, x + 2].filter(v => v !== x)]; });
gen(8, ['展開'], 6, () => { const a = ri(2, 9); return [`(x + ${a})(x - ${a}) を展開したときの定数項は？`, -a * a, [a * a, -a, a, -2 * a]]; });
gen(9, ['平方根'], 14, () => { const n = ri(4, 20); return [`√${n * n} = ?`, n, [n + 1, n - 1, n * 2, n + 2]]; });
gen(9, ['二次方程式'], 10, () => { const a = ri(1, 9), b = ri(1, 9); return [`x² - ${a + b}x + ${a * b} = 0 の大きいほうの解は？`, Math.max(a, b), [a + b, a * b, Math.max(a, b) + 1, Math.min(a, b)].filter(x => x !== Math.max(a, b))]; });
gen(9, ['平方根'], 6, () => { const n = ri(2, 7), m = ri(2, 5); return [`√${n * n * m} を a√${m} と書くときの a は？`, n, [n + 1, n - 1, n * m, m]]; });

// ---------- 漢字 ----------
const KANJI = {
  1: '山やま 川かわ 空そら 花はな 犬いぬ 雨あめ 足あし 右みぎ 左ひだり 耳みみ 森もり 林はやし 石いし 赤あか 青あお 白しろ 夏なつ 秋あき 冬ふゆ 天気てんき 学校がっこう 先生せんせい 小川おがわ 草くさ 町まち 一年いちねん 糸いと 貝かい',
  2: '親おや 午前ごぜん 汽車きしゃ 弓ゆみ 近道ちかみち 遠足えんそく 通るとおる 歌ううたう 紙かみ 数かず 毎朝まいあさ 雪ゆき 点てん 池いけ 市場いちば 星ほし 帰るかえる 絵え 計算けいさん 工場こうじょう 教室きょうしつ 作文さくぶん 太陽たいよう 夜よる 麦むぎ 当たるあたる',
  3: '悲しいかなしい 暗いくらい 駅えき 港みなと 病院びょういん 薬くすり 持つもつ 神社じんじゃ 放課後ほうかご 息いき 第一だいいち 童話どうわ 農業のうぎょう 両手りょうて 洋服ようふく 漢字かんじ 期間きかん 運動うんどう 深いふかい 着るきる products',
  4: '愛情あいじょう 浅いあさい 以前いぜん 英語えいご 求めるもとめる 議会ぎかい 残るのこる 借りるかりる 祝ういわう 周りまわり 選ぶえらぶ 単語たんご 卒業そつぎょう 低いひくい 働くはたらく 梨なし 孫まご 折るおる 束たば 願うねがう 管理かんり 観察かんさつ 結果けっか 念願ねんがん 笑うわらう 無事ぶじ',
  5: '圧力あつりょく 移るうつる 永遠えいえん 応用おうよう 可能かのう 過去かこ 確かめるたしかめる 基本きほん 寄付きふ 規則きそく 逆ぎゃく 救うすくう 許すゆるす 検査けんさ 限るかぎる 構えるかまえる 講演こうえん 耕すたがやす 混ぜるまぜる 再会さいかい 賛成さんせい 支えるささえる 似るにる 損害そんがい',
  6: '異なることなる 割合わりあい 推理すいり 誤るあやまる 穴あな 警察けいさつ 憲法けんぽう 系統けいとう 困るこまる 宇宙うちゅう 盛るもる 存在そんざい 党とう 届けるとどける 納めるおさめる 熟語じゅくご 処理しょり 縮むちぢむ 装置そうち 頂上ちょうじょう 尊いとうとい 暮らすくらす',
  7: '憂鬱ゆううつ 曖昧あいまい 挨拶あいさつ 朗らかほがらか 閲覧えつらん 依頼いらい 潤ううるおう 概念がいねん 旋律せんりつ 歓迎かんげい 把握はあく 膨大ぼうだい',
  8: '躊躇ちゅうちょ 拘束こうそく 脆いもろい 賄うまかなう 漠然ばくぜん 顕著けんちょ 陥るおちいる 趣旨しゅし 遂げるとげる 凝るこる 惜しむおしむ 窮屈きゅうくつ',
  9: '暫くしばらく 斡旋あっせん 懸念けねん 覚醒かくせい 跳躍ちょうやく 恣意しい 忌避きひ 漸くようやく 蔑むさげすむ 綻びるほころびる 鼓舞こぶ 払拭ふっしょく 脅かすおびやかす 恭しいうやうやしい',
};
function splitWord(tok) { // 先頭の漢字（と送りがな）と、あとのひらがな読み
  const m = tok.match(/^([一-鿿々]+[぀-ゟ]*?)([぀-ゟ]+)$/);
  return m;
}
const kRead = [];
const kEntries = [];
for (const [lv, str] of Object.entries(KANJI)) {
  for (const tok of str.split(/\s+/)) {
    if (tok === 'products') continue;
    // 読みは最後のひらがな列。ただし送りがなつきは、読みの先頭に送りがなを含むので、最長一致でなく手で分ける
    const k = tok.match(/^([一-鿿々]+)(.*)$/);
    if (!k) continue;
    const kanji = k[1];
    let rest = k[2];
    // 送りがなつきの語：読みが「語幹の読み+送りがな」。表示は「漢字+送りがな」。読み全体は rest のうち、後半が送りがな。
    // 例: 悲しいかなしい → rest=しいかなしい。表示の送りがなは rest の先頭から、読みの末尾と一致する部分。
    let okuri = '';
    for (let n = Math.min(3, Math.floor(rest.length / 2)); n >= 0; n--) {
      const head = rest.slice(0, n), tail = rest.slice(rest.length - n);
      if (n === 0 || head === tail) { okuri = head; break; }
    }
    const reading = rest.slice(okuri.length);
    kEntries.push({ lv: +lv, word: kanji + okuri, reading });
    kRead.push({ lv: +lv, reading, word: kanji + okuri });
  }
}
const lvName = l => l <= 6 ? `小${l}` : `中${l - 6}`;
for (const e of kEntries) {
  const pool = kRead.filter(x => Math.abs(x.lv - e.lv) <= 1).map(x => x.reading);
  add('kanji', 'kj', e.lv, ['読み', lvName(e.lv)], `「${e.word}」の読み方は？`, e.reading, pickDistractors(e.reading, pool));
}
for (const e of kEntries.filter(x => x.lv <= 6)) {
  const pool = kRead.filter(x => Math.abs(x.lv - e.lv) <= 1).map(x => x.word);
  add('kanji', 'kj', e.lv, ['書き', lvName(e.lv)], `「${e.reading}」を漢字で書くと？`, e.word, pickDistractors(e.word, pool));
}

// ---------- 英語 ----------
const EN = {
  1: 'apple りんご|dog いぬ|cat ねこ|book 本|water 水|red 赤|blue 青|banana バナナ|pen ペン|bag かばん|school 学校|friend ともだち|milk 牛乳|bird 鳥|fish 魚|sun 太陽|moon 月|tree 木|hand 手|eye 目|rain 雨|snow 雪|car 車|egg たまご',
  2: 'breakfast 朝ごはん|lunch 昼ごはん|dinner 晩ごはん|teacher 先生|student 生徒|morning 朝|evening 夕方|Monday 月曜日|Sunday 日曜日|summer 夏|winter 冬|happy うれしい|sad かなしい|big 大きい|small 小さい|fast 速い|slow おそい|kitchen 台所|library 図書館|station 駅|park 公園|hospital 病院',
  3: 'always いつも|usually ふつうは|sometimes ときどき|never 一度も〜ない|beautiful 美しい|difficult 難しい|easy 簡単な|important 大切な|favorite お気に入りの|different ちがう|together いっしょに|tomorrow あした|yesterday きのう|weather 天気|holiday 休日|visit 訪れる|practice 練習する|choose えらぶ|remember おぼえている|forget 忘れる',
  4: 'language 言語|history 歴史|science 理科|mathematics 数学|culture 文化|country 国|foreign 外国の|travel 旅行する|dangerous 危険な|popular 人気のある|useful 役に立つ|expensive 高価な|cheap 安い|tired つかれた|surprised おどろいた|decide 決める|believe 信じる|invite 招待する|borrow 借りる|lend 貸す|enough じゅうぶんな|member 一員|village 村|environment 環境',
  5: 'although 〜だけれども|according 〜によれば|appear 現れる|recent 最近の|include ふくむ|improve 改善する|exchange 交換する|opinion 意見|experience 経験|possible 可能な|necessary 必要な|society 社会|knowledge 知識|volunteer ボランティア|disaster 災害|ability 能力|communicate 伝え合う|develop 発達させる|produce 生産する|prepare 準備する',
  6: 'achieve 達成する|absolute 絶対の|ambition 大望|attitude 態度|conclude 結論づける|consider よく考える|contribute 貢献する|essential 不可欠な|generation 世代|immediately すぐに|maintain 維持する|negotiate 交渉する|obvious 明らかな|remarkable 注目すべき|resource 資源|sufficient 十分な|tendency 傾向|unique 唯一の|vary 変わる|widespread 広く行きわたった',
};
const enEntries = [];
for (const [lv, str] of Object.entries(EN)) for (const p of str.split('|')) { const [w, ...j] = p.split(' '); enEntries.push({ lv: +lv + (lv >= 5 ? 2 : lv >= 4 ? 1 : 0), w, j: j.join(' ') }); }
const lvEn = l => l <= 3 ? '小〜中1' : l <= 5 ? '中1〜中2' : l <= 7 ? '中2〜中3' : '高校入門';
for (const e of enEntries) {
  const pool = enEntries.filter(x => Math.abs(x.lv - e.lv) <= 1).map(x => x.j);
  add('english', 'en', e.lv, ['単語', lvEn(e.lv)], `「${e.w}」の意味は？`, e.j, pickDistractors(e.j, pool));
}
for (const e of enEntries.filter(x => x.lv <= 5)) {
  const pool = enEntries.filter(x => Math.abs(x.lv - e.lv) <= 1).map(x => x.w);
  add('english', 'en', e.lv, ['単語', '英作', lvEn(e.lv)], `「${e.j}」を英語で言うと？`, e.w, pickDistractors(e.w, pool));
}

// ---------- 社会・理科：q|a を、同じ種類（pool）の答えからまちがい選択肢をつくる ----------
function section(cat, prefix, level, tag, text) {
  const rows = text.trim().split('\n').map(l => l.split('|').map(s => s.trim())).filter(r => r.length === 2);
  const pool = rows.map(r => r[1]);
  for (const [q, a] of rows) add(cat, prefix, level, [tag], q, a, pickDistractors(a, pool));
}
section('social', 'so', 3, '地理：都道府県庁所在地', `
北海道の道庁所在地は？|札幌市
宮城県の県庁所在地は？|仙台市
愛知県の県庁所在地は？|名古屋市
石川県の県庁所在地は？|金沢市
兵庫県の県庁所在地は？|神戸市
広島県の県庁所在地は？|広島市
福岡県の県庁所在地は？|福岡市
沖縄県の県庁所在地は？|那覇市
香川県の県庁所在地は？|高松市
愛媛県の県庁所在地は？|松山市
静岡県の県庁所在地は？|静岡市
茨城県の県庁所在地は？|水戸市
栃木県の県庁所在地は？|宇都宮市
群馬県の県庁所在地は？|前橋市
山形県の県庁所在地は？|山形市
岩手県の県庁所在地は？|盛岡市
島根県の県庁所在地は？|松江市
鳥取県の県庁所在地は？|鳥取市
熊本県の県庁所在地は？|熊本市
鹿児島県の県庁所在地は？|鹿児島市
`);
section('social', 'so', 5, '地理：日本の自然', `
日本でいちばん高い山は？|富士山
日本でいちばん長い川は？|信濃川
日本でいちばん大きい湖は？|琵琶湖
日本でいちばん面積が大きい都道府県は？|北海道
日本でいちばん面積が小さい都道府県は？|香川県
日本アルプスの一つ、中央アルプスの別の名前は？|木曽山脈
関東平野を流れる、日本で2番目に長い川は？|利根川
日本の最南端の島は？|沖ノ鳥島
日本海側に多く、冬に雪が多い地方は？|北陸
`);
section('social', 'so', 6, '歴史：人物と出来事', `
鎌倉幕府を開いた人物は？|源頼朝
室町幕府を開いた人物は？|足利尊氏
江戸幕府を開いた人物は？|徳川家康
本能寺で倒れた戦国武将は？|織田信長
天下を統一した、豊臣の名をもつ人物は？|豊臣秀吉
十七条の憲法を定めた人物は？|聖徳太子
大化の改新を進めた中大兄皇子が、のちに即位した天皇は？|天智天皇
奈良の大仏をつくることを命じた天皇は？|聖武天皇
『源氏物語』を書いた人物は？|紫式部
『枕草子』を書いた人物は？|清少納言
黒船で来航したアメリカの使節は？|ペリー
明治維新で「五箇条の御誓文」を出した天皇は？|明治天皇
日本で初めて内閣総理大臣になった人物は？|伊藤博文
『学問のすゝめ』を書いた人物は？|福沢諭吉
『解体新書』をほん訳した人物の一人は？|杉田玄白
日本地図を歩いて作った人物は？|伊能忠敬
`);
section('social', 'so', 6, '歴史：時代の名前', `
縄文土器がつくられた時代の次の時代は？|弥生時代
平安京に都があった時代は？|平安時代
鎌倉に幕府があった時代は？|鎌倉時代
江戸に幕府があった時代は？|江戸時代
大仏づくりや平城京の時代は？|奈良時代
大きな古墳がたくさんつくられた時代は？|古墳時代
明治の次の元号は？|大正
昭和の前の元号は？|大正
太平洋戦争が終わった年の元号は？|昭和
2019年にはじまった元号は？|令和
`);
section('social', 'so', 7, '公民：しくみ', `
国会・内閣・裁判所のように、権力を分けるしくみを何という？|三権分立
国の政治の最高機関で、法律をつくるのは？|国会
内閣のトップは？|内閣総理大臣
裁判所のうち、いちばん上のものは？|最高裁判所
日本国憲法が公布された年は？|1946年
国民が国の政治のあり方を決める原則を何という？|国民主権
日本国憲法の三つの基本原則は、国民主権・平和主義と、あと一つは？|基本的人権の尊重
満18歳以上の国民に認められた、政治に参加する権利は？|選挙権
国会は衆議院と何院でできている？|参議院
税金を集める国の役所の一つ、お金の管理をする省は？|財務省
国連の本部があるアメリカの都市は？|ニューヨーク
`);
section('social', 'so', 4, '地理：世界', `
世界でいちばん大きい大陸は？|ユーラシア大陸
世界でいちばん大きい海洋は？|太平洋
世界でいちばん長い川は？|ナイル川
世界でいちばん高い山は？|エベレスト
アメリカ合衆国の首都は？|ワシントンD.C.
フランスの首都は？|パリ
イギリスの首都は？|ロンドン
中国の首都は？|北京
大韓民国の首都は？|ソウル
オーストラリアの首都は？|キャンベラ
エジプトにある、古代の王の墓は？|ピラミッド
赤道が通る大陸の一つは？|アフリカ大陸
`);
section('science', 'sc', 3, '生物', `
こん虫のからだは、頭・むね・あと何に分かれる？|はら
チョウが、卵→幼虫→さなぎ→成虫と育つことを何という？|完全変態
植物が光を受けて養分をつくるはたらきは？|光合成
花粉を運ぶ、花のはたらきを助けるものの一つは？|ミツバチ
メダカのおすとめすで、背びれに切れこみがあるのは？|おす
カエルの子（おたまじゃくし）が呼吸に使うのは？|えら
ヒトの血液を全身に送り出す器官は？|心臓
食べ物を消化して、養分を吸収する細長い管は？|小腸
種子の中で、芽や根になる部分は？|胚
ヒトのからだで、酸素を取りこむ器官は？|肺
`);
section('science', 'sc', 5, '地学・天体', `
太陽系で、いちばん大きい惑星は？|木星
太陽系で、輪をもつことで有名な惑星は？|土星
地球のまわりを回っている天体は？|月
太陽が東から出て西にしずむように見えるのは、地球の何のため？|自転
夜に見える、自分で光る天体は？|恒星
月の形が日によって変わって見えることを何という？|満ち欠け
地層から見つかる、むかしの生物の体や跡は？|化石
火山がふん火するとき、地下から出る高温のドロドロした物は？|マグマ
雨が降ってできる、川の水が運ぶはたらきは？|運ぱん
台風が発生する場所は？|熱帯の海上
`);
section('science', 'sc', 7, '化学', `
水の化学式は？|H2O
二酸化炭素の化学式は？|CO2
酸素の元素記号は？|O
水素の元素記号は？|H
ナトリウムの元素記号は？|Na
鉄の元素記号は？|Fe
金の元素記号は？|Au
塩酸などの酸性の水よう液を赤くかえるリトマス紙の色は？|青色リトマス紙
水を加熱して100℃で起こる状態変化は？|沸とう
固体が液体をへずに直接気体になることを何という？|昇華
空気中でいちばん多い気体は？|窒素
石灰水を白くにごらせる気体は？|二酸化炭素
`);
section('science', 'sc', 8, '物理', `
物体にはたらく、地球が引っ張る力は？|重力
力の単位は？|ニュートン
電流の単位は？|アンペア
電圧の単位は？|ボルト
抵抗の単位は？|オーム
電圧÷電流で求められるものは？|抵抗
光が鏡ではね返ることを何という？|反射
光が水やガラスに入るとき曲がることを何という？|屈折
音の高さを決めるのは、音源の何？|振動数
1秒間に振動する回数の単位は？|ヘルツ
物体が動き続けようとする性質は？|慣性
仕事の単位は？|ジュール
`);
section('science', 'sc', 6, '人体・植物', `
ヒトの背骨のほねの数をふくむ、からだをささえるしくみの全体は？|骨格
植物の根から吸い上げた水が、葉から水蒸気として出ていくことは？|蒸散
植物の葉にある、気体の出入り口は？|気孔
ヒトの血液で、酸素を運ぶ成分は？|赤血球
ヒトの血液で、細菌をやっつける成分は？|白血球
だ液にふくまれる、でんぷんを分解するはたらきをもつものは？|アミラーゼ
目で、光を受け取る場所は？|網膜
雌しべの根もとのふくらんだ部分で、のちに実になるのは？|子房
裸子植物にあてはまるのは、イチョウと何？|マツ
光合成で、葉の細胞にある緑色の粒は？|葉緑体
`);

// ---------- 書き出し ----------
const names = { math: '算数・数学', kanji: '漢字', english: '英語', social: '社会', science: '理科' };
let total = 0;
for (const [cat, list] of Object.entries(out)) {
  const ids = new Set(); const qs = new Set();
  for (const q of list) {
    if (ids.has(q.id)) throw new Error('dup id ' + q.id); ids.add(q.id);
    if (q.d.length < 3) throw new Error(`distractors<3 ${q.id} ${q.q}`);
    if (q.d.includes(q.a)) throw new Error(`answer in d ${q.id}`);
    if (new Set(q.d).size !== q.d.length) throw new Error(`dup d ${q.id}`);
    qs.add(q.q);
  }
  writeFileSync(join(OUT, `${cat}.json`), JSON.stringify({ version: 1, category: cat, name: names[cat], questions: list }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log(cat, list.length); total += list.length;
}
console.log('total', total);
