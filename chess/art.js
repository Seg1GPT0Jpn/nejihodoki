// チェス工房：駒の絵（自分で描いたもの。SVG。どこかの駒セットをまねたものではない）
// ---------------------------------------------------------------------------------
// 「ろくろで挽いた木の駒」のつもり：どの駒も、ひらたい台座・くびれ・あたま の順に重ねてあり、台座にはネジの頭が1つ付いている。
// 色は CSS の変数で決める（白の駒 .pc.w、黒の駒 .pc.b）。--pf 面・--ps ふち・--pa かざり。ライト／ダークの切り替えで駒の色は変えない。
// 使い方：<svg class="pc w"><use href="#cp-5"/></svg>。sprite() が返す <svg> を body の先頭に 1 回入れる。type：1 ポーン 2 ナイト 3 ビショップ 4 ルーク 5 クイーン 6 キング
(function (root) {
  'use strict';
  const BASE = '<path d="M25 82h50l3 8H22z" class="f"/><circle cx="50" cy="86" r="2" class="a"/>';
  const SHAPES = {
    1: '<circle cx="50" cy="31" r="13" class="f"/><path d="M36 47h28v7H36z" class="f"/><path d="M40 54c1 12-1 21-10 28h40c-9-7-11-16-10-28z" class="f"/><path d="M42 31a9 9 0 0 1 6-8" class="a" fill="none"/>' + BASE,
    2: '<path d="M30 82c0-18 5-28 17-35-8 1-17 3-24 3-6 0-6-8-1-12l17-17-1-10 9 6 7-8 5 11c14 7 20 24 18 44 0 3 0 6 0 8z" class="f"/><circle cx="41" cy="32" r="2.6" class="s2"/><path d="M52 24c8 6 12 15 12 27" class="a" fill="none"/><path d="M28 40l6 0" class="a" fill="none"/>' + BASE,
    3: '<circle cx="50" cy="10" r="4.5" class="f"/><path d="M50 14c12 9 16 22 12 33-2 6-22 6-24 0-4-11 0-24 12-33z" class="f"/><path d="M45 31l10-9" class="a" fill="none"/><ellipse cx="50" cy="53" rx="15" ry="5" class="f"/><path d="M39 56c1 13-1 19-10 26h42c-9-7-11-13-10-26z" class="f"/>' + BASE,
    4: '<path d="M28 15h11v8h6v-8h10v8h6v-8h11v26H28z" class="f"/><path d="M34 41h32l-3 30H37z" class="f"/><path d="M26 71h48v11H26z" class="f"/><path d="M33 52h34" class="a" fill="none"/>' + BASE,
    5: '<path d="M32 58L27 24 34 44 39 16 45 44 50 12 55 44 61 16 66 44 73 24 68 58z" class="f"/><circle cx="27" cy="22" r="4" class="f"/><circle cx="39" cy="14" r="4" class="f"/><circle cx="50" cy="10" r="4" class="f"/><circle cx="61" cy="14" r="4" class="f"/><circle cx="73" cy="22" r="4" class="f"/><path d="M33 58h34l-3 14H36z" class="f"/><path d="M37 72c-1 7-5 10-14 10h54c-9 0-13-3-14-10z" class="f"/><path d="M38 65h24" class="a" fill="none"/>' + BASE,
    6: '<path d="M46 3h8v8h8v8h-8v8h-8v-8h-8v-8h8z" class="f"/><path d="M30 58c-3-20 6-31 20-31s23 11 20 31z" class="f"/><path d="M34 58h32l-3 14H37z" class="f"/><path d="M38 72c-1 7-5 10-14 10h52c-9 0-13-3-12-10z" class="f"/><path d="M36 42c4-5 9-7 14-7" class="a" fill="none"/>' + BASE,
  };
  // 駒1つ分の symbol。f = 面（--pf）、a = かざり（--pa）、s2 = 目
  const symbol = t => '<symbol id="cp-' + t + '" viewBox="0 0 100 100"><g stroke="var(--ps)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' + SHAPES[t].replace(/class="f"/g, 'fill="var(--pf)"').replace(/class="a"/g, 'stroke="var(--pa)" stroke-width="2.4"').replace(/class="s2"/g, 'fill="var(--ps)" stroke="none"').replace(/<circle([^>]*)fill="var(--pf)"([^>]*)\/>/g, '<circle$1fill="var(--pf)"$2/>') + '</g></symbol>';
  // 駒の中のかざり（ネジの頭など）は、面と同じ線の太さで描く
  function sprite() {
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>';
    for (let t = 1; t <= 6; t++) s += symbol(t);
    return s + '</defs></svg>';
  }
  const COL = { w: { f: '#f6ecd3', s: '#3b2a17', a: '#b79d6a' }, b: { f: '#4a4658', s: '#13111a', a: '#9a94b0' } };
  // 単体の SVG 文字列（アイコン・テスト・サムネイル用）。color：0 白 1 黒
  function svg(type, color, size) {
    const c = COL[color ? 'b' : 'w'];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + (size || 45) + '" height="' + (size || 45) + '" style="--pf:' + c.f + ';--ps:' + c.s + ';--pa:' + c.a + '"><g stroke="var(--ps)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' +
      SHAPES[type].replace(/class="f"/g, 'fill="var(--pf)"').replace(/class="a"/g, 'stroke="var(--pa)" stroke-width="2.4"').replace(/class="s2"/g, 'fill="var(--ps)" stroke="none"') + '</g></svg>';
  }
  const url = (type, color) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg(type, color, 100));
  root.ChessArt = { sprite, svg, url, COL, SHAPES };
  if (typeof module === 'object' && module && module.exports) module.exports = root.ChessArt;
})(typeof globalThis !== 'undefined' ? globalThis : this);
