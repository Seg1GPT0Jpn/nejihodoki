// 麻雀工房：役の説明・ルール説明・点数の表（日本語と英語。用語は日本語、英語は意味をそえる）
(function (root) {
  'use strict';
  // [id, 門前の翻, 副露の翻（null = 副露では成立しない）, 説明 ja, 説明 en, 入門モード（ミニ麻雀）で数える]
  const Y = [
    ['riichi', 1, null, 'メンゼン（鳴かない）でテンパイしたら「リーチ」。以後は手を変えずに、あがり牌を待つ。', 'Declare ready with a closed hand; from then on you only draw and discard the drawn tile.', 1],
    ['wriichi', 2, null, '最初の1巡（誰も鳴いていない）でリーチ。', 'Riichi on your very first discard before any call.', 0],
    ['ippatsu', 1, null, 'リーチして1巡以内（鳴きが入らない）にあがる。', 'Win within one go-around after declaring riichi, with no calls in between.', 0],
    ['tsumo', 1, null, '鳴かずに、自分でひいた牌であがる（ツモ）。', 'Win on your own draw with a closed hand.', 1],
    ['tanyao', 1, 1, '2〜8の数牌だけでつくる。', 'Only simples: tiles 2 to 8 of the suits.', 1],
    ['pinfu', 1, null, '4つの順子と役にならない雀頭で、両面待ち。', 'Four sequences, a non-scoring pair and a two-sided wait.', 1],
    ['iipeikou', 1, null, '同じ順子を2組（例：二三四・二三四）。', 'Two identical sequences.', 0],
    ['ryanpeikou', 3, null, '一盃口を2組。', 'Two sets of identical sequences.', 0],
    ['haku', 1, 1, '白・發・中の刻子（3枚）。', 'A triplet of White, Green or Red dragons.', 1],
    ['seat', 1, 1, '自分の風（東家なら東）の刻子。', 'A triplet of your own seat wind.', 1],
    ['round', 1, 1, '場の風（東場なら東）の刻子。', 'A triplet of the round wind.', 1],
    ['rinshan', 1, 1, 'カンでひいた牌（嶺上牌）であがる。', 'Win on the replacement tile after a kan.', 0],
    ['chankan', 1, 1, '他家の加槓した牌でロンする。', 'Ron on a tile another player adds to a kan.', 0],
    ['haitei', 1, 1, '最後の牌でツモあがり。', 'Tsumo on the very last tile of the wall.', 0],
    ['houtei', 1, 1, '最後の捨て牌でロン。', 'Ron on the very last discard.', 0],
    ['sanshoku', 2, 1, '萬子・筒子・索子で同じ数の順子を1組ずつ。', 'The same sequence in all three suits.', 0],
    ['ittsu', 2, 1, '同じ色で一〜九をつなげる3つの順子。', 'A 1-9 straight in one suit.', 0],
    ['chanta', 2, 1, 'すべての組に1・9・字牌をふくむ（順子もある）。', 'Every set and the pair contains a terminal or honor.', 0],
    ['junchan', 3, 2, 'すべての組に1・9をふくむ（字牌なし・順子あり）。', 'Every set and the pair contains a 1 or 9 (no honors).', 0],
    ['chiitoi', 2, null, '7つの違う対子（ペア）。25符。', 'Seven different pairs. Always 25 fu.', 1],
    ['toitoi', 2, 2, '4つとも刻子（暗刻・明刻）。', 'Four triplets.', 0],
    ['sanankou', 2, 2, '鳴かずにそろえた刻子が3つ。', 'Three concealed triplets.', 0],
    ['sandoukou', 2, 2, '3色で同じ数の刻子。', 'The same triplet in all three suits.', 0],
    ['sankantsu', 2, 2, 'カンが3つ。', 'Three kans.', 0],
    ['shousangen', 2, 2, '三元牌の2つを刻子、1つを雀頭。', 'Two dragon triplets and a dragon pair.', 0],
    ['honroutou', 2, 2, '1・9・字牌だけ。', 'Only terminals and honors.', 0],
    ['honitsu', 3, 2, '1つの色と字牌だけ。', 'One suit plus honors.', 0],
    ['chinitsu', 6, 5, '1つの色だけ。', 'One suit only.', 0],
    ['dora', 1, 1, 'ドラ表示牌の次の牌。1枚につき1翻（役がないと使えない）。', 'Each dora tile is +1 han (needs a yaku).', 1],
    ['ura', 1, 1, 'リーチであがったとき、裏の表示牌の次の牌。', 'After a riichi win: the tiles under the dora indicator.', 0],
    ['aka', 1, 1, '赤い五。1枚につき1翻。', 'Each red five is +1 han.', 0],
    ['kokushi', 13, 13, '13種類のヤオ九牌と、そのうち1つの対。', 'One of each terminal and honor plus a pair of one.', 0],
    ['kokushi13', 26, 26, '国士無双の十三面待ち（ダブル役満）。', 'Kokushi with a 13-tile wait (double yakuman).', 0],
    ['suuankou', 13, null, '鳴かない暗刻が4つ。', 'Four concealed triplets.', 0],
    ['suuankouT', 26, null, '四暗刻の単騎待ち（ダブル役満）。', 'Suuankou on a pair wait (double yakuman).', 0],
    ['daisangen', 13, 13, '白・發・中の刻子をぜんぶ。', 'Triplets of all three dragons.', 0],
    ['shousuushi', 13, 13, '風牌の3つが刻子、1つが雀頭。', 'Three wind triplets and a wind pair.', 0],
    ['daisuushi', 26, 26, '風牌の4つがぜんぶ刻子（ダブル役満）。', 'Four wind triplets (double yakuman).', 0],
    ['tsuuiisou', 13, 13, '字牌だけ。', 'Only honors.', 0],
    ['chinroutou', 13, 13, '1・9の数牌だけ。', 'Only 1s and 9s.', 0],
    ['ryuuiisou', 13, 13, '緑の牌（2・3・4・6・8索と發）だけ。', 'Only green tiles (2,3,4,6,8 bamboo and Green dragon).', 0],
    ['chuuren', 13, null, '1112345678999 + 1枚（同じ色）。', 'Nine gates: 1112345678999 plus one more tile of the suit.', 0],
    ['chuuren9', 26, null, '純正九蓮宝燈（九面待ち。ダブル役満）。', 'True nine gates (9-way wait; double yakuman).', 0],
    ['suukantsu', 13, 13, 'カンが4つ。', 'Four kans.', 0],
    ['tenhou', 13, null, '親が最初のツモであがる。', 'Dealer wins on the first draw.', 0],
    ['chiihou', 13, null, '子が最初のツモであがる（誰も鳴いていない）。', 'Non-dealer wins on the first draw with no calls.', 0],
  ];
  const BY = {}; Y.forEach(r => { BY[r[0]] = { id: r[0], closed: r[1], open: r[2], ja: r[3], en: r[4], mini: !!r[5] }; });

  const FU_JA = { base: '副底', menzenRon: '門前ロン', tsumo: 'ツモ', set: '刻子・槓子', pair: '雀頭（役牌）', wait: '待ち（カンチャン・ペンチャン・単騎）', openMin: '副露した平和形のロン', round: '切り上げ' };
  const FU_EN = { base: 'Base', menzenRon: 'Closed ron', tsumo: 'Tsumo', set: 'Triplet / kan', pair: 'Pair (yakuhai)', wait: 'Wait (kanchan/penchan/tanki)', openMin: 'Open pinfu-shape ron', round: 'Rounding up' };

  const LIMIT_JA = { mangan: '満貫', haneman: '跳満', baiman: '倍満', sanbaiman: '三倍満', kazoe: '数え役満', yakuman: '役満', 'double-yakuman': 'ダブル役満', '': '' };
  const LIMIT_EN = { mangan: 'Mangan', haneman: 'Haneman', baiman: 'Baiman', sanbaiman: 'Sanbaiman', kazoe: 'Kazoe yakuman', yakuman: 'Yakuman', 'double-yakuman': 'Double yakuman', '': '' };

  // 麻雀の基本（入門）：{ ja, en } の HTML
  const BASICS = {
    ja: '<p class="lead">14枚の手牌を「3枚の組 × 4」と「同じ牌2枚（雀頭）」にそろえるとあがりです。</p>' +
      '<h3>1. 牌</h3><ul><li><b>数牌</b>：萬子・筒子・索子の1〜9（各4枚）。</li><li><b>字牌</b>：東南西北（風牌）と白發中（三元牌）。</li></ul>' +
      '<h3>2. 組（面子）</h3><ul><li><b>順子</b>：同じ色の連続した3枚（例：三四五）。</li><li><b>刻子</b>：同じ牌3枚（例：白白白）。</li></ul>' +
      '<h3>3. 進め方</h3><ul><li>自分の番：牌山から1枚ひいて、いらない1枚を捨てる。</li><li>他の人の捨てた牌で「あがり」なら <b>ロン</b>、自分でひいてあがりなら <b>ツモ</b>。</li><li>あと1枚であがれる形を <b>テンパイ</b>、あがりまでの足りない数を <b>シャンテン</b>（向聴数）と呼びます。</li><li><b>リーチ</b>：鳴かずにテンパイしたら宣言。1000点を出して、あとは手をかえずに待ちます。</li></ul>' +
      '<h3>4. 役</h3><p>あがるには「役」が1つ以上必要です。入門モードの役は、リーチ・ツモ・タンヤオ・ピンフ・役牌・チートイツ、そしてドラ（役ではなく、点数がふえる牌）です。</p>' +
      '<h3>5. フリテン</h3><p>自分の待ち牌を、前に自分が捨てていると、その牌ではロンできません（ツモはできます）。入門モードでは、そうなったら画面でおしらせします。</p>',
    en: '<div data-kbt-allow-ja><p class="lead">Arrange 14 tiles into four sets of three plus one pair to win.</p>' +
      '<h3>1. Tiles</h3><ul><li><b>Suit tiles (数牌)</b>: Characters (萬子), Dots (筒子), Bamboo (索子), 1-9, four copies each.</li><li><b>Honors (字牌)</b>: winds 東南西北 and dragons 白發中.</li></ul>' +
      '<h3>2. Sets (面子)</h3><ul><li><b>Sequence (順子)</b>: three consecutive tiles of one suit.</li><li><b>Triplet (刻子)</b>: three identical tiles.</li></ul>' +
      '<h3>3. Flow</h3><ul><li>On your turn draw one tile and discard one.</li><li>Win on another player\'s discard with <b>Ron (ロン)</b>, or on your own draw with <b>Tsumo (ツモ)</b>.</li><li>One tile from winning is <b>Tenpai (テンパイ)</b>; the number of tiles still missing is the <b>Shanten (シャンテン)</b>.</li><li><b>Riichi (リーチ)</b>: with a closed tenpai hand, pay 1000 points and wait without changing your hand.</li></ul>' +
      '<h3>4. Yaku (役)</h3><p>You need at least one yaku to win. Beginner mode counts: Riichi, Tsumo, Tanyao, Pinfu, Yakuhai, Chiitoitsu, and Dora (bonus tiles, not a yaku).</p>' +
      '<h3>5. Furiten (フリテン)</h3><p>If a tile you wait on is in your own discards, you cannot win on it by Ron (Tsumo is fine). Beginner mode tells you when this happens.</p></div>',
  };
  const FULL = {
    ja: '<h3>ルールの設定（本格麻雀）</h3><ul><li>東風戦（東1〜4局）／東南戦（東南8局。30000点に届かなければ西入）。25000点持ち・30000点返し。</li><li>赤ドラ（赤五が各色1枚）・裏ドラ・一発・喰いタン（初期はあり）。</li><li>チー・ポン・大明槓・加槓・暗槓と嶺上牌、カンドラ、搶槓。</li><li>フリテン（河・同巡・リーチ後）。流局：九種九牌・四風連打・四家立直・四開槓・三家和・荒牌平局（ノーテン罰符）・流し満貫。</li><li>連荘・本場（300点）・供託（リーチ棒）・トビ（0点未満で終了）。ウマ・オカは設定で選べます。</li></ul>' +
      '<h3>実装していないルール</h3><ul><li>責任払い（パオ）、人和、切り上げ満貫、ダブロン以外の頭ハネ設定、途中参加。</li></ul>' +
      '<p>賭け・課金はありません。「ポイント」はゲーム内の成績表示だけです。</p>',
    en: '<h3>Rule options (full game)</h3><ul><li>Tonpuusen (East 1-4) or Hanchan (East+South; extends to West when nobody has 30000). 25000 start, 30000 return.</li><li>Red fives, ura dora, ippatsu, open tanyao (all on by default; toggle in Settings).</li><li>Chii, pon, daiminkan, kakan, ankan with rinshan draw, kan dora, chankan.</li><li>Furiten (own discards, temporary, after riichi). Draws: nine terminals, four winds, four riichi, four kans, triple ron, exhaustive draw (noten payments), nagashi mangan.</li><li>Dealer repeats (renchan), honba (300), riichi sticks, tobi (game ends below 0). Uma and oka are configurable.</li></ul>' +
      '<h3>Rules not implemented</h3><ul><li>Pao (liability), renhou, kiriage mangan, other head-bump settings, mid-game join.</li></ul>' +
      '<p>No gambling or purchases. "Points" are just an in-game score.</p>',
  };
  root.MahjongText = { YAKU: Y, BY, FU_JA, FU_EN, LIMIT_JA, LIMIT_EN, BASICS, FULL };
  if (typeof module === 'object' && module && module.exports) module.exports = root.MahjongText;
})(typeof globalThis !== 'undefined' ? globalThis : this);
