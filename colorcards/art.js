// いろあわせカード工房：カードの絵（全部この工房の自作。糸の色の4色、ぬい目の縁、特別札のしるし）
// 使い方：document.body.insertAdjacentHTML('afterbegin', ColorCardsArt.sprite()) のあと、faceHTML(札の番号, 翻訳の関数) で札のおもて、backURL() で裏の絵。
(function (root) {
  'use strict';
  // 糸の4色：茜（あか）・藍（あい）・若草（わかくさ）・山吹（やまぶき）。色だけに頼らないよう、色ごとに形のしるし（ボタン・ひし形・葉・星）もつける
  const COLORS = [
    { id: 'red', ja: 'あか', en: 'Red', main: '#d6455d', dark: '#8f1f36', ink: '#ffffff' },
    { id: 'blue', ja: 'あい', en: 'Blue', main: '#2f6fd0', dark: '#173d85', ink: '#ffffff' },
    { id: 'green', ja: 'わかくさ', en: 'Green', main: '#2f9e5b', dark: '#17623a', ink: '#ffffff' },
    { id: 'yellow', ja: 'やまぶき', en: 'Yellow', main: '#eab12c', dark: '#8a5d05', ink: '#3b2600' },
  ];
  const KIND = {
    swap: { ja: 'とりかえ', en: 'Swap', d: 'M3 8.5h14.5l-3.4-3.4M21 15.5H6.5l3.4 3.4' },
    peek: { ja: 'のぞき見', en: 'Peek' },
    tangle: { ja: 'からまり', en: 'Tangle' },
    double: { ja: 'ふた針', en: 'Double' },
    shield: { ja: 'まもり糸', en: 'Shield' },
    dye: { ja: '染め直し', en: 'Re-dye' },
  };
  const ICON = {
    swap: '<path d="M3 8.5h14.5l-3.4-3.4M21 15.5H6.5l3.4 3.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    peek: '<path d="M1.8 12S5.7 5.2 12 5.2 22.2 12 22.2 12 18.3 18.8 12 18.8 1.8 12 1.8 12z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/>',
    tangle: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="12" rx="9" ry="5.2" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="5.2" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="5.2" transform="rotate(90 12 12)"/><path d="M19 19c2 .5 3 1.6 2.2 3"/></g>',
    double: '<path d="M3.5 5.2l8 6.8-8 6.8zM12.5 5.2l8 6.8-8 6.8z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    shield: '<path d="M12 2.4l8 2.9v6c0 5-3.4 8.6-8 10.3-4.6-1.7-8-5.3-8-10.3v-6z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M12 6.5v12M7.4 11.5h9.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="2.2 2.2"/>',
    rev: '<path d="M6.5 8.5a7 7 0 0 1 11.6-1.2M17.5 15.5a7 7 0 0 1-11.6 1.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M18.5 3.4v4.4h-4.4M5.5 20.6v-4.4h4.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  function drop(size) { // 4色の染めのしずく
    return '<svg class="dr" viewBox="0 0 24 24" aria-hidden="true"' + (size ? ' width="' + size + '" height="' + size + '"' : '') + '><defs><clipPath id="ccDropClip"><path d="M12 1.8c4.3 5.2 7.3 8.4 7.3 12.6a7.3 7.3 0 0 1-14.6 0C4.7 10.2 7.7 7 12 1.8z"/></clipPath></defs><g clip-path="url(#ccDropClip)"><rect x="0" y="0" width="12" height="12" fill="' + COLORS[0].main + '"/><rect x="12" y="0" width="12" height="12" fill="' + COLORS[1].main + '"/><rect x="0" y="12" width="12" height="12" fill="' + COLORS[2].main + '"/><rect x="12" y="12" width="12" height="12" fill="' + COLORS[3].main + '"/></g><path d="M12 1.8c4.3 5.2 7.3 8.4 7.3 12.6a7.3 7.3 0 0 1-14.6 0C4.7 10.2 7.7 7 12 1.8z" fill="none" stroke="#fff" stroke-width="1.6"/></svg>';
  }
  // 色のしるし：あか＝ボタン、あい＝ひし形、わかくさ＝葉、やまぶき＝星
  const SHAPE = [
    '<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="9" cy="10" r="1.5" fill="#fff" fill-opacity=".85"/><circle cx="15" cy="10" r="1.5" fill="#fff" fill-opacity=".85"/><circle cx="9" cy="15" r="1.5" fill="#fff" fill-opacity=".85"/><circle cx="15" cy="15" r="1.5" fill="#fff" fill-opacity=".85"/>',
    '<path d="M12 1.5l9.5 10.5L12 22.5 2.5 12z" fill="currentColor"/>',
    '<path d="M3 21C3 9 10 3 21 3c0 11-6 18-18 18z" fill="currentColor"/><path d="M5 19L16 8" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>',
    '<path d="M12 1.8l2.9 7 7.3.6-5.6 4.8 1.8 7.2L12 17.6 5.6 21.4l1.8-7.2L1.8 9.4l7.3-.6z" fill="currentColor"/>',
  ];
  function sprite() {
    let s = '<svg id="ccSprite" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>';
    SHAPE.forEach((p, i) => { s += '<symbol id="cc-s' + i + '" viewBox="0 0 24 24">' + p + '</symbol>'; });
    Object.keys(ICON).forEach(k => { s += '<symbol id="cc-i-' + k + '" viewBox="0 0 24 24">' + ICON[k] + '</symbol>'; });
    return s + '</defs></svg>';
  }
  const useSym = (id, cls) => '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>';
  // 札のおもて。数字札：色の面に大きな数字。特別札：しるしと名前。染め直し：4色のしずく。
  function faceHTML(c, tr) {
    const t = tr || (x => x);
    const info = root.ColorCardsEngine.INFO[c];
    if (info.kind === 'n') {
      const sh = useSym('cc-s' + info.color, 'sh');
      const rev = info.num === 0 ? useSym('cc-i-rev', 'rv') : '';
      return '<div class="cf c' + info.color + ' n"><i class="ix"><b>' + info.num + '</b>' + useSym('cc-s' + info.color, 'su') + '</i><i class="ix br"><b>' + info.num + '</b>' + useSym('cc-s' + info.color, 'su') + '</i><div class="mid"><span class="num">' + info.num + '</span>' + rev + '</div>' + '<span class="wm">' + sh + '</span></div>';
    }
    if (info.kind === 'dye') {
      return '<div class="cf dye"><i class="ix"><svg class="su" viewBox="0 0 24 24"><use href="#cc-s0"/></svg></i><div class="mid">' + drop() + '</div><span class="lb">' + t('染め直し') + '</span></div>';
    }
    return '<div class="cf c' + info.color + ' a k-' + info.kind + '"><i class="ix">' + useSym('cc-i-' + info.kind, 'su') + '</i><i class="ix br">' + useSym('cc-i-' + info.kind, 'su') + '</i><div class="mid">' + useSym('cc-i-' + info.kind, 'ic') + '</div><span class="lb">' + t(KIND[info.kind].ja) + '</span><span class="wm">' + useSym('cc-s' + info.color, 'sh') + '</span></div>';
  }
  // 裏：藍の布に、ぬい目の縁と糸巻き
  function backURL() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" preserveAspectRatio="none"><rect width="100" height="140" fill="#26407a"/><rect x="6" y="6" width="88" height="128" rx="7" fill="none" stroke="#f2e3b5" stroke-width="2.2" stroke-dasharray="5 4"/><g stroke="#3a58a0" stroke-width="2"><path d="M-10 20L40 -20M-10 50L70 -20M-10 80L100 -30M-10 110L100 0M-10 140L100 30M20 150L110 60M50 150L110 90M80 150L110 120" fill="none"/></g><g transform="translate(50 70)"><ellipse cx="0" cy="-17" rx="15" ry="4.5" fill="#d9b86a"/><rect x="-15" y="-17" width="30" height="34" fill="#e04a62"/><g stroke="#a82c43" stroke-width="1.4"><path d="M-15 -11h30M-15 -5h30M-15 1h30M-15 7h30M-15 13h30"/></g><ellipse cx="0" cy="17" rx="15" ry="4.5" fill="#d9b86a"/><path d="M15 -3c9 4 8 14 16 14" fill="none" stroke="#e04a62" stroke-width="2.6" stroke-linecap="round"/></g></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  const colorName = (k, en) => (en ? COLORS[k].en : COLORS[k].ja);
  const API = { COLORS, KIND, sprite, faceHTML, backURL, colorName, useSym, drop, ICON };
  root.ColorCardsArt = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
