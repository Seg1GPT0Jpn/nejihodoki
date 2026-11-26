// 麻雀工房：牌の絵（34種類。すべて自作のデザインのSVG。画像ファイルなし）
// face(kind, red) は、牌の表の絵だけ（viewBox 0 0 40 56）。牌の土台（象牙色の板・ふち・影）は CSS で描く。
//   萬子：数字の漢字 + 萬の印　／ 筒子：まるい「歯車の花」の並び ／ 索子：竹の節がある棒（1は小鳥） ／ 風牌：羅針盤のなかの方角 ／ 白：ふちだけ ／ 發：緑の葉 ／ 中：赤い印
(function (root) {
  'use strict';
  const INK = '#1f2a3d', RED = '#c5352b', BLUE = '#245fa8', GREEN = '#23865a', DEEP = '#16603f', GOLD = '#c8941f';
  const FONT = "'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Noto Sans CJK JP','Noto Sans JP','IPAGothic','Meiryo',sans-serif";
  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const T = (x, y, s, fill, size, w) => '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-family="' + FONT + '" font-weight="' + (w || 800) + '" font-size="' + size + '" fill="' + fill + '">' + s + '</text>';

  // 筒子の丸：外の輪・色のついた輪・まんなかの花
  function dot(cx, cy, r, col, red) {
    const c = red ? RED : col;
    return '<g><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff" stroke="' + c + '" stroke-width="' + (r * 0.22).toFixed(2) + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.62).toFixed(2) + '" fill="none" stroke="' + c + '" stroke-width="' + (r * 0.14).toFixed(2) + '" stroke-dasharray="' + (r * 0.5).toFixed(2) + ' ' + (r * 0.28).toFixed(2) + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.26).toFixed(2) + '" fill="' + c + '"/></g>';
  }
  const PIN_POS = {
    1: [[20, 28, 12]],
    2: [[20, 15, 8.5], [20, 41, 8.5]],
    3: [[11, 11, 7.2], [20, 28, 7.2], [29, 45, 7.2]],
    4: [[12, 16, 7.6], [28, 16, 7.6], [12, 40, 7.6], [28, 40, 7.6]],
    5: [[11, 13, 7], [29, 13, 7], [20, 28, 7], [11, 43, 7], [29, 43, 7]],
    6: [[12, 11, 6.6], [28, 11, 6.6], [12, 28, 6.6], [28, 28, 6.6], [12, 45, 6.6], [28, 45, 6.6]],
    7: [[10, 8, 5.4], [20, 14, 5.4], [30, 20, 5.4], [12, 35, 6], [28, 35, 6], [12, 48, 6], [28, 48, 6]],
    8: [[12, 8, 5.6], [28, 8, 5.6], [12, 21, 5.6], [28, 21, 5.6], [12, 35, 5.6], [28, 35, 5.6], [12, 48, 5.6], [28, 48, 5.6]],
    9: [[9, 11, 5.8], [20, 11, 5.8], [31, 11, 5.8], [9, 28, 5.8], [20, 28, 5.8], [31, 28, 5.8], [9, 45, 5.8], [20, 45, 5.8], [31, 45, 5.8]],
  };
  const PIN_COL = { 1: [BLUE], 2: [GREEN, RED], 3: [BLUE, RED, GREEN], 4: [BLUE, GREEN, GREEN, BLUE], 5: [BLUE, BLUE, RED, BLUE, BLUE], 6: [GREEN, GREEN, RED, RED, RED, RED], 7: [GREEN, GREEN, GREEN, RED, RED, RED, RED], 8: [BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE, BLUE], 9: [GREEN, GREEN, GREEN, RED, RED, RED, BLUE, BLUE, BLUE] };
  function pin(n, red) {
    if (n === 1) {   // 大きな歯車の花
      let g = '<circle cx="20" cy="28" r="15" fill="#fff" stroke="' + (red ? RED : BLUE) + '" stroke-width="2.6"/><circle cx="20" cy="28" r="10.5" fill="none" stroke="' + RED + '" stroke-width="2.2" stroke-dasharray="3.6 2.2"/>';
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g += '<circle cx="' + (20 + Math.cos(a) * 6.2).toFixed(2) + '" cy="' + (28 + Math.sin(a) * 6.2).toFixed(2) + '" r="1.9" fill="' + GREEN + '"/>'; }
      return g + '<circle cx="20" cy="28" r="3.2" fill="' + RED + '"/>';
    }
    const pos = PIN_POS[n], col = PIN_COL[n];
    return pos.map((p, i) => dot(p[0], p[1], p[2], col[i], red && n === 5 && i === 2)).join('');
  }

  // 索子：竹の棒（節あり）
  function stick(cx, cy, w, h, col) {
    const x = cx - w / 2, y = cy - h / 2;
    return '<g><rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w + '" height="' + h + '" rx="' + (w / 2.4).toFixed(2) + '" fill="' + col + '"/>' +
      '<rect x="' + (x + w * 0.2).toFixed(2) + '" y="' + (y + 1).toFixed(2) + '" width="' + (w * 0.18).toFixed(2) + '" height="' + (h - 2) + '" fill="#fff" opacity=".28"/>' +
      '<path d="M' + x.toFixed(2) + ' ' + cy.toFixed(2) + 'h' + w + '" stroke="#fff" stroke-width="1.5" opacity=".9"/>' +
      '<path d="M' + x.toFixed(2) + ' ' + (cy - h / 4).toFixed(2) + 'h' + w + 'M' + x.toFixed(2) + ' ' + (cy + h / 4).toFixed(2) + 'h' + w + '" stroke="#0b3d27" stroke-width=".8" opacity=".45"/></g>';
  }
  const SOU_POS = {
    2: [[20, 15], [20, 41]], 3: [[20, 12], [11, 40], [29, 40]], 4: [[11, 15], [29, 15], [11, 41], [29, 41]],
    5: [[10, 13], [30, 13], [20, 28], [10, 43], [30, 43]], 6: [[8, 14], [20, 14], [32, 14], [8, 42], [20, 42], [32, 42]],
    7: [[8, 10], [20, 10], [32, 10], [8, 33], [20, 33], [32, 33], [20, 48]].slice(0, 7), 8: [[8, 14], [20, 14], [32, 14], [8, 42], [20, 42], [32, 42], [14, 28], [26, 28]].slice(0, 8), 9: [[8, 9], [20, 9], [32, 9], [8, 28], [20, 28], [32, 28], [8, 47], [20, 47], [32, 47]],
  };
  function sou(n, red) {
    if (n === 1) {   // 小鳥
      return '<g><path d="M8 38c4 9 14 12 24 4l-5-8c-4 1-8 1-12-2z" fill="' + GREEN + '"/><path d="M26 22c0-5-4-8-8-8s-7 3-7 7c0 5 4 9 9 9 5 0 6-3 6-8z" fill="' + RED + '"/>' +
        '<circle cx="17" cy="19" r="1.6" fill="#fff"/><circle cx="17.3" cy="19.2" r=".8" fill="' + INK + '"/><path d="M11 20l-6 2 6 2z" fill="' + GOLD + '"/>' +
        '<path d="M26 28c5 2 8 7 10 14-5-2-9-3-12-1z" fill="' + DEEP + '"/><path d="M14 38v8M20 38v8" stroke="' + GOLD + '" stroke-width="1.6"/><path d="M20 28c2 4 6 6 10 6" stroke="#fff" stroke-width="1" fill="none" opacity=".7"/></g>';
    }
    const pos = SOU_POS[n], cols = [];
    for (let i = 0; i < n; i++) cols.push(i % 3 === 1 ? DEEP : GREEN);
    if (n >= 5 && n !== 7) cols[Math.floor(n / 2)] = red ? RED : (n === 5 ? RED : cols[Math.floor(n / 2)]);
    if (n === 7) cols[6] = RED;
    if (n === 9) { cols[1] = RED; cols[4] = RED; cols[7] = RED; }
    if (n === 2 || n === 3) cols[0] = DEEP;
    const w = n >= 6 ? 8 : 9, h = n >= 8 ? 16 : n >= 6 ? 17 : 20;
    return pos.map((p, i) => stick(p[0], p[1], w, h, cols[i])).join('');
  }

  function man(n, red) {
    const col = red ? RED : INK;
    return T(20, 29, NUM[n - 1], col, 26, 900) + '<path d="M8 33h24" stroke="' + RED + '" stroke-width="1.4" opacity=".55"/>' + T(20, 51, '萬', RED, 19, 900) + (red ? '<circle cx="33" cy="9" r="3.2" fill="' + RED + '"/>' : '');
  }
  const WIND = ['東', '南', '西', '北'];
  function wind(i) {
    let g = '<circle cx="20" cy="28" r="17" fill="none" stroke="' + INK + '" stroke-width="1.4"/><circle cx="20" cy="28" r="13.5" fill="none" stroke="' + INK + '" stroke-width=".6" stroke-dasharray="1.4 2"/>';
    const marks = [[20, 8, 20, 12], [20, 44, 20, 48], [0, 0, 0, 0]];
    g += '<path d="M20 9l2 4h-4z" fill="' + RED + '"/><path d="M20 47l2-4h-4z" fill="' + INK + '" opacity=".5"/><path d="M3 28l4-2v4z" fill="' + INK + '" opacity=".5"/><path d="M37 28l-4-2v4z" fill="' + INK + '" opacity=".5"/>';
    return g + T(20, 36, WIND[i], INK, 23, 900);
  }
  function dragon(i) {
    if (i === 0) return '<rect x="5" y="6" width="30" height="44" rx="5" fill="none" stroke="' + BLUE + '" stroke-width="2"/><rect x="9" y="10" width="22" height="36" rx="3" fill="none" stroke="' + BLUE + '" stroke-width="1" stroke-dasharray="3 2.5" opacity=".75"/>';
    if (i === 1) return '<path d="M32 8c-9 0-17 5-19 14 7-1 14-5 19-14z" fill="' + GREEN + '" opacity=".85"/><path d="M8 46c9 0 15-4 18-11-8 0-14 4-18 11z" fill="' + DEEP + '" opacity=".85"/>' + T(20, 38, '發', GREEN, 25, 900);
    return '<circle cx="20" cy="28" r="17" fill="none" stroke="' + RED + '" stroke-width="1.6"/><circle cx="20" cy="28" r="14.4" fill="none" stroke="' + RED + '" stroke-width=".7" stroke-dasharray="1.6 2.2"/>' + T(20, 37, '中', RED, 25, 900);
  }
  const cache = {};
  function face(k, red) {
    const key = k + (red ? 'r' : '');
    if (cache[key]) return cache[key];
    let g;
    if (k < 9) g = man(k + 1, red); else if (k < 18) g = pin(k - 8, red); else if (k < 27) g = sou(k - 17, red); else if (k < 31) g = wind(k - 27); else g = dragon(k - 31);
    return (cache[key] = '<svg viewBox="0 0 40 56" aria-hidden="true" focusable="false">' + g + '</svg>');
  }
  const back = '<svg viewBox="0 0 40 56" aria-hidden="true" focusable="false"><rect x="5" y="6" width="30" height="44" rx="5" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/><path d="M20 14l9 14-9 14-9-14z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/><circle cx="20" cy="28" r="3" fill="#fff" fill-opacity=".6"/></svg>';
  // 牌1枚ぶんの完成した SVG（アイコン・サムネイル・テスト用）。viewBox 0 0 48 64
  function tileSvg(k, red) {
    return '<svg viewBox="0 0 48 64" aria-hidden="true"><rect x="1" y="1" width="46" height="62" rx="7" fill="#e0d8c4"/><rect x="1" y="1" width="46" height="57" rx="7" fill="#fbf7ea" stroke="#b9ad90" stroke-width="1.2"/><svg x="4" y="2" width="40" height="56" viewBox="0 0 40 56">' + face(k, red).replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</svg></svg>';
  }
  const NAMES_JA = ['一萬', '二萬', '三萬', '四萬', '五萬', '六萬', '七萬', '八萬', '九萬', '一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒', '一索', '二索', '三索', '四索', '五索', '六索', '七索', '八索', '九索', '東', '南', '西', '北', '白', '發', '中'];
  const NAMES_EN = ['1 Characters', '2 Characters', '3 Characters', '4 Characters', '5 Characters', '6 Characters', '7 Characters', '8 Characters', '9 Characters', '1 Dots', '2 Dots', '3 Dots', '4 Dots', '5 Dots', '6 Dots', '7 Dots', '8 Dots', '9 Dots', '1 Bamboo', '2 Bamboo', '3 Bamboo', '4 Bamboo', '5 Bamboo', '6 Bamboo', '7 Bamboo', '8 Bamboo', '9 Bamboo', 'East', 'South', 'West', 'North', 'White Dragon', 'Green Dragon', 'Red Dragon'];
  const API = { face, back, tileSvg, NAMES_JA, NAMES_EN, name: (k, en, red) => (red ? (en ? 'Red ' : '赤') : '') + (en ? NAMES_EN : NAMES_JA)[k] };
  root.MahjongArt = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
