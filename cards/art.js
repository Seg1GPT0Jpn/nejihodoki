// トランプ広場：カードの絵（すべてこのゲームの自作。スートと数字の並びは昔からあるもの）
// ---------------------------------------------------------------------------------
//   CardsArt.sprite()         <svg> のスプライト（スートの形・飾り）を返す。ページの <body> の先頭に1回入れる
//   CardsArt.faceHTML(c)      カード c（0〜51、52 = ジョーカー）の表の中身（HTML）
//   CardsArt.backURL()        カードの裏の画像（data URI）
//   CardsArt.rankText(c) / suitName(c) / label(c, lang)   数字の文字・スートの名前・読み上げ用の名前
(function (root) {
  'use strict';
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_JA = ['スペード', 'ハート', 'ダイヤ', 'クラブ'], SUIT_EN = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
  const RANK_JA = ['エース', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'ジャック', 'クイーン', 'キング'];
  const RANK_EN = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
  const suit = c => (c === 52 ? -1 : (c / 13) | 0), rank = c => (c === 52 ? -1 : c % 13);

  // スートの形（24×24）
  const SUITS = [
    '<path d="M12 1.8C9.4 5.6 3.6 8.4 3.6 13.4c0 2.7 2.1 4.6 4.5 4.6 1.5 0 2.7-.6 3.4-1.8-.1 2.7-.9 4.5-2.5 5.6h6c-1.6-1.1-2.4-2.9-2.5-5.6.7 1.2 1.9 1.8 3.4 1.8 2.4 0 4.5-1.9 4.5-4.6C20.4 8.4 14.6 5.6 12 1.8z"/>',
    '<path d="M12 21.6S2.4 15.6 2.4 8.9C2.4 5.7 4.8 3.4 7.7 3.4c1.8 0 3.5.9 4.3 2.6.8-1.7 2.5-2.6 4.3-2.6 2.9 0 5.3 2.3 5.3 5.5 0 6.7-9.6 12.7-9.6 12.7z"/>',
    '<path d="M12 1.6l8.2 10.4L12 22.4 3.8 12z"/>',
    '<path d="M12 2.2a4.4 4.4 0 0 0-3.6 6.9 4.6 4.6 0 1 0 2.3 8.5c-.1 2.1-.9 3.6-2.2 4.4h7c-1.3-.8-2.1-2.3-2.2-4.4a4.6 4.6 0 1 0 2.3-8.5A4.4 4.4 0 0 0 12 2.2z"/>',
  ];

  // 人物札の飾り（60×84）：王冠・ティアラ・盾。ほんものの人物札は使わず、図形だけで描いた自作の紋章
  const GOLD = '#d9a441', GOLD2 = '#f4d27a';
  const COURT = {
    12: // K：王冠
      '<path d="M13 56 9 27l13 10 8-17 8 17 13-10-4 29z" fill="currentColor"/><path d="M13 56h34v7H13z" fill="' + GOLD + '"/><circle cx="30" cy="27" r="2.6" fill="' + GOLD2 + '"/><circle cx="12" cy="30" r="2.2" fill="' + GOLD2 + '"/><circle cx="48" cy="30" r="2.2" fill="' + GOLD2 + '"/><path d="M19 49h22" stroke="' + GOLD2 + '" stroke-width="1.6" stroke-linecap="round"/>',
    11: // Q：ティアラ（星とあわ）
      '<path d="M10 58C12 38 20 28 30 28s18 10 20 30z" fill="currentColor"/><path d="M30 8l2.6 5.6 6 .7-4.4 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.4-4.1 6-.7z" fill="' + GOLD + '"/><circle cx="30" cy="42" r="4.4" fill="' + GOLD2 + '"/><circle cx="19" cy="48" r="2.6" fill="' + GOLD2 + '"/><circle cx="41" cy="48" r="2.6" fill="' + GOLD2 + '"/><path d="M10 58h40v6H10z" fill="' + GOLD + '"/>',
    10: // J：盾と羽
      '<path d="M14 18h32v22c0 13-9 20-16 24-7-4-16-11-16-24z" fill="currentColor"/><path d="M30 18v46" stroke="' + GOLD2 + '" stroke-width="2.4"/><path d="M14 36h32" stroke="' + GOLD2 + '" stroke-width="2.4"/><path d="M38 6c7 4 9 11 6 16-4-2-7-3-12-3 4-3 6-7 6-13z" fill="' + GOLD + '"/>',
  };
  const JOKER_ART = '<path d="M30 6l6.6 14.6 15.4 2-11.5 10.7 3 15.6L30 41.6 16.5 49l3-15.6L8 22.6l15.4-2z" fill="' + GOLD + '" stroke="' + GOLD2 + '" stroke-width="1.2" stroke-linejoin="round"/><circle cx="30" cy="31" r="5" fill="#c9304a"/><path d="M10 70l10-12 5 8 5-10 5 10 5-8 10 12z" fill="#2f4ea2"/><circle cx="10" cy="70" r="2.4" fill="' + GOLD2 + '"/><circle cx="30" cy="56" r="2.4" fill="' + GOLD2 + '"/><circle cx="50" cy="70" r="2.4" fill="' + GOLD2 + '"/>';

  function sprite() {
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>';
    SUITS.forEach((p, i) => { s += '<symbol id="cs' + i + '" viewBox="0 0 24 24" fill="currentColor">' + p + '</symbol>'; });
    s += '</defs></svg>';
    return s;
  }
  const pip = (x, y, i, big) => '<svg class="pip' + (y > 50 ? ' dn' : '') + (big ? ' big' : '') + '" style="left:' + x + '%;top:' + y + '%"><use href="#cs' + i + '"/></svg>';
  // 数字カードの並び（% 単位）
  const L = 31, C = 50, R = 69;
  const LAYOUT = {
    2: [[C, 18], [C, 82]], 3: [[C, 18], [C, 50], [C, 82]],
    4: [[L, 18], [R, 18], [L, 82], [R, 82]], 5: [[L, 18], [R, 18], [C, 50], [L, 82], [R, 82]],
    6: [[L, 18], [R, 18], [L, 50], [R, 50], [L, 82], [R, 82]],
    7: [[L, 18], [R, 18], [C, 34], [L, 50], [R, 50], [L, 82], [R, 82]],
    8: [[L, 18], [R, 18], [C, 34], [L, 50], [R, 50], [C, 66], [L, 82], [R, 82]],
    9: [[L, 18], [R, 18], [L, 39], [R, 39], [C, 50], [L, 61], [R, 61], [L, 82], [R, 82]],
    10: [[L, 18], [R, 18], [C, 28], [L, 39], [R, 39], [L, 61], [R, 61], [C, 72], [L, 82], [R, 82]],
  };

  function faceHTML(c) {
    if (c === 52) {
      return '<div class="cf jk"><div class="ix tl"><b>★</b></div><div class="ix br"><b>★</b></div>'
        + '<svg class="court" viewBox="0 0 60 84" aria-hidden="true">' + JOKER_ART + '</svg><span class="jt">JOKER</span></div>';
    }
    const s = suit(c), r = rank(c), red = s === 1 || s === 2, idx = '<b>' + RANKS[r] + '</b><svg class="su"><use href="#cs' + s + '"/></svg>';
    let mid;
    if (r === 0) mid = pip(50, 50, s, true);
    else if (r >= 10) mid = '<svg class="court" viewBox="0 0 60 84" aria-hidden="true"><rect x="2" y="2" width="56" height="80" rx="6" class="cfr"/><path d="M2 14h56M2 70h56" class="cfl"/>' + COURT[r] + '</svg>'
      + '<svg class="cs tl2"><use href="#cs' + s + '"/></svg><svg class="cs br2"><use href="#cs' + s + '"/></svg>';
    else mid = LAYOUT[r + 1].map(p => pip(p[0], p[1], s)).join('');
    return '<div class="cf ' + (red ? 'red' : 'blk') + ' s' + s + '"><div class="ix tl">' + idx + '</div><div class="ix br">' + idx + '</div><div class="pp">' + mid + '</div></div>';
  }
  // 裏：紺色の菱形のあみと、中央の八つ星（自作の模様）
  function backSVG() {
    let star = ''; for (let i = 0; i < 8; i++) star += '<path transform="rotate(' + i * 45 + ')" d="M0 -23L4.4 -9.5 0 -13 -4.4 -9.5z" fill="#e7c36a"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><defs><pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#243f86"/><path d="M6 0L12 6 6 12 0 6z" fill="none" stroke="#3a5cb0" stroke-width=".9"/><circle cx="6" cy="6" r="1" fill="#e7c36a" opacity=".85"/></pattern>'
      + '<radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1a2f6a"/><stop offset="1" stop-color="#101f4d"/></radialGradient></defs>'
      + '<rect width="100" height="140" rx="9" fill="#e9e4d6"/><rect x="4" y="4" width="92" height="132" rx="6" fill="#16296a"/><rect x="8.5" y="8.5" width="83" height="123" rx="4" fill="url(#p)" stroke="#e7c36a" stroke-width="1.4"/>'
      + '<g transform="translate(50 70)"><circle r="27" fill="url(#g)" stroke="#e7c36a" stroke-width="1.6"/><circle r="22.5" fill="none" stroke="#e7c36a" stroke-width=".7" stroke-dasharray="1.6 2.2"/>' + star + '<circle r="7.6" fill="#16296a" stroke="#e7c36a" stroke-width="1.2"/><circle r="3.2" fill="#e7c36a"/></g></svg>';
  }
  const cache = {};
  function backURL() { return cache.back || (cache.back = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(backSVG()) + '")'); }
  function rankText(c) { return c === 52 ? '★' : RANKS[rank(c)]; }
  function label(c, lang) { if (c === 52) return lang === 'en' ? 'Joker' : 'ジョーカー'; return lang === 'en' ? RANK_EN[rank(c)] + ' of ' + SUIT_EN[suit(c)] : SUIT_JA[suit(c)] + 'の' + RANK_JA[rank(c)]; }
  function suitIcon(s, cls) { return '<svg class="' + (cls || 'su') + '" viewBox="0 0 24 24"><use href="#cs' + s + '"/></svg>'; }

  root.CardsArt = { RANKS, SUITS, sprite, faceHTML, backURL, backSVG, rankText, label, suitIcon, suitName: (s, lang) => (lang === 'en' ? SUIT_EN[s] : SUIT_JA[s]) };
  if (typeof module === 'object' && module && module.exports) module.exports = root.CardsArt;
})(typeof globalThis !== 'undefined' ? globalThis : this);
